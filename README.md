# DnstoreWildcard — Cloudflare DNS & Tunnel Telegram Bot

Implementasi bot Telegram untuk mengelola Cloudflare DNS Record A dan Cloudflare Tunnel (Custom Hostname + Automatic SSL DV) langsung dari aplikasi Telegram.

## 🤖 Informasi Bot
- **Username Bot:** [@seeatesst_bot](https://t.me/seeatesst_bot)
- **Token:** `8797429352:AAGXQRvT7HvtouRy6B3wykeY8qeHMLXlNDU`
- **VPS Host:** VPS Herza (`104.207.93.66`)
- **Service Systemd:** `dnstorewildcard-bot.service`

## 🚀 Fitur Utama
1. **Cloudflare API Token Authentication**:
   - Login berbasis API Token aman (Zone Read, DNS Edit, SSL Edit).
   - Token disimpan aman di database SQLite lokal per user.
   - Fitur logout & revoke kapan saja.
2. **Manajemen Domain / Zones**:
   - Deteksi otomatis semua domain yang ada di akun Cloudflare.
   - Switch domain aktif dengan tombol inline interaktif.
3. **Subdomain & DNS Record A**:
   - Tambah subdomain custom dengan validasi hostname & IP publik.
   - Generator subdomain acak (4 karakter alfanumerik) instan.
   - Tombol cepat auto-detect dan gunakan IP VPS Herza saat pembuatan record.
   - Deteksi konflik record (jika sudah ada, bot meminta konfirmasi overwrite).
4. **Lihat & Hapus DNS Record**:
   - Tampilan paginasi daftar record A.
   - Detail record (IP target, status Cloudflare Proxy/CDN, TTL).
   - Hapus record dengan konfirmasi keamanan.
5. **Cloudflare Tunnel (Custom Hostname + Automatic SSL DV)**:
   - Otomasi provisioning 4 tahap standar dnstorewildcard:
     1. Pembuatan A record proxied (orange cloud ON).
     2. Pemeriksaan & konfigurasi Fallback Origin.
     3. Pendaftaran Custom Hostname dengan SSL DV tipe HTTP.
     4. Pembuatan TXT record ownership verification jika disyaratkan oleh Cloudflare.
   - Monitor dan refresh status sertifikat SSL (active, pending_validation, dll).
   - Hapus tunnel (Custom Hostname saja atau Custom Hostname + DNS A record).
6. **Tools Pendukung**:
   - Cek IP publik VPS langsung di chat.
   - Panduan lengkap cara membuat API Token di Cloudflare Dashboard.
   - Hubungi developer dan grup komunitas.

## 🛠️ Manajemen Service di VPS

```bash
# Cek status bot
systemctl status dnstorewildcard-bot

# Restart bot
systemctl restart dnstorewildcard-bot

# Stop bot
systemctl stop dnstorewildcard-bot

# Start bot
systemctl start dnstorewildcard-bot

# Lihat live log bot
journalctl -u dnstorewildcard-bot -f
```
