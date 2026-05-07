const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Yönetici Paneli Başlatma
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.error("FIREBASE_ADMIN hatası: Lütfen çevresel değişkenleri kontrol edin!");
}

const db = admin.firestore();
const APP_ID = "tonexa-ads-pro";

// Yardımcı Yol Tanımlayıcıları
const userRef = (uid) => db.collection('artifacts').doc(APP_ID).collection('users').doc(String(uid));
const withdrawCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('withdrawals');

// --- STATİK DOSYA SERVİSİ (HATA ÖNLEYİCİ) ---
// 'public' klasöründeki dosyaları dışarı açar
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa isteği geldiğinde public/index.html dosyasını gönderir
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API UÇLARI ---

// 1. Kullanıcı Senkronizasyonu ve Referans Kontrolü
app.post('/api/sync', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        if (!id) return res.status(400).send("ID Gerekli");
        
        const uDoc = userRef(id);
        const snap = await uDoc.get();

        if (!snap.exists) {
            const newUser = {
                uid: String(id),
                name: first_name || "Kullanıcı",
                username: username || "",
                balance: 0,
                adsToday: 0,
                totalInvited: 0,
                walletAddress: "",
                joinedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await uDoc.set(newUser);

            // Referans Bonusu
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

// 2. Cüzdan Adresi Güncelleme
app.post('/api/user/update-wallet', async (req, res) => {
    const { userId, walletAddress } = req.body;
    try {
        await userRef(userId).update({ walletAddress });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Reklam Ödülü İşleme
app.post('/api/reward', async (req, res) => {
    const { userId } = req.body;
    try {
        const uDoc = userRef(userId);
        const snap = await uDoc.get();
        const data = snap.data();

        if (data.adsToday >= 100) return res.status(403).send("Günlük limit doldu");

        const reward = 0.002;
        await uDoc.update({
            balance: admin.firestore.FieldValue.increment(reward),
            adsToday: admin.firestore.FieldValue.increment(1)
        });
        
        res.json({ success: true, balance: (data.balance || 0) + reward });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Çekim Talebi Oluşturma
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;
    try {
        const uDoc = userRef(userId);
        const snap = await uDoc.get();
        const userData = snap.data();

        if (userData.balance < amount || amount < 0.1) {
            return res.status(400).send("Geçersiz miktar veya yetersiz bakiye");
        }

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
app.listen(PORT, () => console.log(`Tonexa Sunucusu ${PORT} portunda çalışıyor.`));
