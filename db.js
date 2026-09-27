const Database = require('better-sqlite3');
const { DB_PATH } = require('./config');

const db = new Database(DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    cf_email TEXT DEFAULT '',
    cf_api_key TEXT DEFAULT '',
    cf_token TEXT DEFAULT '',
    selected_zone_id TEXT DEFAULT '',
    selected_zone_name TEXT DEFAULT '',
    state TEXT DEFAULT '',
    temp_data TEXT DEFAULT '',
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS tunnels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    zone_id TEXT,
    host TEXT,
    ip TEXT,
    ch_id TEXT,
    ssl_status TEXT,
    created_at INTEGER
  );
`);

// Migration for existing tables
try { db.exec("ALTER TABLE users ADD COLUMN cf_email TEXT DEFAULT '';"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN cf_api_key TEXT DEFAULT '';"); } catch (e) {}

function getUser(userId) {
  let row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!row) {
    const now = Date.now();
    db.prepare('INSERT INTO users (user_id, updated_at) VALUES (?, ?)').run(userId, now);
    row = {
      user_id: userId,
      cf_email: '',
      cf_api_key: '',
      cf_token: '',
      selected_zone_id: '',
      selected_zone_name: '',
      state: '',
      temp_data: '',
      updated_at: now
    };
  }
  return row;
}

function setUserCredentials(userId, email, apiKey) {
  getUser(userId);
  db.prepare("UPDATE users SET cf_email = ?, cf_api_key = ?, state = '', temp_data = '', updated_at = ? WHERE user_id = ?")
    .run(email.trim().toLowerCase(), apiKey.trim(), Date.now(), userId);
}

function setUserToken(userId, token) {
  getUser(userId);
  db.prepare("UPDATE users SET cf_token = ?, state = '', temp_data = '', updated_at = ? WHERE user_id = ?")
    .run(token.trim(), Date.now(), userId);
}

function setUserState(userId, state, tempData = null) {
  getUser(userId);
  const tempDataStr = tempData !== null ? JSON.stringify(tempData) : '';
  db.prepare('UPDATE users SET state = ?, temp_data = ?, updated_at = ? WHERE user_id = ?')
    .run(state, tempDataStr, Date.now(), userId);
}

function setSelectedZone(userId, zoneId, zoneName) {
  getUser(userId);
  db.prepare('UPDATE users SET selected_zone_id = ?, selected_zone_name = ?, updated_at = ? WHERE user_id = ?')
    .run(zoneId, zoneName, Date.now(), userId);
}

function clearUserState(userId) {
  getUser(userId);
  db.prepare("UPDATE users SET state = '', temp_data = '', updated_at = ? WHERE user_id = ?")
    .run(Date.now(), userId);
}

function logoutUser(userId) {
  db.prepare("UPDATE users SET cf_email = '', cf_api_key = '', cf_token = '', selected_zone_id = '', selected_zone_name = '', state = '', temp_data = '', updated_at = ? WHERE user_id = ?")
    .run(Date.now(), userId);
}

function saveTunnel(userId, zoneId, host, ip, chId, sslStatus) {
  const existing = db.prepare('SELECT id FROM tunnels WHERE user_id = ? AND zone_id = ? AND host = ?').get(userId, zoneId, host);
  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE tunnels SET ip = ?, ch_id = ?, ssl_status = ?, created_at = ? WHERE id = ?')
      .run(ip, chId, sslStatus, now, existing.id);
    return existing.id;
  } else {
    const info = db.prepare('INSERT INTO tunnels (user_id, zone_id, host, ip, ch_id, ssl_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, zoneId, host, ip, chId, sslStatus, now);
    return info.lastInsertRowid;
  }
}

function getTunnels(userId, zoneId) {
  return db.prepare('SELECT * FROM tunnels WHERE user_id = ? AND zone_id = ? ORDER BY id DESC').all(userId, zoneId);
}

function getTunnelById(id) {
  return db.prepare('SELECT * FROM tunnels WHERE id = ?').get(id);
}

function updateTunnelSSL(id, sslStatus) {
  db.prepare('UPDATE tunnels SET ssl_status = ? WHERE id = ?').run(sslStatus, id);
}

function deleteTunnel(id) {
  db.prepare('DELETE FROM tunnels WHERE id = ?').run(id);
}

function deleteTunnelByHost(userId, zoneId, host) {
  db.prepare('DELETE FROM tunnels WHERE user_id = ? AND zone_id = ? AND host = ?').run(userId, zoneId, host);
}

module.exports = {
  getUser,
  setUserCredentials,
  setUserToken,
  setUserState,
  setSelectedZone,
  clearUserState,
  logoutUser,
  saveTunnel,
  getTunnels,
  getTunnelById,
  updateTunnelSSL,
  deleteTunnel,
  deleteTunnelByHost
};
