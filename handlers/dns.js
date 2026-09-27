const { Markup } = require('telegraf');
const db = require('../db');
const cf = require('../cloudflare');
const utils = require('../utils');
const keyboards = require('../keyboards');

async function startAddSubdomain(ctx, zoneId) {
  const user = db.getUser(ctx.from.id);
  const zoneRes = await cf.cfRequest(user, 'GET', '', null, zoneId);
  const domain = (zoneRes.success && zoneRes.result) ? zoneRes.result.name : user.selected_zone_name;

  db.setUserState(ctx.from.id, 'awaiting_sub_name', { zoneId, domain });

  const text = [
    '✨ <b>Tambah Subdomain (A Record)</b>',
    '',
    '<blockquote>🌐 <b>Domain Target:</b>',
    `<code>${utils.escapeHtml(domain)}</code></blockquote>`,
    '',
    '<blockquote>📝 <b>Instruksi:</b>',
    'Ketik nama host / subdomain yang Anda inginkan.',
    '<i>Contoh: <code>vpn</code>, <code>trojan</code>, <code>ws1</code></i></blockquote>',
    '',
    '<i>Kirim nama subdomain di chat atau tekan tombol batalkan di bawah.</i>'
  ].join('\n');

  const kb = keyboards.cancelKeyboard();
  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
}

async function startRandomSubdomain(ctx, zoneId) {
  const user = db.getUser(ctx.from.id);
  const zoneRes = await cf.cfRequest(user, 'GET', '', null, zoneId);
  const domain = (zoneRes.success && zoneRes.result) ? zoneRes.result.name : user.selected_zone_name;

  const randomSub = utils.randomStr(4);
  db.setUserState(ctx.from.id, 'awaiting_sub_ip', { zoneId, domain, sub: randomSub });

  const text = [
    '🎲 <b>Subdomain Acak Dibuat!</b>',
    '',
    '<blockquote>🌐 <b>Subdomain:</b>',
    `<code>${randomSub}.${utils.escapeHtml(domain)}</code></blockquote>`,
    '',
    '<blockquote>📍 <b>IP Target:</b>',
    'Kirimkan alamat <b>IPv4 Publik</b> VPS / Server Anda.</blockquote>',
    '',
    '<i>Kirim IP di chat atau tekan tombol batalkan di bawah.</i>'
  ].join('\n');

  const kb = keyboards.cancelKeyboard();
  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
}

async function handleSubNameInput(ctx, user, subName) {
  const tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
  const domain = tempData.domain || user.selected_zone_name;
  const zoneId = tempData.zoneId || user.selected_zone_id;

  const cleanSub = subName.trim().toLowerCase();
  if (!utils.isValidSubdomain(cleanSub)) {
    return ctx.reply(
      [
        '⚠️ <b>Format Subdomain Tidak Valid!</b>',
        '',
        '<blockquote>Hanya boleh menggunakan huruf kecil (a-z), angka (0-9), titik (.), atau strip (-).</blockquote>',
        '',
        '<i>Silakan ketik ulang nama subdomain yang diinginkan:</i>'
      ].join('\n'),
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }

  db.setUserState(ctx.from.id, 'awaiting_sub_ip', { zoneId, domain, sub: cleanSub });

  const text = [
    '✨ <b>Tambah Subdomain (A Record)</b>',
    '',
    '<blockquote>🌐 <b>Subdomain Terpilih:</b>',
    `<code>${cleanSub}.${utils.escapeHtml(domain)}</code></blockquote>`,
    '',
    '<blockquote>📍 <b>IP Target:</b>',
    'Kirimkan alamat <b>IPv4 Publik</b> VPS / Server Anda.',
    '<i>Contoh: <code>103.25.44.12</code></i></blockquote>',
    '',
    '<i>Kirim IP di chat atau tekan tombol batalkan di bawah.</i>'
  ].join('\n');

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboards.cancelKeyboard() });
}

