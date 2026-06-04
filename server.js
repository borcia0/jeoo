const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- Persistenza Log (opzionale) ---
// Se hai abilitato il disco persistente su Render, usa questo:
// const LOG_FILE = path.join('/opt/render/project/src/data', 'logs.json');
// Altrimenti, i log verranno salvati nella root, ma andranno persi a ogni riavvio.
const LOG_FILE = path.join(__dirname, 'logs.json');

// --- Funzioni per i log (invariate, solo per tracciare gli accessi) ---
let accessLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    accessLogs = JSON.parse(data);
  } catch (err) {
    console.error('Errore lettura logs.json:', err);
  }
}
function saveLogs() {
  fs.writeFile(LOG_FILE, JSON.stringify(accessLogs, null, 2), (err) => {
    if (err) console.error('Errore scrittura logs.json:', err);
  });
}

// --- Funzione per interrogare l'API di Overpass ---
// Questa è la chiave di volta del nuovo sistema: cerca i luoghi
async function fetchPlacesFromOSM(lat, lon, categoryTag, radius = 1000) {
  // Mappa le categorie del menu ai tag di OpenStreetMap
  const osmTags = {
    'ristoranti': 'amenity=restaurant',
    'bar': 'amenity=bar',
    'cafe': 'amenity=cafe',
    'negozi': 'shop=*',
    'fast_food': 'amenity=fast_food',
    'pizzerie': 'cuisine=pizza',
    'farmacie': 'amenity=pharmacy',
    'supermercati': 'shop=supermarket',
    'alberghi': 'tourism=hotel',
    'musei': 'tourism=museum',
    'banche': 'amenity=bank'
  };

  // Prende la stringa di ricerca corretta o fallback su tutti gli 'amenity'
  const searchTag = osmTags[categoryTag] || 'amenity=*';

  // Costruisce la query Overpass. Cerca entro il raggio specificato e restituisce nome, indirizzo e coordinate.
  const overpassQuery = `
    [out:json];
    (
      node["${searchTag.replace('=', '"]["')}"](around:${radius},${lat},${lon});
      way["${searchTag.replace('=', '"]["')}"](around:${radius},${lat},${lon});
    );
    out body;
    >;
    out skel qt;
  `;

  const url = 'https://overpass-api.de/api/interpreter';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!response.ok) {
      throw new Error(`Errore API Overpass: ${response.statusText}`);
    }

    const data = await response.json();

    // Estrae e pulisce i risultati per restituirli al frontend
    const places = data.elements
      .filter(el => el.tags && el.tags.name) // Solo posti con un nome
      .map(el => {
        // Tenta di ricavare l'indirizzo
        let address = '';
        if (el.tags['addr:street']) address += `${el.tags['addr:street']} `;
        if (el.tags['addr:housenumber']) address += `${el.tags['addr:housenumber']}, `;
        if (el.tags['addr:city']) address += `${el.tags['addr:city']}`;
        if (!address.trim()) address = 'Indirizzo non disponibile';

        // Calcola la distanza (formula approssimativa)
        const distance = Math.round(calculateDistance(lat, lon, el.lat, el.lon));

        return {
          id: el.id,
          name: el.tags.name,
          lat: el.lat,
          lon: el.lon,
          address: address,
          distance: distance, // distanza in metri
          type: categoryTag,
          // Aggiunge altre info utili se presenti
          phone: el.tags.phone || null,
          website: el.tags.website || null,
          opening_hours: el.tags.opening_hours || null,
        };
      })
      .sort((a, b) => a.distance - b.distance) // Ordina per distanza
      .slice(0, 30); // Limita a 30 risultati per non sovraccaricare la mappa

    return places;
  } catch (error) {
    console.error('Errore nel recupero dati da Overpass:', error);
    throw error;
  }
}

// --- Calcolo della distanza (formula di Haversine) ---
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Raggio terrestre in metri
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metri
}
// --- Endpoint per ottenere i luoghi consigliati (NUOVO)---
app.post('/api/places', async (req, res) => {
  const { lat, lon, category } = req.body;
  if (!lat || !lon || !category) {
    return res.status(400).json({ error: 'Parametri lat, lon, category richiesti.' });
  }

  try {
    const places = await fetchPlacesFromOSM(lat, lon, category);
    res.json(places);
  } catch (error) {
    console.error('Errore nella ricerca luoghi:', error);
    res.status(500).json({ error: 'Errore nel recupero dei luoghi. Riprova più tardi.' });
  }
});

// --- Endpoint per tracciare l'accesso (in parte invariato)---
app.post('/api/track', (req, res) => {
  const { location, deviceInfo, category } = req.body; // Aggiunto category
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ip: clientIp,
    location: location || null,
    deviceInfo: deviceInfo || {},
    userAgent: req.headers['user-agent'],
    category: category || 'sconosciuta' // Salva anche la categoria cercata
  };

  accessLogs.push(logEntry);
  saveLogs();

  // Stampa migliorata nella console
  console.log('\n--- NUOVA RICERCA ---');
  console.log(`Cercato: ${logEntry.category}`);
  console.log(`IP: ${clientIp}`);
  if (location && location.lat && location.lon) {
    console.log(`Posizione: ${location.lat}, ${location.lon} (precisione: ${location.accuracy} m)`);
  } else {
    console.log(`Posizione: non disponibile`);
  }
  console.log(`Browser: ${logEntry.userAgent}`);
  console.log('--------------------\n');

  res.status(200).json({ status: 'ok', message: 'Richiesta elaborata' });
});

// --- Endpoint per ottenere i log (invariato)---
app.get('/api/logs', authenticate, (req, res) => {
  res.json(accessLogs);
});

// --- Middleware di autenticazione (invariato)---
function authenticate(req, res, next) {
  const user = auth(req);
  if (!user || user.name !== 'admin' || user.pass !== 'segreto') {
    res.set('WWW-Authenticate', 'Basic realm="Area amministrativa"');
    return res.status(401).send('Autenticazione richiesta');
  }
  next();
}
app.get('/admin', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Avvio del server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
  console.log(`Dashboard admin: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/admin`);
});