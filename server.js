const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rewards = [
  { label: '15 ART', val: 15, type: 'art', color: '#fef08a' },
  { label: '0.01 TON', val: 0.01, type: 'ton', color: '#38bdf8' },
  { label: '25 ART', val: 25, type: 'art', color: '#fca5a5' },
  { label: '20 ART', val: 20, type: 'art', color: '#86efac' },
  { label: '50 ART', val: 50, type: 'art', color: '#c4b5fd' },
  { label: '10 ART', val: 10, type: 'art', color: '#fdba74' },
  { label: '35 ART', val: 35, type: 'art', color: '#f9a8d4' },
  { label: '5 ART', val: 5, type: 'art', color: '#93c5fd' }
];

function parseFirebaseAdmin() {
  if (!process.env.FIREBASE_ADMIN) return null;
  try {
    return JSON.parse(process.env.FIREBASE_ADMIN);
  } catch {
    return JSON.parse(process.env.FIREBASE_ADMIN.replace(/\\n/g, '\n'));
  }
}

const serviceAccount = parseFirebaseAdmin();
if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.apps.length ? admin.firestore() : null;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultUser(id = 'demo') {
  return {
    id,
    art: 550,
    ton: 0.15,
    spins: 5,
    wallet: '',
    minWithdraw: 0.2,
    hasClaimedGift: false,
    adWatchCount: 0,
    adWatchDay: dayKey(),
    records: { wallet: [], swap: [], friends: [], promo: [], spin: [] }
  };
}

async function getUser(id = 'demo') {
  if (!db) return defaultUser(id);
  const ref = db.collection('users').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const user = defaultUser(id);
    await ref.set(user);
    await db.collection('meta').doc('collections').set({ initializedAt: Date.now() }, { merge: true });
    return user;
  }
  const user = { ...defaultUser(id), ...snap.data() };
  if (user.adWatchDay !== dayKey()) {
    user.adWatchDay = dayKey();
    user.adWatchCount = 0;
  }
  return user;
}

async function saveUser(user) {
  if (!db) return;
  await db.collection('users').doc(user.id).set(user, { merge: true });
}

app.get('/api/state', async (req, res) => {
  const user = await getUser(req.query.userId);
  await saveUser(user);
  res.json(user);
});

app.post('/api/spin', async (req, res) => {
  const user = await getUser(req.body.userId);
  if (user.spins <= 0) return res.status(400).json({ error: 'NO_SPINS' });
  const index = Number(req.body.index);
  if (!Number.isInteger(index) || index < 0 || index >= rewards.length) return res.status(400).json({ error: 'BAD_INDEX' });

  user.spins -= 1;
  const win = rewards[index];
  if (win.type === 'art') user.art += win.val;
  else user.ton += win.val;
  user.records.spin.unshift({ ts: Date.now(), message: `Spin: ${win.label}` });
  await saveUser(user);
  res.json({ index, win, spins: user.spins, art: user.art, ton: user.ton });
});

app.post('/api/watch-ad', async (req, res) => {
  const user = await getUser(req.body.userId);
  if (user.adWatchDay !== dayKey()) {
    user.adWatchDay = dayKey();
    user.adWatchCount = 0;
  }
  if (user.adWatchCount >= 50) return res.status(400).json({ error: 'AD_LIMIT_REACHED' });
  user.adWatchCount += 1;
  user.spins += 1;
  await saveUser(user);
  res.json({ spins: user.spins, adWatchCount: user.adWatchCount, adLimit: 50, day: user.adWatchDay });
});

app.get('/api/admin/promos', async (_, res) => {
  if (!db) return res.json([]);
  const snap = await db.collection('promos').get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

app.post('/api/redeem', async (req, res) => {
  const user = await getUser(req.body.userId);
  const code = String(req.body.code || '').toUpperCase();
  let reward = 50;
  if (db) {
    const promoRef = db.collection('promos').doc(code);
    const promoSnap = await promoRef.get();
    if (!promoSnap.exists) return res.status(400).json({ error: 'INVALID_CODE' });
    const promo = promoSnap.data();
    const used = Number(promo.used || 0);
    const maxUses = Number(promo.maxUses || 0);
    if (maxUses > 0 && used >= maxUses) return res.status(400).json({ error: 'PROMO_LIMIT' });
    reward = Number(promo.reward || 50);
    await promoRef.set({ used: used + 1 }, { merge: true });
  } else if (code !== 'TONEXA50') {
    return res.status(400).json({ error: 'INVALID_CODE' });
  }

  user.art += reward;
  user.records.promo.unshift({ ts: Date.now(), message: `Promo ${code} (+${reward} ART)` });
  await saveUser(user);
  res.json({ ok: true, art: user.art });
});

app.get('/api/records', async (req, res) => {
  const user = await getUser(req.query.userId);
  await saveUser(user);
  res.json(user.records);
});

app.get('/healthz', (_, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => console.log(`Tonexa running on http://localhost:${PORT}`));
