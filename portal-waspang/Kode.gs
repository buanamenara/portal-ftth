var CONFIG = {
  WASPANG_SPREADSHEET_ID: "1ZlSlITeC9zi-m894gQYUUn4YMfP6_8B_Jtep5a33OjA",
  DOKUMENTASI_FOLDER_ID: "1xY7LSgaZDiD4YvCGd2FW164IFVdtYGqZ", // folder "DOKUMENTASI FTTH" di Google Drive
  TELEGRAM_CHAT_ID: "@ReportBMI",
  // Gateway FTTH Project Control Portal: menukar tiket sekali pakai dengan username & role (untuk mengenali akun RPM).
  GATEWAY_URL: "https://script.google.com/macros/s/AKfycby4nXXb8JKdAJodp6MdrNfdmNODiCdWr4ouZPKOP6w4wz1tDZLCSqe11eeU9oHYgmVxeQ/exec",
  // Spreadsheet Portal FTTH: daftar site (Name) dan SOW di portal Waspang diambil dari tab DATA BASE.
  FTTH_SPREADSHEET_ID: "1KblZFDIcG6Jbbo6gy2Mh0vpgEzsgfUhMcwg5A5qtSME",
  // Spreadsheet "RPM BMI - BA Pekerjaan": kritik & saran dari Portal Waspang masuk ke tab KRITIK DAN SARAN,
  // tempat yang sama dengan masukan dari Portal FTTH.
  SARAN_SPREADSHEET_ID: "1S8c7A0hPZrJ4bHH6UuUfHY8mkBPvadubtlEV1VuZdHA",
  SARAN_SHEET_NAME: "KRITIK DAN SARAN",
  // Aktivitas Portal Waspang ikut dicatat di tab LOG HISTORY spreadsheet Portal FTTH (tempat yang sama dengan log Portal FTTH).
  LOG_SHEET_NAME: "LOG HISTORY"
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
  return withSites_(HtmlService.createHtmlOutputFromFile('Form'))
    .setTitle('Portal Waspang & Daily Report EMR')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var result;
  try {
    var payload = JSON.parse(e.postData.contents);
    WS_TZ_ = payload;   // zona waktu HP pengirim (tzOff), dipakai wsTz_()
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
        result = getTotals_(payload);
        break;
      case 'SET_TOTAL':
        result = setTotalByRpm_(payload);
        break;
      case 'GET_CLUSTER':
        result = getClusterData_(payload);
        break;
      case 'SET_DONE':
        result = setDone_(payload);
        break;
      case 'DELETE_BOQ':
        result = deleteBoqPlan_(payload);
        break;
      case 'GET_SITES':
        result = getSites_();
        break;
      case 'SARAN':
        result = kirimSaran_(payload);
        break;
      default:
        result = { status: 'error', message: 'Action tidak dikenali: ' + payload.action };
    }
    if (result && result.status === 'success') logWaspang_(payload, result);
  } catch (err) {
    result = { status: 'error', message: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Spreadsheet dan judul kolom dibuka/dibaca sekali per permintaan (satu GET_CLUSTER dulu membuka spreadsheet 2x
// dan membaca baris judul 4x). Variabel global Apps Script mulai kosong lagi di tiap permintaan.
var wsSsMemo_ = null, wsHeadMemo_ = {};
// Zona waktu HP/PC pengirim: tzOff = menit di depan UTC (dikirim halaman). Tanpa tzOff (halaman lama): zona spreadsheet.
// -> {id: 'GMT+08:00', label: 'WITA'} untuk Utilities.formatDate dan teks yang dicatat.
var WS_TZ_ = null, TZ_LABELS_ = { '420': 'WIB', '480': 'WITA', '540': 'WIT' };
function wsTz_() {
  var p = WS_TZ_ || {}, off = p.tzOff !== undefined && p.tzOff !== null && p.tzOff !== '' ? Number(p.tzOff) : NaN;
  if (!(isFinite(off) && Math.abs(off) <= 840 && off % 15 === 0)) {
    var z = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'Z');   // mis. +0800
    off = (z.charAt(0) === '-' ? -1 : 1) * (Number(z.substr(1, 2)) * 60 + Number(z.substr(3, 2)));
  }
  var a = Math.abs(off), sign = off < 0 ? '-' : '+';
  var hm = ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + (a % 60)).slice(-2);
  return { id: 'GMT' + sign + hm, label: TZ_LABELS_[String(off)] || 'UTC' + sign + hm };
}

function getWaspangSpreadsheet_() {
  return wsSsMemo_ || (wsSsMemo_ = SpreadsheetApp.openById(CONFIG.WASPANG_SPREADSHEET_ID));
}

// ===================== TABEL DI SPREADSHEET WASPANG =====================
// Kolom dicari dari judul di baris 1 (huruf besar/kecil dan teks dalam kurung diabaikan),
// jadi isian selalu masuk ke kolom yang benar walau urutan kolom di sheet diubah.

var MATERIAL_HEADERS_ = ['Pole 7/4 (NP 7m + 4")', 'Pole 7/3 (NP 7m + 3")', 'Pole 7/2,5 (NP 7m + 2,5")', 'Pole 9/4 (NP 9m + 4")',
  'Digging Pole', 'Casting Pole', 'Cable 24C', 'Cable 36C', 'Cable 48C', 'Cable 96C', 'Cable 144C', 'Sling Wire 6mm',
  'HDPE 40/30 (40/34)', 'FDT 48', 'FDT 72', 'FAT (16 Port)', 'JC 48 C', 'JC 144 C', 'Suspension 48', 'Suspension 144',
  'Pole Clamp', 'Dead End', 'Dead End 144', 'Slack Hanger', 'Plat Belt', 'Stopping', 'Buldogrip'];
// Rincian Item = volume per item portal (item per line terpisah), Selesai = item yang sudah ditandai selesai.
var MASTER_BOQ_HEADER_ = ['No', 'Cluster Name', 'SOW'].concat(MATERIAL_HEADERS_).concat(['Rincian Item', 'Selesai']);
// Rincian Item mencatat angka per item portal, mis. "Cable 24C Line A = 3; FAT Line B = 1", supaya Total per line
// tetap terbaca walau kolom materialnya digabung. Ringkasan Pencapaian = satu baris item yang dikerjakan hari itu;
// Teks Laporan (paling kanan) = daftar lengkap Today/Total/Plan seperti di Telegram.
var DAILY_REPORT_HEADER_ = ['Timestamp', 'Tanggal', 'Cluster Name', 'SOW', 'Start Implementation', 'Topology', 'Subcont', 'PIC',
  'Manpower', 'Jam Kerja', 'Ringkasan Pencapaian', 'Today Activity'].concat(MATERIAL_HEADERS_).concat(['Rincian Item', 'Teks Laporan']);
var PHOTO_LOG_HEADER_ = ['Timestamp', 'Tanggal Pelaporan', 'Site Name', 'SOW', 'Mandor', 'Nama Waspang', 'Kategori Pekerjaan',
  'Subfolder / FAT', 'Nama File', 'Koordinat GPS', 'Link Maps', 'Link Foto Drive', 'Link Folder Drive', 'Catatan Lapangan', 'Status Telegram'];

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
  var memoKey = 'h' + sh.getSheetId();
  if (wsHeadMemo_[memoKey]) return wsHeadMemo_[memoKey];
  var width = sh.getLastColumn();
  var head = width ? sh.getRange(1, 1, 1, width).getValues()[0] : [];
  var idx = {};
  head.forEach(function (v, i) {
    var k = normHeader_(v);
    if (k && !(k in idx)) idx[k] = i;
  });
  return (wsHeadMemo_[memoKey] = { idx: idx, width: head.length });
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
      if (h.width + 1 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
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
  var fatCounts = payload.fatCounts || {};

  var docRoot = DriveApp.getFolderById(CONFIG.DOKUMENTASI_FOLDER_ID);
  var siteFolder = getOrCreateFolder_(docRoot, siteName);

  // Folder Line (penarikan kabel) tidak dibuat lagi; Line A-D hanya ada di Elektrik (FAT).
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
    var m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.*)$/);
    var mime = m ? m[1] : 'image/jpeg';
    var b64 = m ? m[2] : raw;
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, f.fileName || (mime === 'application/pdf' ? 'dokumen.pdf' : 'foto.jpg'));
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

