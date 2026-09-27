const { Markup } = require('telegraf');

function unauthMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔐 Masuk Cloudflare (API Key)', 'action_login')],
    [Markup.button.callback('📖 Panduan Ambil API Key', 'show_tutorial')]
  ]);
}

function homeMenuKeyboard(selectedZone = null) {
  const rows = [];
  if (selectedZone) {
    rows.push([
      Markup.button.callback(`💎 Domain: ${selectedZone.name}`, `select_zone:${selectedZone.id}`)
    ]);
    rows.push([
      Markup.button.callback('✨ Buat Subdomain', `dom_add_sub:${selectedZone.id}`),
      Markup.button.callback('📋 Records DNS', `dom_records:${selectedZone.id}:0`)
    ]);
    rows.push([
      Markup.button.callback('⚡ Setting Wildcard', `dom_tunnels:${selectedZone.id}`),
      Markup.button.callback('🗑️ Hapus Wildcard', `dom_del_tunnel:${selectedZone.id}`)
    ]);
    rows.push([
      Markup.button.callback('🌐 Ganti Domain', 'menu_zones')
    ]);
  } else {
    rows.push([
      Markup.button.callback('🌐 Pilih Domain Cloudflare', 'menu_zones')
    ]);
  }

  rows.push([
    Markup.button.callback('🔄 Refresh Status', 'menu_refresh'),
    Markup.button.callback('📖 Panduan API Key', 'show_tutorial')
  ]);
  rows.push([
    Markup.button.callback('🚪 Logout Akun', 'prompt_logout')
  ]);
  return Markup.inlineKeyboard(rows);
}

function zoneSelectKeyboard(zones, selectedZoneId = null) {
  const rows = [];
  for (let i = 0; i < zones.length; i += 2) {
    const row = [];
    const z1 = zones[i];
    const isSel1 = selectedZoneId && z1.id === selectedZoneId;
    const icon1 = isSel1 ? '💎' : (z1.status === 'active' ? '🟢' : '🟠');
    row.push(Markup.button.callback(`${icon1} ${z1.name}`, `select_zone:${z1.id}`));

    if (i + 1 < zones.length) {
      const z2 = zones[i + 1];
      const isSel2 = selectedZoneId && z2.id === selectedZoneId;
      const icon2 = isSel2 ? '💎' : (z2.status === 'active' ? '🟢' : '🟠');
      row.push(Markup.button.callback(`${icon2} ${z2.name}`, `select_zone:${z2.id}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback('↩️ Dashboard Utama', 'menu_home')]);
  return Markup.inlineKeyboard(rows);
}

function zoneDetailKeyboard(zoneId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✨ Buat Subdomain', `dom_add_sub:${zoneId}`),
      Markup.button.callback('📋 Records DNS', `dom_records:${zoneId}:0`)
    ],
    [
      Markup.button.callback('⚡ Setting Wildcard', `dom_tunnels:${zoneId}`),
      Markup.button.callback('🗑️ Hapus Wildcard', `dom_del_tunnel:${zoneId}`)
    ],
    [
      Markup.button.callback('🌐 Pilih Domain Lain', 'menu_zones'),
      Markup.button.callback('↩️ Dashboard Utama', 'menu_home')
    ]
  ]);
}

function cancelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Batalkan', 'action_cancel')]
  ]);
}

function useVpsIpKeyboard() {
  return cancelKeyboard();
}

module.exports = {
  unauthMenuKeyboard,
  homeMenuKeyboard,
  zoneSelectKeyboard,
  zoneDetailKeyboard,
  cancelKeyboard,
  useVpsIpKeyboard
};
