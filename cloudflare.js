const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function getAuthHeaders(auth) {
  if (!auth) return {};
  if (typeof auth === 'object') {
    const email = (auth.email || auth.cf_email || '').trim();
    const key = (auth.key || auth.apiKey || auth.cf_api_key || '').trim();
    if (email && key) {
      return {
        'X-Auth-Email': email,
        'X-Auth-Key': key
      };
    }
    if (auth.token || auth.cf_token) {
      return { 'Authorization': `Bearer ${(auth.token || auth.cf_token).trim()}` };
    }
  }
  if (typeof auth === 'string') {
    if (auth.includes(':')) {
      const [email, ...rest] = auth.split(':');
      return {
        'X-Auth-Email': email.trim(),
        'X-Auth-Key': rest.join(':').trim()
      };
    }
    return { 'Authorization': `Bearer ${auth.trim()}` };
  }
  return {};
}

async function cfRequest(auth, method, path, body = null, zoneId = null) {
  const url = zoneId ? `${CF_API_BASE}/zones/${zoneId}${path}` : `${CF_API_BASE}${path}`;
  const headers = {
    ...getAuthHeaders(auth),
    'Content-Type': 'application/json',
    'User-Agent': 'DnstoreWildcard-Bot/1.0'
  };

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(30000)
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const data = await res.json();
    return data;
  } catch (err) {
    return {
      success: false,
      errors: [{ message: err.message || 'Gagal menghubungi Cloudflare API' }]
    };
  }
}

function getErrorMessage(res, defaultMsg = 'Terjadi kesalahan pada Cloudflare API') {
  if (res && Array.isArray(res.errors) && res.errors.length > 0) {
    const err = res.errors[0];
    return err.message || defaultMsg;
  }
  return defaultMsg;
}

async function getZones(auth) {
  const res = await cfRequest(auth, 'GET', '/zones?per_page=50');
  if (res.success && Array.isArray(res.result)) {
    return { success: true, zones: res.result };
  }
  return { success: false, error: getErrorMessage(res, 'Email atau Global API Key tidak valid / akun tidak ditemukan') };
}

async function getRecords(auth, zoneId, type = 'A') {
  const res = await cfRequest(auth, 'GET', `/dns_records?type=${type}&per_page=100`, null, zoneId);
  if (res.success && Array.isArray(res.result)) {
    return { success: true, records: res.result };
  }
  return { success: false, error: getErrorMessage(res, 'Gagal mengambil daftar record DNS') };
}

async function findRecord(auth, zoneId, name, type = 'A') {
  const encoded = encodeURIComponent(name.toLowerCase());
  const res = await cfRequest(auth, 'GET', `/dns_records?name=${encoded}&type=${type}`, null, zoneId);
  if (res.success && Array.isArray(res.result)) {
    return { success: true, record: res.result[0] || null };
  }
  return { success: false, error: getErrorMessage(res, 'Gagal mencari record') };
}

async function createRecord(auth, zoneId, name, content, type = 'A', proxied = false, ttl = 120) {
  const payload = { type, name, content, ttl, proxied };
  const res = await cfRequest(auth, 'POST', '/dns_records', payload, zoneId);
  if (res.success && res.result) {
    return { success: true, record: res.result };
  }
  return { success: false, error: getErrorMessage(res, 'Gagal membuat record DNS') };
}

async function updateRecord(auth, zoneId, recordId, name, content, type = 'A', proxied = false, ttl = 120) {
  const payload = { type, name, content, ttl, proxied };
  const res = await cfRequest(auth, 'PUT', `/dns_records/${recordId}`, payload, zoneId);
  if (res.success && res.result) {
    return { success: true, record: res.result };
  }
  return { success: false, error: getErrorMessage(res, 'Gagal memperbarui record DNS') };
}

async function deleteRecord(auth, zoneId, recordId) {
  const res = await cfRequest(auth, 'DELETE', `/dns_records/${recordId}`, null, zoneId);
  if (res.success) {
    return { success: true };
  }
  return { success: false, error: getErrorMessage(res, 'Gagal menghapus record DNS') };
}

