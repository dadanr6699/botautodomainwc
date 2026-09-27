const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const db = require('./db');
const cf = require('./cloudflare');
const utils = require('./utils');
const keyboards = require('./keyboards');
const common = require('./handlers/common');
const dns = require('./handlers/dns');
const records = require('./handlers/records');
const tunnel = require('./handlers/tunnel');

const bot = new Telegraf(config.BOT_TOKEN);

bot.catch((err, ctx) => {
  if (err?.description?.includes('message is not modified') || err?.message?.includes('message is not modified')) {
    return;
  }
  console.error(`[Bot Error] ${ctx.updateType}:`, err);
  try {
    ctx.reply('⚠️ <i>Terjadi kesalahan internal bot. Silakan coba kembali atau kirim /menu.</i>', { parse_mode: 'HTML' });
  } catch (e) {}
});

// ---------- Helper Functions ----------

async function testAndSaveCredentials(ctx, email, apiKey) {
  const waitMsg = await ctx.reply('⏳ <i>Memverifikasi Email & Global API Key ke Cloudflare...</i>', { parse_mode: 'HTML' });
  const testRes = await cf.getZones({ email, key: apiKey });
  if (testRes.success) {
    db.setUserCredentials(ctx.from.id, email, apiKey);
    const zones = testRes.zones;
    if (zones.length > 0) {
      db.setSelectedZone(ctx.from.id, zones[0].id, zones[0].name);
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `🎉 <b>Login Berhasil!</b>\n📧 Email: <code>${utils.escapeHtml(email)}</code>\n📊 Terdeteksi <b>${zones.length}</b> domain pada akun Anda.`,
      { parse_mode: 'HTML' }
    );
    return common.renderHome(ctx);
  } else {
    return ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ <b>Autentikasi Ditolak Cloudflare:</b>\n<code>${utils.escapeHtml(testRes.error)}</code>\n\nPastikan Email dan Global API Key Anda sudah benar.\n<i>(Ambil di dash.cloudflare.com ➔ My Profile ➔ API Keys ➔ Global API Key)</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔐 Coba Masuk Lagi', 'action_login')],
          [Markup.button.callback('📖 Panduan API Key', 'show_tutorial')]
        ])
      }
    );
  }
}

// ---------- Commands ----------

bot.command(['start', 'menu'], async (ctx) => {
  db.clearUserState(ctx.from.id);
  return common.renderHome(ctx);
});

bot.command(['key', 'login'], async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length >= 3) {
    const email = parts[1].trim().toLowerCase();
    const apiKey = parts[2].trim();
    if (!utils.isValidEmail(email)) {
      return ctx.reply('❌ <b>Format email tidak valid!</b>\nContoh: <code>/key kamu@gmail.com c2547eb745079dac9320b638f5e225cf483cc5</code>', { parse_mode: 'HTML' });
    }
    return testAndSaveCredentials(ctx, email, apiKey);
  }

  db.setUserState(ctx.from.id, 'awaiting_email');
  const text = [
    '📧 <b>Langkah 1/2: Masukkan Email Cloudflare</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Silakan ketik atau kirimkan email akun Cloudflare Anda.',
    '<i>Contoh: <code>kamu@gmail.com</code></i>',
    '',
    '<i>Atau gunakan langsung:</i>',
    '<code>/key &lt;email&gt; &lt;global_api_key&gt;</code>',
    '',
    '<i>Kirim /cancel untuk batal.</i>'
  ].join('\n');
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboards.cancelKeyboard() });
});

bot.command('token', async (ctx) => {
  return ctx.reply(
    '⚠️ <b>Bot sekarang menggunakan Cloudflare Global API Key</b> (bukan API Token).\n\n' +
    'Gunakan perintah:\n' +
    '<code>/key &lt;email&gt; &lt;global_api_key&gt;</code>\n' +
    'atau klik tombol di bawah untuk login interaktif.',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔐 Masuk Cloudflare (API Key)', 'action_login')],
        [Markup.button.callback('📖 Panduan Ambil API Key', 'show_tutorial')]
      ])
    }
  );
});

bot.command('logout', async (ctx) => {
  db.logoutUser(ctx.from.id);
  return ctx.reply('🚪 <b>Berhasil keluar!</b> Akun Cloudflare Anda telah dihapus dari sistem bot.', {
    parse_mode: 'HTML',
    ...keyboards.unauthMenuKeyboard()
  });
});

