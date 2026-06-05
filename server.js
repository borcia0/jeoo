const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const auth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ---------- DATI DI ESEMPIO PER I LOCALI ----------
const placeNames = {
    ristoranti: ['Pizzeria Da Michele', 'Ristorante La Bella Vita', 'Trattoria Nonna Rosa', 'Sushi Wok', 'Ristorante Pizzeria Napoli'],
    bar: ['Bar Centrale', 'Caffè Lux', 'Bar Sport', "L'Angolo del Caffè", 'Bar Hemingway'],
    cafe: ['Caffè Torino', 'Gran Caffè', 'Coffee House', 'Caffè Letterario', 'Starbucks'],
    negozi: ['Zara', 'H&M', 'Foot Locker', 'MediaWorld', 'Coin'],
    fast_food: ['McDonald\'s', 'Burger King', 'KFC', 'Old Wild West', 'Pizza Hut'],
    farmacie: ['Farmacia Comunale', 'Farmacia Dottor Rossi', 'Farmacia San Carlo', 'Farmacia Europa'],
    supermercati: ['Conad', 'Carrefour', 'Lidl', 'Esselunga', 'Coop'],
    musei: ['Museo Civico', 'Pinacoteca', 'Museo di Storia Naturale', 'Galleria d\'Arte Moderna']
};

function fakeAddress() {
    const streets = ['Via Roma', 'Corso Vittorio', 'Piazza Garibaldi', 'Viale dei Mille', 'Via Dante', 'Largo XX Settembre'];
    const street = streets[Math.floor(Math.random() * streets.length)];
    const number = Math.floor(Math.random() * 200) + 1;
    return `${street} ${number}`;
}

function fakeDistance() {
    return Math.floor(Math.random() * 1400) + 100;
}

// ---------- LOG IN MEMORIA ----------
let accessLogs = [];

// ---------- MIDDLEWARE AUTENTICAZIONE PER ADMIN ----------
function authenticate(req, res, next) {
    const user = auth(req);
    if (!user || user.name !== 'admin' || user.pass !== 'segreto') {
        res.set('WWW-Authenticate', 'Basic realm="Area amministrativa"');
        return res.status(401).send('Autenticazione richiesta');
    }
    next();
}

// ---------- API PER I LOCALI (dati esempio) ----------
app.post('/api/places', (req, res) => {
    const { lat, lon, category } = req.body;
    console.log(`[RICHIESTA] Categoria: ${category} a (${lat}, ${lon}) – risposta di esempio`);

    if (!lat || !lon || !category) {
        return res.status(400).json({ error: 'Parametri mancanti' });
    }

    const names = placeNames[category] || placeNames.ristoranti;
    const numPlaces = Math.floor(Math.random() * 5) + 5; // tra 5 e 9
    const places = [];
    for (let i = 0; i < numPlaces; i++) {
        const deltaLat = (Math.random() - 0.5) * 0.01;
        const deltaLon = (Math.random() - 0.5) * 0.01;
        places.push({
            id: i,
            name: names[Math.floor(Math.random() * names.length)] + (i > 0 ? ` ${i}` : ''),
            lat: lat + deltaLat,
            lon: lon + deltaLon,
            address: fakeAddress(),
            distance: fakeDistance()
        });
    }
    places.sort((a, b) => a.distance - b.distance);
    console.log(`[OK] Generati ${places.length} ${category} di esempio`);
    res.json(places);
});

// ---------- API PER TRACCIARE GLI ACCESSI ----------
app.post('/api/track', (req, res) => {
    const { location, category } = req.body;
    const logEntry = {
        timestamp: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        location: location || null,
        category: category || 'sconosciuta',
        userAgent: req.headers['user-agent']
    };
    accessLogs.push(logEntry);
    console.log(`📝 Nuovo accesso: ${logEntry.ip} - ${category}`);
    res.json({ ok: true });
});

// ---------- API PER OTTENERE I LOG (protetta) ----------
app.get('/api/logs', authenticate, (req, res) => {
    res.json(accessLogs);
});

// ---------- PAGINA ADMIN (protetta) ----------
app.get('/admin', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------- AVVIO SERVER ----------
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server attivo su http://localhost:${PORT}`);
    console.log(`🔐 Area admin: http://localhost:${PORT}/admin (admin / segreto)`);
});