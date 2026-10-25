var CONFIG = {
  WASPANG_SPREADSHEET_ID: "1ZlSlITeC9zi-m894gQYUUn4YMfP6_8B_Jtep5a33OjA",
  DOKUMENTASI_FOLDER_ID: "1xY7LSgaZDiD4YvCGd2FW164IFVdtYGqZ", // folder "DOKUMENTASI FTTH" di Google Drive
  // Laporan otomatis ke grup WhatsApp lewat gateway Fonnte (api.fonnte.com). Baru terkirim bila Script Properties
  // FONNTE_TOKEN dan WA_TARGET sudah diisi (lihat waConfig_); false = matikan semua kiriman WA.
  WA_GATEWAY_ENABLED: true,
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

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    return ContentService.createTextOutput(JSON.stringify({
      status: "online",
      message: "Portal Waspang & Daily Report EMR aktif.",
      targetDriveFolder: "DOKUMENTASI FTTH"
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
      case 'WA_PULL':
        result = waPull_(payload);
        break;
      case 'WA_FILE':
        result = waFile_(payload);
        break;
      case 'WA_DONE':
        result = waDone_(payload);
        break;
      case 'WA_CMD':
        result = waCmd_(payload);
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
// Teks Laporan (paling kanan) = daftar lengkap Today/Total/Plan seperti di pesan laporan.
var DAILY_REPORT_HEADER_ = ['Timestamp', 'Tanggal', 'Cluster Name', 'SOW', 'Start Implementation', 'Topology', 'Subcont', 'PIC',
  'Manpower', 'Jam Kerja', 'Ringkasan Pencapaian', 'Today Activity'].concat(MATERIAL_HEADERS_).concat(['Rincian Item', 'Teks Laporan']);
var PHOTO_LOG_HEADER_ = ['Timestamp', 'Tanggal Pelaporan', 'Site Name', 'SOW', 'Mandor', 'Nama Waspang', 'Kategori Pekerjaan',
  'Subfolder / FAT', 'Nama File', 'Koordinat GPS', 'Link Maps', 'Link Foto Drive', 'Link Folder Drive', 'Catatan Lapangan', 'Status WhatsApp'];

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
    saved.push({ name: file.getName(), url: file.getUrl(), file: file });
  });

  var caption = buildWaspangPhotoCaption_(payload);
  var waOk = sendWaspangPhotosToWhatsApp_(blobs, saved, caption);
  logWaspangPhotoToSheet_(payload, targetFolder.getUrl(), saved, waOk);

  return { status: 'success', folderUrl: targetFolder.getUrl(), waSent: waOk };
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

// ===================== WHATSAPP (FONNTE) =====================
// Laporan ke grup WhatsApp (satu-satunya grup tujuan laporan sejak Telegram dihapus 18-10-2026). Semua fungsi di sini
// tidak pernah melempar error: bila flag mati, token/tujuan kosong, atau Fonnte gagal, foto tetap tersimpan di Drive
// dan laporan tetap tercatat di sheet.
// Token dan tujuan TIDAK ditulis di kode (repo ini publik). Simpan di Script Properties:
//   FONNTE_TOKEN : token perangkat dari dashboard fonnte.com (setelah nomor WA disambungkan lewat scan QR)
//   WA_SEND_FILES: isi "true" setelah paket Fonnte berbayar (Super ke atas) aktif: foto/PDF dikirim langsung ke grup.
//                  Kosong = paket gratis (yang diam-diam membuang file): foto/PDF dikirim sebagai link Google Drive.
//   WA_TARGET    : nama grup WA persis seperti di WhatsApp, ID grup (120363xxxxxxxxxxxx@g.us) atau nomor 62xxx;
//                  boleh beberapa, pisahkan koma
function waConfig_() {
  if (!CONFIG.WA_GATEWAY_ENABLED) return null;
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('FONNTE_TOKEN'), target = props.getProperty('WA_TARGET');
    if (!token || !target) return null;
    target = waResolveTarget_(token, target);
    var files = String(props.getProperty('WA_SEND_FILES') || '').trim().toLowerCase() === 'true';
    return target ? { token: token, target: target, files: files } : null;
  } catch (e) {
    console.error('WA config error: ' + e);
    return null;
  }
}

// Nama grup -> ID grup lewat daftar grup Fonnte (disimpan 6 jam). ID grup dan nomor dipakai apa adanya.
function waResolveTarget_(token, target) {
  var cache = CacheService.getScriptCache(), groups = null;
  return target.split(',').map(function (t) {
    t = t.trim();
    if (!t || /@g\.us$/.test(t) || /^\+?[\d\s-]+$/.test(t)) return t;
    var key = 'wa_grp_' + Utilities.base64EncodeWebSafe(t.toLowerCase()).slice(0, 200);
    var id = cache.get(key);
    if (id) return id;
    if (!groups) groups = waGroups_(token, false);
    var hit = waFindGroup_(groups, t);
    if (!hit) { groups = waGroups_(token, true); hit = waFindGroup_(groups, t); }
    if (!hit) { console.error('Grup WA tidak ditemukan di Fonnte: ' + t); return ''; }
    cache.put(key, hit.id, 21600);
    return hit.id;
  }).filter(Boolean).join(',');
}

function waFindGroup_(groups, name) {
  var n = name.toLowerCase();
  return groups.filter(function (g) { return String(g.name || '').trim().toLowerCase() === n; })[0] || null;
}

// Daftar grup nomor WA di Fonnte ({id, name}); refresh = minta Fonnte membaca ulang grup dari WhatsApp dulu.
function waGroups_(token, refresh) {
  var opt = { method: 'post', headers: { Authorization: token }, muteHttpExceptions: true };
  if (refresh) UrlFetchApp.fetch('https://api.fonnte.com/fetch-group', opt);
  var json = {};
  try { json = JSON.parse(UrlFetchApp.fetch('https://api.fonnte.com/get-whatsapp-group', opt).getContentText()) || {}; } catch (e) {}
  return json.data || [];
}

// Teks laporan -> format WhatsApp: *tebal* dan _miring_ tetap; `kode` jadi teks biasa (di WA tampil sebagai huruf
// mesin ketik); garis pemisah dipendekkan; tautan [teks](url) jadi "teks (url)"; garis miring pelindung (\_ \* \[) dibuang.
function waText_(text) {
  return String(text || '')
    .replace(/\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/(^|[^\\])`+/g, '$1')
    .replace(/[━─]{15,}/g, '━━━━━━━━━━━━━━')   // garis pemisah dipendekkan supaya muat satu baris di gelembung WA HP
    .replace(/\\([_*`\[\]])/g, '$1');
}

// Satu kiriman ke Fonnte (teks, atau satu file dengan teks sebagai keterangan). -> true bila diterima.
function waSend_(wa, message, blob) {
  try {
    var payload = { target: wa.target, message: waText_(message) };
    if (blob) {
      payload.file = blob;
      payload.filename = blob.getName();
    }
    var res = UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post', headers: { Authorization: wa.token }, payload: payload, muteHttpExceptions: true
    });
    var json = {};
    try { json = JSON.parse(res.getContentText()) || {}; } catch (e) {}
    if (json.status !== true) console.error('Fonnte send error: ' + (json.reason || res.getResponseCode()));
    return json.status === true;
  } catch (err) {
    console.error('Fonnte send error: ' + err);
    return false;
  }
}

// Foto / PDF Dokumentasi Lapangan. Script Property WA_SEND_FILES (paket berbayar): keterangan ikut pada file pertama, file lain
// menyusul satu per satu. Paket gratis: satu pesan berisi keterangan laporan + link tiap file. -> true bila terkirim.
function sendWaspangPhotosToWhatsApp_(blobs, saved, caption) {
  if (waPcMode_()) return waEnqueue_(caption, saved);
  var wa = waConfig_();
  if (!wa) return false;
  if (wa.files && blobs.length) {
    // File > 4 MB, atau file yang ditolak Fonnte (mis. paket gratis tidak bisa kirim file), dikirim sebagai link
    // Drive di akhir; keterangan laporan ikut di sana bila belum terkirim bersama file.
    var rest = [], captionSent = false, refused = false;
    blobs.forEach(function (blob, i) {
      if (!refused && blob.getBytes().length <= 4 * 1024 * 1024) {
        if (waSend_(wa, captionSent ? '' : caption, blob)) { captionSent = true; return; }
        refused = true;   // satu file ditolak: sisanya langsung jadi link, tidak dicoba satu per satu
      }
      rest.push(saved[i]);
    });
    return rest.length ? sendWaLinks_(wa, captionSent ? '' : caption, rest) : true;
  }
  return sendWaLinks_(wa, caption, saved);
}

