const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- ENV & CONFIG ---
const ADMIN_ID = process.env.ADMIN_ID || "6296765793";
const APP_ID = "tonexa-ads-pro";
const SELF_URL = process.env.APP_URL;

// --- FIREBASE ADMIN INITIALIZATION ---
// Not: Paylaştığın JSON içeriğini FIREBASE_ADMIN env değişkenine koymalısın.
let firebaseConfig;
try {
    firebaseConfig = JSON.parse(process.env.FIREBASE_ADMIN);
} catch (e) {
    console.error("FIREBASE_ADMIN ENV is missing or invalid JSON!");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig)
});

const db = admin.firestore();

// --- PATH HELPERS (Strict Rules Applied) ---
const userRef = (uid) => db.collection('artifacts').doc(APP_ID).collection('users').doc(String(uid));
const publicData = (col) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(col);

// --- KEEP ALIVE ---
if (SELF_URL) {
    setInterval(() => {
        axios.get(`${SELF_URL}/ping`).catch(() => {});
    }, 12 * 60 * 1000); // 12 min
}
app.get('/ping', (req, res) => res.send('brain_active'));

// --- API ENDPOINTS ---

// 1. Sync & Reflink Logic
app.post('/api/sync', async (req, res) => {
    try {
        const { id, first_name, username, start_param } = req.body;
        if (!id) return res.status(400).send("ID Required");

        const uDoc = userRef(id);
        const snap = await uDoc.get();

        if (!snap.exists) {
            const newUser = {
                uid: String(id),
                name: first_name || "User",
                username: username || "",
                balance: 0,
                adsToday: 0,
                totalInvited: 0,
                role: String(id) === ADMIN_ID ? 'admin' : 'user',
                joinedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await uDoc.set(newUser);

            // Reflink Bonus (Davet eden varsa)
            if (start_param && start_param !== String(id)) {
                const invRef = userRef(start_param);
                await invRef.update({
                    balance: admin.firestore.FieldValue.increment(0.01), // Davet başı 0.01 TON
                    totalInvited: admin.firestore.FieldValue.increment(1)
                }).catch(() => console.log("Inviter not found"));
            }
            return res.json(newUser);
        }

        res.json(snap.data());
    } catch (e) { res.status(500).send(e.message); }
});

// 2. Reward Verification (The Brain)
app.post('/api/reward', async (req, res) => {
    const { userId, type } = req.body; // type: 'rewarded', 'interstitial' vb.
    try {
        const uDoc = userRef(userId);
        const snap = await uDoc.get();
        if (!snap.exists) return res.status(404).send("User not found");

        const data = snap.data();
        if (data.adsToday >= 100) return res.status(403).send("Daily limit");

        let reward = 0.002; 
        if (type === 'interstitial') reward = 0.001; // Geçiş reklamı daha az verir

        await uDoc.update({
            balance: admin.firestore.FieldValue.increment(reward),
            adsToday: admin.firestore.FieldValue.increment(1)
        });

        res.json({ success: true, balance: data.balance + reward });
    } catch (e) { res.status(500).send(e.message); }
});

// 3. Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;
    try {
        const uDoc = userRef(userId);
        const snap = await uDoc.get();
        if (snap.data().balance < amount || amount < 0.1) return res.status(400).send("Invalid");

        await db.runTransaction(async (t) => {
            t.update(uDoc, { balance: admin.firestore.FieldValue.increment(-amount) });
            const newReq = publicData('withdrawals').doc();
            t.set(newReq, {
                userId, address, amount, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// 4. Admin: List Pending
app.get('/api/admin/list', async (req, res) => {
    const { adminId } = req.query;
    if (adminId !== ADMIN_ID) return res.status(403).send("Unauthorized");
    
    const snap = await publicData('withdrawals').get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(list);
});

// 5. Admin: Action
app.post('/api/admin/action', async (req, res) => {
    const { adminId, requestId, status } = req.body;
    if (adminId !== ADMIN_ID) return res.status(403).send("Unauthorized");

    await publicData('withdrawals').doc(requestId).update({ status });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tonexa Brain v2 active on ${PORT}`));