// true bila Telegram menerima semua file. Foto dikirim sebagai foto, PDF sebagai dokumen (Telegram tidak bisa
// mencampur keduanya dalam satu album); keterangan laporan ikut pada kiriman pertama.
function sendWaspangPhotosToTelegram_(blobs, caption) {
  var photos = blobs.filter(function (b) { return b.getContentType() !== 'application/pdf'; });
  var docs = blobs.filter(function (b) { return b.getContentType() === 'application/pdf'; });
  try {
    var ok = sendTelegramGroup_(photos, 'photo', caption);
    return sendTelegramGroup_(docs, 'document', photos.length ? '' : caption) && ok;
  } catch (err) {
    console.error('Telegram send error: ' + err);
    return false;
  }
}

// Satu jenis file (photo / document) ke Telegram lewat sendMediaGroup, dipecah per 10; potongan berisi satu file
// lewat sendPhoto / sendDocument.
function sendTelegramGroup_(blobs, type, caption) {
  var ok = true;
  for (var start = 0; start < blobs.length; start += 10) {
    var chunk = blobs.slice(start, start + 10);
    var cap = start === 0 ? caption : '';
    // Album Telegram butuh 2-10 file: satu file (termasuk sisa satu, mis. foto ke-11) dikirim sendiri.
    if (chunk.length === 1) {
      var one = { chat_id: CONFIG.TELEGRAM_CHAT_ID, caption: cap, parse_mode: 'Markdown' };
      one[type] = chunk[0];
      ok = telegramPost_(type === 'photo' ? 'sendPhoto' : 'sendDocument', one).ok === true && ok;
      continue;
    }
    var media = [];
    var formPayload = { chat_id: CONFIG.TELEGRAM_CHAT_ID };
    chunk.forEach(function (blob, idx) {
      var key = 'p_' + idx;
      media.push({
        type: type,
        media: 'attach://' + key,
        caption: (start === 0 && idx === 0) ? caption : '',
        parse_mode: 'Markdown'
      });
      formPayload[key] = blob;
    });
    formPayload.media = JSON.stringify(media);
    ok = telegramPost_('sendMediaGroup', formPayload).ok === true && ok;
  }
  return ok;
}

// Kirim ke Telegram. Bila Telegram menolak format Markdown-nya (mis. "_" atau "*" tanpa pasangan di catatan),
// kirim ulang sebagai teks biasa supaya laporan tetap sampai. -> isi balasan Telegram ({ok, description, ...}).
function telegramPost_(method, payload) {
  var url = 'https://api.telegram.org/bot' + telegramToken_() + '/' + method;
  var json = telegramFetch_(url, payload);
  if (!json.ok && /parse entities/i.test(json.description || '')) {
    var plain = {};
    Object.keys(payload).forEach(function (k) { if (k !== 'parse_mode') plain[k] = payload[k]; });
    if (plain.media) {
      plain.media = JSON.stringify(JSON.parse(plain.media).map(function (m) { delete m.parse_mode; return m; }));
    }
    json = telegramFetch_(url, plain);
  }
  return json;
}

function telegramFetch_(url, payload) {
  var res = UrlFetchApp.fetch(url, { method: 'post', payload: payload, muteHttpExceptions: true });
  try { return JSON.parse(res.getContentText()) || {}; } catch (e) { return {}; }
}