// Link Drive dibuka untuk "siapa saja yang memegang link" supaya anggota grup tanpa akses Drive bisa melihatnya.
function sendWaLinks_(wa, caption, saved) {
  var links = saved.map(function (f, i) {
    try { f.file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { console.error('WA share link error: ' + e); }
    return (i + 1) + '. ' + f.url;
  });
  return waSend_(wa, (caption ? caption + '\n\n' : '') + '📷 *Foto / dokumen*:\n' + links.join('\n'));
}

function sendDailyReportToWhatsApp_(text) {
  if (waPcMode_()) return waEnqueue_(text, []);
  var wa = waConfig_();
  return wa ? waSend_(wa, text) : false;
}

// Jalankan dari editor Apps Script (pilih fungsi > Run) setelah FONNTE_TOKEN diisi: daftar grup WA nomor itu
// muncul di Execution log. WA_TARGET cukup diisi nama grupnya; ID grup juga boleh. Tidak bergantung pada flag.
function waListGroups() {
  var token = PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN');
  if (!token) throw new Error('FONNTE_TOKEN belum diisi di Script Properties.');
  var groups = waGroups_(token, true);
  groups.forEach(function (g) { console.log(g.name + '  ->  ' + g.id); });
  if (!groups.length) console.log('Fonnte belum mengirim daftar grup. Coba lagi sebentar lagi.');
}

// Kirim satu pesan uji ke WA_TARGET (setelah flag dinyalakan dan Script Properties diisi).
function waTest() {
  if (waPcMode_()) {
    console.log(waEnqueue_('✅ Tes Portal Waspang: laporan WhatsApp lewat laptop sudah tersambung.', []) ? 'Masuk antrean laptop.' : 'Gagal, lihat log.');
    return;
  }
  var wa = waConfig_();
  if (!wa) throw new Error('WhatsApp belum aktif: cek WA_GATEWAY_ENABLED, FONNTE_TOKEN dan WA_TARGET.');
  console.log(waSend_(wa, '✅ Tes Portal Waspang: laporan WhatsApp otomatis sudah tersambung.') ? 'Terkirim.' : 'Gagal, lihat log.');
}

// ===================== WHATSAPP LEWAT LAPTOP 24 JAM =====================
// Pengganti Fonnte tanpa biaya: program di folder wa-gateway (repo) berjalan di laptop yang menyala 24 jam dan menautkan
// nomor WA laporan seperti WhatsApp Web. Portal hanya menaruh laporan di antrean (Script Properties "waq_..."); laptop
// mengambilnya tiap beberapa detik (WA_PULL, WA_FILE), mengirim ke grup, lalu melapor (WA_DONE). Laptop yang menghubungi
// portal, jadi tidak perlu IP publik atau port terbuka. Bila laptop mati, laporan menunggu dan terkirim saat laptop menyala
// lagi (paling lama 3 hari). Script Properties:
//   WA_MODE      : "pc" = pakai laptop; kosong = Fonnte seperti biasa (FONNTE_TOKEN, WA_TARGET di atas).
//   WA_PC_SECRET : kata sandi acak minimal 16 huruf, sama persis dengan "secret" di config.json laptop.
var WAQ_PREFIX_ = 'waq_', WAQ_MAX_TRY_ = 5, WAQ_MAX_AGE_MS_ = 3 * 24 * 3600 * 1000;

function waPcMode_() {
  if (!CONFIG.WA_GATEWAY_ENABLED) return false;
  try {
    return String(PropertiesService.getScriptProperties().getProperty('WA_MODE') || '').trim().toLowerCase() === 'pc';
  } catch (e) {
    return false;
  }
}

// Laporan (teks + file Drive yang sudah tersimpan) ke antrean laptop. -> true bila masuk antrean.
function waEnqueue_(text, saved) {
  try {
    var now = Date.now();
    var job = {
      t: now, n: 0, last: 0,
      text: waText_(text).slice(0, 6000),   // satu Script Property maksimal 9 KB
      files: (saved || []).map(function (f) { return { id: f.file.getId(), name: f.name }; })
    };
    PropertiesService.getScriptProperties().setProperty(WAQ_PREFIX_ + now + '_' + Math.floor(Math.random() * 1e6), JSON.stringify(job));
    return true;
  } catch (e) {
    console.error('WA antrean error: ' + e);
    return false;
  }
}

function waPcAuth_(p) {
  var s = PropertiesService.getScriptProperties().getProperty('WA_PC_SECRET') || '';
  if (s.length < 16 || String(p.secret || '') !== s) throw new Error('Akses gateway ditolak.');
}

function waJob_(key) {
  key = String(key || '');
  if (key.indexOf(WAQ_PREFIX_) !== 0) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

// Maksimal 3 laporan terlama yang siap dikirim. Laporan yang gagal ditunda 1, 2, 3, ... menit sebelum dicoba lagi.
function waPull_(p) {
  waPcAuth_(p);
  CacheService.getScriptCache().put('wa_pc_seen', new Date().toISOString(), 21600);
  try { botJadwal_(); } catch (e) { console.error('Jadwal bot: ' + e); }
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now(), jobs = [];
  Object.keys(all).filter(function (k) { return k.indexOf(WAQ_PREFIX_) === 0; }).sort().forEach(function (k) {
    var j;
    try { j = JSON.parse(all[k]); } catch (e) { props.deleteProperty(k); return; }
    if (j.due && j.due > now) return;   // pengingat bot yang belum waktunya
    if (now - Math.max(j.t, j.due || 0) > WAQ_MAX_AGE_MS_) {
      console.error('Laporan WA kedaluwarsa (laptop mati > 3 hari), dibuang: ' + k);
      props.deleteProperty(k);
      return;
    }
    if (j.n && now - j.last < j.n * 60000) return;
    if (jobs.length < 3) jobs.push({ key: k, text: j.text, files: j.files, to: j.to || '', mentions: j.mentions || [] });
  });
  return { status: 'success', jobs: jobs };
}

// Isi satu file dari laporan di antrean (hanya file yang memang ada di laporan itu).
function waFile_(p) {
  waPcAuth_(p);
  var j = waJob_(p.key);
  if (!j || !(j.files || []).some(function (f) { return f.id === p.id; })) throw new Error('File tidak ada di antrean.');
  var file = DriveApp.getFileById(p.id), blob = file.getBlob();
  return { status: 'success', name: file.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

function waDone_(p) {
  waPcAuth_(p);
  var props = PropertiesService.getScriptProperties(), key = String(p.key || ''), j = waJob_(key);
  if (!j) return { status: 'success' };
  if (p.ok) {
    props.deleteProperty(key);
    return { status: 'success' };
  }
  j.n = (j.n || 0) + 1;
  j.last = Date.now();
  if (j.n >= WAQ_MAX_TRY_) {
    console.error('Laporan WA dibuang setelah ' + j.n + 'x gagal: ' + key + ' - ' + String(p.error || '').slice(0, 300));
    props.deleteProperty(key);
  } else {
    props.setProperty(key, JSON.stringify(j));
  }
  return { status: 'success' };
}

// Jalankan dari editor: kapan laptop terakhir mengambil antrean dan berapa laporan yang masih menunggu.
function waPcStatus() {
  var seen = CacheService.getScriptCache().get('wa_pc_seen');
  var waiting = Object.keys(PropertiesService.getScriptProperties().getProperties())
    .filter(function (k) { return k.indexOf(WAQ_PREFIX_) === 0; }).length;
  console.log('Laptop terakhir terlihat: ' + (seen || 'belum pernah / > 6 jam lalu') + '. Laporan menunggu: ' + waiting + '.');
}

// ===================== BOT WHATSAPP (PERINTAH PENDEK, TANPA AI) =====================
// Laptop gateway meneruskan pesan yang masuk ke nomor laporan (WA_CMD) dan mengirim balik jawabannya.
// Di grup laporan perintah diawali "!" (mis. "!stok cable"), supaya obrolan biasa tidak dijawab bot.
// Di chat pribadi ke nomor laporan, hanya nomor di Script Property WA_OWNER (pisahkan koma, format 62812...) yang
// dilayani, boleh tanpa "!". Perintah pribadi (catat, ingatkan) hanya untuk WA_OWNER. Pesan dari nomor lain diabaikan.
// Pengingat masuk ke antrean waq_ yang sama dengan laporan (field to + due), jadi ikut terkirim saat laptop mengambil antrean.
var BOT_TZ_ = { id: 'GMT+08:00', label: 'WITA' };   // jam pengingat dan "hari ini" mengikuti WITA (Banjarmasin)
var BOT_NOTE_SHEET_ = 'CATATAN BOT', BOT_NOTE_HEADER_ = ['Timestamp', 'Dari', 'Catatan'];

function waOwner_(from) {
  var list = String(PropertiesService.getScriptProperties().getProperty('WA_OWNER') || '').split(',')
    .map(function (s) { return s.replace(/\D/g, ''); }).filter(Boolean);
  var f = String(from || '').replace(/\D/g, '');
  return !!f && list.indexOf(f) >= 0;
}

// p = {secret, chat: 'group' | 'dm', from: nomor pengirim, fromName, jid: tujuan balasan, text}
// -> {status, reply: teks balasan atau '' (tidak dijawab)}
function waCmd_(p) {
  waPcAuth_(p);
  var owner = waOwner_(p.from), text = String(p.text || '').trim();
  if (p.chat !== 'group' && !owner) return { status: 'success', reply: '' };
  if (text.charAt(0) === '!' || text.charAt(0) === '/') text = text.slice(1).trim();
  else if (p.chat === 'group') return { status: 'success', reply: '' };
  var m = text.match(/^(\S+)\s*([\s\S]*)$/);
  if (!m) return { status: 'success', reply: '' };
  var cmd = m[1].toLowerCase(), arg = m[2].trim(), out;
  switch (cmd) {
    case 'bantu': case 'menu': case 'help': case '?':
      out = botHelp_(owner); break;
    case 'stok': case 'stock': case 'saldo':
      out = botStok_(arg); break;
    case 'progres': case 'progress':
      out = botProgres_(arg); break;
    case 'rekap':
      out = botRekap_(arg); break;
    case 'site': case 'cari':
      out = botSite_(arg); break;
    case 'catat':
      out = owner ? botCatat_(arg, p.fromName || p.from) : ''; break;
    case 'catatan':
      out = owner ? botCatatan_(arg) : ''; break;
    case 'ingatkan':
      out = owner ? botIngatkan_(arg, p.jid) : ''; break;
    case 'pengingat':
      out = owner ? botPengingat_(p.jid) : ''; break;
    case 'permit':
      out = owner ? botPermit_(arg) : ''; break;
    case 'tim':
      out = owner ? botTimCmd_(arg) : ''; break;
    case 'batas':
      out = owner ? botBatasCmd_(arg) : ''; break;
    case 'stokmin': case 'menipis':
      out = owner ? (botStokMenipis_() || 'Tidak ada stok di bawah batas.') : ''; break;
    case 'mingguan':
      out = owner ? botMingguan_(Date.now()) : ''; break;
    case 'pagi':
      out = owner ? botPagi_(Date.now()) : ''; break;
    case 'sore':
      out = owner ? botSore_(Date.now()).text : ''; break;
    default:
      out = p.chat === 'group' ? '' : 'Perintah "' + cmd + '" belum ada. Ketik *bantu* untuk daftar perintah.';
  }
  p.cmd = out ? cmd : '';
  return { status: 'success', reply: out ? waText_((/^(pagi|sore|mingguan)$/.test(cmd) ? '' : '🤖 ') + out).slice(0, 3500) : '' };   // contoh pesan jadwal tampil persis seperti di grup
}

function botHelp_(owner) {
  var g = owner ? '' : '!';
  var s = ['*AdminSuper*' + (owner ? '' : ' (di grup awali dengan !)'),
    g + 'stok [material] [gudang] : saldo gudang, mis. ' + g + 'stok kabel batola',
    g + 'progres <site> : Total vs Plan material, mis. ' + g + 'progres jati baru rt 04',
    g + 'rekap [kemarin | dd/mm] : Daily Report hari itu',
    g + 'site <kata> : cari nama site di DATA BASE'];
  if (owner) s = s.concat(['', '*Pribadi*',
    'catat <teks> : simpan catatan',
    'catatan [kata] : 10 catatan terakhir',
    'ingatkan 14:30 <teks> | besok 08:00 <teks> | 30m <teks> | 2j <teks>',
    'pengingat : daftar pengingat yang menunggu',
    '', '*Jadwal grup* (07:00 Today\'s Plan, 17:30 pengingat laporan)',
    'permit <daftar, satu per baris> : permit untuk Today\'s Plan berikutnya (permit hapus)',
    'tim <nama PIC> <nomor> : tim yang di-tag jam 17:30 (tim, tim hapus <nama>)',
    'pagi | sore | mingguan : lihat contoh pesan jadwal sekarang',
    'batas <material> <angka> : batas stok menipis (dikirim ke sini tiap 07:00), menipis : cek sekarang']);
  return s.join('\n');
}

// 69154 -> "69.154", 1.5 -> "1,5"
function botNum_(n) {
  var neg = n < 0, a = Math.round(Math.abs(n) * 100) / 100, i = Math.floor(a), d = Math.round((a - i) * 100);
  return (neg ? '-' : '') + String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + ('0' + d).slice(-2).replace(/0$/, '') : '');
}

var BOT_MATERIAL_ALIAS_ = { kabel: 'cable', tiang: 'pole', klem: 'clam', galvanis: 'galvanis', sling: 'sling', hdpe: 'hdpe' };
var BOT_GUDANG_ALIAS_ = { bjm: 'banjarmasin', ptk: 'pontianak', pml: 'pemalang', tpn: 'tapin', hst: 'hulu sungai', tnl: 'tanah laut', bka: 'barito', batola: 'barito', btk: 'barito' };

// SALDO GUDANG di spreadsheet Portal FTTH (dihitung dari BA TRANSAKSI): judul di baris 3.
function botStok_(arg) {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('SALDO GUDANG');
  if (!sh || sh.getLastRow() < 4) return 'Tab SALDO GUDANG belum berisi data.';
  var vals = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 10)).getValues(), hr = -1, c = {};
  for (var i = 0; i < Math.min(6, vals.length) && hr < 0; i++) {
    var head = vals[i].map(normHeader_);
    if (head.indexOf('designator') >= 0 && head.indexOf('saldo') >= 0) {
      hr = i; c = { g: head.indexOf('gudang'), d: head.indexOf('designator'), s: head.indexOf('saldo') };
    }
  }
  if (hr < 0) return 'Kolom Designator / Saldo tidak ditemukan di SALDO GUDANG.';
  // Kata yang cocok dengan nama gudang (atau singkatannya) = filter gudang; sisanya harus ada semua di Designator.
  // Tanpa nama gudang = semua gudang. Kata Indonesia diterjemahkan dulu (kabel -> cable, tiang -> pole).
  var gudangs = [];
  for (var r0 = hr + 1; r0 < vals.length; r0++) {
    var g0 = c.g >= 0 ? String(vals[r0][c.g] || '').trim() : '';
    if (g0 && gudangs.indexOf(g0) < 0) gudangs.push(g0);
  }
  var words = arg.toLowerCase().split(/\s+/).filter(Boolean), area = [], mat = [];
  words.forEach(function (w) {
    w = BOT_GUDANG_ALIAS_[w] || w;
    var hit = w !== 'gudang' && gudangs.filter(function (g) { return g.toLowerCase().indexOf(w) >= 0; });
    if (hit && hit.length) area = area.concat(hit);
    else if (w !== 'gudang') mat.push(BOT_MATERIAL_ALIAS_[w] || w);
  });
  var by = {}, order = [], minus = false;
  for (var r = hr + 1; r < vals.length; r++) {
    var d = String(vals[r][c.d] || '').trim(), sal = cellNumber_(vals[r][c.s]);
    var g = c.g >= 0 ? String(vals[r][c.g] || '').trim() || '-' : '-';
    if (!d || (area.length && area.indexOf(g) < 0)) continue;
    if (mat.length ? !mat.every(function (m) { return d.toLowerCase().indexOf(m) >= 0; }) : !sal) continue;
    if (!by[g]) { by[g] = []; order.push(g); }
    by[g].push(d + ': ' + botNum_(sal));
    if (sal < 0) minus = true;
  }
  if (!order.length) return arg ? 'Tidak ada material yang cocok dengan "' + arg + '". Contoh: *stok kabel*, *stok tiang batola*.' : 'Semua saldo gudang 0.';
  var out = ['*Stok gudang*' + (arg ? ' "' + arg + '"' : '')];
  order.forEach(function (g) { out.push('', '_' + g + '_'); out = out.concat(by[g]); });
  if (minus) out.push('', 'Angka minus = barang keluar lebih banyak dari BA Masuk yang tercatat.');
  return out.join('\n');
}

// Cocokkan nama site: semua kata di arg harus ada di nama. -> [{name, sow}]
function botFindSites_(arg) {
  var words = arg.toLowerCase().split(/\s+/).filter(Boolean), res = getSites_();
  if (!words.length || res.status !== 'success') return [];
  return res.sites.filter(function (s) {
    var n = s.name.toLowerCase();
    return words.every(function (w) { return n.indexOf(w) >= 0; });
  });
}

function botSite_(arg) {
  if (!arg) return 'Tulis kata yang dicari, mis. *site jati baru*.';
  var hit = botFindSites_(arg);
  if (!hit.length) return 'Tidak ada site yang cocok dengan "' + arg + '".';
  return ['*' + hit.length + ' site cocok*'].concat(hit.slice(0, 15).map(function (s) {
    return '- ' + s.name + ' (' + s.sow + ')' + (s.region ? ', ' + s.region : '');
  })).concat(hit.length > 15 ? ['... dan ' + (hit.length - 15) + ' lagi, perjelas kata kuncinya.'] : []).join('\n');
}

// Total (DAILY REPORT EMR) vs Plan (MASTER BOQ CLUSTER) per kolom material.
function botProgres_(arg) {
  if (!arg) return 'Tulis nama site, mis. *progres jati baru rt 04*.';
  var hit = botFindSites_(arg);
  if (!hit.length) return 'Tidak ada site yang cocok dengan "' + arg + '". Coba *site ' + arg.split(/\s+/)[0] + '*.';
  if (hit.length > 3) return botSite_(arg) + '\n\nPerjelas nama site-nya.';
  var bsh = boqSheet_(), bh = sheetHeader_(bsh), bdata = boqData_(bsh, bh), bmats = materialCols_(bh);
  var dsh = dailySheet_(), dh = sheetHeader_(dsh), dmats = materialCols_(dh), cTgl = dh.idx['tanggal'];
  return hit.map(function (s) {
    var r = boqRowIndex_(bdata, bh, s.name, s.sow), plan = {};
    if (r >= 0) bmats.forEach(function (m) { var v = cellNumber_(bdata[r][m.idx]); if (v) plan[m.col] = v; });
    var rows = clusterRows_(dsh, dh, s.name, s.sow), tot = {}, last = '';
    rows.forEach(function (row) {
      dmats.forEach(function (m) { var v = cellNumber_(row[m.idx]); if (v) tot[m.col] = (tot[m.col] || 0) + v; });
      var t = botDmy_(row[cTgl]);
      if (t && (!last || botDmyKey_(t) > botDmyKey_(last))) last = t;
    });
    var cols = MATERIAL_HEADERS_.map(normHeader_).filter(function (k) { return plan[k] || tot[k]; });
    var head = '*' + s.name + '* (' + s.sow + ')';
    if (!cols.length) return head + '\nBelum ada BOQ Plan maupun Daily Report.';
    var lines = cols.map(function (k) {
      var t = Math.max(0, tot[k] || 0), p = plan[k] || 0, title = MATERIAL_HEADERS_[MATERIAL_HEADERS_.map(normHeader_).indexOf(k)].replace(/\s*\(.*$/, '');
      return title + ': ' + botNum_(t) + (p ? ' / ' + botNum_(p) + ' (' + Math.round(t / p * 100) + '%)' : ' (tanpa plan)');
    });
    return [head, 'Laporan terakhir: ' + (last || '-')].concat(lines).join('\n');
  }).join('\n\n');
}

// Isi sel Tanggal (teks dd/mm/yyyy atau Date) -> 'dd/MM/yyyy' ('' bila kosong).
function botDmy_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, BOT_TZ_.id, 'dd/MM/yyyy');
  var m = String(v || '').trim().replace(/^'/, '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3] : '';
}
function botDmyKey_(t) { return t.slice(6) + t.slice(3, 5) + t.slice(0, 2); }

