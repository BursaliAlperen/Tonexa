const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

// ---------- FIREBASE BAŞLAT ----------
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT hatalı JSON:', error.message);
    process.exit(1);
}
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// Statik dosyaları sun (public klasörü)
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
    ADMIN_IDS: (process.env.ADMIN_IDS || '')
        .split(',')
        .map(id => Number(id.trim()))
        .filter(Number.isFinite)
};

function getMidnightUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getTime();
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function isAdmin(adminIdRaw) {
    const adminId = Number(adminIdRaw);
    if (!Number.isFinite(adminId)) return false;
    if (!CONFIG.ADMIN_IDS.length) return true;
    return CONFIG.ADMIN_IDS.includes(adminId);
}

function normalizeEvent(docId, event, user = null) {
    const now = Date.now();
    const type = event.type || 'one_time';
    const reward = Number(event.reward || 0);
    const base = {
        id: docId,
        type,
        title: event.title || 'Etkinlik',
        reward,
        image: event.image || '',
        referralMessage: event.referralMessage || '',
        requiredReferrals: Number(event.requiredReferrals || 0),
        requiredAds: Number(event.requiredAds || 0)
    };

    if (type === 'one_time') {
        const endTime = Number(event.endTime || 0);
        return {
            ...base,
            eventKey: docId,
            startTime: Number(event.startTime || now),
            endTime,
            isActive: endTime > now,
            claimable: user ? !(user.completedEvents || []).includes(docId) : true,
            progressText: user ? 'Tek seferlik ödül' : ''
        };
    }

    const durationHours = Number(event.durationHours || 24);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const startHourUTC = Number(event.startHourUTC || 0);
    const startTime = dayStart.getTime() + (startHourUTC * 60 * 60 * 1000);
    const endTime = startTime + (durationHours * 60 * 60 * 1000);
    const key = `${docId}:${todayKey()}`;
    const completed = user ? (user.completedEvents || []).includes(key) : false;

    if (type === 'daily_referral_goal') {
        const referrals = Number(user?.rewardedReferrals || 0);
        const need = Number(event.requiredReferrals || 1);
        return {
            ...base,
            eventKey: key,
            startTime,
            endTime,
            isActive: now >= startTime && now < endTime,
            claimable: user ? (referrals >= need && !completed && now >= startTime && now < endTime) : false,
            progressText: user ? `Davet: ${referrals}/${need}` : '',
            requiredReferrals: need
        };
    }

    if (type === 'daily_watch_goal') {
        const watched = Number(user?.adsWatchedToday || 0);
        const need = Number(event.requiredAds || 1);
        return {
            ...base,
            eventKey: key,
            startTime,
            endTime,
            isActive: now >= startTime && now < endTime,
            claimable: user ? (watched >= need && !completed && now >= startTime && now < endTime) : false,
            progressText: user ? `Reklam: ${watched}/${need}` : '',
            requiredAds: need
        };
    }

    return {
        ...base,
        eventKey: key,
        startTime,
        endTime,
        isActive: now >= startTime && now < endTime,
        claimable: false,
        progressText: user ? 'Bilinmeyen etkinlik tipi' : ''
    };
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
        referralHistory: [],
        rewardedReferrals: 0,
        level: 1,
        xp: 0,
        referredBy: null,
        firstName: '',
        lastName: '',
        username: '',
        photoUrl: ''
    };
}

// ==================== API UÇLARI ====================

// Yeni kullanıcı kaydı / güncelleme (Telegram bilgileriyle)
app.post('/api/user/register', async (req, res) => {
    const { userId, firstName, lastName, username, photoUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
        await userRef.set({
            ...defaultUser(userId),
            firstName: firstName || '',
            lastName: lastName || '',
            username: username || '',
            photoUrl: photoUrl || ''
        });
        console.log(`✅ Yeni kullanıcı oluşturuldu: ${userId}`);
    } else {
        await userRef.update({
            firstName: firstName || '',
            lastName: lastName || '',
            username: username || '',
            photoUrl: photoUrl || ''
        });
    }
    res.json({ success: true });
});

// Kullanıcı bilgisi
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

// Reklam izleme
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

// Para çekme
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

// Geçmiş
app.get('/api/user/:userId/history', async (req, res) => {
    const doc = await db.collection('users').doc(req.params.userId).get();
    if (!doc.exists) return res.json([]);
    res.json(doc.data().withdrawalHistory || []);
});

// Referans
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
        const newHistory = [
            {
                referredUserId: String(userId),
                reward: CONFIG.REFERRAL_REWARD,
                date: new Date().toISOString(),
                active: true
            },
            ...(referrer.referralHistory || [])
        ];
        await referrerRef.update({
            totalEarning: (referrer.totalEarning || 0) + CONFIG.REFERRAL_REWARD,
            rewardedReferrals: newCount,
            referralHistory: newHistory
        });
    }

    res.json({ success: true, reward: CONFIG.REFERRAL_REWARD });
});

// Referans geçmişi/istatistik
app.get('/api/user/:userId/referrals', async (req, res) => {
    const { userId } = req.params;
    const range = String(req.query.range || 'all');
    const now = Date.now();
    const ranges = {
        '1h': 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1m': 30 * 24 * 60 * 60 * 1000,
        '1y': 365 * 24 * 60 * 60 * 1000
    };

    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return res.json({ totalReferrals: 0, totalReward: 0, history: [] });
    const user = doc.data();
    const history = user.referralHistory || [];

    const filtered = !ranges[range]
        ? history
        : history.filter((h) => (now - new Date(h.date).getTime()) <= ranges[range]);

    const totalReward = filtered.reduce((sum, h) => sum + Number(h.reward || 0), 0);
    res.json({
        totalReferrals: filtered.length,
        totalReward,
        history: filtered
    });
});

