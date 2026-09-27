const { Markup } = require('telegraf');
const db = require('../db');
const cf = require('../cloudflare');
const utils = require('../utils');
const keyboards = require('../keyboards');

function sslBadge(status) {
  switch (status) {
    case 'active':
      return '🟢 Aktif (SSL DV Ready)';
    case 'pending_validation':
      return '🟡 Pending Validasi';
    case 'pending_deployment':
      return '🟡 Deployment';
    case 'initializing':
      return '⚪ Inisialisasi';
    default:
      return `⚪ ${status || 'Menunggu'}`;
  }
}

function formatProvisioningText(host, ip, stepState) {
  const getIcon = (st) => {
    if (st === 'done') return '✅';
    if (st === 'running') return '🔄';
    return '⚪';
  };

  const sections = [
    '⚡ <b>PROSES PROVISIONING TUNNEL</b>',
    [
      '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(host) + '</code>',
      '📍 <b>Target IP:</b> <code>' + utils.escapeHtml(ip) + '</code></blockquote>'
    ].join('\n'),
    [
      '<blockquote>' + `${getIcon(stepState[1].status)} <b>Langkah 1/3:</b> ${stepState[1].text}`,
      `${getIcon(stepState[2].status)} <b>Langkah 2/3:</b> ${stepState[2].text}`,
      `${getIcon(stepState[3].status)} <b>Langkah 3/3:</b> ${stepState[3].text}</blockquote>`
    ].join('\n'),
    '⏳ <i>Sedang sinkronisasi ke Cloudflare Edge...</i>'
  ];
  return sections.join('\n\n');
}

function formatTunnelSuccessText({
  host,
  ip,
  chId,
  sslStatus,
  isLiveMonitoring,
  pollCount = 1,
  elapsedSec = 0,
  txtCreated = false,
  spinner = '⠋'
}) {
  const isSslActive = sslStatus === 'active';
  const header = isSslActive
    ? '🎉 <b>CLOUDFLARE TUNNEL AKTIF & TERVERIFIKASI!</b>'
    : '🚀 <b>CLOUDFLARE TUNNEL BERHASIL DIBUAT!</b>';

  const badge = sslBadge(sslStatus);

  let monitorSection = '';
  if (isSslActive) {
    monitorSection = [
      '<blockquote>✨ <b>Sertifikat SSL DV telah AKTIF penuh!</b>',
      '🔒 Koneksi HTTPS & WAF telah siap digunakan untuk tunnel ini.</blockquote>'
    ].join('\n');
  } else if (isLiveMonitoring) {
    monitorSection = [
      '<blockquote>📡 <b>Pemantau SSL Realtime:</b>',
      `<code>${spinner}</code> <i>Memeriksa status SSL secara otomatis...</i>`,
      `⏱️ <i>Pengecekan ke-${pollCount} (${elapsedSec}s) — Tidak perlu tekan refresh.</i></blockquote>`
    ].join('\n');
  } else {
    monitorSection = [
      '<blockquote>ℹ️ <b>Sertifikat SSL DV dalam proses verifikasi CA.</b>',
      '<i>Cloudflare biasanya butuh 5-15 menit untuk menerbitkan sertifikat. Bot akan memantau di latar belakang.</i></blockquote>'
    ].join('\n');
  }

  const configList = [
    '<blockquote>📋 <b>Konfigurasi Selesai:</b>',
    `✅ DNS A Record ➔ <code>${ip}</code> (Proxied)`,
    `✅ Fallback Origin ➔ <code>${host}</code>`,
    `✅ Custom Hostname & SSL DV Terdaftar`
  ];
  if (txtCreated) {
    configList.push('✅ DNS TXT Ownership Verification Terpasang');
  }
  configList[configList.length - 1] += '</blockquote>';

  const sections = [
    header,
    [
      '<blockquote>🌐 <b>Hostname:</b> <code>' + host + '</code>',
      `📍 <b>Target IP:</b> <code>${ip}</code>`,
      `🔒 <b>Status SSL:</b> ${badge}${isLiveMonitoring ? ' <i>(Live)</i>' : ''}`,
      `🛡️ <b>CDN Proxy:</b> <code>Proxied (CDN + WAF ON)</code>`,
      `🆔 <b>Custom Host:</b> <code>${chId}</code></blockquote>`
    ].join('\n'),
    configList.join('\n'),
    monitorSection
  ];

  return sections.filter(Boolean).join('\n\n');
}

