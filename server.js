const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

// Firebase Admin başlat
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// ===== STATİK DOSYALARI SUN (public klasörü) =====
app.use(express.static('public'));

// ==================== AYARLAR ====================
const CONFIG = {
  DAILY_AD_LIMIT: 50,
  XP_PER_AD: 10,
  LEVEL_XP: [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800, 8000, 9300],
  LEVEL_REWARDS: [
    0.002, 0.002214, 0.002428, 0.002642, 0.002856,
    0.003070, 0.003284, 0.003498, 0.003712, 0.003926,
    0.004140, 0.004354, 0.004568, 0.004782, 0.005
  ],
  MIN_WITHDRAWAL: 0.15,
  WITHDRAWAL_FEE: 0.01,
  REFERRAL_REWARD: 0.01,
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_IDS: process.env.ADMIN_IDS.split(',').map(Number)
};

function getMidnightUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getTime();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultUser(uid) {
  return {
    id: uid,
    totalEarning: 0,
    adCount: 0,
    adsWatchedToday: 0,
    lastAdDate: null,
    cooldownUntil: null,
    weeklyActivity: [0,0,0,0,0,0,0],
    withdrawalHistory: [],
    completedBonusTasks: [],
    completedEvents: [],
    rewardedReferrals: 0,
    level: 1,
    xp: 0,
    referredBy: null
  };
}

// ==================== API UÇLARI ====================

app.get('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();

  let user;
  if (!doc.exists) {
    user = defaultUser(userId);
    await userRef.set(user);
  } else {
    user = doc.data();
    if (user.lastAdDate !== todayKey()) {
      user.adsWatchedToday = 0;
      user.lastAdDate = todayKey();
      user.cooldownUntil = null;
      await userRef.update({ adsWatchedToday: 0, lastAdDate: todayKey(), cooldownUntil: null });
    }
    if (user.cooldownUntil && Date.now() >= user.cooldownUntil) {
      user.cooldownUntil = null;
      await userRef.update({ cooldownUntil: null });
    }
  }
  res.json(user);
});

app.post('/api/user/:userId/watchAd', async (req, res) => {
  const { userId } = req.params;
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();
  if (!doc.exists) return res.status(404).json({ error: 'User not found' });
  const user = doc.data();

  if (user.cooldownUntil && Date.now() < user.cooldownUntil) {
    const waitSec = Math.ceil((user.cooldownUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Cooldown active. Wait ${waitSec} seconds.` });
  }

  if (user.adsWatchedToday >= CONFIG.DAILY_AD_LIMIT) {
    const midnight = getMidnightUTC();
    await userRef.update({ cooldownUntil: midnight });
    return res.status(429).json({ error: 'Daily limit reached. Cooldown until 00:00 UTC.' });
  }

  const level = Math.min(user.level || 1, 15);
  const reward = CONFIG.LEVEL_REWARDS[level - 1];
  const newXP = (user.xp || 0) + CONFIG.XP_PER_AD;
  let newLevel = level;
  while (newLevel < 15 && newXP >= CONFIG.LEVEL_XP[newLevel]) {
    newLevel++;
  }

  const newAdCount = (user.adCount || 0) + 1;
  const newAdsToday = (user.adsWatchedToday || 0) + 1;
  const newTotal = (user.totalEarning || 0) + reward;

  const day = new Date().getUTCDay();
  const weekly = [...(user.weeklyActivity || [0,0,0,0,0,0,0])];
  weekly[day]++;

  let cooldownUntil = null;
  if (newAdsToday >= CONFIG.DAILY_AD_LIMIT) {
    cooldownUntil = getMidnightUTC();
  }

  await userRef.update({
    totalEarning: newTotal,
    adCount: newAdCount,
    adsWatchedToday: newAdsToday,
    lastAdDate: todayKey(),
    weeklyActivity: weekly,
    xp: newXP,
    level: newLevel,
    cooldownUntil
  });

  res.json({
    success: true,
    reward,
    newLevel,
    newTotal,
    adsWatchedToday: newAdsToday,
    xp: newXP,
    cooldownUntil
  });
});

app.post('/api/user/:userId/withdraw', async (req, res) => {
  const { userId } = req.params;
  const { amount, walletAddress } = req.body;
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();
  if (!doc.exists) return res.status(404).json({ error: 'User not found' });
  const user = doc.data();

  if (amount < CONFIG.MIN_WITHDRAWAL) return res.status(400).json({ error: `Min ${CONFIG.MIN_WITHDRAWAL} TON.` });
  if (amount > (user.totalEarning || 0)) return res.status(400).json({ error: 'Insufficient balance.' });

  const netAmount = amount - CONFIG.WITHDRAWAL_FEE;

  const message = `💰 New Withdrawal Request\n👤 User ID: ${userId}\n💳 TON Wallet: ${walletAddress}\n💵 Amount: ${amount} TON (net: ${netAmount} TON)`;
  try {
    const tgUrl = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`;
    await Promise.all(CONFIG.ADMIN_IDS.map(chatId =>
      fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message })
      })
    ));
  } catch (err) {
    console.error('Telegram notify error:', err);
  }

  const historyEntry = {
    method: 'TON Wallet',
    number: walletAddress,
    amount,
    date: new Date().toISOString(),
    status: 'Pending'
  };
  const history = user.withdrawalHistory || [];
  history.unshift(historyEntry);

  await userRef.update({
    totalEarning: user.totalEarning - amount,
    withdrawalHistory: history
  });

  res.json({ success: true, message: `Request sent. You will receive ${netAmount.toFixed(3)} TON.`, netAmount });
});

