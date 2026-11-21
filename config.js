const path = require('path');
const fs = require('fs');

// Load .env manual (tanpa dependensi tambahan). File .env sudah masuk .gitignore,
// sehingga token TIDAK ikut ter-commit ke repo publik.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN belum diset! Buat file .env berisi BOT_TOKEN=<token> (lihat .env.example).');
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'data.db'),
  DEV_USERNAME: '@nexusweb_dev',
  DEV_CHANNEL: 'https://t.me/nexusweb_dev',
  GROUP_COMMUNITY: 'https://t.me/tunellingnexus'
};
