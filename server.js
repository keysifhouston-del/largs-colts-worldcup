const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'colts2026';
const MONGODB_URI = process.env.MONGODB_URI;

// CORRECT confirmed 2026 FIFA World Cup teams
const TEAMS = [
  'Argentina','France','England','Brazil','Spain','Portugal','Germany','Netherlands',
  'Belgium','Croatia','Morocco','Senegal','USA','Mexico','Japan','South Korea',
  'Switzerland','Denmark','Austria','Australia','Poland','Colombia','Uruguay','Ecuador',
  'Canada','Scotland','Serbia','Cameroon','South Africa','Tunisia','Saudi Arabia','Iran',
  'Qatar','Costa Rica','Panama','Honduras','Norway','Venezuela','Paraguay','Sweden',
  'Peru','Algeria','Egypt','Nigeria','Bosnia and Herzegovina','Uzbekistan','New Zealand','Jordan'
];

let db, collection;

async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('largscolts');
    collection = db.collection('worldcup');
    console.log('MongoDB connected');
  } catch(e) {
    console.error('MongoDB connection error:', e.message);
  }
}

async function readDB() {
  try {
    const doc = await collection.findOne({ _id: 'state' });
    if (!doc) return { players: {}, draw: null, drawLocked: false };
    return { players: doc.players || {}, draw: doc.draw || null, drawLocked: doc.drawLocked || false };
  } catch(e) {
    console.error('readDB error:', e.message);
    return { players: {}, draw: null, drawLocked: false };
  }
}

async function writeDB(data) {
  try {
    await collection.updateOne(
      { _id: 'state' },
      { $set: { players: data.players, draw: data.draw, drawLocked: data.drawLocked } },
      { upsert: true }
    );
    return true;
  } catch(e) {
    console.error('writeDB error:', e.message);
    return false;
  }
}

// Public: get data
app.get('/api/data', async (req, res) => {
  const data = await readDB();
  res.json({ ...data, teams: TEAMS });
});

// Public: register
app.post('/api/register', async (req, res) => {
  try {
    const { name, number } = req.body;
    const num = parseInt(number, 10);
    if (!name || !num || num < 1 || num > 48) {
      return res.status(400).json({ error: 'Invalid name or number' });
    }
    const data = await readDB();
    if (data.drawLocked) {
      return res.status(400).json({ error: 'The draw has already taken place — registration is closed.' });
    }
    if (data.players[num]) {
      return res.status(400).json({ error: 'Number ' + num + ' is already taken by ' + data.players[num] });
    }
    data.players[num] = name;
    const saved = await writeDB(data);
    if (!saved) return res.status(500).json({ error: 'Could not save — please try again' });
    res.json({ ok: true });
  } catch(e) {
    console.error('register error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Admin: save full state
app.post('/api/admin', async (req, res) => {
  const { password, data } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  await writeDB(data);
  res.json({ ok: true });
});

// Admin: run the draw
app.post('/api/admin/draw', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const data = await readDB();
    if (data.drawLocked) return res.status(400).json({ error: 'Draw already locked' });
    const sold = Object.keys(data.players).length;
    if (sold < 48) return res.status(400).json({ error: 'Not all 48 numbers sold yet (' + sold + '/48)' });
    const shuffled = [...TEAMS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const draw = {};
    for (let i = 1; i <= 48; i++) draw[i] = shuffled[i - 1];
    data.draw = draw;
    data.drawLocked = true;
    await writeDB(data);
    res.json({ ok: true, draw });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: fix draw with correct teams — keeps number assignments, re-shuffles team names
app.post('/api/admin/fixdraw', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const data = await readDB();
    if (!data.draw) return res.status(400).json({ error: 'No draw to fix' });

    // Shuffle correct teams and reassign to same numbers
    const shuffled = [...TEAMS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const newDraw = {};
    for (let i = 1; i <= 48; i++) newDraw[i] = shuffled[i - 1];
    data.draw = newDraw;
    data.drawLocked = true;
    await writeDB(data);
    res.json({ ok: true, draw: newDraw });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete player
app.post('/api/admin/delete', async (req, res) => {
  const { password, number } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  const data = await readDB();
  delete data.players[number];
  await writeDB(data);
  res.json({ ok: true });
});

// Admin: reset draw
app.post('/api/admin/resetdraw', async (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  const data = await readDB();
  data.draw = null;
  data.drawLocked = false;
  await writeDB(data);
  res.json({ ok: true });
});

// Health check
app.get('/api/health', async (req, res) => {
  const data = await readDB();
  res.json({ status: 'ok', players: Object.keys(data.players).length, drawLocked: data.drawLocked });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => console.log('Running on port ' + PORT));
});
