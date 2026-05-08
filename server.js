const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();

function defaultUser() {
  return {
    art: 550,
    ton: 0.15,
    spins: 5,
    wallet: '',
    minWithdraw: 0.2,
    hasClaimedGift: false,
    records: { wallet: [], swap: [], friends: [], promo: [] }
  };
}

function getUser(id = 'demo') {
  if (!users.has(id)) users.set(id, defaultUser());
  return users.get(id);
}

app.get('/api/state', (req, res) => {
  const user = getUser(req.query.userId);
  res.json(user);
});

app.post('/api/spin', (req, res) => {
  const user = getUser(req.body.userId);
  if (user.spins <= 0) return res.status(400).json({ error: 'NO_SPINS' });
  user.spins -= 1;
  const rewards = [
    { label: '15 ART', val: 15, type: 'art' },
    { label: '0.01 TON', val: 0.01, type: 'ton' },
    { label: '25 ART', val: 25, type: 'art' },
    { label: '20 ART', val: 20, type: 'art' },
    { label: '50 ART', val: 50, type: 'art' },
    { label: '10 ART', val: 10, type: 'art' },
    { label: '35 ART', val: 35, type: 'art' },
    { label: '5 ART', val: 5, type: 'art' }
  ];
  const index = Math.floor(Math.random() * rewards.length);
  const win = rewards[index];
  if (win.type === 'art') user.art += win.val;
  else user.ton += win.val;
  res.json({ index, win, spins: user.spins, art: user.art, ton: user.ton });
});

app.post('/api/watch-ad', (req, res) => {
  const user = getUser(req.body.userId);
  user.spins = Math.min(5, user.spins + 1);
  res.json({ spins: user.spins });
});

app.post('/api/redeem', (req, res) => {
  const user = getUser(req.body.userId);
  const code = String(req.body.code || '').toUpperCase();
  if (code === 'TONEXA50') {
    user.art += 50;
    user.records.promo.unshift({ ts: Date.now(), message: `Promo kullanıldı: ${code} (+50 ART)` });
    return res.json({ ok: true, art: user.art });
  }
  res.status(400).json({ error: 'INVALID_CODE' });
});

app.post('/api/swap', (req, res) => {
  const user = getUser(req.body.userId);
  const art = Number(req.body.art || 0);
  if (!Number.isFinite(art) || art <= 0) return res.status(400).json({ error: 'BAD_AMOUNT' });
  if (art > user.art) return res.status(400).json({ error: 'LOW_ART' });
  const tonAmount = art / 10000;
  user.art -= art;
  user.ton += tonAmount;
  user.records.swap.unshift({ ts: Date.now(), message: `Swap: ${art} ART -> ${tonAmount.toFixed(3)} TON` });
  res.json({ art: user.art, ton: user.ton });
});

app.post('/api/withdraw', (req, res) => {
  const user = getUser(req.body.userId);
  const amount = Number(req.body.amount || 0);
  const wallet = String(req.body.wallet || '').trim();
  if (!wallet) return res.status(400).json({ error: 'NO_WALLET' });
  if (amount < user.minWithdraw) return res.status(400).json({ error: 'MIN_WITHDRAW' });
  if (amount > user.ton) return res.status(400).json({ error: 'LOW_TON' });
  user.ton -= amount;
  user.wallet = wallet;
  user.records.wallet.unshift({ ts: Date.now(), message: `Withdraw: ${amount.toFixed(3)} TON -> ${wallet}` });
  res.json({ ton: user.ton, wallet: user.wallet });
});

app.get('/api/records', (req, res) => {
  const user = getUser(req.query.userId);
  res.json(user.records);
});

app.listen(PORT, () => console.log(`Tonexa running on http://localhost:${PORT}`));
