const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Lista di nomi di locali realistici
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

// Genera un indirizzo fittizio basato su lat/lon
function fakeAddress(lat, lon) {
    const streets = ['Via Roma', 'Corso Vittorio', 'Piazza Garibaldi', 'Viale dei Mille', 'Via Dante', 'Largo XX Settembre'];
    const street = streets[Math.floor(Math.random() * streets.length)];
    const number = Math.floor(Math.random() * 200) + 1;
    return `${street} ${number}`;
}

// Calcola una distanza fittizia tra 100 e 1500 metri
function fakeDistance() {
    return Math.floor(Math.random() * 1400) + 100;
}

app.post('/api/places', (req, res) => {
    const { lat, lon, category } = req.body;
    console.log(`[RICHIESTA] Categoria: ${category} a (${lat}, ${lon}) – risposta di esempio`);

    if (!lat || !lon || !category) {
        return res.status(400).json({ error: 'Parametri mancanti' });
    }

    const names = placeNames[category] || placeNames.ristoranti;
    // Genera 6-8 locali fittizi
    const numPlaces = Math.floor(Math.random() * 5) + 5; // tra 5 e 9
    const places = [];
    for (let i = 0; i < numPlaces; i++) {
        // Variazione di lat/lon di circa 0.002-0.01 gradi (200-1000 metri)
        const deltaLat = (Math.random() - 0.5) * 0.01;
        const deltaLon = (Math.random() - 0.5) * 0.01;
        places.push({
            id: i,
            name: names[Math.floor(Math.random() * names.length)] + (i > 0 ? ` ${i}` : ''),
            lat: lat + deltaLat,
            lon: lon + deltaLon,
            address: fakeAddress(lat, lon),
            distance: fakeDistance()
        });
    }
    // Ordina per distanza
    places.sort((a, b) => a.distance - b.distance);
    console.log(`[OK] Generati ${places.length} ${category} di esempio`);
    res.json(places);
});

app.post('/api/track', (req, res) => {
    console.log('Track:', req.body);
    res.json({ ok: true });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server (modalità esempio) su http://localhost:${PORT}`);
});