// Satu baris per foto, mengikuti judul kolom tab LOG FOTO WASPANG.
function logWaspangPhotoToSheet_(payload, folderUrl, saved, telegramOk) {
  try {
    if (!saved.length) return;
    var sh = sheetWithHeader_('LOG FOTO WASPANG', PHOTO_LOG_HEADER_), h = sheetHeader_(sh);
    var now = new Date(), tz = wsTz_();
    var cat = payload.mainCategory || '';
    var sub = cat === 'Elektrik' ? [payload.elektrikType, payload.fatId]
      : cat === 'Line' ? [payload.lineName] : [payload.progressText];
    var rows = saved.map(function (f) {
      return rowByHeader_(h, {
        'Timestamp': now,
        'Tanggal Pelaporan': "'" + Utilities.formatDate(now, tz.id, 'd/M/yyyy, HH.mm.ss') + ' ' + tz.label,
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
    var json = telegramPost_('sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown' });
    if (!json.ok) {
      return { status: 'error', message: json.description || 'Gagal mengirim ke Telegram.' };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }

  // Laporan sudah terkirim: catat di tab DAILY REPORT EMR. Gagal di sini tidak membatalkan laporan.
  try {
    return recordDailyReport_(payload);
  } catch (err) {
    console.error('Log daily report error: ' + err);
    return { status: 'success', totalsError: err.toString() };
  }
}

// Satu baris per Daily Report di tab DAILY REPORT EMR (kolom material berisi volume Today),
// lalu Total baru cluster itu dihitung dari tab yang sama.
function recordDailyReport_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(45000);   // laporan sudah terkirim ke Telegram: tunggu lebih lama supaya barisnya tidak hilang
  try {
    var r = payload.report || {}, sh = dailySheet_(), cluster = payload.cluster, names = payload.names || {};
    var sow = r.sow || payload.sow || sowFromId_(cluster);
    if (cluster) addOpeningBalance_(sh, cluster, sow, payload.base, payload.by, names);
    appendDailyRow_(sh, {
      'Tanggal': dmyText_(r.tanggal),
      'Cluster Name': siteName_(cluster),
      'SOW': sow || '',
      'Start Implementation': dmyText_(r.startImpl),
      'Topology': r.topology || '',
      'Subcont': r.subcont || '-',
      'PIC': r.pic || payload.by || '',
      'Manpower': r.manpower || '',
      'Jam Kerja': r.jamKerja || '',
      'Ringkasan Pencapaian': payload.today ? todaySummary_(payload.today, names, payload.keys) : '',
      'Today Activity': r.todayActivity || '',
      // Halaman lama belum mengirim rincian: simpan seluruh teks laporan.
      'Teks Laporan': payload.report ? (r.ringkasan || '') : (payload.text || '')
    }, payload.today, names);
    if (!cluster) return { status: 'success' };
    return { status: 'success', totals: clusterTotals_(sh, cluster, payload.keys, sow).totals };
  } finally {
    lock.releaseLock();
  }
}

// ===================== NAMA CLUSTER =====================

function cleanClusterNameForSync_(raw) {
  return String(raw || '').replace(/[\u200B-\u200D\uFEFF\u2060]/g, '').trim();
}

// Id cluster di portal bisa diberi awalan SOW (mis. "SUBFEEDER - <nama>") bila satu nama punya beberapa SOW.
var SOW_PREFIX_RE_ = /^(subfeeder|fwa|mainfeeder|hubfeeder|uplink)(\s*-\s*|\s+)/i;

// Nama site seperti di DATA BASE (tanpa awalan SOW).
function siteName_(raw) {
  return cleanClusterNameForSync_(raw).replace(SOW_PREFIX_RE_, '').trim();
}

// Teks SOW -> Cluster, Subfeeder, Mainfeeder, Hubfeeder, Uplink atau FWA ('' bila tidak dikenali).
function normSow_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s.indexOf('subfeeder') >= 0 || s.indexOf('sub feeder') >= 0) return 'Subfeeder';
  if (s.indexOf('mainfeeder') >= 0 || s.indexOf('main feeder') >= 0) return 'Mainfeeder';
  if (s.indexOf('hubfeeder') >= 0 || s.indexOf('hub feeder') >= 0) return 'Hubfeeder';
  if (s.indexOf('uplink') >= 0 || s.indexOf('up link') >= 0) return 'Uplink';
  if (s.indexOf('fwa') >= 0) return 'FWA';
  if (s.indexOf('cluster') >= 0) return 'Cluster';
  return '';
}

// SOW dari awalan id ('' bila tanpa awalan).
function sowFromId_(raw) {
  var m = cleanClusterNameForSync_(raw).match(SOW_PREFIX_RE_);
  return m ? normSow_(m[1]) : '';
}

// ===================== DAFTAR SITE (tab DATA BASE di spreadsheet Portal FTTH) =====================
// Kolom Name dan SOW dicari dari baris judul (baris 1-5); setiap baris di bawahnya = satu site + SOW.
// Hasil disimpan 10 menit, jadi site baru di DATA BASE muncul di portal paling lama 10 menit kemudian.

function getSites_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('database_sites_v1');
  if (hit) return { status: 'success', sites: JSON.parse(hit) };
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('DATA BASE');
  if (!sh) return { status: 'error', message: 'Tab DATA BASE tidak ditemukan.' };
  var last = sh.getLastRow(), width = Math.min(sh.getLastColumn(), 40);
  if (last < 2 || width < 2) return { status: 'error', message: 'Tab DATA BASE kosong.' };
  var vals = sh.getRange(1, 1, last, width).getValues();
  var hr = -1, cName = -1, cSow = -1, cReg = -1;
  for (var i = 0; i < Math.min(5, vals.length) && hr < 0; i++) {
    var head = vals[i].map(normHeader_);
    if (head.indexOf('name') >= 0 && head.indexOf('sow') >= 0) {
      hr = i; cName = head.indexOf('name'); cSow = head.indexOf('sow'); cReg = head.indexOf('region');
    }
  }
  if (hr < 0) return { status: 'error', message: 'Kolom Name / SOW tidak ditemukan di tab DATA BASE.' };
  var sites = [], seen = {};
  for (var r = hr + 1; r < vals.length; r++) {
    var name = cleanClusterNameForSync_(vals[r][cName]).replace(/\s+/g, ' ');
    var sowRaw = String(vals[r][cSow] || '').trim();
    if (!name || !sowRaw) continue;
    var sow = normSow_(sowRaw) || sowRaw, k = name.toLowerCase() + '|' + sow.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    sites.push({ name: name, sow: sow, region: cReg >= 0 ? String(vals[r][cReg] || '').trim() : '' });
  }
  if (!sites.length) return { status: 'error', message: 'Tab DATA BASE belum berisi site.' };
  try { var json = JSON.stringify(sites); cache.put('database_sites_v1', json, 600); cache.put('database_sites_page', json, 21600); } catch (e) {}
  return { status: 'success', sites: sites };
}

// Daftar site ikut di halaman, jadi pilihan cluster langsung terisi tanpa menunggu permintaan kedua ke server.
// Salinan 6 jam boleh sedikit lama: halaman tetap meminta GET_SITES di belakang dan memperbarui daftar bila berubah.
function withSites_(out) {
  try {
    var cache = CacheService.getScriptCache(), json = cache.get('database_sites_v1') || cache.get('database_sites_page');
    if (!json) {
      var r = getSites_();
      if (r.status !== 'success') return out;
      json = JSON.stringify(r.sites);
    }
    var tag = '<script>window.WS_SITES = ' + json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';</script>\n';
    out.setContent(out.getContent().replace('</head>', function () { return tag + '</head>'; }));
  } catch (e) {
    console.error('Daftar site di halaman: ' + e);
  }
  return out;
}

// ===================== BOQ PLAN & SELESAI (tab MASTER BOQ CLUSTER) =====================
// Satu baris per Cluster Name + SOW. Kolom material berisi volume plan (item per line dijumlahkan), Rincian Item
// berisi volume per item portal, dan Selesai berisi item yang sudah ditandai selesai ("-" = belum ada).
// Semua HP membaca plan dan status dari sini saat cluster dibuka. Angka material boleh diubah langsung di sheet.

function boqSheet_() {
  return sheetWithHeader_('MASTER BOQ CLUSTER', MASTER_BOQ_HEADER_);
}

function boqData_(sh, h) {
  var last = sh.getLastRow();
  return last >= 2 ? sh.getRange(2, 1, last - 1, h.width).getValues() : [];
}

// Indeks baris (di data) untuk Cluster Name + SOW, -1 bila belum ada.
function boqRowIndex_(data, h, name, sow) {
  var cName = h.idx['cluster name'], cSow = h.idx['sow'];
  var n = cleanClusterNameForSync_(name).toLowerCase(), so = String(sow || 'Cluster').trim().toLowerCase();
  for (var i = 0; i < data.length; i++) {
    if (cleanClusterNameForSync_(data[i][cName]).toLowerCase() === n && String(data[i][cSow]).trim().toLowerCase() === so) return i;
  }
  return -1;
}

