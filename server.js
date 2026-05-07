const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Admin initialization from ENV
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const ADMIN_ID = process.env.ADMIN_ID;
const APP_PATH = "artifacts/tonexa-pro-w2e";

// --- HELPERS ---
const getUserDoc = (uid) => db.doc(`${APP_PATH}/users/${uid}`);
const getPublicData = (col) => db.collection(`${APP_PATH}/public/data/${col}`);

// --- KEEP ALIVE MECHANISM ---
setInterval(() => {
    if (process.env.SELF_URL) {
        axios.get(`${process.env.SELF_URL}/ping`).catch(() => {});
    }
}, 14 * 60 * 1000); // 14 mins

app.get('/ping', (req, res) => res.send('pong'));

// --- API ENDPOINTS ---

// Sync & Login
app.post('/api/sync', async (req, res) => {
    try {
        const { id, first_name, username, start_param } = req.body;
        const userRef = getUserDoc(id);
        let doc = await userRef.get();

        if (!doc.exists) {
            const newUser = {
                uid: String(id),
                name: first_name,
                username: username || '',
                balance: 0,
                adsToday: 0,
                totalEarned: 0,
                role: String(id) === ADMIN_ID ? 'admin' : 'user',
                invitedBy: start_param || null,
                joinedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await userRef.set(newUser);
            
            if (start_param && start_param !== String(id)) {
                const inviterRef = getUserDoc(start_param);
                await inviterRef.update({ balance: admin.firestore.FieldValue.increment(0.005) }).catch(()=>{});
            }
            doc = await userRef.get();
        }

        res.json(doc.data());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reward Ad (The Brain Logic)
app.post('/api/reward', async (req, res) => {
    const { userId, token } = req.body; // Token normally verified via Adsgram callback
    try {
        const userRef = getUserDoc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.data().adsToday >= 50) return res.status(403).json({ error: "Limit reached" });

        const reward = 0.002;
        await userRef.update({
            balance: admin.firestore.FieldValue.increment(reward),
            adsToday: admin.firestore.FieldValue.increment(1),
            totalEarned: admin.firestore.FieldValue.increment(reward)
        });

        res.json({ success: true, balance: (userDoc.data().balance + reward) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: Get All Pending Withdrawals
app.get('/api/admin/withdrawals', async (req, res) => {
    const { adminId } = req.query;
    if (adminId !== ADMIN_ID) return res.status(403).send("Unauthorized");

    const snapshot = await getPublicData('withdrawals').get();
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(list);
});

// Admin: Approve/Reject Withdrawal
app.post('/api/admin/action', async (req, res) => {
    const { adminId, requestId, action } = req.body;
    if (adminId !== ADMIN_ID) return res.status(403).send("Unauthorized");

    const reqRef = getPublicData('withdrawals').doc(requestId);
    await reqRef.update({ status: action === 'approve' ? 'completed' : 'rejected' });
    res.json({ success: true });
});

// Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;
    try {
        const userRef = getUserDoc(userId);
        const userSnap = await userRef.get();
        
        if (userSnap.data().balance < amount) return res.status(400).send("Insufficient");

        await db.runTransaction(async (t) => {
            t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
            const newReq = getPublicData('withdrawals').doc();
            t.set(newReq, {
                userId, address, amount, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AAA Server running on ${PORT}`));
