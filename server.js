const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DB = path.join(__dirname, 'data.json');

function readDB() {
  try {
    if (!fs.existsSync(DB)) return { sold: {}, players: {}, winBall: null, month: '', year: '2026' };
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch(e) {
    return { sold: {}, players: {}, winBall: null, month: '', year: '2026' };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data), 'utf8');
}

app.get('/api/data', (req, res) => {
  res.json(readDB());
});

app.post('/api/data', (req, res) => {
  writeDB(req.body);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port ' + PORT));