async function provisionTunnel(auth, zoneId, host, ip, onProgress = null) {
  const logs = [];
  const notify = async (step, status, label) => {
    if (typeof onProgress === 'function') {
      try {
        await onProgress({ step, status, label });
      } catch (e) {}
    }
  };
  
  // 1. A Record (Proxied)
  await notify(1, 'running', 'Mengecek & mengonfigurasi DNS A Record (Proxied)...');
  logs.push(`1️⃣ Mengecek DNS A Record untuk <code>${host}</code>...`);
  const findRes = await findRecord(auth, zoneId, host, 'A');

  if (findRes.success && findRes.record) {
    const oldRec = findRes.record;
    if (oldRec.content === ip && oldRec.proxied) {
      logs.push(`1️⃣ A Record sudah sesuai (proxied ON) — reuse.`);
    } else {
      const upRes = await updateRecord(auth, zoneId, oldRec.id, host, ip, 'A', true, 120);
      if (!upRes.success) {
        return { success: false, logs, error: `Langkah 1 gagal (update A record): ${upRes.error}` };
      }
      logs.push(`1️⃣ A Record diperbarui ke <code>${ip}</code> (proxied ON).`);
    }
  } else {
    const crRes = await createRecord(auth, zoneId, host, ip, 'A', true, 120);
    if (!crRes.success) {
      return { success: false, logs, error: `Langkah 1 gagal (buat A record): ${crRes.error}` };
    }
    logs.push(`1️⃣ A Record baru dibuat untuk <code>${host}</code> → <code>${ip}</code> (proxied ON).`);
  }
  await notify(1, 'done', 'DNS A Record terpasang (Proxied ON)');

  // 2. Fallback Origin
  await notify(2, 'running', 'Mengatur Fallback Origin ke Cloudflare Edge...');
  logs.push(`2️⃣ Mengatur Fallback Origin...`);
  const fbRes = await cfRequest(auth, 'GET', '/custom_hostnames/fallback_origin', null, zoneId);
  const currentFb = fbRes.success && fbRes.result ? fbRes.result.origin : '';
  
  if (!currentFb) {
    const setFb = await cfRequest(auth, 'PUT', '/custom_hostnames/fallback_origin', { origin: host }, zoneId);
    if (setFb.success) {
      logs.push(`2️⃣ Fallback Origin berhasil diset ke <code>${host}</code>.`);
    } else {
      logs.push(`⚠️ Fallback Origin: ${getErrorMessage(setFb, 'Gagal diset (mungkin sudah ada) — lanjut.')}`);
    }
  } else {
    logs.push(`2️⃣ Fallback Origin sudah aktif: <code>${currentFb}</code>.`);
  }
  await notify(2, 'done', 'Fallback Origin terverifikasi');

  // 3. Custom Hostname & SSL DV
  await notify(3, 'running', 'Mendaftarkan Custom Hostname & request SSL DV...');
  logs.push(`3️⃣ Mendaftarkan Custom Hostname & SSL...`);
  const encodedHost = encodeURIComponent(host.toLowerCase());
  const chFind = await cfRequest(auth, 'GET', `/custom_hostnames?hostname=${encodedHost}`, null, zoneId);
  
  let chId = '';
  let sslStatus = 'initializing';
  let txtCreated = false;

  if (chFind.success && Array.isArray(chFind.result) && chFind.result.length > 0) {
    const oldCh = chFind.result[0];
    chId = oldCh.id;
    sslStatus = (oldCh.ssl && oldCh.ssl.status) ? oldCh.ssl.status : 'initializing';
    logs.push(`3️⃣ Custom Hostname sudah terdaftar sebelumnya (ID: <code>${chId}</code>).`);
  } else {
    const chPayload = {
      hostname: host,
      ssl: {
        method: 'http',
        type: 'dv',
        settings: {
          min_tls_version: '1.0'
        }
      }
    };
    const chCreate = await cfRequest(auth, 'POST', '/custom_hostnames', chPayload, zoneId);
    if (!chCreate.success) {
      return { success: false, logs, error: `Langkah 3 gagal: ${getErrorMessage(chCreate, 'Gagal membuat Custom Hostname')}` };
    }
    
    const result = chCreate.result || {};
    chId = result.id;
    sslStatus = (result.ssl && result.ssl.status) ? result.ssl.status : 'initializing';
    logs.push(`3️⃣ Custom Hostname dibuat! (ID: <code>${chId}</code>).`);

    // 3b. TXT Ownership Verification jika diperlukan
    const ov = result.ownership_verification;
    if (ov && ov.type === 'txt') {
      logs.push(`3️⃣ Menambahkan TXT record verifikasi...`);
      await createRecord(auth, zoneId, ov.name, ov.value, 'TXT', false, 120);
      logs.push(`3️⃣ TXT Record verifikasi berhasil diset.`);
      txtCreated = true;
    }
  }
  await notify(3, 'done', 'Custom Hostname & SSL DV berhasil didaftarkan');

  return {
    success: true,
    logs,
    chId,
    host,
    ip,
    sslStatus,
    txtCreated
  };
}

async function getCustomHostnameStatus(auth, zoneId, chId) {
  const res = await cfRequest(auth, 'GET', `/custom_hostnames/${chId}`, null, zoneId);
  if (res.success && res.result) {
    const ssl = res.result.ssl || {};
    return {
      success: true,
      status: ssl.status || 'unknown',
      hostname: res.result.hostname,
      ssl: ssl
    };
  }
  return { success: false, error: getErrorMessage(res, 'Gagal mengambil status Custom Hostname') };
}

async function deleteTunnelFull(auth, zoneId, chId, host, withDns = true) {
  let chDeleted = false;
  let dnsDeleted = false;

  if (chId) {
    const delCh = await cfRequest(auth, 'DELETE', `/custom_hostnames/${chId}`, null, zoneId);
    chDeleted = delCh.success;
  }

  if (withDns && host) {
    const findRes = await findRecord(auth, zoneId, host, 'A');
    if (findRes.success && findRes.record) {
      const delRec = await deleteRecord(auth, zoneId, findRes.record.id);
      dnsDeleted = delRec.success;
    }
  }

  return { success: chDeleted, chDeleted, dnsDeleted };
}

module.exports = {
  getAuthHeaders,
  cfRequest,
  getErrorMessage,
  getZones,
  getRecords,
  findRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  provisionTunnel,
  getCustomHostnameStatus,
  deleteTunnelFull
};

