const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'colts2026';

const TEAMS = [
  'Argentina','France','England','Brazil','Spain','Portugal','Germany','Netherlands',
  'Belgium','Croatia','Morocco','Senegal','USA','Mexico','Japan','South Korea',
  'Switzerland','Denmark','Austria','Australia','Poland','Colombia','Uruguay','Ecuador',
  'Canada','Wales','Serbia','Cameroon','Ghana','Tunisia','Saudi Arabia','Iran',
  'Qatar','Costa Rica','Panama','Honduras','Bolivia','Venezuela','Paraguay','Chile',
  'Peru','Algeria','Egypt','Nigeria','Ivory Coast','Mali','New Zealand','Albania'
];

// Use /tmp for writable storage on Render
const DB = '/tmp/worldcup-data.json';

function readDB() {
  try {
    if (!fs.existsSync(DB)) {
      return { players: {}, draw: null, drawLocked: false };
    }
    const raw = fs.readFileSync(DB, 'utf8');
    return JSON.parse(raw);
  } catch(e) {
    console.error('readDB error:', e.message);
    return { players: {}, draw: null, drawLocked: false };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB, JSON.stringify(data), 'utf8');
    return true;
  } catch(e) {
    console.error('writeDB error:', e.message);
    return false;
  }
}

// Public: get data
app.get('/api/data', (req, res) => {
  const db = readDB();
  res.json({ ...db, teams: TEAMS });
});

// Public: register
app.post('/api/register', (req, res) => {
  try {
    const { name, number } = req.body;
    const num = parseInt(number, 10);

    if (!name || !num || num < 1 || num > 48) {
      return res.status(400).json({ error: 'Invalid name or number' });
    }

    const db = readDB();

    if (db.drawLocked) {
      return res.status(400).json({ error: 'The draw has already taken place — registration is closed.' });
    }

    if (db.players[num]) {
      return res.status(400).json({ error: 'Number ' + num + ' is already taken by ' + db.players[num] });
    }

    db.players[num] = name;
    const saved = writeDB(db);

    if (!saved) {
      return res.status(500).json({ error: 'Could not save data — please try again' });
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('register error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Admin: save full state
app.post('/api/admin', (req, res) => {
  try {
    const { password, data } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    writeDB(data);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: run the draw
app.post('/api/admin/draw', (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

    const db = readDB();
    if (db.drawLocked) return res.status(400).json({ error: 'Draw already locked' });

    const sold = Object.keys(db.players).length;
    if (sold < 48) {
      return res.status(400).json({ error: 'Not all 48 numbers sold yet (' + sold + '/48)' });
    }

    // Fisher-Yates shuffle
    const shuffled = [...TEAMS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const draw = {};
    for (let i = 1; i <= 48; i++) {
      draw[i] = shuffled[i - 1];
    }

    db.draw = draw;
    db.drawLocked = true;
    writeDB(db);
    res.json({ ok: true, draw });
  } catch(e) {
    console.error('draw error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete player
app.post('/api/admin/delete', (req, res) => {
  try {
    const { password, number } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const db = readDB();
    delete db.players[number];
    writeDB(db);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: reset draw
app.post('/api/admin/resetdraw', (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const db = readDB();
    db.draw = null;
    db.drawLocked = false;
    writeDB(db);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  const db = readDB();
  res.json({ 
    status: 'ok', 
    players: Object.keys(db.players).length,
    drawLocked: db.drawLocked,
    dbPath: DB,
    writable: (() => { try { fs.writeFileSync(DB + '.test', 'test'); fs.unlinkSync(DB + '.test'); return true; } catch(e) { return false; } })()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port ' + PORT));