// Etkinlikler
app.get('/api/events', async (req, res) => {
    const { userId } = req.query;
    let user = null;
    if (userId) {
        const userDoc = await db.collection('users').doc(String(userId)).get();
        if (userDoc.exists) user = userDoc.data();
    }

    const snapshot = await db.collection('events').where('isActive', '!=', false).get();
    const events = [];
    snapshot.forEach((doc) => {
        const normalized = normalizeEvent(doc.id, doc.data(), user);
        if (normalized.isActive) events.push(normalized);
    });
    events.sort((a, b) => a.endTime - b.endTime);
    res.json(events);
});

// Etkinlik claim
app.post('/api/user/:userId/claimEvent', async (req, res) => {
    const { userId } = req.params;
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ error: 'eventId required' });

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const user = userDoc.data();

    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    const normalized = normalizeEvent(eventId, eventDoc.data(), user);
    if (!normalized.isActive) return res.status(400).json({ error: 'Event has ended' });
    if ((user.completedEvents || []).includes(normalized.eventKey)) {
        return res.status(400).json({ error: 'Event already claimed' });
    }
    if (!normalized.claimable) {
        return res.status(400).json({ error: normalized.progressText || 'Event requirements not completed' });
    }

    const reward = normalized.reward || 0;
    const completed = [...(user.completedEvents || []), normalized.eventKey];
    await userRef.update({
        totalEarning: (user.totalEarning || 0) + reward,
        completedEvents: completed
    });

    res.json({ success: true, reward, newTotal: (user.totalEarning || 0) + reward });
});

// Admin doğrulama
app.use('/api/admin', (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.query.adminId || req.body?.adminId;
    if (!isAdmin(adminId)) {
        return res.status(403).json({ error: 'Admin yetkisi gerekli' });
    }
    next();
});

// Admin: hızlı durum kontrolü (UI görünürlüğü için)
app.get('/api/admin/check', (req, res) => {
    const adminId = req.query.adminId;
    res.json({ isAdmin: isAdmin(adminId) });
});

// Admin: çekim geçmişi
app.get('/api/admin/withdrawals', async (req, res) => {
    const snapshot = await db.collection('users').get();
    const rows = [];
    snapshot.forEach((doc) => {
        const user = doc.data();
        (user.withdrawalHistory || []).forEach((w) => {
            rows.push({
                userId: doc.id,
                firstName: user.firstName || '',
                username: user.username || '',
                method: w.method || 'TON Wallet',
                number: w.number || '',
                amount: Number(w.amount || 0),
                status: w.status || 'Pending',
                date: w.date || new Date().toISOString()
            });
        });
    });
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(rows);
});

// Admin: etkinlikleri listele
app.get('/api/admin/events', async (req, res) => {
    const snapshot = await db.collection('events').get();
    const events = [];
    snapshot.forEach((doc) => events.push({ id: doc.id, ...doc.data() }));
    events.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json(events);
});

// Admin: etkinlik ekle / güncelle
app.post('/api/admin/events', async (req, res) => {
    const {
        eventId,
        title,
        type,
        reward,
        image,
        endTime,
        startTime,
        durationHours,
        startHourUTC,
        requiredReferrals,
        requiredAds,
        referralMessage,
        isActive
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title gerekli' });
    if (!type) return res.status(400).json({ error: 'type gerekli' });
    if (!Number.isFinite(Number(reward))) return res.status(400).json({ error: 'reward sayı olmalı' });

    const payload = {
        title,
        type,
        reward: Number(reward),
        image: image || '',
        referralMessage: referralMessage || '',
        requiredReferrals: Number(requiredReferrals || 0),
        requiredAds: Number(requiredAds || 0),
        durationHours: Number(durationHours || 24),
        startHourUTC: Number(startHourUTC || 0),
        isActive: isActive !== false,
        createdAt: new Date().toISOString()
    };

    if (type === 'one_time') {
        payload.startTime = Number(startTime || Date.now());
        payload.endTime = Number(endTime || (Date.now() + 86400000));
    }

    const collection = db.collection('events');
    if (eventId) {
        await collection.doc(String(eventId)).set(payload, { merge: true });
        return res.json({ success: true, id: String(eventId) });
    }

    const ref = await collection.add(payload);
    res.json({ success: true, id: ref.id });
});

// Admin: etkinlik sil
app.delete('/api/admin/events/:eventId', async (req, res) => {
    await db.collection('events').doc(req.params.eventId).delete();
    res.json({ success: true });
});

// Bonus görevler
app.get('/api/bonusTasks', async (req, res) => {
    const snapshot = await db.collection('bonusTasks').get();
    const tasks = [];
    snapshot.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));
    res.json(tasks);
});


// Health check / keep-alive
app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, timestamp: Date.now() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ TonexaAdsBot backend çalışıyor: port ${PORT}`);

    const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    const KEEP_ALIVE_INTERVAL_MIN = Number(process.env.KEEP_ALIVE_INTERVAL_MIN || 14);

    if (KEEP_ALIVE_URL) {
        const pingUrl = `${KEEP_ALIVE_URL.replace(/\/$/, '')}/health`;
        setInterval(async () => {
            try {
                await fetch(pingUrl);
                console.log(`💓 Keep-alive ping başarılı: ${pingUrl}`);
            } catch (error) {
                console.error('⚠️ Keep-alive ping hatası:', error.message);
            }
        }, KEEP_ALIVE_INTERVAL_MIN * 60 * 1000);
    }
});