function botRekap_(arg) {
  var now = new Date(), a = arg.toLowerCase(), day;
  if (!a || a === 'hari ini') day = Utilities.formatDate(now, BOT_TZ_.id, 'dd/MM/yyyy');
  else if (a === 'kemarin') day = Utilities.formatDate(new Date(now.getTime() - 864e5), BOT_TZ_.id, 'dd/MM/yyyy');
  else {
    var m = a.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    if (!m) return 'Format tanggal: *rekap*, *rekap kemarin*, atau *rekap 24/10*.';
    day = botDmy_(m[1] + '/' + m[2] + '/' + (m[3] || Utilities.formatDate(now, BOT_TZ_.id, 'yyyy')));
  }
  var sh = dailySheet_(), h = sheetHeader_(sh), last = sh.getLastRow();
  if (last < 2) return 'DAILY REPORT EMR masih kosong.';
  var c = { t: h.idx['tanggal'], n: h.idx['cluster name'], s: h.idx['sow'], p: h.idx['pic'], r: h.idx['ringkasan pencapaian'], a: h.idx['today activity'] };
  var width = Math.max(c.t, c.n, c.s, c.p, c.r, c.a) + 1;
  var rows = sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
    return botDmy_(r[c.t]) === day && !/^(saldo awal|koreksi total)/i.test(String(r[c.a] || ''));
  });
  if (!rows.length) return 'Belum ada Daily Report tanggal ' + day + '.';
  return ['*Rekap Daily Report ' + day + '* (' + rows.length + ' laporan)'].concat(rows.map(function (r, i) {
    return (i + 1) + '. ' + siteName_(r[c.n]) + (r[c.s] ? ' (' + r[c.s] + ')' : '') + (r[c.p] ? ' - ' + r[c.p] : '') +
      '\n   ' + (String(r[c.r] || '').trim() || '-').slice(0, 300);
  })).join('\n');
}

