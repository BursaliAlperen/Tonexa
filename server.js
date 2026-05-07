const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- FIREBASE ADMIN KURULUMU ---
// .env içerisindeki FIREBASE_SERVICE_ACCOUNT_JSON değişkenini kullanır
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin bağlandı.");
} catch (error) {
    console.error("Firebase başlatma hatası: Service Account JSON geçersiz.");
}

const db = admin.firestore();
const ADMIN_ID = process.env.ADMIN_ID; // Senin Telegram ID'n
const APP_ID = "tonexa-pro-w2e";

// --- YARDIMCI YOLLAR ---
const userRef = (uid) => db.collection('artifacts').doc(APP_ID).collection('users').doc(String(uid));
const withdrawalCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('withdrawals');

// --- KEEP ALIVE (SUNUCUYU UYANIK TUTMA) ---
// Render/Railway gibi platformlarda 14 dakikada bir ping atar
setInterval(() => {
    if (process.env.SELF_URL) {
        axios.get(`${process.env.SELF_URL}/ping`)
            .then(() => console.log('Keep-alive: Ping başarılı'))
            .catch((e) => console.log('Keep-alive: Hata payı yok'));
    }
}, 14 * 60 * 1000);

app.get('/ping', (req, res) => res.status(200).send('active'));

// --- BEYİN ENDPOINT'LERİ ---

// 1. Senkronizasyon: Kullanıcı var mı yok mu kontrol eder, yoksa oluşturur.
app.post('/api/sync', async (req, res) => {
    try {
        const { id, first_name, username, start_param } = req.body;
        if (!id) return res.status(400).json({ error: "ID gerekli" });

        const doc = await userRef(id).get();

        if (!doc.exists) {
            const newUser = {
                uid: String(id),
                name: first_name || 'User',
                username: username || '',
                balance: 0,
                adsToday: 0,
                totalEarned: 0,
                role: String(id) === ADMIN_ID ? 'admin' : 'user',
                invitedBy: start_param || null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await userRef(id).set(newUser);
            
            // Referans Bonusu
            if (start_param && start_param !== String(id)) {
                await userRef(start_param).update({
                    balance: admin.firestore.FieldValue.increment(0.01) 
                }).catch(() => console.log("Davet eden bulunamadı."));
            }
            return res.json(newUser);
        }

        res.json(doc.data());
    } catch (e) {
        res.status(500).json({ error: "Sunucu hatası" });
    }
});

// 2. Reklam Ödülü: Bakiye artışını frontend'den değil, buradan yönetir.
app.post('/api/reward', async (req, res) => {
    const { userId } = req.body;
    try {
        const snap = await userRef(userId).get();
        if (!snap.exists) return res.status(404).send("User not found");
        
        const userData = snap.data();
        if (userData.adsToday >= 50) return res.status(403).json({ error: "Daily limit reached" });

        const reward = 0.002;
        await userRef(userId).update({
            balance: admin.firestore.FieldValue.increment(reward),
            adsToday: admin.firestore.FieldValue.increment(1),
            totalEarned: admin.firestore.FieldValue.increment(reward)
        });

        res.json({ success: true, newBalance: userData.balance + reward });
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 3. Çekim Talebi: Bakiyeyi düşer ve admin onayına gönderir.
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;
    try {
        const snap = await userRef(userId).get();
        if (snap.data().balance < amount || amount < 0.1) {
            return res.status(400).send("Invalid amount or balance");
        }

        await db.runTransaction(async (t) => {
            t.update(userRef(userId), { balance: admin.firestore.FieldValue.increment(-amount) });
            const newWithdrawal = withdrawalCol().doc();
            t.set(newWithdrawal, {
                userId,
                address,
                amount,
                status: 'pending',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 4. Admin Paneli: Onay bekleyen talepleri getirir.
app.get('/api/admin/pending', async (req, res) => {
    const { adminId } = req.query;
    if (adminId !== ADMIN_ID) return res.status(403).send("Forbidden");

    try {
        const snapshot = await withdrawalCol().where('status', '==', 'pending').get();
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(results);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Tonexa Brain Server is active on port ${PORT}`);
});