// Cluster yang belum ada ditambahkan di bawah tabel dengan No berikutnya.
function appendBoqRow_(sh, h, data, name, sow) {
  var cNo = h.idx['no'], row = [], maxNo = 0;
  for (var j = 0; j < h.width; j++) row.push('');
  data.forEach(function (d) { maxNo = Math.max(maxNo, Number(d[cNo]) || 0); });
  if (cNo !== undefined) row[cNo] = maxNo + 1;
  row[h.idx['cluster name']] = cleanClusterNameForSync_(name);
  row[h.idx['sow']] = String(sow || 'Cluster').trim();
  data.push(row);
  sh.getRange(data.length + 1, 1, 1, h.width).setValues([row]);
  return data.length - 1;
}

// Tulis beberapa sel di satu baris ({indeks kolom: isi}); kolom yang berurutan ditulis sekaligus.
function writeCells_(sh, rowNum, rowData, cells) {
  var cols = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
  for (var i = 0; i < cols.length;) {
    var j = i;
    while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
    var vals = [];
    for (var k = i; k <= j; k++) {
      vals.push(cells[cols[k]]);
      if (rowData) rowData[cols[k]] = cells[cols[k]];
    }
    sh.getRange(rowNum, cols[i] + 1, 1, vals.length).setValues([vals]);
    i = j + 1;
  }
}

// [{col: judul normal, idx: indeks kolom, baseKey}] untuk kolom material yang ada di sheet.
function materialCols_(h) {
  var out = [], seen = {};
  Object.keys(MATERIAL_COLUMNS_).forEach(function (k) {
    var col = MATERIAL_COLUMNS_[k];
    if (h.idx[col] !== undefined && !seen[col]) { seen[col] = true; out.push({ col: col, idx: h.idx[col], baseKey: k }); }
  });
  return out;
}

// Angka di kolom material = patokan. part = {key: angka per item}; selisihnya masuk ke item pertama
// (bila berkurang, dikurangi berurutan mulai item pertama).
function splitCell_(part, ks, v) {
  var sum = 0;
  ks.forEach(function (k) { sum += part[k]; });
  var diff = v - sum;
  if (diff >= 0) { part[ks[0]] += diff; return part; }
  ks.forEach(function (k) {
    var d = Math.min(-diff, Math.max(0, part[k]));
    part[k] -= d;
    diff += d;
  });
  part[ks[0]] += diff;
  return part;
}

// Item BOQ Plan -> "pole_7_4=1; cable_24c_line_a=704; mat_17=5 @Kabel Drop|meter|Lain-lain"
// (nama, satuan dan kategori hanya ditulis untuk item di luar katalog material).
function planRincianText_(items) {
  return (items || []).filter(function (it) { return it && String(it.key || '').trim(); }).map(function (it) {
    var k = String(it.key).trim(), t = rincianKey_(k) + '=' + (Number(it.volume) || 0);
    if (!materialColumn_(k) && it.name) {
      t += ' @' + [it.name, it.unit || '', it.cat || ''].map(function (x) { return String(x).replace(/[;|@=]/g, ' ').trim(); }).join('|');
    }
    return t;
  }).join('; ');
}

function parsePlanRincian_(text) {
  var out = { vols: {}, meta: {}, order: [] };
  String(text || '').split(';').forEach(function (part) {
    var m = part.match(/^\s*([^=@]+?)\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:@(.*))?$/);
    if (!m) return;
    var k = m[1];
    try { k = decodeURIComponent(k); } catch (e) {}
    if (!(k in out.vols)) { out.vols[k] = 0; out.order.push(k); }
    out.vols[k] += Number(m[2]);
    if (m[3]) {
      var p = m[3].split('|');
      out.meta[k] = { name: (p[0] || '').trim(), unit: (p[1] || '').trim(), cat: (p[2] || '').trim() };
    }
  });
  return out;
}

function parseDone_(v) {
  var t = String(v == null ? '' : v).trim();
  if (!t || t === '-') return [];
  return t.split(';').map(function (k) { return k.trim(); }).filter(Boolean);
}

// Plan satu baris. local = item BOQ Plan di HP ([{key, volume}], urutan plan): dipakai untuk membagi angka material
// yang belum punya Rincian Item (mis. diketik langsung di sheet) ke item per line yang sama dengan di HP.
// -> {found, items: [{key, volume, name?, unit?, cat?}], done: [key], doneSet}
function planFromRow_(h, row, local) {
  var cRin = h.idx['rincian item'], cDone = h.idx['selesai'], mats = materialCols_(h);
  var rin = cRin === undefined ? parsePlanRincian_('') : parsePlanRincian_(row[cRin]);
  var doneRaw = cDone === undefined ? '' : String(row[cDone] == null ? '' : row[cDone]).trim();
  var plan = { found: false, items: [], done: parseDone_(doneRaw), doneSet: doneRaw !== '' };
  var hasData = rin.order.length > 0 || mats.some(function (m) { return cellNumber_(row[m.idx]) !== 0; });
  // Rincian Item "-" tanpa angka material = plan dihapus RPM: HP lain ikut menghapus salinan plan-nya.
  if (!hasData && cRin !== undefined && String(row[cRin] == null ? '' : row[cRin]).trim() === '-') plan.cleared = true;
  if (!hasData) return plan;

  var localVol = {}, localKeys = [];
  (local || []).forEach(function (it) {
    var k = it && String(it.key || '').trim();
    if (!k) return;
    if (!(k in localVol)) { localVol[k] = 0; localKeys.push(k); }
    localVol[k] += Number(it.volume) || 0;
  });
  var vol = {}, order = [];
  function put(k, n) {
    if (!(k in vol)) { vol[k] = 0; order.push(k); }
    vol[k] += n;
  }
  function noColumn(k) {
    var col = materialColumn_(k);
    return !col || h.idx[col] === undefined;
  }
  // Item tanpa kolom material di sheet: angka dari Rincian Item. Baris yang belum punya Rincian Item (plan lama)
  // tidak bisa memuat item itu, jadi item tambahan yang sudah ada di HP tetap dipakai.
  if (rin.order.length) rin.order.forEach(function (k) { if (noColumn(k)) put(k, rin.vols[k]); });
  else localKeys.forEach(function (k) { if (noColumn(k) && localVol[k]) put(k, localVol[k]); });
  mats.forEach(function (m) {
    var v = cellNumber_(row[m.idx]), part = {};
    var ks = rin.order.filter(function (k) { return materialColumn_(k) === m.col; });
    if (ks.length) ks.forEach(function (k) { part[k] = rin.vols[k]; });
    else if (v) {
      ks = localKeys.filter(function (k) { return materialColumn_(k) === m.col; });
      ks.forEach(function (k) { part[k] = localVol[k]; });
      if (!ks.length) { ks = [m.baseKey]; part[m.baseKey] = 0; }
    }
    if (!ks.length) return;
    splitCell_(part, ks, v);
    ks.forEach(function (k) { put(k, part[k]); });
  });
  // Urutan: urutan Rincian Item, lalu item lain. Item bervolume 0 hanya dipertahankan bila tercatat di Rincian Item.
  var keys = rin.order.filter(function (k) { return k in vol; })
    .concat(order.filter(function (k) { return rin.order.indexOf(k) < 0; }));
  plan.found = true;
  plan.items = keys.filter(function (k) { return vol[k] !== 0 || (k in rin.vols); }).map(function (k) {
    var it = { key: k, volume: Math.round(vol[k] * 1000) / 1000 };
    if (rin.meta[k]) { it.name = rin.meta[k].name; it.unit = rin.meta[k].unit; it.cat = rin.meta[k].cat; }
    return it;
  });
  return plan;
}