async function showTunnels(ctx, zoneId, lastRefreshed = null) {
  const user = db.getUser(ctx.from.id);
  const tunnels = db.getTunnels(ctx.from.id, zoneId);

  const textLines = [
    '🌐 <b>Setting Wildcard Manager</b>',
    '<i>(Custom Hostname + Automatic SSL DV)</i>',
    '',
    `<blockquote>🌐 <b>Domain:</b> <b>${utils.escapeHtml(user.selected_zone_name || zoneId)}</b></blockquote>`,
    ''
  ];

  if (tunnels.length === 0) {
    textLines.push('<i>Belum ada wildcard yang dibuat di domain ini.</i>');
    textLines.push('Tekan <b>🚀 Buat Wildcard Baru</b> untuk memulai provisioning otomatis.');
  } else {
    textLines.push(`Tersimpan <b>${tunnels.length}</b> wildcard. Klik untuk detail / hapus:`);
  }

  if (lastRefreshed) {
    textLines.push(`🕐 <i>Terakhir diperbarui: ${lastRefreshed}</i>`);
  }

  const buttons = [];
  for (const t of tunnels) {
    const badge = t.ssl_status === 'active' ? '🟢' : (t.ssl_status ? '🟡' : '⚪');
    buttons.push([
      Markup.button.callback(`🛡️ ${t.host} [${badge}]`, `tunnel_view:${t.id}`)
    ]);
  }

  buttons.push([
    Markup.button.callback('🚀 Buat Wildcard Baru', `tunnel_new:${zoneId}`),
    Markup.button.callback('🔄 Refresh Status SSL', `tunnel_refresh:${zoneId}`)
  ]);
  buttons.push([
    Markup.button.callback('↩️ Menu Domain', `select_zone:${zoneId}`)
  ]);

  const kb = Markup.inlineKeyboard(buttons);
  if (ctx.callbackQuery) {
    return utils.safeEdit(ctx, textLines.join('\n'), { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(textLines.join('\n'), { parse_mode: 'HTML', ...kb });
  }
}

async function startNewTunnel(ctx, zoneId) {
  const user = db.getUser(ctx.from.id);
  const domain = user.selected_zone_name;

  db.setUserState(ctx.from.id, 'awaiting_tunnel_host', { zoneId, domain });

  const text = [
    '🚀 <b>Buat Wildcard Baru</b>',
    '',
    '<blockquote>🌐 <b>Domain Target:</b>',
    `<code>${utils.escapeHtml(domain)}</code></blockquote>`,
    '',
    '<blockquote>📝 <b>Instruksi:</b>',
    'Kirimkan <b>Hostname Wildcard</b> yang ingin dibuat.',
    `<i>Harus merupakan subdomain dari domain ini, misalnya: <code>tunnel.${utils.escapeHtml(domain)}</code></i></blockquote>`,
    '',
    '<i>Kirim hostname di chat atau tekan tombol batalkan di bawah.</i>'
  ].join('\n');

  const kb = keyboards.cancelKeyboard();
  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
}

async function handleTunnelHostInput(ctx, user, hostInput) {
  const tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
  const domain = tempData.domain || user.selected_zone_name;
  const zoneId = tempData.zoneId || user.selected_zone_id;
  const cleanHost = hostInput.trim().toLowerCase();

  if (!utils.isValidTunnelHost(cleanHost, domain)) {
    return ctx.reply(
      [
        '⚠️ <b>Hostname Tidak Valid!</b>',
        '',
        `<blockquote>Hostname harus berakhiran <code>.${utils.escapeHtml(domain)}</code>\n<i>Contoh valid: <code>tunnel.${utils.escapeHtml(domain)}</code></i></blockquote>`,
        '',
        '<i>Silakan kirimkan hostname yang benar:</i>'
      ].join('\n'),
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }

  db.setUserState(ctx.from.id, 'awaiting_tunnel_ip', { zoneId, domain, host: cleanHost });

  const text = [
    '🚀 <b>Buat Wildcard Baru</b>',
    '',
    '<blockquote>🌐 <b>Hostname Terpilih:</b>',
    `<code>${cleanHost}</code></blockquote>`,
    '',
    '<blockquote>📍 <b>IP Target:</b>',
    'Kirimkan <b>IPv4 Publik VPS / Server</b> untuk wildcard ini.',
    '<i>Contoh: <code>103.25.44.12</code></i></blockquote>',
    '',
    '<i>Kirim IP di chat atau tekan tombol batalkan di bawah.</i>'
  ].join('\n');

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboards.cancelKeyboard() });
}

async function startRealtimeSslTracker({
  telegram,
  chatId,
  messageId,
  user,
  zoneId,
  tunnelId,
  chId,
  host,
  ip,
  txtCreated,
  initialStatus
}) {
  let currentStatus = initialStatus;
  const startTime = Date.now();
  const maxFastPolls = 20; // 20 polls * 4s = 80s
  const pollIntervalMs = 4000;
  const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let isMessageActive = true;

  for (let i = 1; i <= maxFastPolls; i++) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    const statusRes = await cf.getCustomHostnameStatus(user, zoneId, chId);
    if (statusRes.success && statusRes.status) {
      currentStatus = statusRes.status;
      db.updateTunnelSSL(tunnelId, currentStatus);
    }

    if (currentStatus === 'active') {
      const finalText = formatTunnelSuccessText({
        host,
        ip,
        chId,
        sslStatus: 'active',
        isLiveMonitoring: false,
        txtCreated
      });
      const finalKb = Markup.inlineKeyboard([
        [Markup.button.callback('⚡ Setting Wildcard', `dom_tunnels:${zoneId}`)],
        [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
      ]);
      try {
        await telegram.editMessageText(chatId, messageId, null, finalText, {
          parse_mode: 'HTML',
          ...finalKb
        });
      } catch (e) {}

      try {
        await telegram.sendMessage(
          chatId,
          [
            '🎉 <b>SSL DV Telah Aktif!</b>',
            '',
            `<blockquote>🌐 <b>Hostname:</b> <code>${host}</code>`,
            '🔒 <i>Sertifikat SSL DV telah aktif penuh. Tunnel siap digunakan untuk HTTPS!</i></blockquote>'
          ].join('\n'),
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
      return;
    }

    if (isMessageActive) {
      const sp = spinners[i % spinners.length];
      const updatingText = formatTunnelSuccessText({
        host,
        ip,
        chId,
        sslStatus: currentStatus,
        isLiveMonitoring: true,
        pollCount: i,
        elapsedSec,
        txtCreated,
        spinner: sp
      });
      const liveKb = Markup.inlineKeyboard([
        [Markup.button.callback('⚡ Setting Wildcard', `dom_tunnels:${zoneId}`)],
        [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
      ]);
      try {
        await telegram.editMessageText(chatId, messageId, null, updatingText, {
          parse_mode: 'HTML',
          ...liveKb
        });
      } catch (err) {
        if (!err?.description?.includes('message is not modified')) {
          isMessageActive = false;
        }
      }
    }
  }

  if (isMessageActive) {
    const finalPendingText = formatTunnelSuccessText({
      host,
      ip,
      chId,
      sslStatus: currentStatus,
      isLiveMonitoring: false,
      txtCreated
    });
    const pendingKb = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Cek Status SSL Sekarang', `tunnel_check:${tunnelId}`)],
      [Markup.button.callback('⚡ Setting Wildcard', `dom_tunnels:${zoneId}`)],
      [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
    ]);
    try {
      await telegram.editMessageText(chatId, messageId, null, finalPendingText, {
        parse_mode: 'HTML',
        ...pendingKb
      });
    } catch (e) {}
  }

  // Continue background watcher up to 10 minutes
  startBackgroundSslWatcher(telegram, chatId, user, zoneId, tunnelId, chId, host);
}

async function startBackgroundSslWatcher(telegram, chatId, user, zoneId, tunnelId, chId, host) {
  const maxBackgroundCycles = 30; // 30 * 20s = 10 minutes
  for (let c = 0; c < maxBackgroundCycles; c++) {
    await new Promise(r => setTimeout(r, 20000));
    try {
      const currentTunnel = db.getTunnelById(tunnelId);
      if (!currentTunnel || currentTunnel.ssl_status === 'active') {
        return;
      }

      const res = await cf.getCustomHostnameStatus(user, zoneId, chId);
      if (res.success && res.status) {
        db.updateTunnelSSL(tunnelId, res.status);
        if (res.status === 'active') {
          await telegram.sendMessage(
            chatId,
            [
              '🎉 <b>Notifikasi SSL Cloudflare</b>',
              '',
              `<blockquote>🌐 <b>Hostname:</b> <code>${host}</code>`,
              '🔒 <b>Status SSL:</b> 🟢 <b>Aktif (SSL DV Ready)</b>',
              '<i>Sertifikat SSL DV berhasil divalidasi dan koneksi HTTPS aman siap dinikmati.</i></blockquote>'
            ].join('\n'),
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔍 Lihat Detail Wildcard', `tunnel_view:${tunnelId}`)]
              ])
            }
          );
          return;
        }
      }
    } catch (e) {}
  }
}


