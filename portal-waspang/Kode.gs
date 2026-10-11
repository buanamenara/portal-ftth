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

// ===================== TABEL DI SPREADSHEET WASPANG =====================
// Kolom dicari dari judul di baris 1 (huruf besar/kecil dan teks dalam kurung diabaikan),
// jadi isian selalu masuk ke kolom yang benar walau urutan kolom di sheet diubah.

var MATERIAL_HEADERS_ = ['Pole 7/4 (NP 7m + 4")', 'Pole 7/3 (NP 7m + 3")', 'Pole 7/2,5 (NP 7m + 2,5")', 'Pole 9/4 (NP 9m + 4")',
  'Digging Pole', 'Casting Pole', 'Cable 24C', 'Cable 36C', 'Cable 48C', 'Cable 96C', 'Cable 144C', 'Sling Wire 6mm',
  'HDPE 40/30 (40/34)', 'FDT 48', 'FDT 72', 'FAT (16 Port)', 'JC 48 C', 'JC 144 C', 'Suspension 48', 'Suspension 144',
  'Pole Clamp', 'Dead End', 'Dead End 144', 'Slack Hanger', 'Plat Belt', 'Stopping', 'Buldogrip'];
var MASTER_BOQ_HEADER_ = ['No', 'Cluster Name', 'SOW'].concat(MATERIAL_HEADERS_);
var DAILY_REPORT_HEADER_ = ['Timestamp', 'Tanggal', 'Cluster Name', 'SOW', 'Start Implementation', 'Topology', 'Subcont', 'PIC',
  'Manpower', 'Jam Kerja', 'Ringkasan Pencapaian', 'Today Activity'].concat(MATERIAL_HEADERS_);
var PHOTO_LOG_HEADER_ = ['Timestamp', 'Tanggal Pelaporan', 'Site Name', 'SOW', 'Mandor', 'Nama Waspang', 'Kategori Pekerjaan',
  'Subfolder / FAT', 'Nama File', 'Koordinat GPS', 'Link Maps', 'Link Foto Drive', 'Link Folder Drive', 'Catatan Lapangan', 'Status Telegram'];
var TOTALS_HEADER_ = ['Cluster', 'SOW', 'Item', 'Total', 'Diperbarui', 'Oleh', 'Keterangan', 'Key'];

// Item portal -> kolom material (judul yang sudah dinormalkan). Item per line (Cable 24C Line A, FAT Line B, ...)
// masuk ke kolom material yang sama dan dijumlahkan.
var MATERIAL_COLUMNS_ = {
  pole_7_4: 'pole 7/4', pole_7_3: 'pole 7/3', pole_7_25: 'pole 7/2,5', pole_9_4: 'pole 9/4',
  digging_hole: 'digging pole', casting_pole: 'casting pole',
  cable_24c: 'cable 24c', cable_36c: 'cable 36c', cable_48c: 'cable 48c', cable_96c: 'cable 96c', cable_144c: 'cable 144c',
  slingwire_6mm: 'sling wire 6mm', hdpe_40_34: 'hdpe 40/30', fdt_48: 'fdt 48', fdt_72: 'fdt 72', fat: 'fat',
  jc_48: 'jc 48 c', jc_144: 'jc 144 c', suspension_48: 'suspension 48', suspension_144: 'suspension 144',
  pole_clam: 'pole clamp', dead_end: 'dead end', dead_end_144: 'dead end 144', slack_hanger: 'slack hanger',
  plat_belt: 'plat belt', stopping: 'stopping', buldogrip: 'buldogrip'
};

function normHeader_(h) {
  return String(h || '').toLowerCase().replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim();
}

// {idx: {judul: indeks kolom}, width: jumlah kolom}
function sheetHeader_(sh) {
  var width = sh.getLastColumn();
  var head = width ? sh.getRange(1, 1, 1, width).getValues()[0] : [];
  var idx = {};
  head.forEach(function (v, i) {
    var k = normHeader_(v);
    if (k && !(k in idx)) idx[k] = i;
  });
  return { idx: idx, width: head.length };
}

