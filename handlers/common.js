const { Markup } = require('telegraf');
const db = require('../db');
const cf = require('../cloudflare');
const utils = require('../utils');
const keyboards = require('../keyboards');
const config = require('../config');

async function renderHome(ctx, userId = null) {
  const uid = userId || ctx.from.id;
  const user = db.getUser(uid);

  if (!user.cf_email || !user.cf_api_key) {
    const text = [
      '⚡ <b>DnstoreWildcard — Cloudflare Manager</b>',
      '<i>Kelola DNS Record A & Setting Wildcard langsung dari Telegram.</i>',
      '',
      '<blockquote>🔒 <b>Status Akun: Belum Terhubung</b>',
      'Silakan hubungkan akun Cloudflare Anda menggunakan <b>Email & Global API Key</b> untuk mengelola DNS records dan otomatisasi Wildcard SSL.</blockquote>',
      '',
      '<blockquote>💡 <b>Cara Menghubungkan Cepat:</b>',
      'Gunakan perintah berikut di chat:',
      '<code>/key &lt;email&gt; &lt;global_api_key&gt;</code>',
      'Atau tekan tombol <b>🔑 Masuk</b> di bawah.</blockquote>'
    ].join('\n');

    const kb = keyboards.unauthMenuKeyboard();
    if (ctx.callbackQuery) {
      return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
    } else {
      return ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  // User has credentials, check zones
  const zonesRes = await cf.getZones(user);
  if (!zonesRes.success) {
    const text = [
      '⚡ <b>DnstoreWildcard — Cloudflare Manager</b>',
      '',
      '<blockquote>⚠️ <b>Koneksi ke Cloudflare Gagal</b>',
      `Error: <code>${utils.escapeHtml(zonesRes.error)}</code></blockquote>`,
      '',
      '<blockquote>💡 <b>Solusi:</b>',
      'Pastikan Email dan Global API Key Anda sudah benar serta memiliki izin akses yang valid pada akun Cloudflare.</blockquote>',
      '',
      '<i>Silakan login ulang dengan data yang benar:</i>'
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Masuk Ulang (API Key)', 'action_login')],
      [Markup.button.callback('🚪 Logout Akun', 'confirm_logout')]
    ]);

    if (ctx.callbackQuery) {
      return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
    } else {
      return ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  const zones = zonesRes.zones;
  let selectedZone = null;
  if (user.selected_zone_id) {
    selectedZone = zones.find(z => z.id === user.selected_zone_id);
  }
  if (!selectedZone && zones.length > 0) {
    selectedZone = zones[0];
    db.setSelectedZone(uid, selectedZone.id, selectedZone.name);
  }

  const maskedKey = utils.maskApiKey(user.cf_api_key);
  const zoneName = selectedZone ? selectedZone.name : 'Belum dipilih';
  const zoneId = selectedZone ? selectedZone.id : '-';
  const zoneStatus = selectedZone 
    ? (selectedZone.status === 'active' ? '🟢 Aktif' : `🟠 ${selectedZone.status}`)
    : 'Belum dipilih';

  const text = [
    '⚡ <b>DnstoreWildcard — Cloudflare Manager</b>',
    '<i>Panel Manajemen DNS Record & Setting Wildcard</i>',
    '',
    '<blockquote>👤 <b>Akun Cloudflare</b>',
    `📧 <b>Email:</b> <code>${utils.escapeHtml(user.cf_email)}</code>`,
    `🔑 <b>API Key:</b> <code>${maskedKey}</code>`,
    `📊 <b>Total Domain:</b> <b>${zones.length}</b> domain terhubung</blockquote>`,
    '',
    '<blockquote>🌐 <b>Domain Aktif</b>',
    `🏷️ <b>Nama:</b> <code>${utils.escapeHtml(zoneName)}</code>`,
    `🆔 <b>Zone ID:</b> <code>${zoneId}</code>`,
    `⚡ <b>Status:</b> ${zoneStatus}</blockquote>`,
    '',
    '<i>Pilih menu di bawah untuk mulai mengelola DNS atau Wildcard:</i>'
  ].join('\n');

  const kb = keyboards.homeMenuKeyboard(selectedZone);
  if (ctx.callbackQuery) {
    return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
}

async function showTutorial(ctx) {
  const text = [
    '📖 <b>Panduan Mengambil Global API Key Cloudflare</b>',
    '',
    '<blockquote>1️⃣ Buka <b>dash.cloudflare.com</b> di browser',
    '2️⃣ Login dengan akun Cloudflare Anda',
    '3️⃣ Klik ikon Profil (kanan atas) ➔ <b>My Profile</b>',
    '4️⃣ Pilih tab menu <b>API Keys</b>',
    '5️⃣ Pada baris <b>Global API Key</b>, klik <b>View</b>',
    '6️⃣ Masukkan password Cloudflare & selesaikan captcha',
    '7️⃣ Salin <b>Global API Key</b> yang ditampilkan</blockquote>',
    '',
    '<blockquote>💡 <b>Format Cepat via Chat:</b>',
    '<code>/key &lt;email&gt; &lt;global_api_key&gt;</code>',
    '<i>Contoh:</i>',
    '<code>/key kamu@gmail.com c2547eb745079dac9320b638f5e225cf483cc5</code></blockquote>'
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔐 Masukkan API Key Sekarang', 'action_login')],
    [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
  ]);

  if (ctx.callbackQuery) {
    return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
}

async function showVpsIp(ctx) {
  const ip = await utils.getPublicIP();
  const text = [
    '🌐 <b>Informasi IP Publik VPS (Herza)</b>',
    '',
    `<blockquote>📍 <b>IPv4 VPS:</b> <code>${ip}</code></blockquote>`,
    '',
    '<i>Tekan pada teks IP di atas untuk menyalin langsung ke clipboard. IP ini dapat digunakan sebagai target A Record atau Wildcard VPS Anda.</i>'
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
  ]);

  if (ctx.callbackQuery) {
    return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
}

async function showContact(ctx) {
  const text = [
    '💬 <b>Kontak Developer & Komunitas</b>',
    '',
    `<blockquote>👨‍💻 <b>Developer:</b> <a href="${config.DEV_CHANNEL}">NexusDev</a> (${config.DEV_USERNAME})`,
    `👥 <b>Grup Komunitas:</b> <a href="${config.GROUP_COMMUNITY}">Tunneling Nexus</a></blockquote>`,
    '',
    '<i>Diskusi VPN, tunneling Cloudflare, info script, dan layanan VPS.</i>'
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.url('👨‍💻 Hubungi Developer', config.DEV_CHANNEL),
      Markup.button.url('👥 Grup Komunitas', config.GROUP_COMMUNITY)
    ],
    [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
  ]);

  if (ctx.callbackQuery) {
    return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb, disable_web_page_preview: true });
  }
}

module.exports = {
  renderHome,
  showTutorial,
  showVpsIp,
  showContact
};
