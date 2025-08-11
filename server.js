// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'accounts.json');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // при деплое можно ограничить

app.use(bodyParser.json());
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DB helpers
function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { accounts: {}, tx: [], reservations: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read DB file:', e);
    return { accounts: {}, tx: [], reservations: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// Ensure account exists
function ensureAccount(db, id) {
  if (!db.accounts[id]) {
    db.accounts[id] = { id, balances: { USD: 0, EUR: 0, GBP: 0 }, tx: [] };
  }
  return db.accounts[id];
}

// --- Routes

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// list accounts (for debugging)
app.get('/api/accounts', (req, res) => {
  const db = loadDB();
  res.json({ accounts: db.accounts });
});

// get account
app.get('/api/account/:id', (req, res) => {
  const db = loadDB();
  const acc = db.accounts[req.params.id];
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  res.json(acc);
});

// get balances for account
app.get('/api/balance/:id', (req, res) => {
  const db = loadDB();
  const acc = db.accounts[req.params.id];
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  res.json({ balances: acc.balances });
});

// top-up (debug / admin)
app.post('/api/topup', (req, res) => {
  const { to, amount, currency } = req.body;
  if (!to || !amount || !currency) return res.status(400).json({ error: 'to, amount, currency required' });
  const db = loadDB();
  const acc = ensureAccount(db, to);
  acc.balances[currency] = (acc.balances[currency] || 0) + Number(amount);
  const tx = { id: randomUUID(), ts: Date.now(), type: 'topup', to, amount: Number(amount), currency };
  db.tx.unshift(tx);
  acc.tx.unshift(tx);
  saveDB(db);
  res.json({ success: true, balances: acc.balances, tx });
});

// pay endpoint
app.post('/api/pay', (req, res) => {
  const { from, to, amount, currency, note } = req.body;
  if (!from || !to || !amount || !currency) return res.status(400).json({ error: 'from,to,amount,currency required' });

  const db = loadDB();
  const aFrom = db.accounts[from];
  const aTo = db.accounts[to];

  if (!aFrom) return res.status(404).json({ error: 'Sender not found' });
  if (!aTo) return res.status(404).json({ error: 'Receiver not found' });

  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: 'Invalid amount' });

  const fromBal = Number(aFrom.balances[currency] || 0);
  if (fromBal < amt) return res.status(400).json({ error: 'Insufficient funds' });

  aFrom.balances[currency] = +(fromBal - amt).toFixed(2);
  aTo.balances[currency] = +((Number(aTo.balances[currency] || 0) + amt).toFixed(2));

  const tx = {
    id: randomUUID(),
    ts: Date.now(),
    type: 'payment',
    from, to, amount: amt, currency,
    note: note || ''
  };

  db.tx.unshift(tx);
  aFrom.tx.unshift(tx);
  aTo.tx.unshift(tx);

  saveDB(db);

  res.json({
    success: true,
    txId: tx.id,
    fromBalance: aFrom.balances,
    toBalance: aTo.balances,
    tx
  });
});

// simple reservation endpoint (example)
app.post('/api/reserve', (req, res) => {
  const { userId, itemId, amount, currency } = req.body;
  if (!userId || !itemId || !amount || !currency) return res.status(400).json({ error: 'userId,itemId,amount,currency required' });
  const db = loadDB();
  const acc = db.accounts[userId];
  if (!acc) return res.status(404).json({ error: 'User not found' });
  if ((acc.balances[currency] || 0) < Number(amount)) return res.status(400).json({ error: 'Insufficient funds' });

  const reservation = { id: randomUUID(), ts: Date.now(), userId, itemId, amount: Number(amount), currency, status: 'reserved' };
  db.reservations.unshift(reservation);
  // optionally block funds: here we'll deduct immediately
  acc.balances[currency] = +(acc.balances[currency] - Number(amount)).toFixed(2);
  const tx = { id: randomUUID(), ts: Date.now(), type: 'reservation', userId, amount: Number(amount), currency, itemId };
  db.tx.unshift(tx);
  acc.tx.unshift(tx);
  saveDB(db);

  res.json({ success: true, reservation, balances: acc.balances });
});

app.listen(PORT, () => {
  console.log(`RP bank API listening on port ${PORT}`);
});
