/**
 * GATEWAY - Portal Terpadu BMI (PT Buana Menara Indonesia)
 * Project Apps Script terpisah: hanya login + menu, lalu membuka Portal FTTH atau Portal Waspang
 * (navigasi browser sungguhan ke URL exec masing-masing web app).
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
  PORTALS: {
    ftth: {
      title: 'Portal FTTH',
      desc: 'Submit BOQ, BA Transaksi, Rekap BA, Saldo Gudang, BA Pekerjaan RPM',
      url: 'https://script.google.com/macros/s/AKfycbwO25NZjRNu11QfyZQDGp1ZAPHdR-PwMwrc3U09lGUQ03KH91bNUl178-A7F246fm_djw/exec'
    },
    waspang: {
      title: 'Portal Waspang',
      desc: 'Daily Report EMR, progres BOQ, dokumentasi foto lapangan',
      url: 'https://script.google.com/macros/s/AKfycbw4TJYefbBIIoBS4Kztyv2lClvmngtIMotFbSLfp_E6ptKjv0qVwDBg_ppR1fY8zGKG/exec'
    }
  },
  // Portal yang boleh dibuka tiap role (kolom Role di sheet USERS). Urutan pertama = portal utama role itu.
  ROLE_PORTALS: {
    rpm: ['ftth', 'waspang'],
    admin: ['ftth'],
    waspang: ['waspang', 'ftth']
  }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('Portal Terpadu BMI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Dipanggil dari halaman: google.script.run.loginUser(username, password).
// Password dibandingkan persis seperti di Portal FTTH; username tidak peka huruf besar/kecil.
function loginUser(username, password) {
  var uname = String(username || '').trim().toLowerCase();
  var pass = String(password || '');
  if (!uname || !pass) throw new Error('Username dan password wajib diisi.');

  var sh = SpreadsheetApp.openById(CONFIG.USERS_SPREADSHEET_ID).getSheetByName(CONFIG.USERS_SHEET_NAME);
  if (!sh) throw new Error('Sheet USERS tidak ditemukan. Hubungi admin.');
  var lastRow = sh.getLastRow();
  var rows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, 6).getValues() : [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]).trim().toLowerCase() !== uname || String(r[1]) !== pass) continue;
    var status = String(r[5]).trim().toLowerCase() || 'aktif';
    if (status === 'nonaktif') break;
    var role = String(r[3]).trim().toLowerCase();
    var keys = CONFIG.ROLE_PORTALS[role] || [];
    if (!keys.length) throw new Error('Role "' + role + '" belum diberi akses portal. Hubungi admin.');
    return {
      name: String(r[2]).trim() || String(r[0]).trim(),
      role: role,
      area: String(r[4]).trim(),
      portals: keys.map(function (k) {
        var p = CONFIG.PORTALS[k];
        return { key: k, title: p.title, desc: p.desc, url: p.url };
      })
    };
  }
  Utilities.sleep(1500);   // memperlambat tebak-tebakan password
  throw new Error('Username atau password salah.');
}