function botCatat_(arg, from) {
  if (!arg) return 'Tulis isinya, mis. *catat beli 2 roll cable 24C*.';
  var sh = sheetWithHeader_(BOT_NOTE_SHEET_, BOT_NOTE_HEADER_);
  sh.appendRow(rowByHeader_(sheetHeader_(sh), { 'Timestamp': new Date(), 'Dari': String(from || ''), 'Catatan': /^[=+\-@]/.test(arg) ? "'" + arg : arg }));
  return 'Tercatat (' + (sh.getLastRow() - 1) + ' catatan di tab ' + BOT_NOTE_SHEET_ + ').';
}

function botCatatan_(arg) {
  var ss = getWaspangSpreadsheet_(), sh = ss.getSheetByName(BOT_NOTE_SHEET_);
  if (!sh || sh.getLastRow() < 2) return 'Belum ada catatan. Mulai dengan *catat <teks>*.';
  var h = sheetHeader_(sh), q = arg.toLowerCase();
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.width).getValues().filter(function (r) {
    return !q || String(r[h.idx['catatan']]).toLowerCase().indexOf(q) >= 0;
  }).slice(-10);
  if (!rows.length) return 'Tidak ada catatan yang berisi "' + arg + '".';
  return ['*Catatan' + (q ? ' "' + arg + '"' : ' terakhir') + '*'].concat(rows.map(function (r) {
    var t = r[h.idx['timestamp']];
    return '- ' + (t instanceof Date ? Utilities.formatDate(t, BOT_TZ_.id, 'dd/MM HH:mm') + ' ' : '') + r[h.idx['catatan']];
  })).join('\n');
}