// Sheet dengan judul kolom `header`: dibuat bila belum ada; judul yang belum ada ditambahkan di kanan.
function sheetWithHeader_(name, header) {
  var ss = getWaspangSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  var h = sheetHeader_(sh);
  header.forEach(function (title) {
    if (!(normHeader_(title) in h.idx)) {
      sh.getRange(1, h.width + 1).setValue(title).setFontWeight('bold');
      h.idx[normHeader_(title)] = h.width++;
    }
  });
  return sh;
}

// Satu baris sesuai judul kolom: values = {judul: isi}; judul yang tidak ada di sheet diabaikan.
function rowByHeader_(h, values) {
  var row = [];
  for (var i = 0; i < h.width; i++) row.push('');
  Object.keys(values).forEach(function (k) {
    var c = h.idx[normHeader_(k)];
    if (c !== undefined) row[c] = values[k];
  });
  return row;
}

function materialColumn_(key) {
  return MATERIAL_COLUMNS_[String(key || '').trim().toLowerCase().replace(/_line_[a-d]$/, '')] || '';
}

// {key item: angka} -> {kolom material: jumlah}
function sumByMaterial_(byKey) {
  var out = {};
  Object.keys(byKey || {}).forEach(function (k) {
    var col = materialColumn_(k), n = Number(byKey[k]) || 0;
    if (col && n) out[col] = (out[col] || 0) + n;
  });
  return out;
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

  var blobs = [], saved = [];
  files.forEach(function (f) {
    var raw = f.imageBase64 || '';
    var m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    var mime = m ? m[1] : 'image/jpeg';
    var b64 = m ? m[2] : raw;
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, f.fileName || 'foto.jpg');
    var file = targetFolder.createFile(blob);
    blobs.push(blob);
    saved.push({ name: file.getName(), url: file.getUrl() });
  });

  var telegramOk = sendWaspangPhotosToTelegram_(blobs, buildWaspangPhotoCaption_(payload));
  logWaspangPhotoToSheet_(payload, targetFolder.getUrl(), saved, telegramOk);

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

// true bila Telegram menerima semua foto.
function sendWaspangPhotosToTelegram_(blobs, caption) {
  var ok = true;
  try {
    if (blobs.length === 1) {
      return telegramOk_(UrlFetchApp.fetch('https://api.telegram.org/bot' + telegramToken_() + '/sendPhoto', {
        method: 'post',
        payload: {
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          caption: caption,
          parse_mode: 'Markdown',
          photo: blobs[0]
        },
        muteHttpExceptions: true
      }));
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
      ok = telegramOk_(UrlFetchApp.fetch('https://api.telegram.org/bot' + telegramToken_() + '/sendMediaGroup', {
        method: 'post',
        payload: formPayload,
        muteHttpExceptions: true
      })) && ok;
    }
  } catch (err) {
    console.error('Telegram send error: ' + err);
    return false;
  }
  return ok;
}

function telegramOk_(res) {
  try { return JSON.parse(res.getContentText()).ok === true; } catch (e) { return false; }
}

