const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Log file
const LOG_FILE = path.join(__dirname, 'logs.json');
let accessLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    accessLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch(e) { console.error(e); }
}
function saveLogs() {
  fs.writeFile(LOG_FILE, JSON.stringify(accessLogs, null, 2), (err) => {
    if (err) console.error('Errore scrittura logs.json:', err);
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getOsmTag(category) {
  const tags = {
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
  return tags[category] || 'amenity=*';
}

async function fetchPlacesFromOSM(lat, lon, category, radius = 1000) {
  const osmTag = getOsmTag(category);
  const [key, value] = osmTag.split('=');
  const query = `
    [out:json];
    (
      node["${key}"="${value}"](around:${radius},${lat},${lon});
      way["${key}"="${value}"](around:${radius},${lat},${lon});
    );
    out body;
    >;
    out skel qt;
  `;
  console.log('Query Overpass:', query);
  
  const url = 'https://overpass-api.de/api/interpreter';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  console.log(`Elementi grezzi: ${data.elements?.length || 0}`);
  
  const places = [];
  for (const el of data.elements) {
    if (!el.tags || !el.tags.name) continue;
    let latVal = el.lat;
    let lonVal = el.lon;
    if (!latVal && el.center) {
      latVal = el.center.lat;
      lonVal = el.center.lon;
    }
    if (!latVal || !lonVal) continue;
    
    let address = '';
    if (el.tags['addr:street']) address += el.tags['addr:street'] + ' ';
    if (el.tags['addr:housenumber']) address += el.tags['addr:housenumber'] + ', ';
    if (el.tags['addr:city']) address += el.tags['addr:city'];
    if (!address.trim()) address = 'Indirizzo non disponibile';
    
    const distance = Math.round(calculateDistance(lat, lon, latVal, lonVal));
    places.push({
      id: el.id,
      name: el.tags.name,
      lat: latVal,
      lon: lonVal,
      address: address.trim(),
      distance: distance,
      phone: el.tags.phone || null,
      website: el.tags.website || null
    });
  }
  places.sort((a,b) => a.distance - b.distance);
  return places.slice(0, 30);
}

app.post('/api/places', async (req, res) => {
  const { lat, lon, category } = req.body;
  console.log(`Richiesta places: lat=${lat}, lon=${lon}, cat=${category}`);
  if (!lat || !lon || !category) {
    return res.status(400).json({ error: 'Parametri mancanti' });
  }
  try {
    const places = await fetchPlacesFromOSM(lat, lon, category);
    res.json(places);
  } catch (error) {
    console.error('Errore /api/places:', error);
    res.status(500).json({ error: 'Errore nel recupero dei luoghi. Riprova più tardi.' });
  }
});

app.post('/api/track', (req, res) => {
  const { location, deviceInfo, category } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  accessLogs.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ip: clientIp,
    location: location || null,
    deviceInfo: deviceInfo || {},
    userAgent: req.headers['user-agent'],
    category: category || 'sconosciuta'
  });
  saveLogs();
  res.status(200).json({ status: 'ok' });
});

function authenticate(req, res, next) {
  const user = auth(req);
  if (!user || user.name !== 'admin' || user.pass !== 'segreto') {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Autenticazione richiesta');
  }
  next();
}
app.get('/api/logs', authenticate, (req, res) => res.json(accessLogs));
app.get('/admin', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});