# ⚡ DnstoreWildcard — Cloudflare DNS & Wildcard Tunnel Bot

<p align="center">
  <b>Bot Telegram Otomatisasi Cloudflare DNS Record A & Wildcard Tunneling (Custom Hostname + Automatic SSL DV)</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Telegraf-v4.16-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegraf" />
  <img src="https://img.shields.io/badge/SQLite-Better--SQLite3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Cloudflare-API_v4-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
  <img src="https://img.shields.io/badge/License-ISC-blue?style=for-the-badge" alt="License" />
</p>

---

## 📖 Tentang Proyek

**DnstoreWildcard Bot** adalah solusi otomatisasi berbasis Telegram untuk mengelola domain Cloudflare secara instan dan efisien. Bot ini memungkinkan pengguna untuk menambahkan DNS Record A, mengelola record yang ada, serta memprovisi **Cloudflare Tunnel / Custom Hostname** lengkap dengan sertifikat SSL DV (Domain Validation) otomatis tanpa perlu membuka Cloudflare Dashboard.

Antarmuka bot dirancang modern menggunakan format Telegram HTML `<blockquote>` yang elegan, dilengkapi tombol navigasi interaktif dan manajemen sesi SQLite lokal yang aman.

---

## ✨ Fitur Unggulan

### 🔐 1. Keamanan & Multi-Akun Cloudflare
* **Login Fleksibel**: Mendukung **Cloudflare API Token** (Scoped) maupun **Global API Key** + Email.
* **Penyimpanan Terisolasi**: Kredensial disimpan dalam database SQLite lokal (`better-sqlite3`) per Telegram User ID.
* **Sesi Mandiri**: Pengguna dapat berganti akun, refresh status, atau logout kapan saja.

### 🌐 2. Manajemen Zone / Domain
* **Deteksi Otomatis**: Mendeteksi seluruh domain aktif di akun Cloudflare pengguna.
* **Switch Domain Instan**: Ganti domain kerja hanya dengan satu kali klik dari dashboard interaktif.
* **Tampilan Status**: Informasi ringkas nama domain, Zone ID, dan status koneksi.

### ⚡ 3. Pembuatan Subdomain & DNS Record A
* **Custom Subdomain**: Buat subdomain pilihan sendiri dengan validasi karakter ketat (RFC compliant).
* **Random Subdomain**: Generator subdomain unik acak 4 karakter otomatis untuk kemudahan deployment cepat.
* **Deteksi Otomatis IPv4**: Filter validasi alamat IPv4 publik dan pencegahan input IP privat (RFC 1918).
* **Konflik Resolver**: Notifikasi instan jika hostname telah terdaftar dengan opsi overwrite (timpa IP) langsung.

### 📋 4. Eksplorasi & Hapus DNS Record
* **Tampilan Terpaginasi**: Menampilkan daftar record A secara rapi dengan navigasi halaman (Next/Prev).
* **Detail Record Lengkap**: Informasi IP target, status Cloudflare Proxy (Orange/Grey Cloud), dan TTL.
* **Penghapusan Aman**: Konfirmasi dialog sebelum menghapus record DNS untuk menghindari kesalahan operasional.

### 🚀 5. Provisioning Wildcard Tunnel & SSL DV Otomatis
Mengotomatisasi 4 tahapan Cloudflare for SaaS / Tunneling dalam hitungan detik:
1. **DNS A Record Proxied**: Pembuatan record A dengan status Cloudflare Proxy aktif (Orange Cloud).
2. **Fallback Origin Setup**: Memeriksa dan mendaftarkan origin fallback pada zone terkait.
3. **Custom Hostname Registration**: Mendaftarkan custom hostname dengan SSL tipe HTTP domain validation.
4. **SSL Tracker Real-Time**: Pelacakan status penerbitan SSL (*pending_validation* ➜ *active*).

### 🛠️ 6. Tools Pendukung
* **Auto-Detect VPS IPv4**: Deteksi IP publik server VPS Herza secara instan via API `ifconfig.me`.
* **Petunjuk Interaktif**: Panduan pembuatan Cloudflare API Token terpadu di dalam menu Telegram.
* **Komunitas & Bantuan**: Navigasi langsung ke kanal developer dan grup diskusi.

---

## 📂 Struktur Direktori

```text
dnstorewildcard/bot/
├── bot.js                 # Entry point bot, event dispatcher, state routing
├── cloudflare.js          # Client wrapper API Cloudflare v4 (DNS & Custom Hostnames)
├── config.js              # Manajemen konfigurasi dan environment variable
├── db.js                  # Skema database SQLite & persistence query (better-sqlite3)
├── keyboards.js           # Desain inline keyboard & tata letak tombol interaktif
├── utils.js               # Helper string, HTML escaper, dan IPv4 validator
├── handlers/
│   ├── common.js          # Dashboard utama, panduan API token, VPS IP, help
│   ├── dns.js             # Flow input subdomain, random subdomain, overwrite DNS
│   ├── records.js         # Flow listing, detail record, dan aksi hapus DNS
│   └── tunnel.js          # Flow pembuatan wildcard tunnel & pemantauan status SSL
├── package.json           # Dependensi modul Node.js
└── README.md              # Dokumentasi teknis proyek
```

---

## 🚀 Panduan Instalasi & Deployment

### 1. Prasyarat Sistem
* **OS:** Linux (Ubuntu 20.04/22.04/24.04 LTS)
* **Node.js:** v18.x atau lebih baru
* **NPM:** v9.x atau lebih baru

### 2. Kloning Repositori & Instalasi
```bash
git clone git@github.com:dadanr6699/botautodomainwc.git /root/dnstorewildcard/bot
cd /root/dnstorewildcard/bot
npm install
```

### 3. Konfigurasi
Sesuaikan variabel lingkungan pada file `.env` atau `config.js`:
```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
DB_PATH=/root/dnstorewildcard/bot/data.db
```

---

## ⚙️ Manajemen Service VPS (Systemd)

Bot dikelola menggunakan service systemd agar otomatis berjalan di background dan tangguh saat terjadi restart server.

Unit file tersimpan di: `/etc/systemd/system/dnstorewildcard-bot.service`

| Aksi | Perintah Bash |
| :--- | :--- |
| **Cek Status Bot** | `systemctl status dnstorewildcard-bot` |
| **Restart Bot** | `systemctl restart dnstorewildcard-bot` |
| **Hentikan Bot** | `systemctl stop dnstorewildcard-bot` |
| **Jalankan Bot** | `systemctl start dnstorewildcard-bot` |
| **Pantau Live Log** | `journalctl -u dnstorewildcard-bot -f` |

---

## 🔑 Izin Cloudflare API Token

Jika menggunakan otentikasi **API Token**, pastikan Token Cloudflare memiliki hak akses (*Permissions*) berikut:

| Kategori | Izin | Level Akses |
| :--- | :--- | :--- |
| **Zone** | `Zone` | **Read** |
| **Zone** | `DNS` | **Edit** |
| **Zone** | `SSL and Certificates` | **Edit** |

> 💡 *Resource Scope: Terapkan pada **All Zones** atau domain spesifik yang dikelola.*

---

## 🤝 Repositori & Kontribusi

* **GitHub Repository:** [github.com/dadanr6699/botautodomainwc](https://github.com/dadanr6699/botautodomainwc)
* **Branch Utama:** `main`
* **Lisensi:** ISC License

---
<p align="center">
  <b>DnstoreWildcard Bot</b> — Cloudflare Automation Telegram Bot
</p>

