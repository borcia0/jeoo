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
app.use(express.static('public')); // serve i file statici (HTML, CSS, JS)

// Percorso del file di log
const LOG_FILE = path.join(__dirname, 'logs.json');

// Carica i log esistenti o inizializza array vuoto
let accessLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    accessLogs = JSON.parse(data);
  } catch (err) {
    console.error('Errore lettura logs.json:', err);
  }
}

// Salva i log su file
function saveLogs() {
  fs.writeFile(LOG_FILE, JSON.stringify(accessLogs, null, 2), (err) => {
    if (err) console.error('Errore scrittura logs.json:', err);
  });
}

// Middleware di autenticazione per /admin e /api/logs
function authenticate(req, res, next) {
  const user = auth(req);
  // Cambia qui username e password come preferisci
  if (!user || user.name !== 'admin' || user.pass !== 'segreto') {
    res.set('WWW-Authenticate', 'Basic realm="Area amministrativa"');
    return res.status(401).send('Autenticazione richiesta');
  }
  next();
}

// Endpoint per ricevere la posizione dal visitatore
app.post('/api/track', (req, res) => {
  const { location, deviceInfo } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ip: clientIp,
    location: location || null,
    deviceInfo: deviceInfo || {},
    userAgent: req.headers['user-agent']
  };

  accessLogs.push(logEntry);
  saveLogs();

  // Stampa nella console del server (visibile su Render o in locale)
  console.log('\n--- NUOVO ACCESSO ---');
  console.log(`Orario: ${logEntry.timestamp}`);
  console.log(`IP: ${clientIp}`);
  if (location && location.lat && location.lon) {
    console.log(`Posizione: ${location.lat}, ${location.lon} (precisione: ${location.accuracy} m)`);
  } else {
    console.log(`Posizione: non disponibile`);
  }
  console.log(`Browser: ${logEntry.userAgent}`);
  console.log('--------------------\n');

  res.status(200).json({ status: 'ok', message: 'Posizione ricevuta' });
});

// Endpoint per ottenere i log (JSON) – protetto
app.get('/api/logs', authenticate, (req, res) => {
  res.json(accessLogs);
});

// Pagina admin protetta (serve il file HTML, ma la protezione è sul file statico)
app.get('/admin', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Avvio del server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
  console.log(`Per vedere la dashboard admin: http://localhost:${PORT}/admin`);
  console.log(`Credenziali: admin / segreto`);
});