bot.command(['zones', 'domains'], async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user.cf_email || !user.cf_api_key) return common.renderHome(ctx);

  const res = await cf.getZones(user);
  if (!res.success) {
    return ctx.reply(`❌ <b>Gagal memuat domain:</b>\n<code>${utils.escapeHtml(res.error)}</code>`, { parse_mode: 'HTML' });
  }
  return ctx.reply('🌐 <b>Pilih Domain Cloudflare:</b>', {
    parse_mode: 'HTML',
    ...keyboards.zoneSelectKeyboard(res.zones, user.selected_zone_id)
  });
});

bot.command('records', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user.cf_email || !user.cf_api_key) return common.renderHome(ctx);
  if (!user.selected_zone_id) {
    return ctx.reply('⚠️ <i>Pilih domain terlebih dahulu:</i>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🌐 Pilih Domain Cloudflare', 'menu_zones')]])
    });
  }
  return records.showRecords(ctx, user.selected_zone_id, 0);
});

bot.command('tunnels', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user.cf_email || !user.cf_api_key) return common.renderHome(ctx);
  if (!user.selected_zone_id) {
    return ctx.reply('⚠️ <i>Pilih domain terlebih dahulu:</i>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🌐 Pilih Domain Cloudflare', 'menu_zones')]])
    });
  }
  return tunnel.showTunnels(ctx, user.selected_zone_id);
});

bot.command('ip', async (ctx) => {
  return common.showVpsIp(ctx);
});

bot.command('tutorial', async (ctx) => {
  return common.showTutorial(ctx);
});

bot.command('help', async (ctx) => {
  const text = [
    '⚡ <b>Daftar Perintah DnstoreWildcard Bot</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '• /start atau /menu — Buka dashboard utama',
    '• /key [email] [api_key] — Login dengan Global API Key Cloudflare',
    '• /domains — Pilih domain / zone yang aktif',
    '• /records — Lihat daftar DNS A records domain aktif',
    '• /tunnels — Kelola Setting Wildcard & SSL',
    '• /ip — Cek IP publik VPS (Herza)',
    '• /tutorial — Panduan cara mengambil Global API Key',
    '• /logout — Hapus data Cloudflare dari bot',
    '• /cancel — Batalkan input saat ini',
    '━━━━━━━━━━━━━━━━━━━━'
  ].join('\n');
  return ctx.reply(text, { parse_mode: 'HTML' });
});

bot.command('cancel', async (ctx) => {
  db.clearUserState(ctx.from.id);
  await ctx.reply('❌ <i>Operasi dibatalkan.</i>', { parse_mode: 'HTML' });
  return common.renderHome(ctx);
});

// ---------- Callback Query Handlers ----------

bot.action('action_login', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id, 'awaiting_email');
  const text = [
    '📧 <b>Langkah 1/2: Masukkan Email Cloudflare</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Silakan ketik atau kirimkan email akun Cloudflare Anda.',
    '<i>Contoh: <code>kamu@gmail.com</code></i>',
    '',
    '<i>Atau kirim langsung:</i>',
    '<code>/key &lt;email&gt; &lt;global_api_key&gt;</code>',
    '',
    '<i>Kirim /cancel untuk batal.</i>'
  ].join('\n');
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboards.cancelKeyboard() });
});

bot.action('prompt_logout', async (ctx) => {
  await ctx.answerCbQuery();
  const text = [
    '🚪 <b>Konfirmasi Keluar</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Apakah Anda yakin ingin menghapus akun Cloudflare dari bot ini?',
    '<i>(Domain dan DNS record Anda di Cloudflare tidak akan terpengaruh).</i>'
  ].join('\n');
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🚪 Ya, Logout Akun', 'confirm_logout')],
    [Markup.button.callback('❌ Batalkan', 'menu_home')]
  ]);
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
});

bot.action('confirm_logout', async (ctx) => {
  await ctx.answerCbQuery('Berhasil logout');
  db.logoutUser(ctx.from.id);
  return common.renderHome(ctx);
});

bot.action('show_tutorial', async (ctx) => {
  await ctx.answerCbQuery();
  return common.showTutorial(ctx);
});

bot.action('show_vps_ip', async (ctx) => {
  await ctx.answerCbQuery();
  return common.showVpsIp(ctx);
});

bot.action('show_contact', async (ctx) => {
  await ctx.answerCbQuery();
  return common.showContact(ctx);
});