async function handleTunnelIpInput(ctx, user, ipInput) {
  const tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
  const domain = tempData.domain || user.selected_zone_name;
  const zoneId = tempData.zoneId || user.selected_zone_id;
  const host = tempData.host;
  const cleanIp = ipInput.trim();

  if (!utils.isValidIPv4(cleanIp)) {
    return ctx.reply(
      '❌ <b>Format IPv4 tidak valid!</b>\nSilakan kirimkan IP yang benar:',
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }

  if (utils.isPrivateIPv4(cleanIp)) {
    return ctx.reply(
      '⚠️ <b>IP privat tidak didukung</b> untuk Cloudflare Tunnel proxied.\nSilakan kirimkan IP publik:',
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }

  const stepState = {
    1: { status: 'running', text: 'Menyiapkan DNS A Record (Proxied)...' },
    2: { status: 'waiting', text: 'Mengatur Fallback Origin' },
    3: { status: 'waiting', text: 'Registrasi Custom Hostname & SSL DV' }
  };

  const initialText = formatProvisioningText(host, cleanIp, stepState);
  const progressMsg = await ctx.reply(initialText, { parse_mode: 'HTML' });

  let lastEditTime = 0;
  const onProgress = async ({ step, status, label }) => {
    if (status === 'running') {
      stepState[step].status = 'running';
      stepState[step].text = label;
    } else if (status === 'done') {
      stepState[step].status = 'done';
      stepState[step].text = label;
      if (step < 3) {
        stepState[step + 1].status = 'running';
      }
    }
    const now = Date.now();
    if (now - lastEditTime < 800) {
      await new Promise(r => setTimeout(r, 800 - (now - lastEditTime)));
    }
    lastEditTime = Date.now();
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        null,
        formatProvisioningText(host, cleanIp, stepState),
        { parse_mode: 'HTML' }
      );
    } catch (e) {}
  };

  const result = await cf.provisionTunnel(user, zoneId, host, cleanIp, onProgress);
  db.clearUserState(ctx.from.id);

  if (result.success) {
    const tunnelId = db.saveTunnel(ctx.from.id, zoneId, host, cleanIp, result.chId, result.sslStatus);

    const isAlreadyActive = result.sslStatus === 'active';
    const text = formatTunnelSuccessText({
      host,
      ip: cleanIp,
      chId: result.chId,
      sslStatus: result.sslStatus,
      isLiveMonitoring: !isAlreadyActive,
      pollCount: 1,
      elapsedSec: 0,
      txtCreated: result.txtCreated
    });

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('⚡ Setting Wildcard', `dom_tunnels:${zoneId}`)],
      [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
    ]);

    try {
      await ctx.telegram.editMessageText(ctx.chat.id, progressMsg.message_id, null, text, {
        parse_mode: 'HTML',
        ...kb
      });
    } catch (e) {}

    if (!isAlreadyActive) {
      startRealtimeSslTracker({
        telegram: ctx.telegram,
        chatId: ctx.chat.id,
        messageId: progressMsg.message_id,
        user,
        zoneId,
        tunnelId,
        chId: result.chId,
        host,
        ip: cleanIp,
        txtCreated: result.txtCreated,
        initialStatus: result.sslStatus
      });
    }
    return;
  } else {
    const text = [
      '❌ <b>PROVISIONING TUNNEL GAGAL</b>',
      '',
      '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(host) + '</code>',
      `📍 <b>Target IP:</b> <code>${utils.escapeHtml(cleanIp)}</code></blockquote>`,
      '',
      '<blockquote>⚠️ <b>Penyebab:</b>',
      `<code>${utils.escapeHtml(result.error)}</code></blockquote>`,
      '',
      '<i>Silakan periksa konfigurasi domain atau coba beberapa saat lagi.</i>'
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Coba Lagi', `tunnel_new:${zoneId}`)],
      [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
    ]);

    return ctx.telegram.editMessageText(ctx.chat.id, progressMsg.message_id, null, text, { parse_mode: 'HTML', ...kb });
  }
}