// "14:30 teks" (hari ini, atau besok bila jamnya sudah lewat), "besok 08:00 teks", "30m teks", "2j teks".
function botIngatkan_(arg, jid) {
  if (!jid) return 'Tujuan pengingat tidak diketahui.';
  var now = Date.now(), due = 0, text = '', m;
  if ((m = arg.match(/^(\d+)\s*(m|mnt|menit|j|jam)\s+([\s\S]+)$/i))) {
    due = now + Number(m[1]) * (/^m/i.test(m[2]) ? 60000 : 3600000);
    text = m[3];
  } else if ((m = arg.match(/^(besok\s+)?(\d{1,2})[:.](\d{2})\s+([\s\S]+)$/i))) {
    var hh = Number(m[2]), mm = Number(m[3]);
    if (hh > 23 || mm > 59) return 'Jamnya tidak valid.';
    var today = Utilities.formatDate(new Date(now), BOT_TZ_.id, 'yyyy-MM-dd');
    due = new Date(today + 'T' + ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) + ':00+08:00').getTime();
    if (m[1] || due <= now) due += 864e5;
    text = m[4];
  } else {
    return 'Contoh: *ingatkan 14:30 rapat Waspang*, *ingatkan besok 08:00 kirim BA*, *ingatkan 30m telpon mandor*.';
  }
  if (due - now > 30 * 864e5) return 'Pengingat paling lama 30 hari ke depan.';
  var key = WAQ_PREFIX_ + due + '_r' + Math.floor(Math.random() * 1e6);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
    t: now, n: 0, last: 0, due: due, to: jid, files: [], text: waText_('⏰ Pengingat: ' + text.trim()).slice(0, 3000)
  }));
  var hari = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'][Number(Utilities.formatDate(new Date(due), BOT_TZ_.id, 'u')) - 1];
  return 'Siap, diingatkan ' + hari + ' ' + Utilities.formatDate(new Date(due), BOT_TZ_.id, 'dd/MM HH:mm') + ' ' + BOT_TZ_.label + '.';
}

function botPengingat_(jid) {
  var all = PropertiesService.getScriptProperties().getProperties(), list = [];
  Object.keys(all).filter(function (k) { return k.indexOf(WAQ_PREFIX_) === 0; }).sort().forEach(function (k) {
    try { var j = JSON.parse(all[k]); if (j.due && j.to === jid) list.push(j); } catch (e) {}
  });
  if (!list.length) return 'Tidak ada pengingat yang menunggu.';
  return ['*Pengingat menunggu*'].concat(list.map(function (j) {
    return '- ' + Utilities.formatDate(new Date(j.due), BOT_TZ_.id, 'dd/MM HH:mm') + ' ' + String(j.text).replace(/^⏰ Pengingat: /, '');
  })).join('\n');
}

// ===================== JADWAL BOT: TODAY'S PLAN 07:00 DAN PENGINGAT LAPORAN 17:30 (WITA) =====================
// Tanpa trigger Apps Script: tiap kali laptop mengambil antrean (WA_PULL, tiap 15 detik), jadwal dicek. Begitu lewat jamnya
// (dan belum lewat batas), pesan dibuat dari data terbaru lalu masuk antrean ke grup. Laptop mati sampai lewat batas = hari
// itu dilewati. Script Properties (opsional): BOT_JADWAL = off (matikan), BOT_PIC (bawaan Rama), BOT_REGION (bawaan Banjarmasin).
// Permit dikirim pemilik lewat chat pribadi ("permit" + daftar) dan dipakai di Today's Plan berikutnya.
// Nomor WA tim untuk di-tag disimpan lewat perintah "tim <nama> <nomor>" (nama = PIC di Daily Report).
var BOT_JADWAL_ = [
  { id: 'PAGI', from: '07:00', until: '10:00', build: function (now) { return { text: botPagi_(now), mentions: [] }; } },
  { id: 'SORE', from: '17:30', until: '19:30', build: function (now) { return botSore_(now); } },
  { id: 'STOK', from: '07:00', until: '10:00', build: function (now) { return { text: botStokMenipis_(), to: botOwnerJid_() }; } },
  { id: 'MINGGU', from: '07:00', until: '10:00', day: 1, build: function (now) { return { text: botMingguan_(now) }; } }
];
var BOT_GARIS_ = new Array(38).join('≡');

function botWita_(ms, fmt) { return Utilities.formatDate(new Date(ms), BOT_TZ_.id, fmt); }

function botJadwal_() {
  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('BOT_JADWAL') || '').trim().toLowerCase() === 'off') return;
  var now = Date.now(), hm = botWita_(now, 'HH:mm'), today = botWita_(now, 'yyyyMMdd');
  BOT_JADWAL_.forEach(function (j) {
    if (hm < j.from || hm >= j.until || props.getProperty('BOT_SENT_' + j.id) === today) return;
    if (j.day && Number(botWita_(now, 'u')) !== j.day) return;   // u: 1 = Senin
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return;
    try {
      if (props.getProperty('BOT_SENT_' + j.id) === today) return;
      props.setProperty('BOT_SENT_' + j.id, today);   // dulu ditandai, supaya tidak terkirim dua kali bila gagal di tengah
      var msg = j.build(now);
      if (j.id === 'PAGI') Object.keys(props.getProperties()).forEach(function (k) {   // permit hari yang sudah lewat
        if (k.indexOf('BOT_PERMIT_') === 0 && k.slice(11) < today) props.deleteProperty(k);
      });
      if (!msg || !msg.text) return;
      props.setProperty(WAQ_PREFIX_ + now + '_' + j.id.toLowerCase(), JSON.stringify({
        t: now, n: 0, last: 0, files: [], to: msg.to || '', mentions: msg.mentions || [], text: String(msg.text).slice(0, 6000)
      }));
    } catch (e) {
      console.error('Jadwal bot ' + j.id + ': ' + e);
    } finally {
      lock.releaseLock();
    }
  });
  try { botBaBaru_(); } catch (e) { console.error('BA baru: ' + e); }
}

// Baris Daily Report asli (tanpa Saldo awal / Koreksi Total) -> [{day: 'dd/MM/yyyy', site, pic, act}]
function botDailyRows_() {
  var sh = dailySheet_(), h = sheetHeader_(sh), last = sh.getLastRow();
  if (last < 2) return [];
  var c = { ts: h.idx['timestamp'], t: h.idx['tanggal'], n: h.idx['cluster name'], p: h.idx['pic'], a: h.idx['today activity'] };
  var width = Math.max(c.ts, c.t, c.n, c.p, c.a) + 1;
  return sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
    return !/^(saldo awal|koreksi total)/i.test(String(r[c.a] || ''));
  }).map(function (r) {
    return { day: botDmy_(r[c.t]) || botDmy_(r[c.ts]), sent: botDmy_(r[c.ts]), site: siteName_(r[c.n]), pic: String(r[c.p] || '').trim(), act: String(r[c.a] || '') };
  });
}

