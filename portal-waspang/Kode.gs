var CONFIG = {
  WASPANG_SPREADSHEET_ID: "1ZlSlITeC9zi-m894gQYUUn4YMfP6_8B_Jtep5a33OjA",
  DOKUMENTASI_FOLDER_ID: "1xY7LSgaZDiD4YvCGd2FW164IFVdtYGqZ", // folder "DOKUMENTASI FTTH" di Google Drive
  TELEGRAM_CHAT_ID: "@ReportBMI",
  // Gateway Portal Terpadu BMI: menukar tiket sekali pakai dengan username & role (untuk mengenali akun RPM).
  GATEWAY_URL: "https://script.google.com/macros/s/AKfycby4nXXb8JKdAJodp6MdrNfdmNODiCdWr4ouZPKOP6w4wz1tDZLCSqe11eeU9oHYgmVxeQ/exec",
  TOTALS_SHEET: "PROGRES TOTAL"   // Total kumulatif bersama per cluster & item
};

// Token bot Telegram TIDAK ditulis di kode (repo ini publik). Simpan di Script Properties:
// Project Settings (ikon roda gigi) > Script Properties > Add script property
//   Property: TELEGRAM_BOT_TOKEN   Value: <token dari @BotFather>
function telegramToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN belum diisi di Script Properties.');
  return t;
}

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    return ContentService.createTextOutput(JSON.stringify({
      status: "online",
      message: "Portal Waspang & Daily Report EMR aktif.",
      targetDriveFolder: "DOKUMENTASI FTTH",
      targetTelegramGroup: CONFIG.TELEGRAM_CHAT_ID
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('Portal Waspang & Daily Report EMR')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var result;
  try {
    var payload = JSON.parse(e.postData.contents);
    switch (payload.action) {
      case 'UPLOAD_PHOTOS':
        result = uploadWaspangPhotos_(payload);
        break;
      case 'CREATE_SITE_FOLDERS':
        result = createSiteFoldersInDrive_(payload);
        break;
      case 'DAILY_REPORT':
        result = sendDailyReportEMR_(payload);
        break;
      case 'SYNC_BOQ_EXCEL':
        result = syncMasterBoqToSheet_(payload.clusters);
        break;
      case 'SSO_LOGIN':
        result = ssoLogin_(payload.ticket);
        break;
      case 'GET_TOTALS':
        result = getTotals_(payload.cluster);
        break;
      case 'SET_TOTAL':
        result = setTotalByRpm_(payload);
        break;
      default:
        result = { status: 'error', message: 'Action tidak dikenali: ' + payload.action };
    }
  } catch (err) {
    result = { status: 'error', message: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWaspangSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.WASPANG_SPREADSHEET_ID);
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getOrCreateFolderPath_(rootFolder, pathStr) {
  var parts = String(pathStr || '').split('/').map(function (s) { return s.trim(); }).filter(Boolean);
  if (parts.length && /^dokumentasi ftth$/i.test(parts[0])) {
    parts = parts.slice(1);
  }
  var folder = rootFolder;
  for (var i = 0; i < parts.length; i++) {
    folder = getOrCreateFolder_(folder, parts[i]);
  }
  return folder;
}

// ===================== CREATE_SITE_FOLDERS =====================

function createSiteFoldersInDrive_(payload) {
  var siteName = payload.siteName;
  var lines = payload.lines && payload.lines.length ? payload.lines : ["Line A", "Line B", "Line C", "Line D"];
  var fatCounts = payload.fatCounts || {};

  var docRoot = DriveApp.getFolderById(CONFIG.DOKUMENTASI_FOLDER_ID);
  var siteFolder = getOrCreateFolder_(docRoot, siteName);

  var lineFolder = getOrCreateFolder_(siteFolder, 'Line');
  lines.forEach(function (ln) {
    getOrCreateFolder_(lineFolder, ln);
  });

  var elektrikFolder = getOrCreateFolder_(siteFolder, 'Elektrik');
  var elTypes = ['Terbuka & Tertutup', 'OPM 1:8'];
  elTypes.forEach(function (elType) {
    var elTypeFolder = getOrCreateFolder_(elektrikFolder, elType);
    ['A', 'B', 'C', 'D'].forEach(function (lineLetter) {
      var count = parseInt(fatCounts[lineLetter], 10) || 0;
      for (var n = 1; n <= count; n++) {
        var fatId = lineLetter + (n < 10 ? '0' + n : String(n));
        getOrCreateFolder_(elTypeFolder, fatId);
      }
    });
  });

  getOrCreateFolder_(siteFolder, 'Pole view');
  getOrCreateFolder_(siteFolder, 'Implementasi');
  getOrCreateFolder_(siteFolder, 'Opname Lapangan');

  return {
    status: 'success',
    siteFolderUrl: siteFolder.getUrl(),
    sowFolderUrl: siteFolder.getUrl()
  };
}

// ===================== UPLOAD_PHOTOS =====================

function uploadWaspangPhotos_(payload) {
  var files = payload.files || [];
  if (!files.length) {
    return { status: 'error', message: 'Tidak ada file untuk diupload.' };
  }

  var docRoot = DriveApp.getFolderById(CONFIG.DOKUMENTASI_FOLDER_ID);
  var targetFolder = getOrCreateFolderPath_(docRoot, payload.subPath);

  var blobs = [];
  files.forEach(function (f) {
    var raw = f.imageBase64 || '';
    var m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    var mime = m ? m[1] : 'image/jpeg';
    var b64 = m ? m[2] : raw;
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, f.fileName || 'foto.jpg');
    targetFolder.createFile(blob);
    blobs.push(blob);
  });

  logWaspangPhotoToSheet_(payload, targetFolder.getUrl());
  sendWaspangPhotosToTelegram_(blobs, buildWaspangPhotoCaption_(payload));

  return { status: 'success', folderUrl: targetFolder.getUrl() };
}

function buildWaspangPhotoCaption_(payload) {
  var caption = "📌 *LAPORAN WASPANG - PT. BUANA MENARA INDONESIA*\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🏷️ *Site Name* : `" + (payload.siteName || '') + "`\n" +
    "📋 *SOW*       : `" + (payload.sow || '') + "`\n" +
    "🚧 *Progress*  : `" + (payload.progressText || '') + "`\n" +
    "👤 *Waspang*   : " + (payload.waspang || '');
  if (payload.notes) {
    caption += "\n📝 *Catatan*:\n" + payload.notes;
  }
  return caption;
}

function sendWaspangPhotosToTelegram_(blobs, caption) {
  try {
    if (blobs.length === 1) {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + telegramToken_() + '/sendPhoto', {
        method: 'post',
        payload: {
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          caption: caption,
          parse_mode: 'Markdown',
          photo: blobs[0]
        },
        muteHttpExceptions: true
      });
      return;
    }

    // Telegram sendMediaGroup menerima maksimal 10 item per panggilan — dipecah per 10 jika lebih.
    for (var start = 0; start < blobs.length; start += 10) {
      var chunk = blobs.slice(start, start + 10);
      var media = [];
      var formPayload = { chat_id: CONFIG.TELEGRAM_CHAT_ID };
      chunk.forEach(function (blob, idx) {
        var key = 'p_' + idx;
        media.push({
          type: 'photo',
          media: 'attach://' + key,
          caption: (start === 0 && idx === 0) ? caption : '',
          parse_mode: 'Markdown'
        });
        formPayload[key] = blob;
      });
      formPayload.media = JSON.stringify(media);
      UrlFetchApp.fetch('https://api.telegram.org/bot' + telegramToken_() + '/sendMediaGroup', {
        method: 'post',
        payload: formPayload,
        muteHttpExceptions: true
      });
    }
  } catch (err) {
    console.error('Telegram send error: ' + err);
  }
}

function logWaspangPhotoToSheet_(payload, folderUrl) {
  try {
    var ss = getWaspangSpreadsheet_();
    var sheet = ss.getSheetByName('LOG FOTO WASPANG');
    if (!sheet) {
      sheet = ss.insertSheet('LOG FOTO WASPANG');
      sheet.appendRow(['Timestamp', 'Site', 'SOW', 'Kategori', 'Line', 'FAT ID', 'Progress', 'Waspang', 'Catatan', 'Jumlah Foto', 'Folder URL']);
    }
    sheet.appendRow([
      new Date(),
      payload.siteName || '',
      payload.sow || '',
      payload.mainCategory || '',
      payload.lineName || '',
      payload.fatId || '',
      payload.progressText || '',
      payload.waspang || '',
      payload.notes || '',
      (payload.files || []).length,
      folderUrl
    ]);
  } catch (err) {
    console.error('Log photo to sheet error: ' + err);
  }
}

// ===================== DAILY_REPORT =====================

function sendDailyReportEMR_(payload) {
  var text = payload.text || '';
  var chatId = payload.chatId || CONFIG.TELEGRAM_CHAT_ID;
  if (!text) {
    return { status: 'error', message: 'Teks Daily Report kosong.' };
  }
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + telegramToken_() + '/sendMessage', {
      method: 'post',
      payload: {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      },
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText());
    if (!json.ok) {
      return { status: 'error', message: json.description || 'Gagal mengirim ke Telegram.' };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }

  logDailyReportToSheet_(text);
  if (!payload.cluster) return { status: 'success' };
  // Laporan sudah terkirim: tambahkan Today ke Total bersama. Gagal di sini tidak membatalkan laporan.
  try {
    return { status: 'success', totals: addDailyToTotals_(payload) };
  } catch (err) {
    return { status: 'success', totalsError: err.toString() };
  }
}

function logDailyReportToSheet_(text) {
  try {
    var ss = getWaspangSpreadsheet_();
    var sheet = ss.getSheetByName('LOG DAILY REPORT');
    if (!sheet) {
      sheet = ss.insertSheet('LOG DAILY REPORT');
      sheet.appendRow(['Timestamp', 'Isi Laporan']);
    }
    sheet.appendRow([new Date(), text]);
  } catch (err) {
    console.error('Log daily report error: ' + err);
  }
}

// ===================== SYNC_BOQ_EXCEL =====================

function cleanClusterNameForSync_(raw) {
  return String(raw || '').replace(/[​-‍﻿⁠]/g, '').trim();
}

function syncMasterBoqToSheet_(clusters) {
  if (!clusters || !clusters.length) {
    return { status: 'error', message: 'Tidak ada data cluster untuk disinkronkan.' };
  }
  try {
    var ss = getWaspangSpreadsheet_();
    var sheet = ss.getSheetByName('MASTER BOQ CLUSTER');
    if (!sheet) {
      sheet = ss.insertSheet('MASTER BOQ CLUSTER');
      sheet.appendRow(['Cluster', 'SOW', 'Item', 'Key', 'Volume Plan', 'Last Updated']);
    }
    var data = sheet.getDataRange().getValues();
    var CLUSTER_COL = 0, KEY_COL = 3;

    clusters.forEach(function (cl) {
      var clusterName = cleanClusterNameForSync_(cl.fullName || cl.name);
      (cl.items || []).forEach(function (item) {
        var rowIdx = -1;
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][CLUSTER_COL]).trim() === clusterName &&
              String(data[i][KEY_COL]).trim() === String(item.key).trim()) {
            rowIdx = i;
            break;
          }
        }
        var rowValues = [clusterName, cl.sow || '', item.name || '', item.key || '', item.volume || 0, new Date()];
        if (rowIdx === -1) {
          sheet.appendRow(rowValues);
          data.push(rowValues);
        } else {
          sheet.getRange(rowIdx + 1, 1, 1, rowValues.length).setValues([rowValues]);
          data[rowIdx] = rowValues;
        }
      });
    });

    return { status: 'success' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// ===================== TOTAL BERSAMA (sheet PROGRES TOTAL) =====================
// Total kumulatif per cluster & item disimpan di sheet supaya semua HP memakai angka yang sama.
// Daily Report menambahkan Today; hanya akun RPM (masuk lewat Gateway) yang boleh mengubah Total langsung.

function totalsSheet_() {
  var ss = getWaspangSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.TOTALS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.TOTALS_SHEET);
    sh.appendRow(['Cluster', 'Key', 'Total', 'Diperbarui', 'Oleh', 'Keterangan']);
  }
  return sh;
}