async function refreshTunnelSsl(ctx, zoneId) {
  const user = db.getUser(ctx.from.id);
  const tunnels = db.getTunnels(ctx.from.id, zoneId);

  if (tunnels.length === 0) {
    return ctx.answerCbQuery('Tidak ada tunnel untuk di-refresh.', { show_alert: true });
  }

  let changedCount = 0;
  for (const t of tunnels) {
    if (!t.ch_id) continue;
    const statusRes = await cf.getCustomHostnameStatus(user, zoneId, t.ch_id);
    if (statusRes.success && statusRes.status) {
      if (statusRes.status !== t.ssl_status) {
        changedCount++;
      }
      db.updateTunnelSSL(t.id, statusRes.status);
    }
  }

  const nowTime = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
  const alertMsg = changedCount > 0 
    ? `✅ Status ${changedCount} tunnel diperbarui!` 
    : 'ℹ️ Status SSL belum berubah dari Cloudflare.';

  try {
    await ctx.answerCbQuery(alertMsg, { show_alert: false });
  } catch (e) {}

  return showTunnels(ctx, zoneId, nowTime);
}

async function checkSingleTunnelSsl(ctx, tunnelId) {
  const user = db.getUser(ctx.from.id);
  const tunnel = db.getTunnelById(tunnelId);
  if (!tunnel) {
    return ctx.answerCbQuery('Tunnel tidak ditemukan!', { show_alert: true });
  }

  await ctx.answerCbQuery('🔄 Memeriksa status SSL ke Cloudflare...');
  const res = await cf.getCustomHostnameStatus(user, tunnel.zone_id, tunnel.ch_id);
  if (res.success && res.status) {
    db.updateTunnelSSL(tunnel.id, res.status);
  }

  return showTunnelDetail(ctx, tunnelId);
}

