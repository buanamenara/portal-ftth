/**
 * GATEWAY - Portal Terpadu BMI (PT Buana Menara Indonesia)
 * Project Apps Script terpisah: hanya login + menu. Portal dibuka di dalam halaman PWA (GitHub Pages)
 * supaya banner Google Apps Script tidak muncul, dan Portal FTTH ikut masuk otomatis lewat tiket sekali pakai.
 *
 * Login dicek ke sheet USERS yang sama dengan Portal FTTH
 * (kolom: Username, Password, Nama, Role, Area, Status).
 *
 * Deploy: Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * Akses web app: Execute as "Me", Who has access "Anyone".
 */

var CONFIG = {
  USERS_SPREADSHEET_ID: '1S8c7A0hPZrJ4bHH6UuUfHY8mkBPvadubtlEV1VuZdHA',   // spreadsheet "RPM BMI - BA Pekerjaan", sheet USERS
  USERS_SHEET_NAME: 'USERS',
  // Halaman PWA yang memuat portal di dalam bingkainya (index.html, ?p=<portal>&t=<tiket>).
  SHELL_URL: 'https://buanamenara.github.io/portal-ftth/',
  PORTALS: {
    ftth: { title: 'Portal FTTH', desc: 'Submit BOQ, BA Transaksi, Rekap BA, Saldo Gudang, BA Pekerjaan RPM', sso: true },
    waspang: { title: 'Portal Waspang', desc: 'Daily Report EMR, progres BOQ, dokumentasi foto lapangan', sso: false }
  },
  // Portal yang boleh dibuka tiap role (kolom Role di sheet USERS). Urutan pertama = portal utama role itu.
  ROLE_PORTALS: {
    rpm: ['ftth', 'waspang'],
    admin: ['ftth'],
    waspang: ['waspang', 'ftth']
  },
  SESSION_TTL: 21600,   // detik; batas maksimal CacheService (6 jam)
  TICKET_TTL: 120       // detik; tiket masuk otomatis ke Portal FTTH, sekali pakai
};

function doGet(e) {
  // Dipanggil server Portal FTTH (UrlFetchApp) untuk menukar tiket dengan username. Tiket langsung dihapus.
  if (e && e.parameter && e.parameter.sso_verify) {
    var t = String(e.parameter.sso_verify), out = { ok: false };
    if (/^[A-Za-z0-9]{32,80}$/.test(t)) {
      var cache = CacheService.getScriptCache(), uname = cache.get('tk_' + t);
      if (uname) { cache.remove('tk_' + t); out = { ok: true, username: uname }; }
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('Portal Terpadu BMI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function findUser_(username) {
  var uname = String(username || '').trim().toLowerCase();
  var sh = SpreadsheetApp.openById(CONFIG.USERS_SPREADSHEET_ID).getSheetByName(CONFIG.USERS_SHEET_NAME);
  if (!sh) throw new Error('Sheet USERS tidak ditemukan. Hubungi admin.');
  var lastRow = sh.getLastRow();
  var rows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, 6).getValues() : [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === uname) return rows[i];
  }
  return null;
}

function randomId_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

// Dipanggil dari halaman: google.script.run.loginUser(username, password).
// Password dibandingkan persis seperti di Portal FTTH; username tidak peka huruf besar/kecil.
function loginUser(username, password) {
  var pass = String(password || '');
  if (!String(username || '').trim() || !pass) throw new Error('Username dan password wajib diisi.');
  var r = findUser_(username);
  if (r && String(r[1]) === pass && (String(r[5]).trim().toLowerCase() || 'aktif') !== 'nonaktif') {
    var role = String(r[3]).trim().toLowerCase();
    if (!(CONFIG.ROLE_PORTALS[role] || []).length) throw new Error('Role "' + role + '" belum diberi akses portal. Hubungi admin.');
    var sid = randomId_();
    CacheService.getScriptCache().put('sid_' + sid, String(r[0]).trim(), CONFIG.SESSION_TTL);
    return { sid: sid, name: String(r[2]).trim() || String(r[0]).trim(), role: role, area: String(r[4]).trim() };
  }
  Utilities.sleep(1500);   // memperlambat tebak-tebakan password
  throw new Error('Username atau password salah.');
}

// Daftar portal untuk sesi ini, dengan tautan ke halaman PWA. Portal ber-sso membawa tiket baru sekali pakai.
// Dipanggil saat menu tampil dan diperbarui berkala oleh halaman (tiket berlaku TICKET_TTL detik).
function portalLinks(sid) {
  var cache = CacheService.getScriptCache();
  var uname = /^[A-Za-z0-9]{32,80}$/.test(String(sid || '')) ? cache.get('sid_' + sid) : null;
  var r = uname ? findUser_(uname) : null;
  if (!r || (String(r[5]).trim().toLowerCase() || 'aktif') === 'nonaktif') throw new Error('Sesi habis. Silakan login lagi.');
  var keys = CONFIG.ROLE_PORTALS[String(r[3]).trim().toLowerCase()] || [];
  return keys.map(function (k) {
    var p = CONFIG.PORTALS[k], href = CONFIG.SHELL_URL + '?p=' + k;
    if (p.sso) {
      var t = randomId_();
      cache.put('tk_' + t, uname, CONFIG.TICKET_TTL);
      href += '&t=' + t;
    }
    return { key: k, title: p.title, desc: p.desc, href: href };
  });
}
