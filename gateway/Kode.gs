/**
 * GATEWAY - FTTH Project Control Portal (PT Buana Menara Indonesia)
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
  // Login, login gagal dan logout dicatat di tab LOG HISTORY spreadsheet Portal FTTH (Sumber "Gateway").
  LOG_SPREADSHEET_ID: '1KblZFDIcG6Jbbo6gy2Mh0vpgEzsgfUhMcwg5A5qtSME',
  LOG_SHEET_NAME: 'LOG HISTORY',
  // Halaman PWA yang memuat portal di dalam bingkainya (index.html, ?p=<portal>&t=<tiket>).
  SHELL_URL: 'https://buanamenara.github.io/portal-ftth/',
  PORTALS: {
    ftth: { title: 'Portal FTTH', desc: 'Submit BOQ, BA Transaksi, Rekap BA, Saldo Gudang, BA Pekerjaan RPM', sso: true },
    waspang: { title: 'Portal Waspang', desc: 'Daily Report EMR, progres BOQ, dokumentasi foto lapangan', sso: true }
  },
  // Portal yang boleh dibuka tiap role (kolom Role di sheet USERS). Urutan pertama = portal utama role itu.
  ROLE_PORTALS: {
    rpm: ['ftth', 'waspang'],
    admin: ['ftth'],
    waspang: ['waspang', 'ftth']
  },
  SESSION_TTL: 21600,   // detik; batas maksimal CacheService (6 jam)
  TICKET_TTL: 120       // detik; tiket masuk otomatis ke portal ber-sso, sekali pakai
};

function doGet(e) {
  // Dipanggil server Portal FTTH / Waspang (UrlFetchApp) untuk menukar tiket dengan username, role dan nama. Tiket langsung dihapus.
  if (e && e.parameter && e.parameter.sso_verify) {
    var t = String(e.parameter.sso_verify), out = { ok: false };
    if (/^[A-Za-z0-9]{32,80}$/.test(t)) {
      var cache = CacheService.getScriptCache(), v = cache.get('tk_' + t);
      if (v) {
        cache.remove('tk_' + t);
        // Tiket menyimpan username, role dan nama sejak dibuat (tanpa membaca sheet USERS lagi, supaya portal cepat terbuka).
        var info = null;
        try { info = JSON.parse(v); } catch (err) { /* tiket versi lama: hanya username */ }
        if (info && info.u) {
          out = { ok: true, username: info.u, role: info.role || '', name: info.name || '' };
        } else {
          var r = findUser_(v);
          out = { ok: true, username: v, role: r ? String(r[3]).trim().toLowerCase() : '', name: r ? String(r[2]).trim() : '' };
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('FTTH Project Control Portal - Buana Menara Indonesia')
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
  var aktif = r && (String(r[5]).trim().toLowerCase() || 'aktif') !== 'nonaktif';
  if (r && String(r[1]) === pass && aktif) {
    var role = String(r[3]).trim().toLowerCase(), name = String(r[2]).trim() || String(r[0]).trim();
    if (!(CONFIG.ROLE_PORTALS[role] || []).length) {
      logGateway_(name, role, 'Login gagal', 'role belum diberi akses portal');
      throw new Error('Role "' + role + '" belum diberi akses portal. Hubungi admin.');
    }
    var sid = randomId_();
    CacheService.getScriptCache().put('sid_' + sid, String(r[0]).trim(), CONFIG.SESSION_TTL);
    logGateway_(name, role, 'Login', String(r[0]).trim());
    return { sid: sid, name: name, role: role, area: String(r[4]).trim() };
  }
  // Password yang diketik tidak pernah dicatat; hanya username dan alasannya.
  logGateway_(String(username).trim().slice(0, 60), r ? String(r[3]).trim().toLowerCase() : '', 'Login gagal',
    !r ? 'username tidak terdaftar' : (!aktif ? 'akun nonaktif' : 'password salah'));
  Utilities.sleep(1500);   // memperlambat tebak-tebakan password
  throw new Error('Username atau password salah.');
}

// Dipanggil saat tombol Keluar ditekan (atau ?logout=1 dari portal lain): sesi di server diakhiri dan dicatat.
function logoutUser(sid) {
  var cache = CacheService.getScriptCache();
  var uname = /^[A-Za-z0-9]{32,80}$/.test(String(sid || '')) ? cache.get('sid_' + sid) : null;
  if (!uname) return { ok: true };
  cache.remove('sid_' + sid);
  var r = null;
  try { r = findUser_(uname); } catch (e) { /* tetap dicatat dengan username */ }
  logGateway_(r ? (String(r[2]).trim() || uname) : uname, r ? String(r[3]).trim().toLowerCase() : '', 'Logout', uname);
  return { ok: true };
}

// Satu baris di LOG HISTORY (Waktu | Sumber | User | Peran | Aksi | Detail). Teks yang diawali = + - @ diberi ' supaya
// tidak jadi rumus. Gagal mencatat tidak boleh menggagalkan login.
function logGateway_(user, peran, aksi, detail) {
  try {
    var sh = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID).getSheetByName(CONFIG.LOG_SHEET_NAME);
    if (!sh) return;
    var plain = function (v) { v = String(v || ''); return /^[=+\-@]/.test(v) ? "'" + v : v; };
    sh.appendRow([new Date(), 'Gateway', plain(user), peran || '', aksi, plain(String(detail || '').slice(0, 200))]);
    var row = sh.getLastRow(), w = Math.min(10, row - 4);
    // Format 10 baris terakhir saja (baris lain bisa ditulis bersamaan oleh pemicu edit/portal lain); baris lama
    // dibuang sekaligus 200 baris supaya tidak menggeser seluruh tab di setiap login.
    sh.getRange(row - w + 1, 1, w, 1).setNumberFormat('dd mmm yyyy HH:mm');
    sh.getRange(row - w + 1, 1, w, 6).setVerticalAlignment('middle').setWrap(true);
    if (row - 4 > 2200) sh.deleteRows(5, row - 4 - 2000);
  } catch (e) { console.error('LOG HISTORY: ' + e); }
}

// Daftar portal untuk sesi ini, dengan tautan ke halaman PWA. Portal ber-sso membawa tiket baru sekali pakai.
// Dipanggil saat menu tampil dan diperbarui berkala oleh halaman (tiket berlaku TICKET_TTL detik).
function portalLinks(sid) {
  var cache = CacheService.getScriptCache();
  var uname = /^[A-Za-z0-9]{32,80}$/.test(String(sid || '')) ? cache.get('sid_' + sid) : null;
  var r = uname ? findUser_(uname) : null;
  if (!r || (String(r[5]).trim().toLowerCase() || 'aktif') === 'nonaktif') throw new Error('Sesi habis. Silakan login lagi.');
  var role = String(r[3]).trim().toLowerCase(), keys = CONFIG.ROLE_PORTALS[role] || [];
  var info = JSON.stringify({ u: String(uname), role: role, name: String(r[2]).trim() });
  return keys.map(function (k) {
    var p = CONFIG.PORTALS[k], href = CONFIG.SHELL_URL + '?p=' + k;
    if (p.sso) {
      var t = randomId_();
      cache.put('tk_' + t, info, CONFIG.TICKET_TTL);
      href += '&t=' + t;
    }
    return { key: k, title: p.title, desc: p.desc, href: href };
  });
}