bot.action('menu_home', async (ctx) => {
  await ctx.answerCbQuery();
  db.clearUserState(ctx.from.id);
  return common.renderHome(ctx);
});

bot.action('menu_refresh', async (ctx) => {
  await ctx.answerCbQuery('🔄 Memperbarui status...');
  return common.renderHome(ctx);
});

bot.action('menu_zones', async (ctx) => {
  await ctx.answerCbQuery();
  const user = db.getUser(ctx.from.id);
  if (!user.cf_email || !user.cf_api_key) return common.renderHome(ctx);
  const res = await cf.getZones(user);
  if (!res.success) {
    return ctx.editMessageText(`❌ <b>Gagal:</b>\n<code>${utils.escapeHtml(res.error)}</code>`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]])
    });
  }
  return ctx.editMessageText('🌐 <b>Pilih Domain Cloudflare:</b>', {
    parse_mode: 'HTML',
    ...keyboards.zoneSelectKeyboard(res.zones, user.selected_zone_id)
  });
});

bot.action(/^select_zone:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const zoneId = ctx.match[1];
  const user = db.getUser(ctx.from.id);
  const zonesRes = await cf.getZones(user);
  let zoneName = zoneId;
  if (zonesRes.success) {
    const target = zonesRes.zones.find(z => z.id === zoneId);
    if (target) zoneName = target.name;
  }
  db.setSelectedZone(ctx.from.id, zoneId, zoneName);

  const text = [
    `🌐 <b>Domain Terpilih: ${utils.escapeHtml(zoneName)}</b>`,
    `Zone ID: <code>${zoneId}</code>`,
    '━━━━━━━━━━━━━━━━━━━━',
    '<i>Pilih tindakan untuk domain ini:</i>'
  ].join('\n');
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboards.zoneDetailKeyboard(zoneId) });
});

bot.action('menu_quick_random', async (ctx) => {
  await ctx.answerCbQuery();
  const user = db.getUser(ctx.from.id);
  if (!user.cf_email || !user.cf_api_key) return common.renderHome(ctx);
  if (!user.selected_zone_id) {
    return ctx.editMessageText('⚠️ <i>Pilih domain terlebih dahulu:</i>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🌐 Pilih Domain Cloudflare', 'menu_zones')]])
    });
  }
  return dns.startRandomSubdomain(ctx, user.selected_zone_id);
});


bot.action(/^dom_add_sub:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return dns.startAddSubdomain(ctx, ctx.match[1]);
});

bot.action(/^dom_rand_sub:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return dns.startRandomSubdomain(ctx, ctx.match[1]);
});

bot.action('do_overwrite_dns', async (ctx) => {
  await ctx.answerCbQuery('Menimpa record DNS...');
  return dns.handleOverwriteDns(ctx);
});

bot.action(/^dom_records:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return records.showRecords(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
});

bot.action(/^rec_view:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return records.showRecordDetail(ctx, ctx.match[1]);
});

bot.action(/^rec_del:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return records.confirmDeleteRecord(ctx, ctx.match[1]);
});

bot.action(/^rec_dodel:(.+)$/, async (ctx) => {
  return records.executeDeleteRecord(ctx, ctx.match[1]);
});

bot.action(/^dom_tunnels:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return tunnel.showTunnels(ctx, ctx.match[1]);
});

bot.action(/^tunnel_new:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return tunnel.startNewTunnel(ctx, ctx.match[1]);
});

bot.action(/^tunnel_refresh:(.+)$/, async (ctx) => {
  return tunnel.refreshTunnelSsl(ctx, ctx.match[1]);
});

bot.action(/^tunnel_check:(\d+)$/, async (ctx) => {
  return tunnel.checkSingleTunnelSsl(ctx, parseInt(ctx.match[1], 10));
});

bot.action(/^tunnel_view:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return tunnel.showTunnelDetail(ctx, parseInt(ctx.match[1], 10));
});

bot.action(/^tunnel_del_ch:(\d+)$/, async (ctx) => {
  return tunnel.deleteTunnelAction(ctx, parseInt(ctx.match[1], 10), false);
});

bot.action(/^tunnel_del_both:(\d+)$/, async (ctx) => {
  return tunnel.deleteTunnelAction(ctx, parseInt(ctx.match[1], 10), true);
});