// "- Tanam tiang\n- Pulling cable Line B\n\nObstacle ..." -> ['Planting Pole', 'Pulling Cable Line B']
function botAktivitas_(text) {
  var out = [];
  String(text || '').split(/\r?\n/).some(function (l) {
    l = l.replace(/^[\s\-•*]+/, '').trim();
    if (/^(obstacle|kendala)/i.test(l)) return true;
    if (!l) return false;
    var line = (l.match(/\bline\s+([a-d])\b/i) || [])[1];
    if (/tanam|penanaman|planting/i.test(l)) l = 'Planting Pole';
    else if (/digging|galian/i.test(l)) l = 'Digging Pole';
    else if (/pulling|tarik(an)?\s*kabel|penarikan/i.test(l)) l = 'Pulling Cable' + (line ? ' Line ' + line.toUpperCase() : '');
    else if (/(instal+|pemasangan|pasang)\s*acc/i.test(l)) l = 'Install Accessories';
    else l = l.charAt(0).toUpperCase() + l.slice(1);
    if (out.indexOf(l) < 0) out.push(l);
    return false;
  });
  return out;
}

// Tanggal Today's Plan yang memakai permit yang dikirim sekarang: sebelum 07:00 = hari ini, sesudahnya = besok.
function botPermitKey_(now) {
  return 'BOT_PERMIT_' + botWita_(botWita_(now, 'HH:mm') < '07:00' ? now : now + 864e5, 'yyyyMMdd');
}

function botPagi_(now) {
  var props = PropertiesService.getScriptProperties(), todayKey = botWita_(now, 'yyyyMMdd');
  var rows = botDailyRows_().filter(function (r) { return r.day && botDmyKey_(r.day) < todayKey; });
  var lastDay = rows.reduce(function (m, r) { var k = botDmyKey_(r.day); return k > m ? k : m; }, '');
  var sites = [], acts = {};
  rows.forEach(function (r) {
    if (botDmyKey_(r.day) !== lastDay || !r.site) return;
    if (!acts[r.site]) { acts[r.site] = []; sites.push(r.site); }
    botAktivitas_(r.act).forEach(function (a) { if (acts[r.site].indexOf(a) < 0) acts[r.site].push(a); });
  });
  var permit = props.getProperty('BOT_PERMIT_' + todayKey) || '';
  var s = ['» *TODAY\'S PLAN*  : ' + botWita_(now, 'dd/MM/yyyy'),
    '» *PIC*  :  ' + (props.getProperty('BOT_PIC') || 'Rama'),
    '» *REGION*  : ' + (props.getProperty('BOT_REGION') || 'Banjarmasin'),
    BOT_GARIS_];
  if (permit) s = s.concat(['*Permit*', 'Cluster :'], permit.split('\n'), ['']);   // tanpa permit malam itu = bagian Permit tidak ada
  s.push('Implementasi');
  if (!sites.length) s.push('-');
  sites.forEach(function (n) {
    s.push('- ' + n);
    (acts[n].length ? acts[n] : ['-']).forEach(function (a) { s.push('-' + a); });
  });
  s.push(BOT_GARIS_, 'TERIMAKASIH');
  return s.join('\n');
}

function botTim_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('BOT_TIM') || '{}'); } catch (e) { return {}; }
}

// 17:30: tim yang belum mengirim Daily Report hari ini di-tag; yang sudah disebut namanya.
function botSore_(now) {
  var day = botWita_(now, 'dd/MM/yyyy'), tim = botTim_();
  var pics = botDailyRows_().filter(function (r) { return r.day === day || r.sent === day; })
    .map(function (r) { return r.pic.toLowerCase(); }).filter(Boolean);
  var sudah = [], belum = [];
  Object.keys(tim).sort().forEach(function (n) {
    var k = n.toLowerCase();
    (pics.some(function (p) { return p.indexOf(k) >= 0 || k.indexOf(p) >= 0; }) ? sudah : belum).push(n);
  });
  var s = ['⏰ *Pengingat Laporan Harian* ' + day, 'Mohon kirim Daily Report hari ini lewat Portal Waspang sebelum pulang.'];
  if (belum.length) s.push('', 'Belum laporan: ' + belum.map(function (n) { return '@' + tim[n]; }).join(' '));
  if (sudah.length) s.push('Sudah laporan: ' + sudah.join(', ') + ' 🙏');
  if (Object.keys(tim).length && !belum.length) s.push('', 'Semua tim sudah laporan hari ini, terima kasih 🙏');
  return { text: s.join('\n'), mentions: belum.map(function (n) { return tim[n]; }) };
}

// permit <daftar, satu cluster per baris> | permit (lihat) | permit hapus
function botPermit_(arg) {
  var now = Date.now(), key = botPermitKey_(now), props = PropertiesService.getScriptProperties();
  var tgl = key.slice(-2) + '/' + key.slice(-4, -2) + '/' + key.slice(-8, -4);
  if (/^hapus$/i.test(arg)) { props.deleteProperty(key); return 'Permit untuk Today\'s Plan ' + tgl + ' dihapus.'; }
  if (!arg) {
    var cur = props.getProperty(key);
    return cur ? '*Permit ' + tgl + '*\n' + cur : 'Belum ada permit untuk ' + tgl + '. Kirim *permit* diikuti daftar cluster, satu per baris.';
  }
  var lines = arg.split(/\r?\n/).map(function (l) {
    return l.replace(/\t+/g, '  ').replace(/^[\s\-•*]+/, '').replace(/\s{3,}/g, '  ').trim();
  }).filter(function (l) { return l && !/^cluster\s*:?$/i.test(l); });
  if (!lines.length) return 'Daftar permit kosong.';
  props.setProperty(key, lines.map(function (l) { return '- ' + l; }).join('\n').slice(0, 6000));
  return 'Siap, ' + lines.length + ' permit masuk Today\'s Plan ' + tgl + ' jam 07:00.';
}

// tim | tim <nama> <nomor> | tim hapus <nama>
function botTimCmd_(arg) {
  var props = PropertiesService.getScriptProperties(), tim = botTim_(), m;
  if ((m = arg.match(/^hapus\s+(.+)$/i))) {
    var hit = Object.keys(tim).filter(function (n) { return n.toLowerCase() === m[1].trim().toLowerCase(); })[0];
    if (!hit) return 'Nama "' + m[1].trim() + '" tidak ada di daftar tim.';
    delete tim[hit];
  } else if ((m = arg.match(/^(.+?)\s+(\+?[\d\s\-]{9,})$/))) {
    var no = m[2].replace(/\D/g, '').replace(/^0/, '62');
    if (!/^62\d{8,13}$/.test(no)) return 'Nomor tidak valid. Contoh: *tim Nazar 081234567890*.';
    tim[m[1].trim()] = no;
  } else if (arg) {
    return 'Contoh: *tim Nazar 081234567890*, *tim hapus Nazar*, atau *tim* untuk melihat daftar.';
  }
  if (arg) props.setProperty('BOT_TIM', JSON.stringify(tim));
  var names = Object.keys(tim).sort();
  if (!names.length) return 'Daftar tim kosong. Tambah dengan *tim <nama PIC> <nomor WA>*.';
  return ['*Tim yang di-tag jam 17:30*'].concat(names.map(function (n) { return '- ' + n + ': ' + tim[n]; })).join('\n');
}

