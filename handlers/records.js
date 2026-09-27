const { Markup } = require('telegraf');
const db = require('../db');
const cf = require('../cloudflare');
const utils = require('../utils');

const PAGE_SIZE = 6;

async function showRecords(ctx, zoneId, page = 0) {
  page = Math.max(0, parseInt(page, 10) || 0);
  const user = db.getUser(ctx.from.id);

  const recsRes = await cf.getRecords(user, zoneId, 'A');
  if (!recsRes.success) {
    const text = `❌ <b>Gagal memuat record DNS:</b>\n<code>${utils.escapeHtml(recsRes.error)}</code>`;
    const kb = Markup.inlineKeyboard([[Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]]);
    if (ctx.callbackQuery) return ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }

  const records = recsRes.records || [];
  const totalPages = Math.ceil(records.length / PAGE_SIZE) || 1;
  const startIdx = page * PAGE_SIZE;
  const pageRecords = records.slice(startIdx, startIdx + PAGE_SIZE);

  const textLines = [
    '📖 <b>Daftar DNS Record (Type A)</b>',
    '',
    `<blockquote>🌐 <b>Domain:</b> <b>${utils.escapeHtml(user.selected_zone_name || zoneId)}</b>`,
    `📊 <b>Total:</b> <b>${records.length}</b> record(s) — Halaman <b>${page + 1}/${totalPages}</b></blockquote>`,
    ''
  ];

  if (records.length === 0) {
    textLines.push('<i>Belum ada A Record yang dibuat pada domain ini.</i>');
  } else {
    textLines.push('<i>Pilih record di bawah untuk melihat detail atau menghapus:</i>');
  }

  const buttons = [];
  for (const r of pageRecords) {
    const proxiedIcon = r.proxied ? '🟠' : '⚪';
    let label = `${proxiedIcon} ${r.name} ➔ ${r.content}`;
    if (label.length > 50) {
      label = `${proxiedIcon} ${r.name.slice(0, 22)}... ➔ ${r.content}`;
    }
    buttons.push([
      Markup.button.callback(label, `rec_view:${r.id}`)
    ]);
  }

  // Navigation row
  const navRow = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('◀️ Sebelumnya', `dom_records:${zoneId}:${page - 1}`));
  }
  if (page + 1 < totalPages) {
    navRow.push(Markup.button.callback('Berikutnya ▶️', `dom_records:${zoneId}:${page + 1}`));
  }
  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback('✨ Tambah Record', `dom_add_sub:${zoneId}`),
    Markup.button.callback('↩️ Menu Domain', `select_zone:${zoneId}`)
  ]);

  const kb = Markup.inlineKeyboard(buttons);
  if (ctx.callbackQuery) {
    return utils.safeEdit(ctx, textLines.join('\n'), { parse_mode: 'HTML', ...kb });
  } else {
    return ctx.reply(textLines.join('\n'), { parse_mode: 'HTML', ...kb });
  }
}

async function showRecordDetail(ctx, recordId) {
  const user = db.getUser(ctx.from.id);
  const zoneId = user.selected_zone_id;
  if (!zoneId) {
    return ctx.answerCbQuery('Pilih domain terlebih dahulu!', { show_alert: true });
  }
  const res = await cf.cfRequest(user, 'GET', `/dns_records/${recordId}`, null, zoneId);

  if (!res.success || !res.result) {
    return ctx.answerCbQuery('Record tidak ditemukan atau sudah dihapus!', { show_alert: true });
  }

  const r = res.result;
  const proxiedText = r.proxied ? '🟠 Aktif (Proxied CDN)' : '⚪ Mati (DNS Only)';
  const text = [
    '📋 <b>Detail DNS Record A</b>',
    '',
    '<blockquote>🌐 <b>Hostname:</b> <code>' + utils.escapeHtml(r.name) + '</code>',
    `📍 <b>IP Target:</b> <code>${r.content}</code>`,
    `☁️ <b>Proxy:</b> ${proxiedText}`,
    `⏱️ <b>TTL:</b> ${r.ttl} detik`,
    `🆔 <b>Record ID:</b> <code>${r.id}</code></blockquote>`
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Hapus Record Ini', `rec_del:${r.id}`)],
    [Markup.button.callback('↩️ Kembali ke Daftar', `dom_records:${zoneId}:0`)]
  ]);

  return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
}

async function confirmDeleteRecord(ctx, recordId) {
  const user = db.getUser(ctx.from.id);
  const zoneId = user.selected_zone_id;
  if (!zoneId) {
    return ctx.answerCbQuery('Pilih domain terlebih dahulu!', { show_alert: true });
  }
  const res = await cf.cfRequest(user, 'GET', `/dns_records/${recordId}`, null, zoneId);
  const r = res.result || {};

  const text = [
    '⚠️ <b>Konfirmasi Hapus Record</b>',
    '',
    `<blockquote>Apakah Anda yakin ingin menghapus record <code>${utils.escapeHtml(r.name || recordId)}</code>?\n<i>Tindakan ini tidak dapat dibatalkan.</i></blockquote>`
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Ya, Hapus Permanen', `rec_dodel:${recordId}`)],
    [Markup.button.callback('❌ Batalkan', `rec_view:${recordId}`)]
  ]);

  return utils.safeEdit(ctx, text, { parse_mode: 'HTML', ...kb });
}

async function executeDeleteRecord(ctx, recordId) {
  const user = db.getUser(ctx.from.id);
  const zoneId = user.selected_zone_id;
  if (!zoneId) {
    return ctx.answerCbQuery('Pilih domain terlebih dahulu!', { show_alert: true });
  }
  const res = await cf.deleteRecord(user, zoneId, recordId);

  if (res.success) {
    await ctx.answerCbQuery('🗑️ Record berhasil dihapus!', { show_alert: false });
    return showRecords(ctx, zoneId, 0);
  } else {
    return ctx.answerCbQuery(`❌ Gagal: ${res.error}`, { show_alert: true });
  }
}

module.exports = {
  showRecords,
  showRecordDetail,
  confirmDeleteRecord,
  executeDeleteRecord
};