app.get('/api/user/:userId/history', async (req, res) => {
  const doc = await db.collection('users').doc(req.params.userId).get();
  if (!doc.exists) return res.json([]);
  res.json(doc.data().withdrawalHistory || []);
});

app.post('/api/user/:userId/referral', async (req, res) => {
  const { userId } = req.params;
  const { referrerId } = req.body;
  if (!referrerId || userId === referrerId) return res.status(400).json({ error: 'Invalid referral' });

  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) await userRef.set(defaultUser(userId));
  const user = (await userRef.get()).data();
  if (user.referredBy) return res.json({ success: false, message: 'Already referred' });

  await userRef.update({ referredBy: referrerId });

  const referrerRef = db.collection('users').doc(referrerId);
  const referrerDoc = await referrerRef.get();
  if (referrerDoc.exists) {
    const referrer = referrerDoc.data();
    const newCount = (referrer.rewardedReferrals || 0) + 1;
    await referrerRef.update({
      totalEarning: (referrer.totalEarning || 0) + CONFIG.REFERRAL_REWARD,
      rewardedReferrals: newCount
    });
  }

  res.json({ success: true, reward: CONFIG.REFERRAL_REWARD });
});

app.get('/api/events', async (req, res) => {
  const now = Date.now();
  const snapshot = await db.collection('events')
    .where('endTime', '>', now)
    .orderBy('endTime', 'asc')
    .get();
  const events = [];
  snapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
  res.json(events);
});

app.post('/api/user/:userId/claimEvent', async (req, res) => {
  const { userId } = req.params;
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: 'eventId required' });

  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
  const user = userDoc.data();

  if ((user.completedEvents || []).includes(eventId)) {
    return res.status(400).json({ error: 'Event already claimed' });
  }

  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
  const event = eventDoc.data();
  if (Date.now() > event.endTime) return res.status(400).json({ error: 'Event has ended' });

  const reward = event.reward || 0;
  const completed = [...(user.completedEvents || []), eventId];
  await userRef.update({
    totalEarning: (user.totalEarning || 0) + reward,
    completedEvents: completed
  });

  res.json({ success: true, reward, newTotal: (user.totalEarning || 0) + reward });
});

app.get('/api/bonusTasks', async (req, res) => {
  const snapshot = await db.collection('bonusTasks').get();
  const tasks = [];
  snapshot.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));
  res.json(tasks);
});

// Ana sayfa (fallback) – isteğe bağlı, zaten static index.html sunulur.
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ TonexaAdsBot backend + frontend running on port ${PORT}`));