// ===================== BOT: STOK MENIPIS, REKAP MINGGUAN, CEK DAILY REPORT, BA AMBIL, ALARM GATEWAY =====================
function botMatTitle_(k) {
  var i = MATERIAL_HEADERS_.map(normHeader_).indexOf(k);
  return (i >= 0 ? MATERIAL_HEADERS_[i] : k).replace(/\s*\(.*$/, '');
}

// Nomor pertama di WA_OWNER sebagai chat tujuan pesan pribadi bot ('' bila belum diisi).
function botOwnerJid_() {
  var n = String(PropertiesService.getScriptProperties().getProperty('WA_OWNER') || '').split(',')[0].replace(/\D/g, '');
  return n ? n + '@s.whatsapp.net' : '';
}

// Plan (MASTER BOQ CLUSTER) dan Total (semua Daily Report) satu site per kolom material.
function botPlanTotal_(name, sow, ctx) {
  ctx = ctx || {};
  if (!ctx.bh) {
    ctx.bsh = boqSheet_(); ctx.bh = sheetHeader_(ctx.bsh); ctx.bdata = boqData_(ctx.bsh, ctx.bh); ctx.bmats = materialCols_(ctx.bh);
    ctx.dsh = dailySheet_(); ctx.dh = sheetHeader_(ctx.dsh); ctx.dmats = materialCols_(ctx.dh);
  }
  var r = boqRowIndex_(ctx.bdata, ctx.bh, name, sow), plan = {}, tot = {};
  if (r >= 0) ctx.bmats.forEach(function (m) { var v = cellNumber_(ctx.bdata[r][m.idx]); if (v) plan[m.col] = v; });
  clusterRows_(ctx.dsh, ctx.dh, name, sow).forEach(function (row) {
    ctx.dmats.forEach(function (m) { var v = cellNumber_(row[m.idx]); if (v) tot[m.col] = (tot[m.col] || 0) + v; });
  });
  return { plan: plan, tot: tot, ctx: ctx };
}

// ---- Stok menipis: tiap pagi ke chat pribadi pemilik. Batas per material lewat perintah "batas". ----
var BOT_STOK_MIN_DEFAULT_ = { 'cable 24c': 3000, 'cable 48c': 2000, 'cable 144c': 2000, 'pole 7/3': 100, 'pole 7/4': 50, 'fat': 20 };

function botBatas_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('BOT_STOK_MIN');
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(BOT_STOK_MIN_DEFAULT_));
  } catch (e) { return JSON.parse(JSON.stringify(BOT_STOK_MIN_DEFAULT_)); }
}

// Gudang yang dicek: Script Property BOT_STOK_GUDANG (bawaan "banjarmasin"; pisahkan koma).
function botStokMenipis_() {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('SALDO GUDANG');
  if (!sh || sh.getLastRow() < 4) return '';
  var batas = botBatas_(), keys = Object.keys(batas);
  if (!keys.length) return '';
  var gud = String(PropertiesService.getScriptProperties().getProperty('BOT_STOK_GUDANG') || 'banjarmasin').toLowerCase()
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var vals = sh.getRange(4, 1, sh.getLastRow() - 3, 7).getValues(), out = [];
  vals.forEach(function (r) {
    var g = String(r[0] || '').trim(), d = String(r[1] || '').trim(), sal = cellNumber_(r[6]);
    if (!d || !gud.some(function (x) { return g.toLowerCase().indexOf(x) >= 0; })) return;
    var k = keys.filter(function (k) { return d.toLowerCase().indexOf(k) >= 0; })[0];
    if (k && sal < batas[k]) out.push('- ' + d + ' (' + g.replace(/^gudang\s+/i, '') + '): ' + botNum_(sal) + ' (batas ' + botNum_(batas[k]) + ')');
  });
  return out.length ? ['⚠️ *Stok menipis* ' + botWita_(Date.now(), 'dd/MM/yyyy')].concat(out).join('\n') : '';
}

// batas | batas <material> <angka> | batas hapus <material> | batas awal (kembali ke bawaan)
function botBatasCmd_(arg) {
  var props = PropertiesService.getScriptProperties(), b = botBatas_(), m;
  if (/^awal$/i.test(arg)) { props.deleteProperty('BOT_STOK_MIN'); b = botBatas_(); }
  else if ((m = arg.match(/^hapus\s+(.+)$/i))) { delete b[m[1].trim().toLowerCase()]; props.setProperty('BOT_STOK_MIN', JSON.stringify(b)); }
  else if ((m = arg.match(/^(.+?)\s+([\d.]+)$/))) {
    var mat = m[1].trim().toLowerCase().split(/\s+/).map(function (w) { return BOT_MATERIAL_ALIAS_[w] || w; }).join(' ');
    b[mat] = Number(m[2].replace(/\./g, ''));
    props.setProperty('BOT_STOK_MIN', JSON.stringify(b));
  } else if (arg) return 'Contoh: *batas cable 24c 3000*, *batas hapus fat*, *batas awal*, atau *batas* untuk melihat.';
  var ks = Object.keys(b).sort();
  return ['*Batas stok menipis* (dicek tiap 07:00)'].concat(ks.length ? ks.map(function (k) { return '- ' + k + ': ' + botNum_(b[k]); }) : ['(kosong)']).join('\n');
}

// ---- Rekap mingguan (Senin pagi, ke grup): Senin-Minggu pekan lalu. ----
function botMingguan_(now) {
  var endKey = botWita_(now - 864e5, 'yyyyMMdd'), startKey = botWita_(now - 7 * 864e5, 'yyyyMMdd');
  var sh = dailySheet_(), h = sheetHeader_(sh), last = sh.getLastRow(), mats = materialCols_(h);
  var c = { t: h.idx['tanggal'], ts: h.idx['timestamp'], n: h.idx['cluster name'], s: h.idx['sow'], a: h.idx['today activity'] };
  var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, h.width).getValues().filter(function (r) {
    if (/^(saldo awal|koreksi total)/i.test(String(r[c.a] || ''))) return false;
    var d = botDmy_(r[c.t]) || botDmy_(r[c.ts]), k = d && botDmyKey_(d);
    return k && k >= startKey && k <= endKey;
  });
  var dari = botWita_(now - 7 * 864e5, 'dd/MM'), sampai = botWita_(now - 864e5, 'dd/MM/yyyy');
  var s = ['📊 *REKAP MINGGUAN* ' + dari + ' - ' + sampai, BOT_GARIS_];
  if (!rows.length) return s.concat(['Tidak ada Daily Report pekan ini.', BOT_GARIS_]).join('\n');
  var sites = [], by = {}, all = {};
  rows.forEach(function (r) {
    var key = siteName_(r[c.n]) + '|' + String(r[c.s] || '');
    if (!by[key]) { by[key] = { name: siteName_(r[c.n]), sow: String(r[c.s] || ''), n: 0, sum: {} }; sites.push(key); }
    by[key].n++;
    mats.forEach(function (m) {
      var v = cellNumber_(r[m.idx]);
      if (v) { by[key].sum[m.col] = (by[key].sum[m.col] || 0) + v; all[m.col] = (all[m.col] || 0) + v; }
    });
  });
  var ctx = {};
  sites.forEach(function (key) {
    var x = by[key], pt = botPlanTotal_(x.name, x.sow, ctx);
    ctx = pt.ctx;
    s.push('', '*' + x.name + '* (' + x.sow + '), ' + x.n + ' laporan');
    var cols = Object.keys(x.sum);
    if (!cols.length) s.push('- Tidak ada volume');
    cols.forEach(function (k) {
      var p = pt.plan[k], t = Math.max(0, pt.tot[k] || 0);
      s.push('- ' + botMatTitle_(k) + ': +' + botNum_(x.sum[k]) + (p ? ' (total ' + botNum_(t) + '/' + botNum_(p) + ', ' + Math.round(t / p * 100) + '%)' : ''));
    });
  });
  var allCols = Object.keys(all);
  if (allCols.length) s.push('', '*Total pemakaian pekan ini*');
  allCols.forEach(function (k) { s.push('- ' + botMatTitle_(k) + ': ' + botNum_(all[k])); });
  s.push(BOT_GARIS_);
  return s.join('\n').slice(0, 5900);
}