async function handleSubIpInput(ctx, user, targetIp) {
  const tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
  const domain = tempData.domain || user.selected_zone_name;
  const zoneId = tempData.zoneId || user.selected_zone_id;
  const sub = tempData.sub;
  const cleanIp = targetIp.trim();

  if (!utils.isValidIPv4(cleanIp)) {
    return ctx.reply(
      [
        '⚠️ <b>Format IPv4 Tidak Valid!</b>',
        '',
        '<blockquote>Format harus 4 blok angka (0-255) yang dipisahkan titik.\n<i>Contoh valid: <code>103.25.44.12</code></i></blockquote>',
        '',
        '<i>Silakan kirimkan IP yang benar:</i>'
      ].join('\n'),
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }

  if (utils.isPrivateIPv4(cleanIp)) {
    return ctx.reply(
      [
        '⚠️ <b>IP Privat Terdeteksi!</b>',
        '',
        `<blockquote>Alamat IP <code>${cleanIp}</code> adalah IP lokal/privat. Cloudflare DNS publik memerlukan alamat IP publik internet.</blockquote>`,
        '',
        '<i>Silakan kirimkan IP publik VPS Anda:</i>'
      ].join('\n'),
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }

  const fqdn = `${sub}.${domain}`;
  const waitMsg = await ctx.reply(`⏳ <i>Memeriksa DNS record untuk <code>${fqdn}</code>...</i>`, { parse_mode: 'HTML' });

  const findRes = await cf.findRecord(user, zoneId, fqdn, 'A');
  if (findRes.success && findRes.record) {
    const oldRec = findRes.record;
    db.setUserState(ctx.from.id, 'confirm_overwrite_dns', {
      zoneId,
      domain,
      sub,
      ip: cleanIp,
      recordId: oldRec.id,
      oldIp: oldRec.content
    });

    const confirmText = [
      '⚠️ <b>Konfirmasi Penimpaan Record (Overwrite)</b>',
      '',
      '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(fqdn) + '</code>',
      '📌 <b>IP Saat Ini:</b> <code>' + oldRec.content + '</code>',
      '📍 <b>IP Baru:</b> <code>' + cleanIp + '</code></blockquote>',
      '',
      '<i>Record sudah terdaftar di Cloudflare. Apakah Anda ingin menimpa (overwrite) IP record ini?</i>'
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('⚡ Ya, Timpa (Overwrite)', 'do_overwrite_dns')],
      [Markup.button.callback('❌ Batalkan', 'action_cancel')]
    ]);

    return ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, confirmText, { parse_mode: 'HTML', ...kb });
  }

  // Not exists, create immediately
  const crRes = await cf.createRecord(user, zoneId, fqdn, cleanIp, 'A', false, 120);
  db.clearUserState(ctx.from.id);

  if (crRes.success) {
    const successText = [
      '🎉 <b>DNS Record Berhasil Dibuat!</b>',
      '',
      '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(fqdn) + '</code>',
      '📍 <b>IP Target:</b> <code>' + cleanIp + '</code>',
      '🆔 <b>Record ID:</b> <code>' + crRes.record.id + '</code>',
      '☁️ <b>Proxy Status:</b> DNS Only (Grey Cloud)</blockquote>',
      '',
      '<i>Subdomain siap digunakan untuk tunneling / VPN / server Anda!</i>'
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('✨ Tambah Subdomain Lagi', `dom_add_sub:${zoneId}`)],
      [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
    ]);

    return ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, successText, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ <b>Gagal membuat DNS record:</b>\n<code>${utils.escapeHtml(crRes.error)}</code>`,
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }
}

async function handleOverwriteDns(ctx) {
  const user = db.getUser(ctx.from.id);
  const tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
  const { zoneId, domain, sub, ip, recordId } = tempData;

  const fqdn = `${sub}.${domain}`;
  const upRes = await cf.updateRecord(user, zoneId, recordId, fqdn, ip, 'A', false, 120);
  db.clearUserState(ctx.from.id);

  if (upRes.success) {
    const successText = [
      '⚡ <b>DNS Record Berhasil Ditimpa!</b>',
      '',
      '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(fqdn) + '</code>',
      '📍 <b>IP Target:</b> <code>' + ip + '</code>',
      '🆔 <b>Record ID:</b> <code>' + recordId + '</code>',
      '☁️ <b>Proxy Status:</b> DNS Only (Grey Cloud)</blockquote>',
      '',
      '<i>Alamat IP berhasil diperbarui secara langsung di Cloudflare.</i>'
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('✨ Buat Subdomain Baru', `dom_add_sub:${zoneId}`)],
      [Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]
    ]);

    return ctx.editMessageText(successText, { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.editMessageText(
      `❌ <b>Gagal update record:</b>\n<code>${utils.escapeHtml(upRes.error)}</code>`,
      { parse_mode: 'HTML', ...keyboards.cancelKeyboard() }
    );
  }
}

module.exports = {
  startAddSubdomain,
  startRandomSubdomain,
  handleSubNameInput,
  handleSubIpInput,
  handleOverwriteDns
};

