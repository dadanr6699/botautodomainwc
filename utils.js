function isValidIPv4(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const p = ip.trim().split('.');
  if (p.length !== 4) return false;
  return p.every(it => it.length > 0 && it.length <= 3 && /^\d+$/.test(it) && Number(it) >= 0 && Number(it) <= 255);
}

function isPrivateIPv4(ip) {
  if (!isValidIPv4(ip)) return false;
  const p = ip.trim().split('.').map(Number);
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224
  );
}

function isValidSubdomain(sub) {
  if (!sub || typeof sub !== 'string') return false;
  const s = sub.trim().toLowerCase();
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(s);
}

function isValidTunnelHost(host, domain) {
  if (!host || typeof host !== 'string') return false;
  const h = host.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]{0,200})$/.test(h)) return false;
  if (!h.endsWith('.' + d)) return false;
  return h.split('.').every(part => part.length > 0 && part.length <= 63);
}

function randomStr(len = 4) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function maskApiKey(key) {
  if (!key) return '••••••';
  if (key.length > 8) {
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  }
  return '••••••';
}

function maskToken(token) {
  return maskApiKey(token);
}

async function getPublicIP() {
  const endpoints = ['https://api.ipify.org', 'https://ifconfig.me', 'https://icanhazip.com'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = (await res.text()).trim();
        if (isValidIPv4(text)) return text;
      }
    } catch (e) {}
  }
  return '104.207.93.66'; // Fallback to current VPS IP
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function safeEdit(ctx, text, extra) {
  try {
    return await ctx.editMessageText(text, extra);
  } catch (err) {
    if (err?.description?.includes('message is not modified') || err?.message?.includes('message is not modified')) {
      return null;
    }
    throw err;
  }
}

module.exports = {
  isValidIPv4,
  isPrivateIPv4,
  isValidSubdomain,
  isValidTunnelHost,
  randomStr,
  isValidEmail,
  maskApiKey,
  maskToken,
  getPublicIP,
  escapeHtml,
  safeEdit
};