function totalsClusterKey_(name) {
  return cleanClusterNameForSync_(name).toLowerCase();
}

// {key: {row, total}} untuk satu cluster (row = nomor baris di sheet).
function readClusterTotals_(sh, cluster) {
  var ck = totalsClusterKey_(cluster), out = {};
  var last = sh.getLastRow();
  var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
  rows.forEach(function (r, i) {
    if (totalsClusterKey_(r[0]) === ck) out[String(r[1]).trim()] = { row: i + 2, total: Number(r[2]) || 0 };
  });
  return out;
}

function getTotals_(cluster) {
  if (!totalsClusterKey_(cluster)) return { status: 'error', message: 'Cluster kosong.' };
  var cur = readClusterTotals_(totalsSheet_(), cluster), totals = {};
  Object.keys(cur).forEach(function (k) { totals[k] = cur[k].total; });
  return { status: 'success', found: Object.keys(totals).length > 0, totals: totals };
}

// changes: {key: total baru}. Baris yang sudah ada diperbarui, yang belum ada ditambahkan.
function writeTotals_(sh, cluster, cur, changes, by, note) {
  var now = new Date(), name = cleanClusterNameForSync_(cluster);
  Object.keys(changes).forEach(function (k) {
    var vals = [name, k, changes[k], now, by || '', note || ''];
    if (cur[k]) sh.getRange(cur[k].row, 1, 1, vals.length).setValues([vals]);
    else { sh.appendRow(vals); cur[k] = { row: sh.getLastRow(), total: changes[k] }; }
    cur[k].total = changes[k];
  });
}