// BOQ Plan dari portal (simpan manual atau impor Excel) menggantikan plan cluster itu: kolom material diisi ulang
// (material yang tidak ada di plan dikosongkan) dan Rincian Item ditulis. Tanda Selesai tidak berubah.
function syncMasterBoqToSheet_(clusters) {
  if (!clusters || !clusters.length) {
    return { status: 'error', message: 'Tidak ada data cluster untuk disinkronkan.' };
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sh = boqSheet_(), h = sheetHeader_(sh), mats = materialCols_(h), cRin = h.idx['rincian item'];
    var data = boqData_(sh, h);

    clusters.forEach(function (cl) {
      var name = cleanClusterNameForSync_(cl.name || cl.fullName);
      var sow = String(cl.sow || 'Cluster').trim();
      if (!name) return;
      var items = (cl.items || []).filter(function (it) { return it && String(it.key || '').trim(); });
      var vols = {};
      items.forEach(function (it) { vols[it.key] = (vols[it.key] || 0) + (Number(it.volume) || 0); });
      var byCol = sumByMaterial_(vols);

      var r = boqRowIndex_(data, h, name, sow);
      if (r === -1) r = appendBoqRow_(sh, h, data, name, sow);
      var cells = {};
      mats.forEach(function (m) { cells[m.idx] = byCol[m.col] || ''; });
      if (cRin !== undefined) cells[cRin] = planRincianText_(items);
      writeCells_(sh, r + 2, data[r], cells);
    });

    return { status: 'success' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// RPM menghapus BOQ Plan satu cluster (mis. salah unggah). Site yang ada di DATA BASE: kolom material dikosongkan dan
// Rincian Item diisi "-" (tanda plan dihapus). Nama di luar DATA BASE (baris sisa impor yang salah): barisnya dihapus.
// Tanda Selesai dan DAILY REPORT EMR tidak berubah.
function deleteBoqPlan_(payload) {
  var s = wsSession_(payload.session);
  if (!s) return { status: 'error', message: 'Sesi habis. Buka Portal Waspang lagi dari Gateway.' };
  if (s.role !== 'rpm') return { status: 'error', message: 'Hanya akun RPM yang boleh menghapus BOQ Plan.' };
  var name = siteName_(payload.name || payload.cluster), sow = String(payload.sow || 'Cluster').trim();
  if (!name) return { status: 'error', message: 'Cluster kosong.' };
  var sites = getSites_(), key = name.replace(/\s+/g, ' ').toLowerCase(), so = (normSow_(sow) || sow).toLowerCase();
  var inDb = sites.status !== 'success' || sites.sites.some(function (x) { return x.name.toLowerCase() === key && x.sow.toLowerCase() === so; });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = boqSheet_(), h = sheetHeader_(sh), data = boqData_(sh, h);
    var r = boqRowIndex_(data, h, name, sow);
    if (r === -1) return { status: 'success', found: false, removedRow: false };
    if (!inDb) {
      sh.deleteRow(r + 2);
      return { status: 'success', found: true, removedRow: true };
    }
    var cells = {};
    materialCols_(h).forEach(function (m) { cells[m.idx] = ''; });
    if (h.idx['rincian item'] !== undefined) cells[h.idx['rincian item']] = '-';
    writeCells_(sh, r + 2, data[r], cells);
    return { status: 'success', found: true, removedRow: false };
  } finally {
    lock.releaseLock();
  }
}

// Data satu cluster untuk portal: BOQ Plan + item Selesai (MASTER BOQ CLUSTER) dan Total (DAILY REPORT EMR).
function getClusterData_(payload) {
  var name = cleanClusterNameForSync_(payload.name || payload.cluster);
  if (!name) return { status: 'error', message: 'Cluster kosong.' };
  var sh = boqSheet_(), h = sheetHeader_(sh), data = boqData_(sh, h);
  var r = boqRowIndex_(data, h, name, payload.sow);
  var plan = r === -1 ? { found: false, items: [], done: [], doneSet: false } : planFromRow_(h, data[r], payload.local);
  var keys = plan.items.map(function (it) { return it.key; }).concat(payload.keys || []);
  var t = clusterTotals_(dailySheet_(), payload.cluster || name, keys, payload.sow);
  return { status: 'success', plan: plan, found: t.found, totals: t.totals };
}

// Tandai / buka tanda Selesai (keys = satu atau beberapa item) untuk semua HP.
function setDone_(payload) {
  var name = cleanClusterNameForSync_(payload.name || payload.cluster), sow = String(payload.sow || 'Cluster').trim();
  var keys = (payload.keys || (payload.key ? [payload.key] : [])).map(function (k) { return String(k || '').trim(); }).filter(Boolean);
  if (!name || !keys.length) return { status: 'error', message: 'Data Selesai tidak lengkap.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = boqSheet_(), h = sheetHeader_(sh), cDone = h.idx['selesai'], data = boqData_(sh, h);
    var r = boqRowIndex_(data, h, name, sow);
    if (r === -1) r = appendBoqRow_(sh, h, data, name, sow);
    var cur = parseDone_(data[r][cDone]);
    keys.forEach(function (k) {
      var i = cur.indexOf(k);
      if (payload.done && i < 0) cur.push(k);
      if (!payload.done && i >= 0) cur.splice(i, 1);
    });
    var cells = {};
    cells[cDone] = cur.length ? cur.join('; ') : '-';
    writeCells_(sh, r + 2, data[r], cells);
    return { status: 'success', done: cur };
  } finally {
    lock.releaseLock();
  }
}

// ===================== TOTAL (dihitung dari tab DAILY REPORT EMR) =====================
// Total per cluster & item = jumlah semua baris cluster itu di DAILY REPORT EMR, jadi semua HP memakai angka yang sama.
// Angka di sheet boleh diubah langsung (atau ditambah baris koreksi); portal membacanya saat cluster dibuka.
// Di portal hanya akun RPM (masuk lewat Gateway) yang boleh mengubah Total; perubahannya dicatat sebagai baris koreksi.

function dailySheet_() {
  return sheetWithHeader_('DAILY REPORT EMR', DAILY_REPORT_HEADER_);
}

function totalsClusterKey_(name) {
  return siteName_(name).toLowerCase();
}

function todayText_() {
  return Utilities.formatDate(new Date(), wsTz_().id, 'dd/MM/yyyy');   // tanggal di HP pengirim
}

// "9/10/2026" -> "'09/10/2026": teks dd/mm/yyyy, sama dengan format Timestamp.
function dmyText_(s) {
  var t = String(s || '').trim(), m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) t = ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  return t ? "'" + t : '';
}

function cellNumber_(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v == null ? '' : v).trim());
  return isFinite(n) ? n : 0;
}