// Satu baris per foto, mengikuti judul kolom tab LOG FOTO WASPANG.
function logWaspangPhotoToSheet_(payload, folderUrl, saved, telegramOk) {
  try {
    if (!saved.length) return;
    var sh = sheetWithHeader_('LOG FOTO WASPANG', PHOTO_LOG_HEADER_), h = sheetHeader_(sh);
    var now = new Date(), tz = getWaspangSpreadsheet_().getSpreadsheetTimeZone();
    var cat = payload.mainCategory || '';
    var sub = cat === 'Elektrik' ? [payload.elektrikType, payload.fatId]
      : cat === 'Line' ? [payload.lineName] : [payload.progressText];
    var rows = saved.map(function (f) {
      return rowByHeader_(h, {
        'Timestamp': now,
        'Tanggal Pelaporan': "'" + Utilities.formatDate(now, tz, 'd/M/yyyy, HH.mm.ss'),
        'Site Name': cleanClusterNameForSync_(payload.siteName),
        'SOW': payload.sow || '',
        'Mandor': payload.mandor || '-',
        'Nama Waspang': payload.waspang || '',
        'Kategori Pekerjaan': cat,
        'Subfolder / FAT': sub.filter(Boolean).join(' / ') || '-',
        'Nama File': f.name,
        'Koordinat GPS': payload.gps || '-',
        'Link Maps': payload.mapsUrl || '-',
        'Link Foto Drive': f.url,
        'Link Folder Drive': folderUrl,
        'Catatan Lapangan': payload.notes || '',
        'Status Telegram': telegramOk ? 'SENT_TELEGRAM' : 'GAGAL_TELEGRAM'
      });
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
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

  logDailyReportToSheet_(payload);
  if (!payload.cluster) return { status: 'success' };
  // Laporan sudah terkirim: tambahkan Today ke Total bersama. Gagal di sini tidak membatalkan laporan.
  try {
    return { status: 'success', totals: addDailyToTotals_(payload) };
  } catch (err) {
    return { status: 'success', totalsError: err.toString() };
  }
}

// Satu baris per Daily Report di tab DAILY REPORT EMR; kolom material berisi volume Today.
function logDailyReportToSheet_(payload) {
  try {
    var r = payload.report || {};
    var sh = sheetWithHeader_('DAILY REPORT EMR', DAILY_REPORT_HEADER_);
    var vals = {
      'Timestamp': new Date(),
      'Tanggal': r.tanggal ? "'" + r.tanggal : '',
      'Cluster Name': cleanClusterNameForSync_(payload.cluster),
      'SOW': r.sow || payload.sow || '',
      'Start Implementation': r.startImpl ? "'" + r.startImpl : '',
      'Topology': r.topology || '',
      'Subcont': r.subcont || '-',
      'PIC': r.pic || payload.by || '',
      'Manpower': r.manpower || '',
      'Jam Kerja': r.jamKerja || '',
      // Halaman lama belum mengirim rincian: simpan seluruh teks laporan di Ringkasan.
      'Ringkasan Pencapaian': payload.report ? (r.ringkasan || '') : (payload.text || ''),
      'Today Activity': r.todayActivity || ''
    };
    var byCol = sumByMaterial_(payload.today);
    Object.keys(byCol).forEach(function (c) { vals[c] = byCol[c]; });
    sh.appendRow(rowByHeader_(sheetHeader_(sh), vals));
  } catch (err) {
    console.error('Log daily report error: ' + err);
  }
}

// ===================== SYNC_BOQ_EXCEL =====================

function cleanClusterNameForSync_(raw) {
  return String(raw || '').replace(/[​-‍﻿⁠]/g, '').trim();
}

// BOQ Plan dari portal mengisi kolom material pada baris Cluster Name + SOW di tabel MASTER BOQ CLUSTER
// (item per line dijumlahkan ke kolom materialnya). Cluster yang belum ada ditambahkan di bawah tabel.
function syncMasterBoqToSheet_(clusters) {
  if (!clusters || !clusters.length) {
    return { status: 'error', message: 'Tidak ada data cluster untuk disinkronkan.' };
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sh = sheetWithHeader_('MASTER BOQ CLUSTER', MASTER_BOQ_HEADER_), h = sheetHeader_(sh);
    var cNo = h.idx['no'], cName = h.idx['cluster name'], cSow = h.idx['sow'];
    var last = sh.getLastRow();
    var data = last >= 2 ? sh.getRange(2, 1, last - 1, h.width).getValues() : [];

    clusters.forEach(function (cl) {
      var name = cleanClusterNameForSync_(cl.name || cl.fullName);
      var sow = String(cl.sow || 'Cluster').trim();
      if (!name) return;
      var vols = {};
      (cl.items || []).forEach(function (it) { vols[it.key] = (vols[it.key] || 0) + (Number(it.volume) || 0); });
      var byCol = sumByMaterial_(vols);

      var r = -1;
      for (var i = 0; i < data.length; i++) {
        if (cleanClusterNameForSync_(data[i][cName]).toLowerCase() === name.toLowerCase() &&
            String(data[i][cSow]).trim().toLowerCase() === sow.toLowerCase()) { r = i; break; }
      }
      if (r === -1) {
        var row = [], maxNo = 0;
        for (var j = 0; j < h.width; j++) row.push('');
        data.forEach(function (d) { maxNo = Math.max(maxNo, Number(d[cNo]) || 0); });
        if (cNo !== undefined) row[cNo] = maxNo + 1;
        row[cName] = name;
        row[cSow] = sow;
        data.push(row);
        r = data.length - 1;
        sh.getRange(r + 2, 1, 1, h.width).setValues([row]);
      }
      Object.keys(byCol).forEach(function (col) {
        var c = h.idx[col];
        if (c === undefined) return;
        data[r][c] = byCol[col];
        sh.getRange(r + 2, c + 1).setValue(byCol[col]);
      });
    });

    return { status: 'success' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ===================== TOTAL BERSAMA (sheet PROGRES TOTAL) =====================
// Total kumulatif per cluster & item disimpan di sheet supaya semua HP memakai angka yang sama.
// Daily Report menambahkan Today; di portal hanya akun RPM (masuk lewat Gateway) yang boleh mengubah Total.
// Angka di kolom Total juga boleh diubah langsung di sheet; portal membacanya saat cluster dibuka.

function totalsSheet_() {
  var sh = getWaspangSpreadsheet_().getSheetByName(CONFIG.TOTALS_SHEET);
  if (sh && sh.getLastRow() <= 1) {
    // Masih kosong: pasang susunan kolom terbaru (Key di paling kanan).
    var head = TOTALS_HEADER_.slice();
    while (head.length < sh.getLastColumn()) head.push('');
    sh.getRange(1, 1, 1, head.length).setValues([head]);
  }
  return sheetWithHeader_(CONFIG.TOTALS_SHEET, TOTALS_HEADER_);
}

function totalsClusterKey_(name) {
  return cleanClusterNameForSync_(name).toLowerCase();
}

// {key: {row, total, vals}} untuk satu cluster (row = nomor baris di sheet, vals = isi barisnya).
function readClusterTotals_(sh, cluster) {
  var ck = totalsClusterKey_(cluster), out = {}, h = sheetHeader_(sh);
  var cC = h.idx['cluster'], cK = h.idx['key'], cT = h.idx['total'];
  var last = sh.getLastRow();
  var rows = last >= 2 ? sh.getRange(2, 1, last - 1, h.width).getValues() : [];
  rows.forEach(function (r, i) {
    var k = String(r[cK]).trim();
    if (k && totalsClusterKey_(r[cC]) === ck) out[k] = { row: i + 2, total: toCount_(r[cT]), vals: r };
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
// meta: {sow, names: {key: nama item}} untuk kolom SOW dan Item.
function writeTotals_(sh, cluster, cur, changes, by, note, meta) {
  var h = sheetHeader_(sh), now = new Date(), name = cleanClusterNameForSync_(cluster);
  var names = (meta && meta.names) || {}, sow = (meta && meta.sow) || '';
  Object.keys(changes).forEach(function (k) {
    var vals = { 'Total': changes[k], 'Diperbarui': now, 'Oleh': by || '', 'Keterangan': note || '' };
    if (cur[k]) {
      var row = cur[k].vals.slice();
      while (row.length < h.width) row.push('');
      if (!String(row[h.idx['item']] || '').trim()) vals['Item'] = names[k] || k;
      if (!String(row[h.idx['sow']] || '').trim() && sow) vals['SOW'] = sow;
      Object.keys(vals).forEach(function (col) {
        var c = h.idx[normHeader_(col)];
        if (c !== undefined) row[c] = vals[col];
      });
      sh.getRange(cur[k].row, 1, 1, h.width).setValues([row]);
      cur[k].vals = row;
    } else {
      vals['Cluster'] = name;
      vals['SOW'] = sow;
      vals['Item'] = names[k] || k;
      vals['Key'] = k;
      var newRow = rowByHeader_(h, vals);
      sh.appendRow(newRow);
      cur[k] = { row: sh.getLastRow(), vals: newRow };
    }
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
    writeTotals_(sh, payload.cluster, cur, changes, payload.by || 'Daily Report', 'Daily Report',
      { sow: payload.sow, names: payload.names });
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
    var names = {};
    names[key] = payload.itemName || '';
    writeTotals_(sh, payload.cluster, cur, ch, s.name || s.username, 'Edit RPM', { sow: payload.sow, names: names });
  } finally {
    lock.releaseLock();
  }
  return { status: 'success' };
}