bot.action(/^use_vps_ip:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Menggunakan IP VPS');
  const ip = ctx.match[1];
  const user = db.getUser(ctx.from.id);
  if (user.state === 'awaiting_sub_ip') {
    return dns.handleSubIpInput(ctx, user, ip);
  } else if (user.state === 'awaiting_tunnel_ip') {
    return tunnel.handleTunnelIpInput(ctx, user, ip);
  }
});

bot.action('action_cancel', async (ctx) => {
  await ctx.answerCbQuery('Dibatalkan');
  db.clearUserState(ctx.from.id);
  return common.renderHome(ctx);
});

// ---------- Text Messages Handler ----------

bot.on('text', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  const text = ctx.message.text.trim();

  if (text.startsWith('/')) return; // handled by commands

  switch (user.state) {
    case 'awaiting_email': {
      let email = '';
      let apiKey = '';
      if (text.includes(':')) {
        const [e, ...rest] = text.split(':');
        email = e.trim().toLowerCase();
        apiKey = rest.join(':').trim();
      } else {
        const parts = text.split(/\\s+/);
        if (parts.length >= 2) {
          email = parts[0].trim().toLowerCase();
          apiKey = parts[1].trim();
        }
      }

      if (email && apiKey && utils.isValidEmail(email)) {
        return testAndSaveCredentials(ctx, email, apiKey);
      }

      if (!utils.isValidEmail(text)) {
        return ctx.reply('❌ <b>Format email tidak valid!</b>\\nSilakan ketikkan alamat email yang benar (contoh: <code>kamu@gmail.com</code>):', {
          parse_mode: 'HTML',
          ...keyboards.cancelKeyboard()
        });
      }

      db.setUserState(ctx.from.id, 'awaiting_key', { email: text.toLowerCase() });
      const step2Text = [
        '🔑 <b>Langkah 2/2: Masukkan Global API Key</b>',
        '━━━━━━━━━━━━━━━━━━━━',
        `Email: <code>${utils.escapeHtml(text.toLowerCase())}</code>`,
        '',
        'Sekarang kirimkan <b>Global API Key</b> Cloudflare Anda:',
        '<i>(Dapat dilihat di dash.cloudflare.com ➔ My Profile ➔ API Keys ➔ Global API Key)</i>',
        '',
        '<i>Kirim /cancel untuk batal.</i>'
      ].join('\\n');
      return ctx.reply(step2Text, { parse_mode: 'HTML', ...keyboards.cancelKeyboard() });
    }
    case 'awaiting_key': {
      const tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
      const email = tempData.email;
      if (!email) {
        db.setUserState(ctx.from.id, 'awaiting_email');
        return ctx.reply('⚠️ Silakan masukkan email Cloudflare Anda terlebih dahulu:', { parse_mode: 'HTML' });
      }
      return testAndSaveCredentials(ctx, email, text);
    }
    case 'awaiting_sub_name': {
      return dns.handleSubNameInput(ctx, user, text);
    }
    case 'awaiting_sub_ip': {
      return dns.handleSubIpInput(ctx, user, text);
    }
    case 'awaiting_tunnel_host': {
      return tunnel.handleTunnelHostInput(ctx, user, text);
    }
    case 'awaiting_tunnel_ip': {
      return tunnel.handleTunnelIpInput(ctx, user, text);
    }
    default: {
      let possibleEmail = '';
      let possibleKey = '';
      if (text.includes(':')) {
        const [e, ...rest] = text.split(':');
        possibleEmail = e.trim().toLowerCase();
        possibleKey = rest.join(':').trim();
      } else {
        const parts = text.split(/\\s+/);
        if (parts.length === 2) {
          possibleEmail = parts[0].trim().toLowerCase();
          possibleKey = parts[1].trim();
        }
      }
      if (possibleEmail && possibleKey && utils.isValidEmail(possibleEmail) && possibleKey.length >= 20) {
        return testAndSaveCredentials(ctx, possibleEmail, possibleKey);
      }

      return ctx.reply(
        '⚡ <b>DnstoreWildcard Bot</b>\nKetik /menu untuk membuka dashboard kontrol Cloudflare Anda atau /help untuk melihat panduan.',
        { parse_mode: 'HTML' }
      );
    }
  }
});

// Start bot
bot.launch().then(() => {
  console.log('⚡ DnstoreWildcard Telegram Bot is online and running!');
}).catch(err => {
  console.error('Failed to launch bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

