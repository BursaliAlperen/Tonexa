<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Tonexa Ads Pro</title>
    <!-- Reklam SDK -->
    <script src="https://richinfo.co/richpartners/telegram/js/tg-ob.js"></script>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
            --bg: #070b10;
            --card: #121820;
            --primary: #0088cc;
            --text: #ffffff;
            --text-dim: #8e97a2;
            --success: #00c853;
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; font-family: sans-serif; }
        body { background: var(--bg); color: var(--text); margin: 0; padding: 0; }

        /* Ekranlar */
        .screen { display: none; padding: 20px; padding-bottom: 100px; animation: fadeIn 0.3s ease; }
        .screen.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* Kartlar ve Butonlar */
        .card { background: var(--card); border-radius: 20px; padding: 20px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.05); }
        .btn { background: var(--primary); color: white; border: none; padding: 15px; border-radius: 15px; width: 100%; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; }
        .btn:disabled { opacity: 0.5; }

        .balance-hero { text-align: center; padding: 30px 0; }
        .balance-hero h1 { font-size: 45px; margin: 10px 0; color: var(--primary); }

        /* Hızlı Miktar Butonları */
        .quick-amounts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 15px 0; }
        .q-btn { background: #1a222c; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 12px; border-radius: 12px; font-weight: bold; }
        .q-btn:active { background: var(--primary); }

        .input-group { margin-bottom: 15px; }
        .input-group label { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 5px; text-transform: uppercase; }
        .input-group input { width: 100%; background: #0a0e14; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; color: white; outline: none; }

        /* Navigasyon */
        .nav { position: fixed; bottom: 20px; left: 20px; right: 20px; background: rgba(18,24,32,0.95); backdrop-filter: blur(10px); border-radius: 20px; display: flex; padding: 8px; border: 1px solid rgba(255,255,255,0.1); }
        .nav-item { flex: 1; text-align: center; color: var(--text-dim); text-decoration: none; font-size: 10px; padding: 10px; display: flex; flex-direction: column; gap: 5px; }
        .nav-item.active { color: var(--primary); }
        .nav-item i { font-size: 20px; }

        #loader { position: fixed; inset: 0; background: var(--bg); display: flex; justify-content: center; align-items: center; z-index: 1000; }
    </style>
</head>
<body>

    <div id="loader"><i class="fas fa-circle-notch fa-spin fa-2x" style="color: var(--primary);"></i></div>

    <!-- ANA SAYFA -->
    <div id="home" class="screen active">
        <div class="balance-hero">
            <div style="font-size: 12px; color: var(--text-dim); letter-spacing: 1px;">TOPLAM BAKİYE (TON)</div>
            <h1 id="ui-bal">0.0000</h1>
        </div>
        <div class="card">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 10px;">
                <span>GÜNLÜK HEDEF</span>
                <span id="ui-ads">0 / 100</span>
            </div>
            <button class="btn" id="ad-btn" onclick="playAd()">
                <i class="fas fa-play-circle"></i> REKLAM İZLE KAZAN
            </button>
        </div>
    </div>

    <!-- CÜZDAN / ÇEKİM -->
    <div id="wallet" class="screen">
        <h3>Cüzdanım</h3>
        <div class="card">
            <div class="input-group">
                <label>ÇEKİLECEK MİKTAR</label>
                <input type="number" id="withdraw-input" placeholder="0.00">
            </div>
            <div class="quick-amounts">
                <button class="q-btn" onclick="setWithdrawAmt(0.10)">0.10</button>
                <button class="q-btn" onclick="setWithdrawAmt(0.50)">0.50</button>
                <button class="q-btn" onclick="setWithdrawAmt('max')">MAX</button>
            </div>
            <div class="input-group">
                <label>ÖDEME ADRESİ</label>
                <input type="text" id="wallet-display" readonly placeholder="Ayarlardan adres kaydedin">
            </div>
            <button class="btn" onclick="requestWithdraw()">
                <i class="fas fa-wallet"></i> BAKİYEYİ ÇEK
            </button>
        </div>
    </div>

    <!-- AYARLAR -->
    <div id="settings" class="screen">
        <h3>Profil Ayarları</h3>
        <div class="card">
            <div class="input-group">
                <label>TON CÜZDAN ADRESİ (UQ... veya EQ...)</label>
                <input type="text" id="wallet-input" placeholder="Cüzdan adresinizi yapıştırın">
            </div>
            <button class="btn" onclick="saveWallet()">
                <i class="fas fa-save"></i> ADRESİ GÜNCELLE
            </button>
        </div>
        <div class="card" style="text-align: center;">
            <p style="font-size: 13px; color: var(--text-dim);">Arkadaşlarını davet et, her kayıt olan için 0.01 TON kazan!</p>
            <button class="btn" onclick="copyRef()">
                <i class="fas fa-copy"></i> DAVET LİNKİNİ KOPYALA
            </button>
        </div>
    </div>

    <nav class="nav">
        <a href="javascript:void(0)" class="nav-item active" onclick="switchTab('home', this)">
            <i class="fas fa-home"></i><span>ANA SAYFA</span>
        </a>
        <a href="javascript:void(0)" class="nav-item" onclick="switchTab('wallet', this)">
            <i class="fas fa-wallet"></i><span>CÜZDAN</span>
        </a>
        <a href="javascript:void(0)" class="nav-item" onclick="switchTab('settings', this)">
            <i class="fas fa-user-cog"></i><span>AYARLAR</span>
        </a>
    </nav>

    <script>
        const tg = window.Telegram.WebApp;
        const API = window.location.origin; // Otomatik URL tespiti
        let user = null;

        // SDK Başlatma
        if (window.TelegramAdsController) {
            window.TelegramAdsController.initialize({ pubId: "988708", appId: "7279" });
        }

        async function syncData() {
            const tgUser = tg.initDataUnsafe.user || { id: "6296765793", first_name: "Test" };
            try {
                const res = await fetch(`${API}/api/sync`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        id: tgUser.id,
                        first_name: tgUser.first_name,
                        username: tgUser.username,
                        start_param: tg.initDataUnsafe.start_param
                    })
                });
                user = await res.json();
                updateUI();
            } catch (e) {
                tg.showAlert("Sunucu bağlantısı sağlanamadı!");
            } finally {
                document.getElementById('loader').style.display = 'none';
            }
        }

        function updateUI() {
            document.getElementById('ui-bal').innerText = user.balance.toFixed(4);
            document.getElementById('ui-ads').innerText = `${user.adsToday} / 100`;
            document.getElementById('wallet-display').value = user.walletAddress || "Adres Kayıtlı Değil";
            document.getElementById('wallet-input').value = user.walletAddress || "";
        }

        function switchTab(id, el) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            el.classList.add('active');
            tg.HapticFeedback.selectionChanged();
        }

        function setWithdrawAmt(v) {
            const input = document.getElementById('withdraw-input');
            if (v === 'max') input.value = user.balance.toFixed(2);
            else input.value = v;
        }

        async function saveWallet() {
            const addr = document.getElementById('wallet-input').value.trim();
            if (addr.length < 10) return tg.showAlert("Geçersiz cüzdan adresi!");

            const res = await fetch(`${API}/api/user/update-wallet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId: user.uid, walletAddress: addr })
            });
            if (res.ok) {
                user.walletAddress = addr;
                updateUI();
                tg.showAlert("Cüzdan adresiniz güncellendi!");
            }
        }

        async function playAd() {
            const btn = document.getElementById('ad-btn');
            if (user.adsToday >= 100) return tg.showAlert("Günlük limite ulaştınız!");
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> YÜKLENİYOR...';

            window.TelegramAdsController.playAd({
                type: 'rewarded',
                onCompleted: async () => {
                    const res = await fetch(`${API}/api/reward`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ userId: user.uid })
                    });
                    const data = await res.json();
                    user.balance = data.balance;
                    user.adsToday += 1;
                    updateUI();
                    tg.HapticFeedback.notificationOccurred('success');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-play-circle"></i> REKLAM İZLE KAZAN';
                },
                onFailed: () => {
                    tg.showAlert("Reklam şu an müsait değil.");
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-play-circle"></i> REKLAM İZLE KAZAN';
                }
            });
        }

        async function requestWithdraw() {
            const amount = parseFloat(document.getElementById('withdraw-input').value);
            if (!user.walletAddress) return tg.showAlert("Önce ayarlardan cüzdan adresi kaydedin!");
            if (amount < 0.1) return tg.showAlert("Minimum çekim 0.10 TON!");
            if (amount > user.balance) return tg.showAlert("Yetersiz bakiye!");

            const res = await fetch(`${API}/api/withdraw`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId: user.uid, address: user.walletAddress, amount: amount })
            });
            if (res.ok) {
                user.balance -= amount;
                updateUI();
                tg.showAlert("Çekim talebi gönderildi! 24 saat içinde onaylanacaktır.");
            }
        }

        function copyRef() {
            const link = `https://t.me/TonexaAdsBot?start=${user.uid}`;
            const el = document.createElement('textarea');
            el.value = link; document.body.appendChild(el);
            el.select(); document.execCommand('copy');
            document.body.removeChild(el);
            tg.showAlert("Referans linkiniz kopyalandı!");
        }

        window.onload = () => {
            tg.expand();
            syncData();
        };
    </script>
</body>
</html>