// ---- Cek Daily Report yang baru masuk; temuan dikirim ke grup (PIC di-tag bila nomornya ada di daftar tim). ----
function botCekDaily_(payload) {
  var r = payload.report || {}, cluster = payload.cluster;
  if (!cluster) return;
  var tgl = botDmy_(dmyText_(r.tanggal)), start = botDmy_(dmyText_(r.startImpl)), now = Date.now(), cek = [];
  var today = botWita_(now, 'yyyyMMdd');
  if (tgl) {
    if (start && botDmyKey_(tgl) < botDmyKey_(start)) cek.push('Tanggal laporan ' + tgl + ' lebih awal dari Start Implementation ' + start + '.');
    if (botDmyKey_(tgl) > today) cek.push('Tanggal laporan ' + tgl + ' ada di masa depan.');
    else if (botDmyKey_(tgl) < botWita_(now - 3 * 864e5, 'yyyyMMdd')) cek.push('Tanggal laporan ' + tgl + ' sudah lewat lebih dari 3 hari, mungkin salah pilih tanggal.');
  }
  var name = siteName_(cluster), sow = r.sow || payload.sow || sowFromId_(cluster);
  var today_ = payload.today || {}, todayCols = {};
  Object.keys(today_).forEach(function (k) { var col = materialColumn_(k); if (col && cellNumber_(today_[k])) todayCols[col] = true; });
  if (Object.keys(todayCols).length) {
    var pt = botPlanTotal_(name, sow);
    Object.keys(todayCols).forEach(function (k) {
      var p = pt.plan[k], t = pt.tot[k] || 0;
      if (p && t > p) cek.push(botMatTitle_(k) + ': Total ' + botNum_(t) + ' melebihi Plan ' + botNum_(p) + '.');
    });
  }
  if (!cek.length) return;
  var pic = String(r.pic || payload.by || '').trim(), tim = botTim_(), no = '';
  Object.keys(tim).forEach(function (n) {
    var a = n.toLowerCase(), b = pic.toLowerCase();
    if (b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) no = tim[n];
  });
  var text = ['⚠️ *Cek Daily Report*', name + ' (' + sow + ')' + (pic ? ' - PIC ' + (no ? '@' + no : pic) : '')]
    .concat(cek.map(function (x) { return '- ' + x; })).concat(['Mohon dicek dan diperbaiki bila keliru.']).join('\n');
  PropertiesService.getScriptProperties().setProperty(WAQ_PREFIX_ + now + '_cek', JSON.stringify({ t: now, n: 0, last: 0, files: [], mentions: no ? [no] : [], text: text }));
}

// ---- BA Ambil baru di BA TRANSAKSI (Portal FTTH) diteruskan ke grup. Dicek paling sering tiap 5 menit dari WA_PULL. ----
function botBaBaru_() {
  var cache = CacheService.getScriptCache();
  if (cache.get('bot_ba_cek')) return;
  cache.put('bot_ba_cek', '1', 300);
  var props = PropertiesService.getScriptProperties();
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('BA TRANSAKSI');
  if (!sh) return;
  var last = sh.getLastRow(), seen = Number(props.getProperty('BOT_BA_LAST') || 0);
  if (!seen || last < seen) { props.setProperty('BOT_BA_LAST', String(last)); return; }   // pertama kali / ada baris dihapus: mulai dari sini
  if (last === seen) return;
  var width = sh.getLastColumn(), head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (x) { return String(x).trim(); });
  var rows = sh.getRange(seen + 1, 1, Math.min(last - seen, 20), width).getValues();
  props.setProperty('BOT_BA_LAST', String(last));
  var ix = function (n) { return head.indexOf(n); }, first = ix('FAT'), lastMat = ix('Galvanis');
  rows.forEach(function (r, i) {
    if (String(r[ix('Jenis Transaksi')] || '').trim() !== 'Ambil') return;
    var items = [];
    for (var c = first; c >= 0 && c <= lastMat; c++) { var v = cellNumber_(r[c]); if (v) items.push('- ' + head[c] + ': ' + botNum_(v)); }
    var lain = String(r[ix('Material Lain')] || '').trim();
    if (lain) items.push('- ' + lain);
    var tgl = r[ix('Tanggal BA')] instanceof Date ? botWita_(r[ix('Tanggal BA')].getTime(), 'dd/MM/yyyy') : String(r[ix('Tanggal BA')] || '');
    var text = ['📦 *BA Ambil Material* ' + tgl,
      'Site: ' + String(r[ix('Name')] || '-') + (r[ix('SOW')] ? ' (' + r[ix('SOW')] + ')' : ''),
      'Mandor: ' + String(r[ix('Mandor / Subcont')] || '-') + ' | ' + String(r[ix('Gudang')] || '-')]
      .concat(items.length ? items : ['- (tanpa material)']).join('\n');
    var t = Date.now() + i;
    props.setProperty(WAQ_PREFIX_ + t + '_ba', JSON.stringify({ t: t, n: 0, last: 0, files: [], mentions: [], text: text.slice(0, 3000) }));
  });
}

// ---- Alarm gateway mati: trigger tiap 15 menit, email ke Script Property BOT_ALARM_EMAIL (WA ikut mati, jadi lewat email). ----
// Pasang sekali dari editor Apps Script: jalankan pasangAlarmGateway lalu setujui izin (trigger + kirim email).
function pasangAlarmGateway() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cekGatewayBot') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cekGatewayBot').timeBased().everyMinutes(15).create();
  cekGatewayBot();
  console.log('Alarm gateway terpasang, email ke: ' + (PropertiesService.getScriptProperties().getProperty('BOT_ALARM_EMAIL') || '(BOT_ALARM_EMAIL belum diisi)'));
}

function cekGatewayBot() {
  var props = PropertiesService.getScriptProperties();
  if (!waPcMode_()) return;
  var to = String(props.getProperty('BOT_ALARM_EMAIL') || '').trim();
  var seen = CacheService.getScriptCache().get('wa_pc_seen'), seenMs = seen ? Date.parse(seen) : 0;
  var down = !seenMs || Date.now() - seenMs > 15 * 60000, was = props.getProperty('BOT_GW_DOWN') === '1';
  if (down === was) return;
  props.setProperty('BOT_GW_DOWN', down ? '1' : '0');
  if (!to) return;
  var jam = botWita_(Date.now(), 'dd/MM/yyyy HH:mm') + ' ' + BOT_TZ_.label;
  if (down) MailApp.sendEmail(to, '⚠️ Gateway WA mati (' + jam + ')',
    'Laptop gateway WhatsApp tidak mengambil antrean sejak ' + (seen ? botWita_(seenMs, 'dd/MM HH:mm') + ' ' + BOT_TZ_.label : 'lebih dari 6 jam') + '.\n' +
    'Bot tidak membalas dan laporan menunggu di antrean (paling lama 3 hari).\n\nCek laptop: nyalakan, lalu jalankan gateway.');
  else MailApp.sendEmail(to, '✅ Gateway WA jalan lagi (' + jam + ')', 'Laptop gateway sudah mengambil antrean lagi. Laporan yang menunggu akan terkirim.');
}

// Satu baris per foto, mengikuti judul kolom tab LOG FOTO WASPANG.
function logWaspangPhotoToSheet_(payload, folderUrl, saved, waOk) {
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
        'Status WhatsApp': waOk ? 'SENT_WA' : 'GAGAL_WA'
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
  if (!text) {
    return { status: 'error', message: 'Teks Daily Report kosong.' };
  }
  var waOk = sendDailyReportToWhatsApp_(text);

  // Catat di tab DAILY REPORT EMR, juga bila WhatsApp gagal (laporan tidak hilang). Gagal di sini tidak membatalkan laporan.
  var res;
  try {
    res = recordDailyReport_(payload);
  } catch (err) {
    console.error('Log daily report error: ' + err);
    res = { status: 'success', totalsError: err.toString() };
  }
  res.waSent = waOk;
  if (waPcMode_()) try { botCekDaily_(payload); } catch (e) { console.error('Cek Daily Report: ' + e); }
  return res;
}

// Satu baris per Daily Report di tab DAILY REPORT EMR (kolom material berisi volume Today),
// lalu Total baru cluster itu dihitung dari tab yang sama.
function recordDailyReport_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(45000);   // laporan sudah terkirim ke WhatsApp: tunggu lebih lama supaya barisnya tidak hilang
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
      case 'WA_CMD':
        // Hanya nama perintah (isi catatan/pengingat tidak dicatat); pesan yang tidak dijawab bot tidak dicatat.
        if (!p.cmd) return;
        aksi = 'Perintah Bot WA';
        detail = p.cmd + (/^(catat|ingatkan|permit|tim)$/.test(p.cmd) ? '' : ' ' + String(p.text || '').replace(/^[!\/]?\S+\s*/, '')).slice(0, 80);
        who = { name: String(p.fromName || '').trim() || String(p.from || ''), role: p.chat === 'group' ? 'Grup WA' : 'WA pribadi' };
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
