# Cloudflare Wildcard & DNS Manager Bot

Bot Telegram premium untuk mengelola pendaftaran DNS A Record dan setup Wildcard Domain secara otomatis menggunakan Cloudflare Worker.

## Fitur Utama

- **Penyatuan Alur DNS & Wildcard:** Melakukan pointing IP (A Record) dan dilanjutkan secara interaktif ke pendaftaran wildcard/custom hostname dalam 1 alur tombol.
- **Deteksi & Pembersihan Konflik DNS Otomatis:** Secara otomatis menghapus record DNS CNAME/A yang bentrok (mengatasi Cloudflare error `100117`) sebelum menghubungkan domain ke Worker.
- **Proxy Script Worker Dinamis:** Otomatis men-deploy script reverse proxy dinamis yang mengarah ke subdomain backend Anda tanpa memerlukan upload kode manual.
- **Isolasi Pengguna Penuh:** Mendukung banyak pengguna dengan sesi dan penyimpanan kredensial API Key Cloudflare yang terisolasi secara terpisah untuk tiap user ID Telegram.
- **Navigasi Mudah:** Dilengkapi tombol kembali ke menu utama pada setiap langkah interaksi.

## Prasyarat

- **Node.js** v16 ke atas.
- **Telegram Bot Token** (didapatkan dari [@BotFather](https://t.me/BotFather)).
- **Akun Cloudflare** (Email, Global API Key, dan Account ID).

## Instalasi

1. **Clone Repository:**
   ```bash
   git clone git@github.com:dadanr6699/botautodomainwc.git
   cd botautodomainwc
   ```

2. **Install Dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Buat file `.env` di direktori utama dan isi dengan token bot Anda:
   ```env
   BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
   ```

## Menjalankan Bot

### Mode Pengembangan (Development)
```bash
npm run dev
```

### Menggunakan PM2 (Production)
```bash
pm2 start index.js --name "wildcard-bot"
```

---
👨‍💻 **Dev:** @Dadan_R01