// Nama item katalog = judul kolom materialnya (+ " Line A" dst.), mis. "Cable 24C Line A"; '' untuk item di luar katalog.
function catalogItemName_(key) {
  var k = String(key || '').trim().toLowerCase(), m = k.match(/^(.*)_line_([a-d])$/), col = MATERIAL_COLUMNS_[m ? m[1] : k];
  if (!col) return '';
  for (var i = 0; i < MATERIAL_HEADERS_.length; i++) {
    if (normHeader_(MATERIAL_HEADERS_[i]) === col) {
      return MATERIAL_HEADERS_[i].replace(/\s*\(.*$/, '').trim() + (m ? ' Line ' + m[2].toUpperCase() : '');
    }
  }
  return '';
}

var ITEM_BY_NAME_ = null;

// {nama item katalog huruf kecil: key}
function itemByName_() {
  if (ITEM_BY_NAME_) return ITEM_BY_NAME_;
  ITEM_BY_NAME_ = {};
  Object.keys(MATERIAL_COLUMNS_).forEach(function (b) {
    ['', '_line_a', '_line_b', '_line_c', '_line_d'].forEach(function (s) {
      var n = catalogItemName_(b + s).toLowerCase();
      if (n && !(n in ITEM_BY_NAME_)) ITEM_BY_NAME_[n] = b + s;
    });
  });
  return ITEM_BY_NAME_;
}

// Nama item untuk ditampilkan: nama di HP, lalu nama katalog, lalu key.
function itemDisplayName_(k, names) {
  return String((names || {})[k] || '').trim() || catalogItemName_(k) || String(k);
}

// Ringkasan satu baris: item yang ada angka Today-nya (urutan BOQ Plan), mis. "Pole 7/3: 5 | Digging Pole: 10".
function todaySummary_(today, names, keys) {
  var seen = {}, out = [];
  (keys || []).concat(Object.keys(today || {})).forEach(function (k) {
    k = String(k || '').trim();
    if (!k || seen[k]) return;
    seen[k] = true;
    var n = Number((today || {})[k]) || 0;
    if (n) out.push(itemDisplayName_(k, names) + ': ' + n);
  });
  return out.length ? out.join(' | ') : 'Tidak ada progres';
}

// {key item: angka} <-> "Cable 24C Line A = 3; Kabel Drop (mat_17) = 5". Item katalog ditulis dengan namanya,
// item lain dengan nama di HP + key dalam kurung. Baris lama berformat "cable_24c_line_a=3" tetap terbaca.
function rincianText_(byKey, names) {
  return Object.keys(byKey || {}).filter(function (k) { return String(k).trim() && Number(byKey[k]); }).map(function (k) {
    return rincianLabel_(k, names) + ' = ' + Number(byKey[k]);
  }).join('; ');
}

function rincianLabel_(k, names) {
  var key = String(k).trim(), n = catalogItemName_(key);
  if (n && rincianKeyOf_(n) === key) return n;
  var given = String((names || {})[key] || '').replace(/[%;=@()]/g, ' ').replace(/\s+/g, ' ').trim();
  return given && given.toLowerCase() !== key.toLowerCase() ? given + ' (' + rincianKey_(key) + ')' : rincianKey_(key);
}

function rincianKey_(k) {
  return String(k).trim().replace(/[%;=@()]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

function rincianKeyOf_(label) {
  var t = String(label).trim(), m = t.match(/\(([^()]+)\)$/);
  if (m) t = m[1];
  else if (itemByName_()[t.toLowerCase()]) return itemByName_()[t.toLowerCase()];
  try { t = decodeURIComponent(t); } catch (e) {}
  return t;
}

function parseRincian_(text) {
  var out = {};
  String(text || '').split(';').forEach(function (part) {
    var m = part.match(/^\s*([^=]+?)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return;
    var k = rincianKeyOf_(m[1]);
    out[k] = (out[k] || 0) + Number(m[2]);
  });
  return out;
}

// vals = {judul kolom: isi}; byKey = {key item: angka} mengisi kolom material dan Rincian Item.
function appendDailyRow_(sh, vals, byKey, names) {
  vals['Timestamp'] = new Date();
  var byCol = sumByMaterial_(byKey);
  Object.keys(byCol).forEach(function (c) { vals[c] = byCol[c]; });
  vals['Rincian Item'] = rincianText_(byKey, names);
  sh.appendRow(rowByHeader_(sheetHeader_(sh), vals));
  try { formatDailyRows_(sh, sh.getLastRow()); } catch (e) { console.error('Format DAILY REPORT EMR: ' + e); }
}

// Tampilan tab: Timestamp dd/mm/yyyy HH:mm (sama dengan Tanggal), teks panjang tidak membuat baris tinggi,
// baris Saldo awal dan Koreksi Total (RPM) berwarna kuning muda. Isi sel tidak diubah.
// onlyRow = hanya baris itu (baris baru dari appendDailyRow_); tanpa onlyRow = semua baris.
function formatDailyRows_(sh, onlyRow) {
  var h = sheetHeader_(sh), first = onlyRow || 2, n = onlyRow ? 1 : sh.getLastRow() - 1;
  if (n < 1 || first < 2) return;
  if (h.idx['timestamp'] !== undefined) sh.getRange(first, h.idx['timestamp'] + 1, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  ['ringkasan pencapaian', 'today activity', 'rincian item', 'teks laporan'].forEach(function (k) {
    if (h.idx[k] !== undefined) sh.getRange(first, h.idx[k] + 1, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  });
  sh.setRowHeightsForced(first, n, 21);
  highlightSaldoRows_(sh, h);   // hanya menulis aturan bila belum ada atau belum mencakup semua baris
}

// Warna baris lewat format bersyarat, karena warna selang-seling (alternating colors) di tab ini menutupi warna sel biasa.
function highlightSaldoRows_(sh, h) {
  var cAct = h.idx['today activity'];
  if (cAct === undefined) return;
  var f = '=REGEXMATCH(LOWER($' + colLetter_(cAct + 1) + '2&""),"^(saldo awal|koreksi total)")';
  var rules = sh.getConditionalFormatRules(), at = -1;
  rules.forEach(function (r, i) {
    var c = r.getBooleanCondition();
    if (c && String(c.getCriteriaValues()[0]) === f) at = i;
  });
  if (at >= 0 && rules[at].getRanges()[0].getLastColumn() >= h.width && rules[at].getRanges()[0].getLastRow() >= sh.getMaxRows()) return;
  var rule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f).setBackground('#fff8e1')
    .setRanges([sh.getRange(2, 1, sh.getMaxRows() - 1, h.width)]).build();
  if (at >= 0) rules[at] = rule; else rules.push(rule);
  sh.setConditionalFormatRules(rules);
}

// Sekali setelah pemasangan: baris DAILY REPORT EMR yang sudah ada ikut dirapikan (hanya tampilan).
function formatDailyOnce_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('DAILY_FORMAT_V') === '1') return;
    formatDailyRows_(dailySheet_());
    props.setProperty('DAILY_FORMAT_V', '1');
  } catch (e) {
    console.error('Format DAILY REPORT EMR: ' + e);
  }
}

function colLetter_(n) {
  var s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

// Baris satu site + SOW. Baris tanpa SOW ikut dihitung untuk SOW mana pun dari nama itu.
function clusterRows_(sh, h, cluster, sow) {
  var ck = totalsClusterKey_(cluster), cName = h.idx['cluster name'], cSow = h.idx['sow'], last = sh.getLastRow();
  if (!ck || cName === undefined || last < 2) return [];
  var want = normSow_(sow) || sowFromId_(cluster);
  // Kolom Teks Laporan (paling kanan, teks terpanjang) tidak dipakai untuk Total: tidak ikut dibaca.
  var width = h.idx['teks laporan'] === h.width - 1 && h.width > 1 ? h.width - 1 : h.width;
  return sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
    if (totalsClusterKey_(r[cName]) !== ck) return false;
    var rowSow = (cSow === undefined ? '' : normSow_(r[cSow])) || sowFromId_(r[cName]);
    return !want || !rowSow || rowSow === want;
  });
}

// Cluster yang belum punya baris: Total yang sudah ada di HP pelapor dicatat dulu sebagai baris saldo awal.
function addOpeningBalance_(sh, cluster, sow, base, by, names) {
  sow = sow || sowFromId_(cluster);
  if (clusterRows_(sh, sheetHeader_(sh), cluster, sow).length) return;
  var pos = {};
  Object.keys(base || {}).forEach(function (k) {
    var n = Math.floor(Number(base[k]) || 0);
    if (n > 0) pos[k] = n;
  });
  if (!Object.keys(pos).length) return;
  appendDailyRow_(sh, {
    'Tanggal': "'" + todayText_(),
    'Cluster Name': siteName_(cluster),
    'SOW': sow || '',
    'PIC': by || '',
    'Ringkasan Pencapaian': 'Saldo awal Total (angka yang sudah ada di HP sebelum Total dicatat di sheet)',
    'Today Activity': 'Saldo awal'
  }, pos, names);
}

// Total satu cluster. keys = item di HP (urutan BOQ Plan). Angka di kolom material yang tidak tercatat per item
// di Rincian Item (mis. diubah langsung di sheet) masuk ke item pertama di HP untuk material itu.
// -> {found, raw: {key: jumlah apa adanya}, totals: {key: jumlah, minimal 0}}
function clusterTotals_(sh, cluster, keys, sow) {
  var h = sheetHeader_(sh), rows = clusterRows_(sh, h, cluster, sow), cRin = h.idx['rincian item'];
  var mats = materialCols_(h), baseKey = {};
  mats.forEach(function (m) { baseKey[m.col] = m.baseKey; });
  var amount = {};
  function add(k, n) { if (n) amount[k] = (amount[k] || 0) + n; }

  rows.forEach(function (r) {
    var rin = cRin === undefined ? {} : parseRincian_(r[cRin]), byCol = {};
    Object.keys(rin).forEach(function (k) {
      var col = materialColumn_(k);
      if (col && h.idx[col] !== undefined) (byCol[col] = byCol[col] || []).push(k);
      else add(k, rin[k]);   // item tanpa kolom material: angka dari Rincian Item
    });
    mats.forEach(function (m) {
      var v = cellNumber_(r[m.idx]), ks = byCol[m.col] || [];
      if (!ks.length) { add('#' + m.col, v); return; }
      var part = {};
      ks.forEach(function (k) { part[k] = rin[k]; });
      splitCell_(part, ks, v);
      ks.forEach(function (k) { add(k, part[k]); });
    });
  });

  var list = [], known = {};
  (keys || []).forEach(function (k) {
    k = String(k || '').trim();
    if (k && !known[k]) { known[k] = true; list.push(k); }
  });
  function firstKeyFor(col) {
    for (var i = 0; i < list.length; i++) if (materialColumn_(list[i]) === col) return list[i];
    return '';
  }
  var raw = {};
  Object.keys(amount).forEach(function (k) {
    var col = k.charAt(0) === '#' ? k.slice(1) : materialColumn_(k);
    var to = known[k] ? k : (col && h.idx[col] !== undefined && firstKeyFor(col)) || (k.charAt(0) === '#' ? baseKey[col] : k);
    raw[to] = (raw[to] || 0) + amount[k];
  });
  if (rows.length) list.forEach(function (k) { if (!(k in raw)) raw[k] = 0; });
  var totals = {};
  Object.keys(raw).forEach(function (k) {
    raw[k] = Math.round(raw[k] * 1000) / 1000;
    totals[k] = Math.max(0, raw[k]);
  });
  return { found: rows.length > 0, raw: raw, totals: totals };
}

function getTotals_(payload) {
  if (!totalsClusterKey_(payload.cluster)) return { status: 'error', message: 'Cluster kosong.' };
  var t = clusterTotals_(dailySheet_(), payload.cluster, payload.keys, payload.sow);
  return { status: 'success', found: t.found, totals: t.totals };
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

// Bantuan & Masukan: satu baris kritik/saran (hanya pengguna yang masuk lewat Gateway). Kolom sama dengan Portal FTTH:
// Tanggal | Jam | Peran | Nama (opsional) | Pesan | Status. Teks yang diawali = + - @ diberi ' supaya tidak jadi rumus.
function kirimSaran_(payload) {
  var s = wsSession_(payload.session);
  if (!s) return { status: 'error', message: 'Sesi habis. Buka Portal Waspang lagi dari FTTH Project Control Portal.' };
  var pesan = String(payload.pesan || '').trim().slice(0, 2000);
  if (!pesan) return { status: 'error', message: 'Pesan belum diisi.' };
  var nama = String(payload.nama || '').trim().slice(0, 80);
  var peran = (s.role === 'rpm' ? 'RPM' : (s.role === 'waspang' ? 'Waspang' : 'Admin')) + ' (Portal Waspang)';
  var plain = function (v) { return /^[=+\-@]/.test(v) ? "'" + v : v; };
  var ss = SpreadsheetApp.openById(CONFIG.SARAN_SPREADSHEET_ID);
  var sh = ss.getSheetByName(CONFIG.SARAN_SHEET_NAME);
  if (!sh) return { status: 'error', message: 'Tab ' + CONFIG.SARAN_SHEET_NAME + ' tidak ditemukan.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = new Date();
    var row = Math.max(sh.getLastRow() + 1, 5);
    var tz = wsTz_();
    sh.getRange(row, 1, 1, 6).setValues([[now, Utilities.formatDate(now, tz.id, 'HH:mm') + ' ' + tz.label, peran, plain(nama), plain(pesan), 'Baru']]);
    sh.getRange(row, 1).setNumberFormat('dd mmm yyyy');
    sh.getRange(row, 1, 1, 6).setVerticalAlignment('middle').setWrap(true);
  } finally {
    lock.releaseLock();
  }
  return { status: 'success' };
}

// Catat aksi Portal Waspang yang berhasil ke LOG HISTORY (spreadsheet Portal FTTH). Nama dan peran diambil dari sesi Gateway;
// tanpa sesi dipakai nama PIC/Waspang yang diketik. Gagal mencatat tidak boleh menggagalkan aksi utamanya.
var LOG_RESET_ROWS = 550;
// LOG HISTORY dimulai lagi dari nol setiap kali terisi lebih dari LOG_RESET_ROWS baris: baris terbaru dipindah ke
// baris 5 dan baris lainnya dikosongkan (bukan dihapus, supaya format dan warna baris tetap).
function logResetIfFull_(sh, row) {
  if (row - 4 <= LOG_RESET_ROWS) return;
  var last = sh.getRange(row, 1, 1, 6).getValues()[0].map(function (v) {
    return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
  });
  sh.getRange(5, 1, row - 4, 6).clearContent();
  sh.getRange(5, 1, 1, 6).setValues([last]);
}

function logWaspang_(p, res) {
  try {
    var aksi, detail = '', who = null, site = function (raw, sow) { var n = siteName_(raw); return n + (sow ? ' (' + sow + ')' : ''); };
    switch (p.action) {
      case 'SSO_LOGIN':
        aksi = 'Buka Portal Waspang';
        who = { name: res && res.name, role: res && res.role };
        break;
      case 'CREATE_SITE_FOLDERS':
        aksi = 'Buat Folder Site';
        detail = site(p.siteName, p.sow);
        break;
      case 'SARAN':
        // Masukan boleh tanpa nama: hanya nama yang diketik, tanpa isi pesan (isi ada di tab KRITIK DAN SARAN).
        aksi = 'Kirim Kritik & Saran';
        who = { name: String(p.nama || '').trim() || '(tanpa nama)', role: (wsSession_(p.session) || {}).role || '' };
        break;
      case 'DAILY_REPORT':
        aksi = 'Daily Report';
        detail = site(p.cluster, p.sow || sowFromId_(p.cluster)) + (p.by ? ' - PIC ' + p.by : '');
        break;
      case 'UPLOAD_PHOTOS':
        aksi = 'Upload Foto';
        detail = site(p.siteName, p.sow) + ' - ' + (p.files || []).length + ' foto' + (p.mainCategory ? ', ' + p.mainCategory : '') + (p.subPath ? ', ' + p.subPath : '');
        break;
      case 'SYNC_BOQ_EXCEL':
        aksi = 'BOQ Plan';
        detail = (p.clusters || []).map(function (c) { return site(c.name || c.fullName, c.sow); }).join('; ');
        break;
      case 'SET_DONE':
        aksi = p.done ? 'Tandai Selesai' : 'Batal Selesai';
        detail = site(p.name || p.cluster, p.sow) + ' - ' + (p.items || p.keys || (p.key ? [p.key] : [])).join(', ');
        break;
      case 'DELETE_BOQ':
        aksi = 'Hapus BOQ Plan (RPM)';
        detail = site(p.name || p.cluster, p.sow) + (res && res.removedRow ? ' - baris dihapus (nama tidak ada di DATA BASE)' : '');
        break;
      case 'SET_TOTAL':
        aksi = 'Edit Total (RPM)';
        detail = site(p.cluster, p.sow || sowFromId_(p.cluster)) + ' - ' + (p.itemName || p.key) + ' = ' + p.total;
        break;
      default:
        return;
    }
    var s = who ? null : wsSession_(p.session);
    var user = who ? (who.name || '') : s ? (s.name || s.username) : (String(p.by || p.waspang || '').trim() || '(tanpa login)');
    var peran = who ? (who.role || '') : s ? s.role : '';
    var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName(CONFIG.LOG_SHEET_NAME);
    if (!sh) return;
    var plain = function (v) { v = String(v || ''); return /^[=+\-@]/.test(v) ? "'" + v : v; };
    sh.appendRow([new Date(), 'Portal Waspang', plain(user), peran, aksi, plain(String(detail).slice(0, 500))]);
    var row = sh.getLastRow(), w = Math.min(10, row - 4);
    // Format 10 baris terakhir saja (baris lain bisa ditulis bersamaan oleh pemicu edit/portal lain).
    sh.getRange(row - w + 1, 1, w, 1).setNumberFormat('dd mmm yyyy HH:mm');
    sh.getRange(row - w + 1, 1, w, 6).setVerticalAlignment('middle').setWrap(true);
    logResetIfFull_(sh, row);
  } catch (e) { console.error('LOG HISTORY: ' + e); }
}

function wsSession_(sid) {
  if (!/^[A-Za-z0-9]{32,80}$/.test(String(sid || ''))) return null;
  var raw = CacheService.getScriptCache().get('ws_' + sid);
  return raw ? JSON.parse(raw) : null;
}

// Total yang diubah RPM dicatat sebagai baris koreksi (selisihnya) di DAILY REPORT EMR.
function setTotalByRpm_(payload) {
  var s = wsSession_(payload.session);
  if (!s) return { status: 'error', message: 'Sesi habis. Buka Portal Waspang lagi dari Gateway.' };
  if (s.role !== 'rpm') return { status: 'error', message: 'Hanya akun RPM yang boleh mengubah Total.' };
  var key = String(payload.key || '').trim(), total = Number(payload.total);
  if (!totalsClusterKey_(payload.cluster) || !key || !(total >= 0)) return { status: 'error', message: 'Data Total tidak lengkap.' };
  total = Math.floor(total);
  var name = s.name || s.username, sow = payload.sow || sowFromId_(payload.cluster), names = payload.names || {};
  if (payload.itemName && !names[key]) names[key] = payload.itemName;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dailySheet_();
    addOpeningBalance_(sh, payload.cluster, sow, payload.base, name, names);
    var keys = (payload.keys || []).slice();
    if (keys.indexOf(key) < 0) keys.push(key);
    var cur = clusterTotals_(sh, payload.cluster, keys, sow).raw[key] || 0;
    if (total !== cur) {
      var by = {};
      by[key] = total - cur;
      appendDailyRow_(sh, {
        'Tanggal': "'" + todayText_(),
        'Cluster Name': siteName_(payload.cluster),
        'SOW': sow || '',
        'PIC': name,
        'Ringkasan Pencapaian': 'Koreksi Total oleh RPM ' + name + ': ' + (payload.itemName || key) + ' dari ' + cur + ' menjadi ' + total,
        'Today Activity': 'Koreksi Total (RPM)'
      }, by, names);
    }
  } finally {
    lock.releaseLock();
  }
  return { status: 'success' };
}
