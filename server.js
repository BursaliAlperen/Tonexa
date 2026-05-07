const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIG ---
const ADMIN_ID = process.env.ADMIN_ID || "6296765793";
const APP_ID = "tonexa-ads-pro";

// --- FIREBASE INITIALIZATION ---
// Render ortamında env değişkeni olarak JSON formatında girmelisin.
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
    console.error("Firebase config missing!");
    process.exit(1);
}

const db = admin.firestore();

// Helpers
const userRef = (uid) => db.collection('artifacts').doc(APP_ID).collection('users').doc(String(uid));
const withdrawCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('withdrawals');

// --- ENDPOINTS ---

// 1. Sync User
app.post('/api/sync', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
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
                walletAddress: "",
                joinedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await uDoc.set(newUser);

            // Ref Bonus
            if (start_param && start_param !== String(id)) {
                const inviter = userRef(start_param);
                await inviter.update({
                    balance: admin.firestore.FieldValue.increment(0.01),
                    totalInvited: admin.firestore.FieldValue.increment(1)
                }).catch(() => {});
            }
            return res.json(newUser);
        }
        res.json(snap.data());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Update Wallet Address
app.post('/api/user/update-wallet', async (req, res) => {
    const { userId, walletAddress } = req.body;
    try {
        await userRef(userId).update({ walletAddress });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Reward (Ad Completed)
app.post('/api/reward', async (req, res) => {
    const { userId } = req.body;
    try {
        const uDoc = userRef(userId);
        const snap = await uDoc.get();
        if (snap.data().adsToday >= 100) return res.status(403).send("Limit reached");

        const reward = 0.002;
        await uDoc.update({
            balance: admin.firestore.FieldValue.increment(reward),
            adsToday: admin.firestore.FieldValue.increment(1)
        });
        
        const newBalance = (snap.data().balance || 0) + reward;
        res.json({ success: true, balance: newBalance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;
    try {
        const uDoc = userRef(userId);
        const snap = await uDoc.get();
        const userData = snap.data();

        if (userData.balance < amount || amount < 0.1) return res.status(400).send("Invalid amount");

        await db.runTransaction(async (t) => {
            t.update(uDoc, { balance: admin.firestore.FieldValue.increment(-amount) });
            const newRequest = withdrawCol().doc();
            t.set(newRequest, {
                userId,
                address,
                amount,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