function toCount_(v) {
  var n = Math.floor(Number(v));
  return n > 0 ? n : 0;
}

// Total baru = Total di sheet + Today. Item yang belum ada di sheet memakai angka awal dari HP pelapor (base).
function addDailyToTotals_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = totalsSheet_(), cur = readClusterTotals_(sh, payload.cluster);
    var today = payload.today || {}, base = payload.base || {}, changes = {}, keys = {};
    Object.keys(today).concat(Object.keys(base)).forEach(function (k) { keys[String(k).trim()] = true; });
    Object.keys(keys).forEach(function (k) {
      var t = toCount_(today[k]);
      if (!cur[k]) changes[k] = toCount_(base[k]) + t;
      else if (t > 0) changes[k] = cur[k].total + t;
    });
    writeTotals_(sh, payload.cluster, cur, changes, payload.by || 'Daily Report', 'Daily Report');
    var totals = {};
    Object.keys(cur).forEach(function (k) { totals[k] = cur[k].total; });
    return totals;
  } finally {
    lock.releaseLock();
  }
}

// Masuk lewat Gateway: tiket sekali pakai ditukar dengan sesi Waspang (6 jam) berisi username & role.
function ssoLogin_(ticket) {
  var t = String(ticket || '');
  if (!/^[A-Za-z0-9]{32,80}$/.test(t)) return { status: 'error', message: 'Tiket tidak valid.' };
  var out = {};
  try {
    out = JSON.parse(UrlFetchApp.fetch(CONFIG.GATEWAY_URL + '?sso_verify=' + t, { muteHttpExceptions: true }).getContentText());
  } catch (e) {}
  if (!out.ok || !out.username) return { status: 'error', message: 'Sesi Gateway sudah habis. Silakan login lagi.' };
  var sid = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var sess = { username: String(out.username), role: String(out.role || '').toLowerCase(), name: String(out.name || out.username) };
  CacheService.getScriptCache().put('ws_' + sid, JSON.stringify(sess), 21600);
  return { status: 'success', session: sid, role: sess.role, name: sess.name };
}

function wsSession_(sid) {
  if (!/^[A-Za-z0-9]{32,80}$/.test(String(sid || ''))) return null;
  var raw = CacheService.getScriptCache().get('ws_' + sid);
  return raw ? JSON.parse(raw) : null;
}

function setTotalByRpm_(payload) {
  var s = wsSession_(payload.session);
  if (!s) return { status: 'error', message: 'Sesi habis. Buka Portal Waspang lagi dari Gateway.' };
  if (s.role !== 'rpm') return { status: 'error', message: 'Hanya akun RPM yang boleh mengubah Total.' };
  var key = String(payload.key || '').trim(), total = Number(payload.total);
  if (!totalsClusterKey_(payload.cluster) || !key || !(total >= 0)) return { status: 'error', message: 'Data Total tidak lengkap.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = totalsSheet_(), cur = readClusterTotals_(sh, payload.cluster), ch = {};
    ch[key] = Math.floor(total);
    writeTotals_(sh, payload.cluster, cur, ch, s.name || s.username, 'Edit RPM');
  } finally {
    lock.releaseLock();
  }
  return { status: 'success' };
}