async function showTunnelDetail(ctx, tunnelId) {
  const user = db.getUser(ctx.from.id);
  const tunnel = db.getTunnelById(tunnelId);
  if (!tunnel) {
    return ctx.answerCbQuery('Tunnel tidak ditemukan!', { show_alert: true });
  }

  let currentSsl = tunnel.ssl_status;
  if (tunnel.ch_id) {
    const statusRes = await cf.getCustomHostnameStatus(user, tunnel.zone_id, tunnel.ch_id);
    if (statusRes.success && statusRes.status) {
      currentSsl = statusRes.status;
      db.updateTunnelSSL(tunnel.id, currentSsl);
    }
  }

  const createdDate = new Date(tunnel.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
  const text = [
    '🌐 <b>DETAIL CLOUDFLARE TUNNEL</b>',
    '',
    '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(tunnel.host) + '</code>',
    `📍 <b>Target IP:</b> <code>${utils.escapeHtml(tunnel.ip)}</code>`,
    `🔒 <b>Status SSL:</b> ${sslBadge(currentSsl)}`,
    `🛡️ <b>CDN Proxy:</b> <code>Proxied (Orange Cloud ON)</code>`,
    `🆔 <b>Custom Host:</b> <code>${utils.escapeHtml(tunnel.ch_id)}</code>`,
    `📅 <b>Dibuat:</b> <code>${createdDate}</code></blockquote>`
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Cek Ulang SSL Realtime', `tunnel_check:${tunnel.id}`)],
    [Markup.button.callback('🗑️ Hapus Hostname Saja', `tunnel_del_ch:${tunnel.id}`)],
    [Markup.button.callback('💥 Hapus Hostname + DNS Record', `tunnel_del_both:${tunnel.id}`)],
    [Markup.button.callback('↩️ Kembali ke Setting Wildcard', `dom_tunnels:${tunnel.zone_id}`)]
  ]);

  return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
}

async function deleteTunnelAction(ctx, tunnelId, withDns = false) {
  const user = db.getUser(ctx.from.id);
  const tunnel = db.getTunnelById(tunnelId);

  if (!tunnel) {
    return ctx.answerCbQuery('Tunnel tidak ditemukan!', { show_alert: true });
  }

  await ctx.answerCbQuery('⏳ Menghapus tunnel...', { show_alert: false });
  await cf.deleteTunnelFull(user, tunnel.zone_id, tunnel.ch_id, tunnel.host, withDns);
  db.deleteTunnel(tunnel.id);

  return showTunnels(ctx, tunnel.zone_id);
}

module.exports = {
  showTunnels,
  startNewTunnel,
  handleTunnelHostInput,
  handleTunnelIpInput,
  refreshTunnelSsl,
  checkSingleTunnelSsl,
  showTunnelDetail,
  deleteTunnelAction
};

