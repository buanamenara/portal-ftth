var CONFIG = {
  WASPANG_SPREADSHEET_ID: "1ZlSlITeC9zi-m894gQYUUn4YMfP6_8B_Jtep5a33OjA",
  DOKUMENTASI_FOLDER_ID: "1xY7LSgaZDiD4YvCGd2FW164IFVdtYGqZ", // folder "DOKUMENTASI FTTH" di Google Drive
  TELEGRAM_CHAT_ID: "@ReportBMI",
  // Gateway FTTH Project Control Portal: menukar tiket sekali pakai dengan username & role (untuk mengenali akun RPM).
  GATEWAY_URL: "https://script.google.com/macros/s/AKfycby4nXXb8JKdAJodp6MdrNfdmNODiCdWr4ouZPKOP6w4wz1tDZLCSqe11eeU9oHYgmVxeQ/exec",
  // Spreadsheet Portal FTTH: daftar site (Name) dan SOW di portal Waspang diambil dari tab DATA BASE.
  FTTH_SPREADSHEET_ID: "1KblZFDIcG6Jbbo6gy2Mh0vpgEzsgfUhMcwg5A5qtSME"
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
      case 'GET_SITES':
        result = getSites_();
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
// Rincian Item = volume per item portal (item per line terpisah), Selesai = item yang sudah ditandai selesai.
var MASTER_BOQ_HEADER_ = ['No', 'Cluster Name', 'SOW'].concat(MATERIAL_HEADERS_).concat(['Rincian Item', 'Selesai']);
// Rincian Item (paling kanan) mencatat angka per item portal, mis. "cable_24c_line_a=3; fat_line_b=1",
// supaya Total per line tetap terbaca walau kolom materialnya digabung.
var DAILY_REPORT_HEADER_ = ['Timestamp', 'Tanggal', 'Cluster Name', 'SOW', 'Start Implementation', 'Topology', 'Subcont', 'PIC',
  'Manpower', 'Jam Kerja', 'Ringkasan Pencapaian', 'Today Activity'].concat(MATERIAL_HEADERS_).concat(['Rincian Item']);
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
      return telegramPost_('sendPhoto', {
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        caption: caption,
        parse_mode: 'Markdown',
        photo: blobs[0]
      }).ok === true;
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
      ok = telegramPost_('sendMediaGroup', formPayload).ok === true && ok;
    }
  } catch (err) {
    console.error('Telegram send error: ' + err);
    return false;
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
  lock.waitLock(20000);
  try {
    var r = payload.report || {}, sh = dailySheet_(), cluster = payload.cluster;
    var sow = r.sow || payload.sow || sowFromId_(cluster);
    if (cluster) addOpeningBalance_(sh, cluster, sow, payload.base, payload.by);
    appendDailyRow_(sh, {
      'Tanggal': r.tanggal ? "'" + r.tanggal : '',
      'Cluster Name': siteName_(cluster),
      'SOW': sow || '',
      'Start Implementation': r.startImpl ? "'" + r.startImpl : '',
      'Topology': r.topology || '',
      'Subcont': r.subcont || '-',
      'PIC': r.pic || payload.by || '',
      'Manpower': r.manpower || '',
      'Jam Kerja': r.jamKerja || '',
      // Halaman lama belum mengirim rincian: simpan seluruh teks laporan di Ringkasan.
      'Ringkasan Pencapaian': payload.report ? (r.ringkasan || '') : (payload.text || ''),
      'Today Activity': r.todayActivity || ''
    }, payload.today);
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
  try { cache.put('database_sites_v1', JSON.stringify(sites), 600); } catch (e) {}
  return { status: 'success', sites: sites };
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
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd/M/yyyy');
}

function cellNumber_(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v == null ? '' : v).trim());
  return isFinite(n) ? n : 0;
}

// {key item: angka} <-> "cable_24c_line_a=3; fat_line_b=1"
function rincianText_(byKey) {
  return Object.keys(byKey || {}).filter(function (k) { return String(k).trim() && Number(byKey[k]); }).map(function (k) {
    return rincianKey_(k) + '=' + Number(byKey[k]);
  }).join('; ');
}

function rincianKey_(k) {
  return String(k).trim().replace(/[%;=@]/g, function (c) { return encodeURIComponent(c); });
}

function parseRincian_(text) {
  var out = {};
  String(text || '').split(';').forEach(function (part) {
    var m = part.match(/^\s*([^=]+?)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return;
    var k = m[1];
    try { k = decodeURIComponent(k); } catch (e) {}
    out[k] = (out[k] || 0) + Number(m[2]);
  });
  return out;
}

// vals = {judul kolom: isi}; byKey = {key item: angka} mengisi kolom material dan Rincian Item.
function appendDailyRow_(sh, vals, byKey) {
  vals['Timestamp'] = new Date();
  var byCol = sumByMaterial_(byKey);
  Object.keys(byCol).forEach(function (c) { vals[c] = byCol[c]; });
  vals['Rincian Item'] = rincianText_(byKey);
  sh.appendRow(rowByHeader_(sheetHeader_(sh), vals));
}

// Baris satu site + SOW. Baris tanpa SOW ikut dihitung untuk SOW mana pun dari nama itu.
function clusterRows_(sh, h, cluster, sow) {
  var ck = totalsClusterKey_(cluster), cName = h.idx['cluster name'], cSow = h.idx['sow'], last = sh.getLastRow();
  if (!ck || cName === undefined || last < 2) return [];
  var want = normSow_(sow) || sowFromId_(cluster);
  return sh.getRange(2, 1, last - 1, h.width).getValues().filter(function (r) {
    if (totalsClusterKey_(r[cName]) !== ck) return false;
    var rowSow = (cSow === undefined ? '' : normSow_(r[cSow])) || sowFromId_(r[cName]);
    return !want || !rowSow || rowSow === want;
  });
}

// Cluster yang belum punya baris: Total yang sudah ada di HP pelapor dicatat dulu sebagai baris saldo awal.
function addOpeningBalance_(sh, cluster, sow, base, by) {
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
  }, pos);
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
  var name = s.name || s.username, sow = payload.sow || sowFromId_(payload.cluster);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dailySheet_();
    addOpeningBalance_(sh, payload.cluster, sow, payload.base, name);
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
      }, by);
    }
  } finally {
    lock.releaseLock();
  }
  return { status: 'success' };
}
