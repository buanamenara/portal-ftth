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
    // Cek kesehatan sungguhan: spreadsheet FTTH, Waspang, RPM BMI dan folder dokumentasi benar-benar dibuka.
    var cek = wsHealth_(), err = wsErrHariIni_();
    return ContentService.createTextOutput(JSON.stringify({
      status: cek.ok ? "online" : "gangguan",
      message: cek.ok ? "Portal Waspang & Daily Report EMR aktif. Semua spreadsheet terhubung." : "Gangguan: " + cek.masalah.join('; '),
      targetDriveFolder: "DOKUMENTASI FTTH",
      checks: cek.items,
      errorsToday: err.n,
      lastError: err.items.length ? err.items[err.items.length - 1] : null
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return withSites_(HtmlService.createHtmlOutputFromFile('Form'))
    .setTitle('Portal Waspang & Daily Report EMR')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var result, payload = null;
  try {
    payload = JSON.parse(e.postData.contents);
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
    else if (result && result.status === 'error') wsErrCatat_(payload.action, result.message);
  } catch (err) {
    result = { status: 'error', message: err.toString() };
    wsErrCatat_(payload && payload.action, err.toString());
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
    case 'bantu': case 'bantuan': case 'menu': case 'help': case '?':
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
    case 'implementasi': case 'impl':
      out = owner ? botImplementasi_(arg) : ''; break;
    case 'tim':
      out = owner ? botTimCmd_(arg) : ''; break;
    case 'batas':
      out = owner ? botBatasCmd_(arg) : ''; break;
    case 'stokmin': case 'menipis':
      out = owner ? (botStokMenipis_(true) || 'Tidak ada stok di bawah batas.') : ''; break;
    case 'mingguan':
      out = owner ? botMingguan_(Date.now()) : ''; break;
    case 'wh':
      out = owner ? botTimCmd_(arg, 'BOT_WH') : ''; break;
    case 'mangkrak':
      out = owner ? ((botMangkrak_(Date.now(), true) || {}).text || 'Tidak ada site aktif yang 3 hari tanpa laporan.') : ''; break;
    case 'boq':
      out = !owner ? '' : /^ok\b/i.test(arg) ? botBoqOk_(arg.replace(/^ok\s*/i, '')) : (botBoqLewat_(Date.now()) || 'Tidak ada item yang melebihi Plan BOQ (di luar site yang sudah di-OK).'); break;
    case 'bulanan':
      out = owner ? botBulanan_(Date.now()) : ''; break;
    case 'backup':
      out = owner ? botBackup_(true) : ''; break;
    case 'status':
      out = owner ? botStatus_() : ''; break;
    case 'potongan':
      out = botPotongan_(arg); break;
    case 'ba':
      out = botBa_(arg); break;
    case 'panduan':
      out = botPanduan_(p, owner, arg); break;
    case 'stokwh':
      out = botStokWh_(p, arg, owner); break;
    case 'setuju':
      out = owner && p.chat !== 'group' ? botStokWhSetuju_(p.fromName || p.from) : ''; break;
    case 'batal':
      out = owner && p.chat !== 'group' ? botStokWhBatal_() : ''; break;
    case 'pagi':   // pratinjau Today's Plan berikutnya: sesudah 07:00 = besok (memakai Daily Report dan tambahan hari ini)
      out = owner ? botPagi_(botWita_(Date.now(), 'HH:mm') < '07:00' ? Date.now() : Date.now() + 864e5) : ''; break;
    case 'sore':
      out = owner ? (/^kirim$/i.test(arg) ? botSoreKirim_() : botSore_(Date.now()).text) : ''; break;
    default:
      if (owner && /\s+ok$/i.test(text)) { out = botBoqOk_(text.replace(/\s+ok$/i, '').trim()); break; }   // "<site> ok" (BOQ melebihi Plan)
      out = p.chat === 'group' ? '' : 'Perintah "' + cmd + '" belum ada. Ketik *bantu* untuk daftar perintah.';
  }
  p.cmd = out ? cmd : '';
  return { status: 'success', reply: out ? waText_((/^(pagi|sore|mingguan|bulanan)$/.test(cmd) ? '' : '🤖 ') + out).slice(0, 3500) : '' };   // contoh pesan jadwal tampil persis seperti di grup
}

function botHelp_(owner) {
  var g = owner ? '' : '!';
  var s = ['*AdminSuper - daftar perintah*' + (owner ? '' : ' (di grup awali dengan !)'),
    '', '*Perintah*',
    g + 'bantu / ' + g + 'bantuan : daftar ini',
    g + 'stok [material] [gudang] : saldo gudang, mis. ' + g + 'stok kabel batola',
    g + 'progres <site> : Total vs Plan material, mis. ' + g + 'progres jati baru rt 04',
    g + 'rekap [kemarin | dd/mm] : Daily Report hari itu',
    g + 'site <kata> : cari nama site di DATA BASE',
    g + 'potongan [kabel] [gudang] : haspel utuh + potongan kabel dari Excel WH terakhir, mis. ' + g + 'potongan 24c',
    g + 'ba <site> [sow] : BA Ambil / Pengembalian satu site + total bersih, mis. ' + g + 'ba penggalaman',
    g + 'panduan : kirim PDF panduan perintah ke chat ini',
    'Kirim Excel stok WH dengan caption ' + g + 'stokwh : dibandingkan dengan SALDO GUDANG, admin yang menyetujui',
    '', '*Otomatis ke grup*',
    '07:00 Today\'s Plan (permit + implementasi)',
    '07:05 site 3 hari tanpa laporan (tag PIC; daftar lengkap tiap Senin)',
    '17:30 pengingat Daily Report (tag yang belum lapor)',
    'Senin 07:00 rekap mingguan | tanggal 1 07:00 rekap bulanan',
    'Senin 08:00 minta Excel stok WH | tgl 28 persiapan opname | tgl 1 tagih file opname',
    'Setiap Daily Report dicek (tanggal, Total > Plan) | BA Ambil dan BA Masuk baru diteruskan'];
  if (owner) s = s.concat(['', '*Otomatis ke chat pribadi admin*',
    '07:00 stok berkurang di bawah standar (+ perkiraan habis; daftar lengkap tiap Senin)',
    'Senin 07:05 item yang melebihi Plan BOQ (balas <site> ok supaya tidak dilaporkan lagi)',
    '07:10 peringatan bila Excel stok WH (!stokwh) 7 hari tidak dikirim (diulang tiap 3 hari)',
    'Minggu 22:00 backup spreadsheet FTTH + Waspang ke Drive | email bila gateway mati',
    '', '*Pribadi*',
    'catat <teks> : simpan catatan',
    'catatan [kata] : 10 catatan terakhir',
    'ingatkan 14:30 <teks> | besok 08:00 <teks> | 30m <teks> | 2j <teks>',
    'pengingat : daftar pengingat yang menunggu',
    'permit <daftar, satu per baris> : permit untuk Today\'s Plan berikutnya (permit hapus)',
    'implementasi <daftar, satu per baris> : tambah ke blok Implementasi Today\'s Plan berikutnya (implementasi hapus)',
    'implementasi buang <nama site> : buang site dari daftar otomatis Today\'s Plan berikutnya',
    'tim <nama PIC> <nomor> : tim yang di-tag jam 17:30 (tim, tim hapus <nama>)',
    'wh <nama> <nomor> : tim gudang yang di-tag pengingat stok / opname (wh, wh hapus <nama>)',
    'batas <material> <angka> : standar stok (batas, batas hapus <material>, batas awal)',
    'panduan lengkap : PDF semua perintah termasuk admin, selalu ke chat pribadi admin',
    'menipis : stok di bawah standar sekarang',
    'mangkrak : site aktif 3+ hari tanpa laporan',
    'boq : semua item yang melebihi Plan BOQ (kecuali site yang sudah di-OK)',
    '<site> ok : site itu tidak dilaporkan lagi di BOQ melebihi Plan (boq ok = daftar, boq ok hapus <site>)',
    'setuju | batal : usulan stok dari Excel WH (!stokwh)',
    'pagi | sore | mingguan | bulanan : lihat contoh pesan jadwal sekarang',
    'sore kirim : kirim pengingat laporan ke grup sekarang (tag yang belum lapor)',
    'backup : backup spreadsheet sekarang',
    'status : status gateway, antrean pesan, jadwal hari ini, alarm, Excel WH, backup terakhir, kesehatan spreadsheet dan error hari ini']);
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
  var pd = botPotonganData_(), potLines = [];
  order.forEach(function (g) {
    var x = pd[botGudangKey_(g).toLowerCase()];
    if (!x) return;
    by[g].forEach(function (line) {
      var d = line.split(':')[0], o = x.items[d];
      if (o) potLines.push('- ' + d + ' (' + botGudangKey_(g) + '): ' + botPotonganTeks_(o));
    });
  });
  if (potLines.length) out = out.concat(['', '✂️ _Rincian kabel (Excel WH ' + (pd[Object.keys(pd)[0]] || {}).tgl + ', ketik ' + 'potongan <kabel> untuk daftar)_']).concat(potLines);
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
  { id: 'STOK', from: '07:00', until: '10:00', build: function (now) { return { text: botStokMenipis_(Number(botWita_(now, 'u')) === 1), to: botOwnerJid_() }; } },   // Senin: daftar lengkap
  { id: 'MINGGU', from: '07:00', until: '10:00', day: 1, build: function (now) { return { text: botMingguan_(now) }; } },
  { id: 'BULAN', from: '07:00', until: '10:00', date: 1, build: function (now) { return { text: botBulanan_(now) }; } },
  { id: 'MANGKRAK', from: '07:05', until: '10:00', build: function (now) { return botMangkrak_(now, Number(botWita_(now, 'u')) === 1); } },
  { id: 'BOQ', from: '07:05', until: '10:00', day: 1, build: function (now) { return { text: botBoqLewat_(now), to: botOwnerJid_() }; } },   // Senin saja
  { id: 'WH', from: '08:00', until: '11:00', build: function (now) { return botWhIngat_(now); } },   // Senin, tanggal 28 dan tanggal 1
  { id: 'WHBASI', from: '07:10', until: '10:00', build: function (now) { return { text: botWhBasi_(now), to: botOwnerJid_() }; } }
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
    if (j.date && Number(botWita_(now, 'd')) !== j.date) return;   // tanggal dalam bulan
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return;
    try {
      if (props.getProperty('BOT_SENT_' + j.id) === today) return;
      props.setProperty('BOT_SENT_' + j.id, today);   // dulu ditandai, supaya tidak terkirim dua kali bila gagal di tengah
      var msg = j.build(now);
      if (j.id === 'PAGI') Object.keys(props.getProperties()).forEach(function (k) {   // permit / implementasi hari yang sudah lewat
        var m = k.match(/^BOT_(PERMIT|IMPL|IMPLX)_(\d{8})$/);
        if (m && m[2] < today) props.deleteProperty(k);
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

// Tanggal Today's Plan yang memakai permit / implementasi yang dikirim sekarang: sebelum 07:00 = hari ini, sesudahnya = besok.
function botPermitKey_(now, jenis) {
  return 'BOT_' + (jenis || 'PERMIT') + '_' + botWita_(botWita_(now, 'HH:mm') < '07:00' ? now : now + 864e5, 'yyyyMMdd');
}

// Daftar Implementasi otomatis untuk Today's Plan tanggal todayKey: site + aktivitas dari hari Daily Report terakhir sebelumnya.
function botPagiOtomatis_(todayKey) {
  var rows = botDailyRows_().filter(function (r) { return r.day && botDmyKey_(r.day) < todayKey; });
  var lastDay = rows.reduce(function (m, r) { var k = botDmyKey_(r.day); return k > m ? k : m; }, '');
  var sites = [], acts = {};
  rows.forEach(function (r) {
    if (botDmyKey_(r.day) !== lastDay || !r.site) return;
    if (!acts[r.site]) { acts[r.site] = []; sites.push(r.site); }
    botAktivitas_(r.act).forEach(function (a) { if (acts[r.site].indexOf(a) < 0) acts[r.site].push(a); });
  });
  return { sites: sites, acts: acts };
}

function botImplBuang_(key) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch (e) { return []; }
}

function botPagi_(now) {
  var props = PropertiesService.getScriptProperties(), todayKey = botWita_(now, 'yyyyMMdd');
  var oto = botPagiOtomatis_(todayKey), acts = oto.acts, buang = botImplBuang_('BOT_IMPLX_' + todayKey);
  // implementasi buang <kata>: site otomatis yang namanya memuat kata itu tidak dimasukkan
  var sites = oto.sites.filter(function (n) { return !buang.some(function (k) { return n.toLowerCase().indexOf(k) >= 0; }); });
  var permit = props.getProperty('BOT_PERMIT_' + todayKey) || '';
  var impl = props.getProperty('BOT_IMPL_' + todayKey) || '';   // dari perintah implementasi, ditambahkan ke daftar dari Daily Report terakhir
  var s = ['» *TODAY\'S PLAN*  : ' + botWita_(now, 'dd/MM/yyyy'),
    '» *PIC*  :  ' + (props.getProperty('BOT_PIC') || 'Rama'),
    '» *REGION*  : ' + (props.getProperty('BOT_REGION') || 'Banjarmasin'),
    BOT_GARIS_];
  if (permit) s = s.concat(['*Permit*', 'Cluster :'], permit.split('\n'), ['']);   // tanpa permit malam itu = bagian Permit tidak ada
  // Daftar dari perintah implementasi digabung ke daftar otomatis: site baru ditambah di bawah.
  // Site yang sama dengan daftar otomatis: aktivitasnya diganti dengan yang dikirim pemilik.
  // Aktivitas sebelum site pertama (mis. "- Rumpiang" yang ditampilkan WhatsApp sebagai bullet) dianggap nama site.
  var cur = null;
  impl.split('\n').forEach(function (l) {
    if (!l) return;
    if (/^- /.test(l) || !cur) {
      var nm = l.replace(/^-\s*/, '').trim(), ada = sites.filter(function (x) { return x.toLowerCase() === nm.toLowerCase(); })[0];
      cur = ada || nm;
      acts[cur] = [];
      if (!ada) sites.push(nm);
    } else {
      var a = l.replace(/^-/, '').trim();
      if (a && !acts[cur].some(function (x) { return x.toLowerCase() === a.toLowerCase(); })) acts[cur].push(a);
    }
  });
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
// "sore kirim": pengingat laporan dikirim ke grup saat itu juga (tag yang belum lapor), di luar jadwal 17:30.
function botSoreKirim_() {
  var now = Date.now(), msg = botSore_(now);
  PropertiesService.getScriptProperties().setProperty(WAQ_PREFIX_ + now + '_sore', JSON.stringify({
    t: now, n: 0, last: 0, files: [], to: '', mentions: msg.mentions || [], text: msg.text
  }));
  return 'Pengingat laporan dikirim ke grup' + (msg.mentions.length ? ', ' + msg.mentions.length + ' orang di-tag.' : '. Semua tim sudah lapor, tidak ada yang di-tag.');
}

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

// implementasi <daftar, satu per baris> | implementasi (lihat) | implementasi hapus
// Daftar dari pemilik ditambahkan ke blok Implementasi otomatis (dari Daily Report terakhir) di Today's Plan berikutnya. Site yang namanya sama dengan daftar otomatis: aktivitasnya menimpa yang dari Daily Report.
// Format sama dengan Today's Plan: bullet tanpa spasi = aktivitas ("-Pulling Cable"); bullet + spasi ("• Rumpiang", "- Rumpiang") atau baris tanpa bullet = site.
function botImplementasi_(arg) {
  var now = Date.now(), key = botPermitKey_(now, 'IMPL'), props = PropertiesService.getScriptProperties();
  var tgl = key.slice(-2) + '/' + key.slice(-4, -2) + '/' + key.slice(-8, -4), xkey = key.replace('BOT_IMPL_', 'BOT_IMPLX_'), m;
  if (/^hapus$/i.test(arg)) {
    props.deleteProperty(key); props.deleteProperty(xkey);
    return 'Tambahan dan site yang dibuang untuk Today\'s Plan ' + tgl + ' dihapus, kembali ke daftar otomatis dari Daily Report terakhir.';
  }
  // implementasi buang <kata nama site> | implementasi buang (lihat)
  if ((m = arg.match(/^buang\b\s*([\s\S]*)$/i))) {
    var buang = botImplBuang_(xkey), kata = m[1].replace(/\s+/g, ' ').trim().toLowerCase();
    var oto = botPagiOtomatis_(key.slice(-8)).sites;
    if (!kata) return buang.length ? '*Site dibuang dari Today\'s Plan ' + tgl + '*\n' + buang.map(function (k) { return '- ' + k; }).join('\n') : 'Belum ada site yang dibuang untuk ' + tgl + '. Kirim *implementasi buang* diikuti sebagian nama site.';
    var kena = oto.filter(function (n) { return n.toLowerCase().indexOf(kata) >= 0; });
    if (!kena.length) return 'Tidak ada site di daftar otomatis Today\'s Plan ' + tgl + ' yang memuat "' + kata + '". Cek dengan *pagi*.';
    if (buang.indexOf(kata) < 0) buang.push(kata);
    props.setProperty(xkey, JSON.stringify(buang));
    return 'Siap, dibuang dari Today\'s Plan ' + tgl + ':\n' + kena.map(function (n) { return '- ' + n; }).join('\n') + '\n(implementasi hapus = kembalikan semua)';
  }
  if (!arg) {
    var cur = props.getProperty(key);
    return cur ? '*Implementasi ' + tgl + '*\n' + cur : 'Belum ada tambahan implementasi untuk ' + tgl + ' (Today\'s Plan hanya memakai Daily Report terakhir). Kirim *implementasi* diikuti daftar, satu per baris.';
  }
  var lines = arg.split(/\r?\n/).map(function (l) {
    l = l.replace(/\t+/g, '  ').replace(/\s{3,}/g, '  ').trim();
    if (!l || /^implementasi\s*:?$/i.test(l)) return '';
    // "-Pulling Cable" (bullet tanpa spasi) = aktivitas; "• Rumpiang", "- Rumpiang" (bullet + spasi, daftar WhatsApp) atau tanpa bullet = site
    var b = l.match(/^[-•·*]+(\s*)/), isi = b ? l.slice(b[0].length).trim() : l;
    if (!isi) return '';
    // "-RUMPIANG RT 01" tetap site: huruf besar semua (3 kata atau lebih) atau memuat RT/RW/CLUSTER/FEEDER/FWA/UPLINK/PERUMAHAN
    var miripSite = /(^|[^a-z])(RT|RW|CLUSTER|FEEDER|SUBFEEDER|FWA|UPLINK|PERUMAHAN)([^a-z]|$)/i.test(isi) || (isi === isi.toUpperCase() && /[A-Z]/.test(isi) && isi.split(/\s+/).length >= 3);
    return b && !b[1] && !miripSite ? '-' + isi : '- ' + isi;
  }).filter(Boolean);
  if (!lines.length) return 'Daftar implementasi kosong.';
  props.setProperty(key, lines.join('\n').slice(0, 6000));
  return 'Siap, ' + lines.length + ' baris implementasi ditambahkan ke Today\'s Plan ' + tgl + ' jam 07:00, bersama daftar dari Daily Report terakhir.';
}

// tim | tim <nama> <nomor> | tim hapus <nama>
// prop: BOT_TIM (tim lapangan, di-tag jam 17:30) atau BOT_WH (tim gudang, di-tag pengingat stok / opname).
function botTimCmd_(arg, prop) {
  prop = prop || 'BOT_TIM';
  var cmd = prop === 'BOT_WH' ? 'wh' : 'tim', props = PropertiesService.getScriptProperties(), tim = prop === 'BOT_WH' ? botWhTim_() : botTim_(), m;
  if ((m = arg.match(/^hapus\s+(.+)$/i))) {
    var hit = Object.keys(tim).filter(function (n) { return n.toLowerCase() === m[1].trim().toLowerCase(); })[0];
    if (!hit) return 'Nama "' + m[1].trim() + '" tidak ada di daftar ' + cmd + '.';
    delete tim[hit];
  } else if ((m = arg.match(/^(.+?)\s+(\+?[\d\s\-]{9,})$/))) {
    var no = m[2].replace(/\D/g, '').replace(/^0/, '62');
    if (!/^62\d{8,13}$/.test(no)) return 'Nomor tidak valid. Contoh: *' + cmd + ' Nazar 081234567890*.';
    tim[m[1].trim()] = no;
  } else if (arg) {
    return 'Contoh: *' + cmd + ' Nazar 081234567890*, *' + cmd + ' hapus Nazar*, atau *' + cmd + '* untuk melihat daftar.';
  }
  if (arg) props.setProperty(prop, JSON.stringify(tim));
  var names = Object.keys(tim).sort();
  if (!names.length) return 'Daftar ' + cmd + ' kosong. Tambah dengan *' + cmd + ' <nama> <nomor WA>*.';
  return [prop === 'BOT_WH' ? '*Tim WH yang di-tag pengingat stok*' : '*Tim yang di-tag jam 17:30*'].concat(names.map(function (n) { return '- ' + n + ': ' + tim[n]; })).join('\n');
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
var BOT_STOK_MIN_DEFAULT_ = { 'cable': 3000, 'pole': 30, 'fat': 20 };   // 'cable' / 'pole' = semua jenis kabel / tiang

function botBatas_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('BOT_STOK_MIN');
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(BOT_STOK_MIN_DEFAULT_));
  } catch (e) { return JSON.parse(JSON.stringify(BOT_STOK_MIN_DEFAULT_)); }
}

// Gudang yang dicek: Script Property BOT_STOK_GUDANG (bawaan "banjarmasin"; pisahkan koma).
// Senin dan perintah "menipis" (semua = true): daftar lengkap material di bawah batas.
// Hari lain (semua = false): hanya material yang stoknya BERKURANG sejak pengecekan kemarin (BOT_STOK_KEMARIN) dan ada di
// bawah standar (batas: semua kabel 3000, tiang 30, ...). Aksesoris (BOT_AKSESORIS_) juga dianggap kurang bila stoknya
// tidak cukup 2 minggu pemakaian (BA Ambil 4 minggu terakhir / 4 x 2), walau belum diberi batas.
var BOT_AKSESORIS_ = /suspension|pole clam|dead end|slack hanger|plat belt|stopping|buldogrip|sling|galvanis|helical|stell clamp/i;

function botStokMenipis_(semua) {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('SALDO GUDANG');
  if (!sh || sh.getLastRow() < 4) return '';
  var props = PropertiesService.getScriptProperties(), batas = botBatas_();
  var keys = Object.keys(batas).sort(function (a, b) { return b.length - a.length; });   // paling spesifik dulu: 'cable 24c' sebelum 'cable'
  var gud = String(props.getProperty('BOT_STOK_GUDANG') || 'banjarmasin').toLowerCase()
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var kemarin = {};
  try { kemarin = JSON.parse(props.getProperty('BOT_STOK_KEMARIN') || '{}'); } catch (e) {}
  var avg = botPakaiMingguan_();
  var vals = sh.getRange(4, 1, sh.getLastRow() - 3, 7).getValues(), out = [], snap = {};
  vals.forEach(function (r) {
    var g = String(r[0] || '').trim(), d = String(r[1] || '').trim(), sal = cellNumber_(r[6]);
    if (!d || !gud.some(function (x) { return g.toLowerCase().indexOf(x) >= 0; })) return;
    var id = botGudangKey_(g).toLowerCase() + '|' + d.toLowerCase(), tempat = ' (' + botGudangKey_(g) + '): ';
    snap[id] = sal;
    var k = keys.filter(function (k) { return d.toLowerCase().indexOf(k) >= 0; })[0], acc = BOT_AKSESORIS_.test(d);
    var bawahBatas = k && sal < batas[k], kurang2mg = acc && avg[id] && sal < avg[id] * 2;
    if (!bawahBatas && !kurang2mg) return;
    var hari = avg[id] > 0 && sal > 0 ? Math.floor(sal / (avg[id] / 7)) : -1;   // perkiraan habis dari rata-rata pakai 4 minggu
    var why = ' (' + (bawahBatas ? 'batas ' + botNum_(batas[k]) : 'kurang dari 2 minggu') + (avg[id] ? ', pakai ' + botNum_(avg[id]) + '/minggu' : '')
      + (hari >= 0 ? ', habis ~' + (hari < 1 ? 'hari ini' : hari + ' hari lagi') : '') + ')';
    if (semua) out.push('- ' + d + tempat + (sal <= 0 ? '*HABIS* ' : '') + botNum_(sal) + why);
    else if (id in kemarin && sal < kemarin[id]) out.push('- ' + d + tempat + botNum_(kemarin[id]) + ' -> ' + (sal <= 0 ? '*HABIS* ' : '') + botNum_(sal) + why);
  });
  if (!semua) props.setProperty('BOT_STOK_KEMARIN', JSON.stringify(snap));
  if (!out.length) return '';
  return [semua ? '⚠️ *Stok di bawah batas* ' + botWita_(Date.now(), 'dd/MM/yyyy') + ' (rekap mingguan)'
    : '⚠️ *Stok berkurang, di bawah standar* ' + botWita_(Date.now(), 'dd/MM/yyyy')].concat(out).join('\n');
}

// "Gudang Banjarmasin" / "Banjarmasin" -> "Banjarmasin" (sama seperti pengelompokan SALDO GUDANG di Portal FTTH).
function botGudangKey_(g) { return String(g || '').replace(/^\s*gudang\s+/i, '').replace(/\s+/g, ' ').trim(); }

var BOT_BULAN_ = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

// BA TRANSAKSI "Tanggal BA" (Date, "24 Okt 2026" atau "24/10/2026") -> 'yyyyMMdd' atau ''.
function botBaTgl_(v) {
  if (v instanceof Date) return botWita_(v.getTime(), 'yyyyMMdd');
  var t = String(v || '').trim(), m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2);
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/);
  var b = m && BOT_BULAN_[m[2].toLowerCase()];
  return b ? m[3] + ('0' + b).slice(-2) + ('0' + m[1]).slice(-2) : '';
}

// Rata-rata pemakaian seminggu per 'gudang|designator' (huruf kecil) = BA Ambil 28 hari terakhir / 4.
function botPakaiMingguan_() {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('BA TRANSAKSI');
  if (!sh || sh.getLastRow() < 2) return {};
  var w = sh.getLastColumn(), v = sh.getRange(1, 1, sh.getLastRow(), w).getValues(), head = v[0].map(function (x) { return String(x).trim(); });
  var cJ = head.indexOf('Jenis Transaksi'), cG = head.indexOf('Gudang'), cT = head.indexOf('Tanggal BA');
  var c0 = head.indexOf('FAT'), c1 = head.indexOf('Galvanis'), dari = botWita_(Date.now() - 28 * 864e5, 'yyyyMMdd'), sum = {};
  if (cJ < 0 || cG < 0 || cT < 0 || c0 < 0 || c1 < c0) return {};
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][cJ]).trim() !== 'Ambil' || botBaTgl_(v[i][cT]) < dari) continue;
    var g = botGudangKey_(v[i][cG]).toLowerCase();
    for (var c = c0; c <= c1; c++) {
      var q = cellNumber_(v[i][c]);
      if (q) sum[g + '|' + head[c].toLowerCase()] = (sum[g + '|' + head[c].toLowerCase()] || 0) + q;
    }
  }
  Object.keys(sum).forEach(function (k) { sum[k] = Math.round(sum[k] / 4); });
  return sum;
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
  return ['*Batas stok menipis* (rekap tiap Senin 07:00)'].concat(ks.length ? ks.map(function (k) { return '- ' + k + ': ' + botNum_(b[k]); }) : ['(kosong)']).join('\n');
}

// ---- Rekap mingguan (Senin pagi, ke grup): Senin-Minggu pekan lalu. ----
function botMingguan_(now) {
  return botRekapPeriode_(now - 7 * 864e5, now - 864e5, '📊 *REKAP MINGGUAN* ' + botWita_(now - 7 * 864e5, 'dd/MM') + ' - ' + botWita_(now - 864e5, 'dd/MM/yyyy'));
}

// Rekap Daily Report dari hari 'dari' sampai hari 'sampai' (ms, WITA, dua-duanya ikut).
function botRekapPeriode_(dari, sampai, judul) {
  var endKey = botWita_(sampai, 'yyyyMMdd'), startKey = botWita_(dari, 'yyyyMMdd');
  var sh = dailySheet_(), h = sheetHeader_(sh), last = sh.getLastRow(), mats = materialCols_(h);
  var c = { t: h.idx['tanggal'], ts: h.idx['timestamp'], n: h.idx['cluster name'], s: h.idx['sow'], a: h.idx['today activity'] };
  var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, h.width).getValues().filter(function (r) {
    if (/^(saldo awal|koreksi total)/i.test(String(r[c.a] || ''))) return false;
    var d = botDmy_(r[c.t]) || botDmy_(r[c.ts]), k = d && botDmyKey_(d);
    return k && k >= startKey && k <= endKey;
  });
  var s = [judul, BOT_GARIS_];
  if (!rows.length) return s.concat(['Tidak ada Daily Report di periode ini.', BOT_GARIS_]).join('\n');
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
  if (allCols.length) s.push('', '*Total pemakaian*');
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

// ---- BA Ambil dan BA Masuk (Pembelian / Transfer) baru di BA TRANSAKSI (Portal FTTH) diteruskan ke grup. Dicek paling sering
// tiap 5 menit dari WA_PULL. Baris penyesuaian stok opname (ID BA berisi "-OPN-") tidak diteruskan. ----
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
    var jenis = String(r[ix('Jenis Transaksi')] || '').trim(), masuk = /^Masuk/.test(jenis);
    if ((jenis !== 'Ambil' && !masuk) || /-OPN-/.test(String(r[ix('ID BA')] || ''))) return;
    var items = [];
    for (var c = first; c >= 0 && c <= lastMat; c++) { var v = cellNumber_(r[c]); if (v) items.push('- ' + head[c] + ': ' + botNum_(v)); }
    var lain = String(r[ix('Material Lain')] || '').trim();
    if (lain) items.push('- ' + lain);
    var tv = r[ix('Tanggal BA')];
    if (typeof tv === 'number' && tv > 30000) tv = new Date(Date.UTC(1899, 11, 30) + tv * 864e5 - 8 * 3600000);   // nomor seri tanggal (BA Masuk dari portal)
    var tgl = tv instanceof Date ? botWita_(tv.getTime(), 'dd/MM/yyyy') : String(tv || '');
    var asal = ix('Gudang Asal') >= 0 ? String(r[ix('Gudang Asal')] || '').trim() : '';
    var sup = ix('Asal / Supplier') >= 0 ? String(r[ix('Asal / Supplier')] || '').trim() : '';
    var text = (masuk ? ['📥 *BA Masuk Material* ' + tgl,
      jenis.replace(/^Masuk - /, '') + ' ke ' + String(r[ix('Gudang')] || '-') + (asal ? ' dari ' + asal : ''),
      sup ? 'Asal / Supplier: ' + sup : '',
      r[ix('Mandor / Subcont')] ? 'Penerima: ' + r[ix('Mandor / Subcont')] : ''].filter(String)
      : ['📦 *BA Ambil Material* ' + tgl,
      'Site: ' + String(r[ix('Name')] || '-') + (r[ix('SOW')] ? ' (' + r[ix('SOW')] + ')' : ''),
      'Mandor: ' + String(r[ix('Mandor / Subcont')] || '-') + ' | ' + String(r[ix('Gudang')] || '-')])
      .concat(items.length ? items : ['- (tanpa material)']).join('\n');
    // PDF BA (dibuat Portal FTTH, kolom File ID) ikut dikirim sebagai dokumen; BA tanpa PDF hanya teks.
    var fid = ix('File ID') >= 0 ? String(r[ix('File ID')] || '').trim() : '';
    var fname = (ix('Nama File PDF') >= 0 ? String(r[ix('Nama File PDF')] || '').trim() : '') || (String(r[ix('ID BA')] || 'BA') + '.pdf');
    var t = Date.now() + i;
    props.setProperty(WAQ_PREFIX_ + t + '_ba', JSON.stringify({ t: t, n: 0, last: 0, files: fid ? [{ id: fid, name: fname }] : [], mentions: [], text: text.slice(0, 3000) }));
  });
}

// ---- Excel stok WH dari grup (!stokwh): gateway membaca file .xlsx, Apps Script membandingkan baris "Stock Gudang" dengan
// SALDO GUDANG dan mengirim usulan selisihnya ke pemilik (WA_OWNER). Baru setelah pemilik membalas "setuju", selisihnya
// dicatat sebagai satu baris "Masuk - Pembelian" per gudang di BA TRANSAKSI (seperti penyesuaian stok opname). "batal" membuang usulan.
// Usulan disimpan di Script Property BOT_STOKWH; file berikutnya dalam 12 jam digabung ke usulan yang sama (file EMR + aksesoris).
var BOT_WH_KODE_ = { 'banjarmasin': 'BJM', 'barito kuala': 'BTK' };

// Judul kolom file WH -> kunci pembanding judul kolom BA TRANSAKSI. "HDPE Ungu (40/34)" -> "hdpe40/34", "JC Inline 48 C" -> "jc48",
// "Pipa Galvanis" -> "galvanis", "Dead End 144C" -> "deadend144".
function botWhNorm_(s) {
  var k = String(s || '').toLowerCase().replace(/\b(inline|ungu|pipa)\b/g, '').replace(/[()\s]/g, '').replace(/(\d)c$/, '$1');
  return k === 'suspension' ? 'suspension48' : k;
}

function botWhGudangs_() {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('SALDO GUDANG'), saldo = {}, names = {};
  if (!sh || sh.getLastRow() < 4) return { saldo: saldo, names: names };
  sh.getRange(4, 1, sh.getLastRow() - 3, 7).getValues().forEach(function (r) {
    var g = botGudangKey_(r[0]), d = String(r[1] || '').trim();
    if (!g || !d) return;
    names[g.toLowerCase()] = names[g.toLowerCase()] || g;
    saldo[g.toLowerCase() + '|' + d] = cellNumber_(r[6]);
  });
  return { saldo: saldo, names: names };
}

// "BANJARMASIN" / ": BARITO KUALA" / "batola" -> kunci gudang di SALDO GUDANG ('banjarmasin') atau ''.
function botWhGudang_(text, names) {
  var t = String(text || '').replace(/^[\s:]+/, '').toLowerCase().replace(/^gudang\s+/, '').trim();
  t = BOT_GUDANG_ALIAS_[t] || t;
  if (!t) return '';
  return Object.keys(names).filter(function (k) { return k === t || k.indexOf(t) >= 0 || t.indexOf(k) >= 0; })[0] || '';
}

// excel = {name, sheets: [{name, rows: [[nomorBaris, [nilai...]]]}]} -> {g: {gudang: {designator: stok}}, skip: [], err: ''}
function botWhParse_(excel, argGudang, desig, names) {
  var byKey = {};
  desig.forEach(function (d) { byKey[botWhNorm_(d)] = d; });
  var out = { g: {}, skip: [], err: '' }, fileGudang = '';
  (excel.sheets || []).forEach(function (s) {
    (s.rows || []).forEach(function (r) {
      if (/^area$/i.test(String(r[1][0] || '').trim())) fileGudang = fileGudang || botWhGudang_(r[1].slice(1).filter(String)[0], names);
    });
  });
  var gudang = argGudang ? botWhGudang_(argGudang, names) : fileGudang;
  if (argGudang && !gudang) return { err: 'Gudang "' + argGudang + '" tidak ada di SALDO GUDANG.' };
  (excel.sheets || []).forEach(function (s) {
    var rows = s.rows || [], head = null, g = gudang;
    rows.forEach(function (r) {
      var v = r[1], first = String(v[0] || '').trim();
      if (/^area$/i.test(first) && !argGudang) g = botWhGudang_(v.slice(1).filter(String)[0], names) || g;
      if (v.filter(function (x) { return typeof x === 'string' && byKey[botWhNorm_(x)]; }).length >= 3) head = v;
      if (!/^stock gudang/i.test(first) || !head) return;
      if (!g) { out.err = out.err || 'Baris "Area" (nama gudang) tidak ada di file. Kirim ulang dengan caption mis. *!stokwh banjarmasin*.'; return; }
      var m = out.g[g] = out.g[g] || {};
      head.forEach(function (h, c) {
        if (typeof h !== 'string' || !h.trim() || c === 0 || v[c] === '' || v[c] == null) return;
        var d = byKey[botWhNorm_(h)], q = cellNumber_(v[c]);
        if (d) m[d] = q;
        else if (q && !/stock|tanggal|keterangan|status|surat|gdr/i.test(h)) out.skip.push(h.trim() + ' (' + botNum_(q) + ')');
      });
    });
  });
  if (!Object.keys(out.g).length && !out.err) out.err = 'Baris "Stock Gudang" atau judul kolom material tidak ditemukan di file ' + (excel.name || '') + '.';
  return out;
}

function botBaDesig_() {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('BA TRANSAKSI');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  return { sh: sh, head: head, desig: head.slice(head.indexOf('FAT'), head.indexOf('Galvanis') + 1) };
}

// Pesan usulan untuk pemilik: selisih per gudang (stok file - saldo portal). ⚠️ = berubah > 30% atau stok file minus.
function botStokWhUsulan_(pend) {
  var gs = botWhGudangs_(), out = ['📥 *Usulan stok WH* (' + pend.files.join(', ') + (pend.by.length ? '; dari ' + pend.by.join(', ') : '') + ')'], ada = 0;
  Object.keys(pend.g).forEach(function (g) {
    var lines = [], sama = 0;
    Object.keys(pend.g[g]).forEach(function (d) {
      var now = gs.saldo[g + '|' + d] || 0, to = pend.g[g][d], diff = Math.round((to - now) * 100) / 100;
      if (!diff) { sama++; return; }
      var aneh = to < 0 || (now > 0 && Math.abs(diff) / now > 0.3) || (now <= 0 && to > 0);
      lines.push('- ' + (aneh ? '⚠️ ' : '') + d + ': ' + botNum_(now) + ' -> ' + botNum_(to) + ' (' + (diff > 0 ? '+' : '') + botNum_(diff) + ')');
    });
    ada += lines.length;
    out.push('', '_' + (gs.names[g] || g) + '_');
    out = out.concat(lines.length ? lines : ['(tidak ada selisih)']);
    if (sama) out.push('Sama dengan portal: ' + sama + ' item');
  });
  if (pend.skip.length) out.push('', 'Tidak ada kolomnya di portal, dilewati: ' + pend.skip.join(', '));
  if (!ada) return { ada: 0, text: out.concat(['', 'Stok file sama dengan SALDO GUDANG, tidak ada yang perlu dicatat.']).join('\n') };
  out.push('', '⚠️ = berubah lebih dari 30%, cek dulu tanggal filenya.', 'Balas *setuju* untuk mencatat penyesuaian ke BA TRANSAKSI, atau *batal*.');
  return { ada: ada, text: out.join('\n') };
}

// p.excel dari gateway. Di grup: siapa saja di grup boleh mengirim; usulan selalu dikirim ke pemilik.
function botStokWh_(p, arg, owner) {
  if (!p.excel) return 'Kirim file Excel stok WH (.xlsx) dengan caption *!stokwh* (boleh ditambah nama gudang, mis. *!stokwh batola*).';
  var props = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ba = botBaDesig_(), gs = botWhGudangs_();
    var r = botWhParse_(p.excel, arg, ba.desig, gs.names);
    if (r.err) return '❌ ' + r.err;
    props.setProperty('BOT_STOKWH_LAST', String(Date.now()));   // untuk peringatan Excel WH basi
    props.deleteProperty('BOT_STOKWH_WARN');
    var pend = null;
    try { pend = JSON.parse(props.getProperty('BOT_STOKWH') || 'null'); } catch (e) {}
    if (!pend || Date.now() - pend.t > 12 * 3600000) pend = { t: Date.now(), files: [], by: [], g: {}, skip: [] };
    pend.t = Date.now();
    pend.files.push(String(p.excel.name || 'file.xlsx').slice(0, 60));
    var who = String(p.fromName || p.from || '').trim();
    if (who && pend.by.indexOf(who) < 0) pend.by.push(who);
    Object.keys(r.g).forEach(function (g) {
      pend.g[g] = pend.g[g] || {};
      Object.keys(r.g[g]).forEach(function (d) { pend.g[g][d] = r.g[g][d]; });
    });
    r.skip.forEach(function (s) { if (pend.skip.indexOf(s) < 0) pend.skip.push(s); });
    var pot = botWhPotongan_(p.excel, ba.desig), gPot = arg ? botWhGudang_(arg, gs.names) : Object.keys(r.g)[0];
    if (pot && gPot) {   // info saja (tidak mengubah saldo), jadi langsung disimpan tanpa persetujuan
      var pd = botPotonganData_();
      pd[gPot] = { nama: gs.names[gPot] || gPot, file: String(p.excel.name || '').slice(0, 60), tgl: botWita_(Date.now(), 'dd/MM/yyyy'), items: pot };
      props.setProperty('BOT_POTONGAN', JSON.stringify(pd));
    }
    var u = botStokWhUsulan_(pend);
    if (u.ada) props.setProperty('BOT_STOKWH', JSON.stringify(pend));
    else props.deleteProperty('BOT_STOKWH');
    var jml = Object.keys(r.g).map(function (g) { return Object.keys(r.g[g]).length + ' item ' + (gs.names[g] || g); }).join(', ');
    if (owner && p.chat !== 'group') return u.text;
    var to = botOwnerJid_();
    if (to) {
      var t = Date.now();
      props.setProperty(WAQ_PREFIX_ + t + '_wh', JSON.stringify({ t: t, n: 0, last: 0, files: [], mentions: [], to: to, text: u.text.slice(0, 3500) }));
    }
    return '📥 File stok WH diterima (' + jml + (pot ? ', potongan ' + Object.keys(pot).length + ' kabel' : '') + '). ' + (u.ada ? 'Selisihnya dikirim ke admin untuk disetujui.' : 'Sama dengan saldo portal, tidak ada yang berubah.');
  } finally {
    lock.releaseLock();
  }
}

// Sheet POTONGAN di Excel stok WH: per kabel kolom "POTONGAN KABEL 24 C" (panjang tiap potongan) dan "UTUH KABEL 24 C"
// (haspel utuh, biasanya 3.000 m). Dua baris terakhir file berisi total kolom dan total gabungan; keduanya dibuang.
// -> {'Cable 24C': {utuh: [3000], pot: [10, 17, ...]}} atau null bila sheet tidak ada.
function botWhPotongan_(excel, desig) {
  var byKey = {};
  desig.forEach(function (d) { byKey[botWhNorm_(d)] = d; });
  var sheet = (excel.sheets || []).filter(function (s) { return /potongan/i.test(s.name); })[0];
  if (!sheet) return null;
  var head = null, cols = {}, out = {};
  sheet.rows.forEach(function (r) {
    var v = r[1];
    if (!head) {
      v.forEach(function (h, c) {
        var m = typeof h === 'string' && h.match(/^\s*(potongan|utuh)\s+kabel\s+(.+)$/i);
        var d = m && byKey[botWhNorm_('Cable ' + m[2])];
        if (d) { cols[c] = { d: d, jenis: m[1].toLowerCase() === 'utuh' ? 'utuh' : 'pot' }; head = true; }
      });
      return;
    }
    Object.keys(cols).forEach(function (c) {
      var x = v[c];
      if (typeof x !== 'number') return;
      var o = out[cols[c].d] = out[cols[c].d] || { utuh: [], pot: [] };
      o[cols[c].jenis].push(x);
    });
  });
  var sum = function (a) { return a.reduce(function (t, x) { return t + x; }, 0); };
  Object.keys(out).forEach(function (d) {
    var o = out[d];
    if (o.utuh.length >= 1 && o.utuh[o.utuh.length - 1] === sum(o.utuh.slice(0, -1))) o.utuh.pop();   // total utuh
    var su = sum(o.utuh);
    if (o.pot.length >= 2 && o.pot[o.pot.length - 1] === o.pot[o.pot.length - 2] + su) o.pot.pop();   // total gabungan
    if (o.pot.length >= 1 && o.pot[o.pot.length - 1] === sum(o.pot.slice(0, -1))) o.pot.pop();   // total potongan
    o.utuh = o.utuh.filter(function (x) { return x > 0; });
    o.pot = o.pot.filter(function (x) { return x > 0; });
    if (!o.utuh.length && !o.pot.length) delete out[d];
  });
  return Object.keys(out).length ? out : null;
}

// Ringkasan potongan satu kabel: "1 haspel utuh (3.000 m) + 34 potongan 7.682 m, terpanjang 1.071 m, 2 potongan >= 500 m"
function botPotonganTeks_(o) {
  var s = [], su = o.utuh.reduce(function (t, x) { return t + x; }, 0), sp = o.pot.reduce(function (t, x) { return t + x; }, 0);
  if (o.utuh.length) s.push(o.utuh.length + ' haspel utuh (' + botNum_(su) + ' m)');
  if (o.pot.length) s.push(o.pot.length + ' potongan ' + botNum_(sp) + ' m, terpanjang ' + botNum_(Math.max.apply(null, o.pot)) + ' m'
    + ', ' + o.pot.filter(function (x) { return x >= 500; }).length + ' potongan >= 500 m');
  return s.join(' + ');
}

function botPotonganData_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('BOT_POTONGAN') || '{}'); } catch (e) { return {}; }
}

// potongan [kabel] [gudang] : rincian potongan kabel dari Excel WH terakhir.
function botPotongan_(arg) {
  var data = botPotonganData_(), gs = Object.keys(data);
  if (!gs.length) return 'Belum ada data potongan kabel. Kirim Excel WH yang berisi sheet POTONGAN dengan caption *!stokwh*.';
  var words = arg.toLowerCase().split(/\s+/).filter(Boolean).map(function (w) { return BOT_GUDANG_ALIAS_[w] || BOT_MATERIAL_ALIAS_[w] || w; });
  var out = ['✂️ *Potongan kabel*'];
  gs.forEach(function (g) {
    var x = data[g], gw = words.filter(function (w) { return g.indexOf(w) >= 0; });
    var mw = words.filter(function (w) { return g.indexOf(w) < 0 && w !== 'cable' && w !== 'kabel'; });
    if (words.length && !gw.length && !mw.length && words.some(function (w) { return w !== 'cable'; })) return;
    var lines = Object.keys(x.items).filter(function (d) { return !mw.length || mw.every(function (w) { return d.toLowerCase().indexOf(w) >= 0; }); });
    if (!lines.length) return;
    out.push('', '_' + (x.nama || g) + '_ (file ' + x.file + ', ' + x.tgl + ')');
    lines.forEach(function (d) {
      var o = x.items[d];
      out.push('*' + d + '*: ' + botPotonganTeks_(o));
      if (mw.length && o.pot.length) out.push('  ' + o.pot.slice().sort(function (a, b) { return b - a; }).map(botNum_).join(', '));
    });
  });
  return out.length > 1 ? out.join('\n') : 'Tidak ada data potongan untuk "' + arg + '".';
}

// Peringatan ke admin bila Excel stok WH (!stokwh) 7 hari tidak dikirim; diulang tiap 3 hari sampai ada file baru.
// BOT_STOKWH_LAST = waktu file terakhir terbaca (diisi botStokWh_); belum ada = mulai dihitung dari sekarang.
function botWhBasi_(now) {
  var props = PropertiesService.getScriptProperties(), last = Number(props.getProperty('BOT_STOKWH_LAST') || 0);
  if (!last) { props.setProperty('BOT_STOKWH_LAST', String(now)); return null; }
  var hari = Math.floor((now - last) / 864e5), warn = Number(props.getProperty('BOT_STOKWH_WARN') || 0);
  if (hari < 7 || (warn && now - warn < 3 * 864e5 - 3600000)) return null;
  props.setProperty('BOT_STOKWH_WARN', String(now));
  return ['⏳ *Excel stok WH belum dikirim ' + hari + ' hari*',
    'File terakhir: ' + botWita_(last, 'dd/MM/yyyy HH:mm') + ' WITA.',
    'Saldo portal, cek stok menipis dan data potongan kabel bisa sudah tidak sesuai gudang.',
    'Minta tim WH kirim Excel stok ke grup dengan caption *!stokwh*.'].join('\n');
}

// ba <site> [sow] : BA Ambil dan Pengembalian satu site dari BA TRANSAKSI (Portal FTTH) + total bersih per material.
// Semua kata harus ada di Name. Kata terakhir yang sama dengan SOW (cluster, subfeeder, ...) = filter SOW.
function botBa_(arg) {
  if (!arg) return 'Tulis nama site, mis. *ba penggalaman* atau *ba jati baru rt 04 subfeeder*.';
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('BA TRANSAKSI');
  if (!sh || sh.getLastRow() < 2) return 'BA TRANSAKSI masih kosong.';
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = vals[0].map(function (x) { return String(x).trim(); }), ix = function (n) { return head.indexOf(n); };
  var cN = ix('Name'), cS = ix('SOW'), cJ = ix('Jenis Transaksi'), first = ix('FAT'), lastMat = ix('Galvanis');
  var rows = vals.slice(1).filter(function (r) { return /^(Ambil|Pengembalian)$/.test(String(r[cJ] || '').trim()) && String(r[cN] || '').trim(); });
  var words = arg.toLowerCase().split(/\s+/).filter(Boolean), sow = '';
  var sows = rows.map(function (r) { return String(r[cS] || '').trim().toLowerCase(); });
  if (words.length > 1 && sows.indexOf(words[words.length - 1]) >= 0) sow = words.pop();
  var hit = rows.filter(function (r) {
    var n = String(r[cN]).toLowerCase();
    return words.every(function (w) { return n.indexOf(w) >= 0; }) && (!sow || String(r[cS] || '').trim().toLowerCase() === sow);
  });
  if (!hit.length) return 'Tidak ada BA Ambil / Pengembalian untuk "' + arg + '". Cek nama site dengan *site ' + words[0] + '*.';
  var names = [];
  hit.forEach(function (r) { var n = String(r[cN]).trim(); if (names.indexOf(n) < 0) names.push(n); });
  var exact = names.filter(function (n) { return n.toLowerCase() === words.join(' '); });
  if (names.length > 1 && exact.length) { names = exact; hit = hit.filter(function (r) { return String(r[cN]).trim() === exact[0]; }); }
  if (names.length > 1) return ['*' + names.length + ' site cocok*, perjelas nama site:'].concat(names.slice(0, 12).map(function (n) {
    return '- ' + n + ' (' + hit.filter(function (r) { return String(r[cN]).trim() === n; }).length + ' BA)';
  })).concat(names.length > 12 ? ['... dan ' + (names.length - 12) + ' lagi.'] : []).join('\n');
  var bulan = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
  var tglBa = function (v) {   // -> 'yyyyMMdd' untuk urutan; Date, nomor seri, "16 Okt 2026" atau "24/10/2026"
    if (typeof v === 'number' && v > 30000) v = new Date(Date.UTC(1899, 11, 30) + v * 864e5 - 8 * 3600000);
    if (v instanceof Date) return botWita_(v.getTime(), 'yyyyMMdd');
    var t = String(v || '').trim().toLowerCase(), m = t.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})/), n;
    if (m && (n = bulan.indexOf(m[2] === 'aug' ? 'agu' : m[2] === 'may' ? 'mei' : m[2] === 'oct' ? 'okt' : m[2] === 'dec' ? 'des' : m[2])) >= 0) return m[3] + ('0' + (n + 1)).slice(-2) + ('0' + m[1]).slice(-2);
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2);
    return '';
  };
  hit = hit.map(function (r) { return { r: r, k: tglBa(r[ix('Tanggal BA')]) }; })
    .sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; }).map(function (x) { x.r.k_ = x.k; return x.r; });
  var bySow = {}, order = [];
  hit.forEach(function (r) {
    var s = String(r[cS] || '').trim() || '-';
    if (!bySow[s]) { bySow[s] = { lines: [], ambil: {}, kembali: {} }; order.push(s); }
    var x = bySow[s], kembali = String(r[cJ]).trim() === 'Pengembalian', items = [];
    for (var c = first; c >= 0 && c <= lastMat; c++) {
      var v = cellNumber_(r[c]);
      if (!v) continue;
      items.push(head[c] + ' ' + botNum_(v));
      var t = kembali ? x.kembali : x.ambil;
      t[head[c]] = (t[head[c]] || 0) + v;
    }
    var lain = String(r[ix('Material Lain')] || '').trim();
    if (lain) items.push(lain);
    var no = String(r[ix('Nomor BA')] || '').trim() || String(r[ix('ID BA')] || '').trim();
    var tg = r.k_ ? r.k_.slice(6, 8) + '/' + r.k_.slice(4, 6) + '/' + r.k_.slice(2, 4) : String(r[ix('Tanggal BA')] || '-').trim();
    x.lines.push('- ' + tg + ' ' + (kembali ? '↩️ Kembali' : 'Ambil') + ' ' + no + ' (' + String(r[ix('Mandor / Subcont')] || '-').trim() + '): ' + (items.join(', ') || '-'));
  });
  var out = ['📦 *BA ' + names[0] + '*'];
  order.forEach(function (s) {
    var x = bySow[s], mats = [];
    for (var c = first; c >= 0 && c <= lastMat; c++) if (x.ambil[head[c]] || x.kembali[head[c]]) mats.push(head[c]);
    out.push('', '_' + s + '_ (' + x.lines.length + ' BA)');
    out = out.concat(x.lines.length > 15 ? ['(15 BA terakhir dari ' + x.lines.length + ')'].concat(x.lines.slice(-15)) : x.lines);
    out.push('*Total bersih (Ambil - Kembali)*');
    mats.forEach(function (m) {
      var a = x.ambil[m] || 0, k = x.kembali[m] || 0;
      out.push('- ' + m + ': ' + botNum_(a - k) + (k ? ' (ambil ' + botNum_(a) + ', kembali ' + botNum_(k) + ')' : ''));
    });
  });
  var text = out.join('\n');
  return text.length > 3400 ? text.slice(0, 3350) + '\n... (terpotong, tambahkan SOW, mis. *ba ' + words.join(' ') + ' cluster*)' : text;
}

// panduan : PDF panduan perintah untuk tim (tanpa perintah admin) dikirim lewat antrean gateway ke chat yang meminta.
// panduan lengkap : PDF dengan perintah admin dan jadwal ke admin, hanya untuk WA_OWNER dan selalu ke chat pribadi admin.
// PDF dibuat sekali dari daftar di bawah lalu disimpan di Drive (BOT_PANDUAN / BOT_PANDUAN_ADMIN); versi baru = BOT_PANDUAN_VERSI_ diganti.
// Script Property opsional BOT_PANDUAN_FILE = ID file PDF di Drive untuk memakai PDF tim buatan sendiri.
var BOT_PANDUAN_VERSI_ = '2026-10-26-9';
var BOT_PANDUAN_TIM_ = [
  ['!bantu', 'Daftar perintah singkat di WhatsApp.', '!bantu'],
  ['!panduan', 'Kirim PDF panduan tim ini ke grup.', '!panduan'],
  ['!stok [material] [gudang]', 'Saldo gudang. Tanpa kata = semua material yang ada saldonya. Kabel ikut rincian haspel utuh + potongan.', '!stok | !stok kabel | !stok tiang batola | !stok fat'],
  ['!progres &lt;site&gt;', 'Total realisasi vs Plan BOQ material satu site.', '!progres jati baru rt 04'],
  ['!rekap [kemarin | dd/mm]', 'Isi Daily Report hari itu (tanpa kata = hari ini).', '!rekap | !rekap kemarin | !rekap 24/10'],
  ['!site &lt;kata&gt;', 'Cari nama site di DATA BASE. Pakai ini kalau !progres atau !ba tidak menemukan site.', '!site jati baru'],
  ['!ba &lt;site&gt; [sow]', 'Daftar BA Ambil dan Pengembalian satu site + total bersih per material.', '!ba penggalaman | !ba jati baru rt 04 subfeeder'],
  ['!potongan [kabel] [gudang]', 'Haspel utuh + daftar panjang potongan kabel dari Excel WH terakhir.', '!potongan 24c | !potongan cable 48 batola'],
  ['Excel + caption !stokwh [gudang]', 'Kirim file Excel stok WH (.xlsx). Selisih dengan saldo portal dikirim ke admin untuk disetujui.', '!stokwh | !stokwh batola']
];
var BOT_PANDUAN_JADWAL_ = [
  ['07:00 tiap hari', "Today's Plan (permit + implementasi)"],
  ['07:05 tiap hari', 'Site aktif 3 hari tanpa laporan, tag PIC (daftar lengkap tiap Senin)'],
  ['17:30 tiap hari', 'Pengingat Daily Report, tag yang belum lapor'],
  ['Senin 07:00', 'Rekap mingguan'],
  ['Senin 08:00', 'Minta tim WH kirim Excel stok (!stokwh)'],
  ['Tanggal 1', 'Rekap bulanan + tagih file stok opname'],
  ['Tanggal 28', 'Persiapan stok opname akhir bulan'],
  ['Saat ada', 'Cek Daily Report baru (tanggal, Total > Plan); BA Ambil dan BA Masuk baru diteruskan']
];
var BOT_PANDUAN_ADMIN_ = [
  ['panduan lengkap', 'PDF panduan lengkap ini, selalu dikirim ke chat pribadi admin.', 'panduan lengkap'],
  ['catat &lt;teks&gt;', 'Simpan catatan ke sheet CATATAN BOT.', 'catat beli 2 roll cable 24C'],
  ['catatan [kata]', '10 catatan terakhir, bisa disaring kata.', 'catatan | catatan cable'],
  ['ingatkan &lt;waktu&gt; &lt;teks&gt;', 'Pengingat ke chat yang sama (maks 30 hari). Jam WITA, besok + jam, menit (m) atau jam (j).', 'ingatkan 14:30 rapat Waspang | ingatkan besok 08:00 kirim BA | ingatkan 30m telpon mandor | ingatkan 2j cek gudang'],
  ['pengingat', 'Daftar pengingat yang menunggu.', 'pengingat'],
  ['permit &lt;daftar&gt;', "Blok Permit di Today's Plan 07:00 berikutnya, satu permit per baris. permit hapus = kosongkan.", 'permit (enter) Cluster Kuin Utara (enter) Subfeeder Jati Baru | permit hapus'],
  ['implementasi &lt;daftar&gt;', "Tambah ke blok Implementasi Today's Plan 07:00 berikutnya (digabung dengan daftar dari Daily Report terakhir; site yang sama = aktivitasnya diganti). Satu baris per site (boleh pakai bullet daftar WhatsApp); baris -aktivitas (tanpa spasi) = aktivitas di bawah site, kecuali mirip nama site (huruf besar semua, atau memuat RT/CLUSTER/FEEDER/FWA). implementasi buang &lt;nama site&gt; = site dari Daily Report tidak dimasukkan. implementasi hapus = buang semua tambahan.", 'implementasi (enter) Jati Baru RT 04 (enter) -Pulling Cable Line A | implementasi buang pemurus | implementasi hapus'],
  ['tim &lt;nama&gt; &lt;nomor&gt;', 'Tim yang di-tag pengingat Daily Report 17:30. tim = lihat daftar.', 'tim Nazar 081234567890 | tim | tim hapus Nazar'],
  ['wh &lt;nama&gt; &lt;nomor&gt;', 'Tim gudang yang di-tag pengingat Excel stok dan opname.', 'wh Fahreza 081234567890 | wh | wh hapus Fahreza'],
  ['sore kirim', 'Kirim pengingat Daily Report ke grup sekarang (tag yang belum lapor).', 'sore kirim'],
  ['batas &lt;material&gt; &lt;angka&gt;', 'Standar stok menipis. batas = lihat, batas awal = standar bawaan (kabel 3000, tiang 30, FAT 20).', 'batas cable 24c 3000 | batas | batas hapus fat | batas awal'],
  ['menipis', 'Stok di bawah standar sekarang (alias stokmin).', 'menipis'],
  ['setuju / batal', 'Terima atau tolak usulan stok dari Excel WH. Hanya di chat pribadi, usulan berlaku 12 jam.', 'setuju | batal'],
  ['boq', 'Semua item yang realisasinya melebihi Plan BOQ, kecuali site yang sudah di-OK.', 'boq'],
  ['&lt;site&gt; ok', 'Site itu tidak dilaporkan lagi di BOQ melebihi Plan. boq ok = daftar, boq ok hapus = batalkan.', 'penggalaman ok | boq ok | boq ok hapus penggalaman'],
  ['mangkrak', 'Site aktif yang 3+ hari tanpa Daily Report.', 'mangkrak'],
  ['pagi / sore', "Contoh Today's Plan 07:00 / pengingat 17:30 (tidak dikirim ke grup).", 'pagi | sore'],
  ['mingguan / bulanan', 'Contoh rekap mingguan / bulanan sekarang.', 'mingguan | bulanan'],
  ['backup', 'Backup spreadsheet FTTH + Waspang ke Drive sekarang.', 'backup'],
  ['status', 'Status gateway: terakhir ambil antrean, pesan yang menunggu / gagal, jadwal hari ini, alarm email, Excel WH dan backup terakhir, cek spreadsheet FTTH/Waspang/RPM BMI + folder dokumentasi, dan jumlah error Portal Waspang hari ini.', 'status | status gateway']
];
var BOT_PANDUAN_JADWAL_ADMIN_ = [
  ['07:00 tiap hari', 'Stok yang berkurang dan di bawah standar + perkiraan habis (Senin: daftar lengkap)'],
  ['Senin 07:05', 'Item yang melebihi Plan BOQ, kecuali site yang sudah di-OK'],
  ['07:10 tiap hari', 'Peringatan bila Excel stok WH 7 hari tidak dikirim (diulang tiap 3 hari)'],
  ['Minggu 22:00', 'Backup spreadsheet ke Drive (4 terbaru disimpan)'],
  ['Saat ada', 'Usulan stok dari Excel !stokwh (balas setuju / batal); email bila laptop gateway mati']
];

function botPanduanPdf_(lengkap) {
  var td = 'border-bottom:1px solid #dde2ea;padding:5px 6px;vertical-align:top;';
  var head = '<table style="width:100%;border-collapse:collapse;"><tr style="background:#1d2433;color:#fff;"><th style="' + td + 'text-align:left;">Perintah</th>' +
    '<th style="' + td + 'text-align:left;">Fungsi</th><th style="' + td + 'text-align:left;">Contoh</th></tr>';
  var baris = function (r) {
    return '<tr><td style="' + td + 'font-weight:bold;width:28%;">' + r[0] + '</td><td style="' + td + '">' + r[1] + '</td><td style="' + td + 'font-family:monospace;width:32%;">' + r[2].split(' | ').join('<br>') + '</td></tr>';
  };
  var jadwal = function (r) { return '<tr><td style="' + td + 'font-weight:bold;width:28%;">' + r[0] + '</td><td style="' + td + '">' + r[1] + '</td></tr>'; };
  var h = ['<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:10pt;color:#1d2433;">',
    '<h2 style="margin:0;">Panduan perintah bot AdminSuper' + (lengkap ? ' (lengkap, khusus admin)' : '') + '</h2>',
    '<div style="color:#5b6475;margin-bottom:8px;">Grup REPORT BMI · versi ' + BOT_PANDUAN_VERSI_ + '</div>',
    '<div style="border:1px solid #f0c879;background:#fff6e6;padding:6px 8px;margin-bottom:8px;"><b>Cara pakai:</b> di grup setiap perintah diawali tanda <b>!</b> (tanpa ! bot diam). ',
    'Huruf besar/kecil sama saja. [ ] = boleh dikosongkan, &lt; &gt; = wajib diisi. Singkatan: kabel = cable, tiang = pole, klem = clam; ',
    'bjm = Banjarmasin, batola = Barito Kuala.' + (lengkap ? ' Perintah admin hanya dijawab dari nomor admin (WA_OWNER): di chat pribadi ke nomor bot tanpa !, atau di grup dengan ! (balasannya terbaca semua anggota).' : '') + '</div>',
    lengkap ? '<h3 style="margin:8px 0 4px;">1. Perintah untuk semua anggota grup</h3>' : '', head];
  h = h.concat(BOT_PANDUAN_TIM_.map(baris));
  if (lengkap) h = h.concat(['</table><h3 style="margin:12px 0 4px;">2. Perintah khusus admin</h3>', head], BOT_PANDUAN_ADMIN_.map(baris));
  h.push('</table><h3 style="margin:12px 0 4px;">' + (lengkap ? '3. ' : '') + 'Pesan otomatis ke grup (WITA)</h3><table style="width:100%;border-collapse:collapse;">');
  h = h.concat(BOT_PANDUAN_JADWAL_.map(jadwal));
  if (lengkap) h = h.concat(['</table><h3 style="margin:12px 0 4px;">4. Pesan otomatis ke chat pribadi admin (WITA)</h3><table style="width:100%;border-collapse:collapse;">'], BOT_PANDUAN_JADWAL_ADMIN_.map(jadwal));
  h.push('</table><p style="color:#5b6475;">Bot tidak menjawab kalau laptop gateway mati.' + (lengkap ? ' Dokumen ini khusus admin, jangan diteruskan ke grup.' : ' Pertanyaan lain hubungi admin.') + '</p>',
    '<p style="text-align:center;color:#5b6475;font-size:8.5pt;margin-top:14px;">© 2026 Rama · All Rights Reserved</p></body></html>');
  return Utilities.newBlob(h.join(''), 'text/html', 'panduan.html').getAs('application/pdf')
    .setName('Panduan Bot AdminSuper ' + (lengkap ? 'Lengkap (Admin) ' : '') + BOT_PANDUAN_VERSI_ + '.pdf');
}

function botPanduan_(p, owner, arg) {
  var lengkap = /^(lengkap|admin|full)$/i.test(arg || ''), to = p.jid || '';
  if (lengkap && !owner) return 'Panduan lengkap hanya untuk admin. Ketik *!panduan* untuk versi tim.';
  if (lengkap && p.chat === 'group') to = botOwnerJid_();   // versi admin tidak pernah dikirim ke grup
  if (!to) return 'Nomor admin (WA_OWNER) belum diatur.';
  var props = PropertiesService.getScriptProperties(), key = lengkap ? 'BOT_PANDUAN_ADMIN' : 'BOT_PANDUAN', cache = {}, file = null;
  try { cache = JSON.parse(props.getProperty(key) || '{}'); } catch (e) {}
  [lengkap ? '' : props.getProperty('BOT_PANDUAN_FILE'), cache.v === BOT_PANDUAN_VERSI_ ? cache.id : ''].some(function (id) {
    try { file = id ? DriveApp.getFileById(String(id).trim()) : null; if (file && file.isTrashed()) file = null; } catch (e) { file = null; }
    return !!file;
  });
  if (!file) {
    if (cache.id) try { DriveApp.getFileById(cache.id).setTrashed(true); } catch (e) {}   // PDF versi lama
    file = DriveApp.createFile(botPanduanPdf_(lengkap));
    props.setProperty(key, JSON.stringify({ v: BOT_PANDUAN_VERSI_, id: file.getId() }));
  }
  var t = Date.now();
  props.setProperty(WAQ_PREFIX_ + t + '_panduan', JSON.stringify({ t: t, n: 0, last: 0, to: to, mentions: [],
    files: [{ id: file.getId(), name: file.getName() }], text: '📘 Panduan perintah bot AdminSuper' + (lengkap ? ' (lengkap, khusus admin)' : '') }));
  return lengkap && p.chat === 'group' ? 'Panduan lengkap dikirim ke chat pribadi admin.' : 'Panduan PDF dikirim sebentar lagi.';
}

// "setuju": selisih dihitung ulang terhadap saldo saat ini, lalu satu baris per gudang ditulis ke BA TRANSAKSI.
function botStokWhSetuju_(who) {
  var props = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock(), pend = null;
  try { pend = JSON.parse(props.getProperty('BOT_STOKWH') || 'null'); } catch (e) {}
  if (!pend) return 'Tidak ada usulan stok WH yang menunggu.';
  lock.waitLock(30000);
  try {
    var ba = botBaDesig_(), gs = botWhGudangs_(), sh = ba.sh, head = ba.head, ix = function (n) { return head.indexOf(n); };
    var now = new Date(), tgl = botWita_(now.getTime(), 'yyyy-MM-dd').split('-');
    var serial = (Date.UTC(+tgl[0], +tgl[1] - 1, +tgl[2]) - Date.UTC(1899, 11, 30)) / 864e5;
    var ids = sh.getLastRow() > 1 ? sh.getRange(2, ix('ID BA') + 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    var done = [];
    Object.keys(pend.g).forEach(function (g) {
      var row = head.map(function () { return ''; }), n = 0;
      Object.keys(pend.g[g]).forEach(function (d) {
        var diff = Math.round((pend.g[g][d] - (gs.saldo[g + '|' + d] || 0)) * 100) / 100;
        if (diff && ix(d) >= 0) { row[ix(d)] = diff; n++; }
      });
      if (!n) return;
      var kode = BOT_WH_KODE_[g] || g.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
      var id = 'MSK-' + botWita_(now.getTime(), 'yyMMdd') + '-OPN-' + kode, base = id, seq = 1;
      while (ids.indexOf(id) >= 0) id = base + '-' + (++seq);
      ids.push(id);
      var tglTeks = botWita_(now.getTime(), 'dd/MM/yyyy');
      row[ix('Tanggal BA')] = serial;
      row[ix('Jam')] = botWita_(now.getTime(), 'HH:mm');
      row[ix('Jenis Transaksi')] = 'Masuk - Pembelian';
      row[ix('Mandor / Subcont')] = 'Tim WH';
      row[ix('Gudang')] = 'Gudang ' + (gs.names[g] || g);
      row[ix('Keterangan')] = ('Penyesuaian stok ' + tglTeks + ' dari Excel WH via WhatsApp (' + pend.files.join(', ') + ', baris Stock Gudang). Jumlah = stok file dikurangi saldo portal. Disetujui ' + who + ' ' + botWita_(now.getTime(), 'dd/MM/yyyy HH:mm') + ' WITA.').slice(0, 1000);
      row[ix('ID BA')] = id;
      row[ix('Waktu Submit')] = now;
      if (ix('Asal / Supplier') >= 0) row[ix('Asal / Supplier')] = 'Penyesuaian Stok ' + tglTeks + ' (data WH)';
      var at = sh.getLastRow() + 1;
      if (at > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
      sh.getRange(at, 1, 1, head.length).setValues([row]);
      done.push(id + ' (' + (gs.names[g] || g) + ', ' + n + ' item, baris ' + at + ')');
    });
    SpreadsheetApp.flush();
    props.deleteProperty('BOT_STOKWH');
    return done.length ? '✅ Penyesuaian dicatat di BA TRANSAKSI:\n' + done.join('\n') + '\nSALDO GUDANG langsung ikut berubah. Batalkan = hapus baris tersebut.'
      : 'Saldo portal sudah sama dengan file, tidak ada yang dicatat.';
  } finally {
    lock.releaseLock();
  }
}

function botStokWhBatal_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BOT_STOKWH')) return 'Tidak ada usulan stok WH yang menunggu.';
  props.deleteProperty('BOT_STOKWH');
  return 'Usulan stok WH dibuang, SALDO GUDANG tidak berubah.';
}

// ---- Fitur bot 26 Okt: site mangkrak, BOQ lewat 100%, pengingat WH + opname, rekap bulanan, backup mingguan. ----
// Pola "sekali saja": harian hanya yang BARU masuk daftar (state di Script Property), daftar lengkap tiap Senin.

// 'yyyyMMdd' -> jumlah hari sejak 1970 (untuk selisih hari).
function botHari_(key) { return Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)) / 864e5; }

// Nomor WA dari daftar nama (BOT_TIM / BOT_WH) yang cocok dengan teks PIC, '' bila tidak ada.
function botNoPic_(pic, tim) {
  var b = String(pic || '').toLowerCase().trim(), no = '';
  if (b) Object.keys(tim).forEach(function (n) { var a = n.toLowerCase(); if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) no = tim[n]; });
  return no;
}

// DATA BASE (Portal FTTH): nama site (huruf kecil) -> true bila semua SOW-nya RFS / Drop (pekerjaan sudah selesai).
function botSiteSelesai_() {
  var sh = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID).getSheetByName('DATA BASE'), out = {};
  if (!sh || sh.getLastRow() < 3) return out;
  var vals = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 40)).getValues(), cName = -1, cSt = -1, hr = -1;
  for (var i = 0; i < Math.min(5, vals.length); i++) {
    var head = vals[i].map(normHeader_);
    if (cName < 0 && head.indexOf('name') >= 0) { cName = head.indexOf('name'); hr = i; }
    if (cSt < 0 && head.indexOf('implementation status') >= 0) { cSt = head.indexOf('implementation status'); hr = Math.max(hr, i); }
  }
  if (cName < 0 || cSt < 0) return out;
  for (var r = hr + 1; r < vals.length; r++) {
    var n = siteName_(vals[r][cName]).toLowerCase(), st = String(vals[r][cSt] || '').trim().toLowerCase();
    if (!n) continue;
    var done = /^(rfs|drop|done|selesai)/.test(st);
    out[n] = n in out ? out[n] && done : done;
  }
  return out;
}

// 2. Site mangkrak: site yang laporan terakhirnya 3-30 hari lalu dan belum RFS / Drop di DATA BASE. Tag PIC terakhir.
function botMangkrak_(now, semua) {
  var props = PropertiesService.getScriptProperties(), today = botHari_(botWita_(now, 'yyyyMMdd'));
  var last = {}, selesai = botSiteSelesai_(), tim = botTim_();
  botDailyRows_().forEach(function (r) {
    if (!r.day || !r.site) return;
    var k = r.site.toLowerCase(), d = botHari_(botDmyKey_(r.day));
    if (!last[k] || d >= last[k].d) last[k] = { d: d, day: r.day, site: r.site, pic: r.pic || (last[k] && last[k].pic) || '' };
  });
  var lama = {}, list = [], mentions = [];
  try { lama = JSON.parse(props.getProperty('BOT_MANGKRAK') || '{}'); } catch (e) {}
  var baru = {};
  Object.keys(last).sort().forEach(function (k) {
    var x = last[k], idle = today - x.d;
    if (idle < 3 || idle > 30 || selesai[k]) return;
    baru[k] = x.day;
    if (!semua && lama[k] === x.day) return;   // sudah pernah diingatkan untuk masa diam yang sama
    var no = botNoPic_(x.pic, tim);
    if (no && mentions.indexOf(no) < 0) mentions.push(no);
    list.push('- ' + x.site + ': ' + idle + ' hari tanpa laporan (terakhir ' + x.day + (x.pic ? ', ' + (no ? '@' + no : x.pic) : '') + ')');
  });
  if (!semua || !props.getProperty('BOT_MANGKRAK')) props.setProperty('BOT_MANGKRAK', JSON.stringify(baru));
  if (!list.length) return null;
  return { text: ['🚧 *Site tanpa laporan* ' + botWita_(now, 'dd/MM/yyyy') + (semua ? ' (daftar lengkap)' : '')].concat(list)
    .concat(['Kalau site memang berhenti (menunggu izin, material, dll.), mohon kabari di grup.']).join('\n'), mentions: mentions };
}

// 8. BOQ lewat 100%: Total Daily Report > Plan MASTER BOQ, per site + SOW + item. Ke chat pribadi pemilik tiap Senin 07:05.
// Site yang sudah dibalas "<site> ok" oleh pemilik (BOT_BOQ_OK) tidak dilaporkan lagi.
function botBoqItems_() {
  var bsh = boqSheet_(), bh = sheetHeader_(bsh), bdata = boqData_(bsh, bh), bmats = materialCols_(bh);
  var dsh = dailySheet_(), dh = sheetHeader_(dsh), dmats = materialCols_(dh), last = dsh.getLastRow(), tot = {}, out = [];
  var cN = dh.idx['cluster name'], cS = dh.idx['sow'];
  if (last >= 2) dsh.getRange(2, 1, last - 1, dh.width).getValues().forEach(function (r) {
    var k = totalsClusterKey_(r[cN]) + '|' + ((cS === undefined ? '' : normSow_(r[cS])) || sowFromId_(r[cN]) || 'Cluster');
    var t = tot[k] = tot[k] || {};
    dmats.forEach(function (m) { var v = cellNumber_(r[m.idx]); if (v) t[m.col] = (t[m.col] || 0) + v; });
  });
  var bN = bh.idx['cluster name'], bS = bh.idx['sow'];
  bdata.forEach(function (row) {
    var name = siteName_(row[bN]), sow = normSow_(row[bS]) || 'Cluster', t = tot[name.toLowerCase() + '|' + sow];
    if (!name || !t) return;
    bmats.forEach(function (m) {
      var p = cellNumber_(row[m.idx]), v = t[m.col] || 0;
      if (p && v > p) out.push({ name: name, line: '- ' + name + ' (' + sow + ') ' + botMatTitle_(m.col) + ': ' + botNum_(v) + ' / plan ' + botNum_(p) + ' (' + Math.round(v / p * 100) + '%)' });
    });
  });
  return out;
}

function botBoqOkData_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('BOT_BOQ_OK') || '{}'); } catch (e) { return {}; }
}

function botBoqLewat_(now) {
  var ok = botBoqOkData_(), skip = {};
  var list = botBoqItems_().filter(function (x) { if (ok[x.name.toLowerCase()]) { skip[x.name] = 1; return false; } return true; });
  var nSkip = Object.keys(skip).length;
  if (!list.length) return null;
  return ['📐 *Realisasi melebihi Plan BOQ* ' + botWita_(now, 'dd/MM/yyyy')].concat(list.map(function (x) { return x.line; }))
    .concat(['Cek Daily Report (salah ketik?) atau perbarui Plan di BOQ Plan.',
      'Kalau sudah dicek, balas *<nama site> ok* supaya site itu tidak dilaporkan lagi.'])
    .concat(nSkip ? ['(' + nSkip + ' site sudah di-OK tidak ditampilkan; ketik *boq ok* untuk daftar)'] : []).join('\n').slice(0, 3800);
}

// "<site> ok" / "boq ok <site>" : site itu tidak dilaporkan lagi di BOQ melebihi Plan. "boq ok" = daftar, "boq ok hapus <site>" = batalkan.
function botBoqOk_(arg) {
  var props = PropertiesService.getScriptProperties(), ok = botBoqOkData_(), m;
  var simpan = function () { props.setProperty('BOT_BOQ_OK', JSON.stringify(ok)); };
  if (!arg) {
    var ks = Object.keys(ok);
    return ks.length ? ['*Site yang sudah di-OK* (tidak dilaporkan di BOQ melebihi Plan)'].concat(ks.map(function (k) { return '- ' + ok[k]; }))
      .concat(['Batalkan dengan *boq ok hapus <nama site>*.']).join('\n') : 'Belum ada site yang di-OK. Balas *<nama site> ok* setelah dicek.';
  }
  var words = function (t) { return t.toLowerCase().split(/\s+/).filter(Boolean); };
  var cocok = function (names, t) { var w = words(t); return names.filter(function (n) { return w.every(function (x) { return n.toLowerCase().indexOf(x) >= 0; }); }); };
  if ((m = arg.match(/^hapus\s+(.+)$/i))) {
    var hit0 = cocok(Object.keys(ok).map(function (k) { return ok[k]; }), m[1]);
    if (hit0.length !== 1) return hit0.length ? 'Lebih dari satu site cocok: ' + hit0.join(', ') + '. Perjelas namanya.' : 'Site "' + m[1] + '" tidak ada di daftar OK.';
    delete ok[hit0[0].toLowerCase()]; simpan();
    return 'Siap, ' + hit0[0] + ' dilaporkan lagi kalau melebihi Plan BOQ.';
  }
  var names = [];
  botBoqItems_().forEach(function (x) { if (names.indexOf(x.name) < 0) names.push(x.name); });
  var hit = cocok(names, arg), exact = hit.filter(function (n) { return n.toLowerCase() === arg.toLowerCase().trim(); });
  if (exact.length) hit = exact;
  if (!hit.length) return 'Tidak ada site yang melebihi Plan BOQ dengan nama "' + arg + '". Ketik *boq* untuk daftar.';
  if (hit.length > 1) return ['Lebih dari satu site cocok, perjelas namanya:'].concat(hit.slice(0, 10).map(function (n) { return '- ' + n; })).join('\n');
  ok[hit[0].toLowerCase()] = hit[0]; simpan();
  return '✅ ' + hit[0] + ' di-OK, tidak dilaporkan lagi di BOQ melebihi Plan. Batalkan dengan *boq ok hapus ' + hit[0].toLowerCase() + '*.';
}

// 12 + 17. Tim WH: Senin pengingat kirim Excel stok, tanggal 28 pengingat stok opname, tanggal 1 tagih file opname.
function botWhTim_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('BOT_WH') || '{}'); } catch (e) { return {}; }
}

function botWhIngat_(now) {
  var tgl = Number(botWita_(now, 'd')), senin = Number(botWita_(now, 'u')) === 1, wh = botWhTim_();
  var tag = Object.keys(wh).map(function (n) { return '@' + wh[n]; }).join(' '), mentions = Object.keys(wh).map(function (n) { return wh[n]; });
  var bulanLalu = botWita_(now - 2 * 864e5, 'MM/yyyy'), s;
  if (tgl === 1) s = ['📦 *Stok Opname ' + bulanLalu + '*', 'Mohon kirim Excel hasil stok opname akhir bulan ke grup ini dengan caption *!stokwh*.'];
  else if (tgl === 28) s = ['📦 *Persiapan Stok Opname Akhir Bulan*', 'Mohon jadwalkan opname fisik gudang di akhir bulan ini. File hasilnya dikirim tanggal 1 dengan caption *!stokwh*.'];
  else if (senin) s = ['📥 *Update Stok Gudang Mingguan*', 'Mohon kirim Excel stok gudang terbaru ke grup ini dengan caption *!stokwh* supaya saldo portal tetap sesuai.'];
  else return null;
  if (tag) s.push('', tag);
  return { text: s.join('\n'), mentions: mentions };
}

// 14. Rekap bulanan (tanggal 1 pagi, ke grup): bulan lalu. Isi sama dengan rekap mingguan.
function botBulanan_(now) {
  var d = new Date(now + 8 * 3600000), y = d.getUTCFullYear(), m = d.getUTCMonth();   // WITA
  var start = Date.UTC(y, m - 1, 1) - 8 * 3600000, end = Date.UTC(y, m, 1) - 8 * 3600000 - 1;
  return botRekapPeriode_(start, end, '📊 *REKAP BULANAN* ' + botWita_(start, 'MM/yyyy'));
}

// 19. Backup mingguan (Minggu >= 22:00 WITA): salinan spreadsheet Portal FTTH dan Waspang ke folder Drive
// "Backup Portal BMI (otomatis)" milik akun yang menjalankan script; 4 salinan terbaru per spreadsheet disimpan,
// salinan lama hasil backup ini dipindah ke Sampah. Dijalankan dari trigger cekGatewayBot, jadi tidak bergantung laptop.
function botBackup_(paksa) {
  var props = PropertiesService.getScriptProperties(), now = Date.now(), today = botWita_(now, 'yyyyMMdd');
  if (!paksa && (Number(botWita_(now, 'u')) !== 7 || botWita_(now, 'HH:mm') < '22:00' || props.getProperty('BOT_SENT_BACKUP') === today)) return '';
  props.setProperty('BOT_SENT_BACKUP', today);
  var folder = null, fid = props.getProperty('BOT_BACKUP_FOLDER');
  try { folder = fid && DriveApp.getFolderById(fid); if (folder && folder.isTrashed()) folder = null; } catch (e) { folder = null; }
  if (!folder) {
    folder = DriveApp.createFolder('Backup Portal BMI (otomatis)');
    props.setProperty('BOT_BACKUP_FOLDER', folder.getId());
  }
  var tgl = botWita_(now, 'yyyy-MM-dd'), hasil = [];
  [['FTTH', CONFIG.FTTH_SPREADSHEET_ID], ['Waspang', CONFIG.WASPANG_SPREADSHEET_ID]].forEach(function (x) {
    try {
      DriveApp.getFileById(x[1]).makeCopy('Backup ' + x[0] + ' ' + tgl, folder);
      var lama = [], it = folder.getFiles();
      while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf('Backup ' + x[0] + ' ') === 0) lama.push(f); }
      lama.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; }).slice(4).forEach(function (f) { f.setTrashed(true); });
      hasil.push('✅ ' + x[0]);
    } catch (e) { hasil.push('❌ ' + x[0] + ': ' + String(e.message || e).slice(0, 120)); }
  });
  var text = '💾 *Backup mingguan* ' + tgl + '\n' + hasil.join('\n') + '\nFolder: ' + folder.getUrl() + '\n(4 backup terbaru disimpan per spreadsheet)';
  var to = botOwnerJid_();
  if (to && !paksa) props.setProperty(WAQ_PREFIX_ + now + '_backup', JSON.stringify({ t: now, n: 0, last: 0, files: [], mentions: [], to: to, text: text }));
  return text;
}

// ---- Alarm gateway mati: trigger tiap 15 menit, email ke Script Property BOT_ALARM_EMAIL (WA ikut mati, jadi lewat email). ----
// Pasang sekali dari editor Apps Script: jalankan pasangAlarmGateway lalu setujui izin (trigger + kirim email).
// status [gateway] : ringkasan untuk admin. Balasan ini sendiri lewat laptop gateway, jadi kalau bot menjawab berarti gateway hidup;
// kalau gateway mati bot diam dan yang memberi tahu adalah email alarm (cekGatewayBot).
var BOT_JADWAL_NAMA_ = { PAGI: "Today's Plan", SORE: 'Pengingat Daily Report', STOK: 'Stok menipis (admin)', MINGGU: 'Rekap mingguan',
  BULAN: 'Rekap bulanan', MANGKRAK: 'Site tanpa laporan', BOQ: 'BOQ melebihi Plan (admin)', WH: 'Pengingat tim WH', WHBASI: 'Cek Excel WH basi (admin)' };

function botStatus_() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now();
  var today = botWita_(now, 'yyyyMMdd'), hm = botWita_(now, 'HH:mm'), lalu = function (ms) {
    var m = Math.round((now - ms) / 60000);
    return m < 60 ? m + ' menit lalu' : m < 2880 ? Math.round(m / 60) + ' jam lalu' : Math.round(m / 1440) + ' hari lalu';
  };
  var out = ['🟢 *Status gateway* ' + botWita_(now, 'dd/MM/yyyy HH:mm') + ' ' + BOT_TZ_.label];
  var seen = CacheService.getScriptCache().get('wa_pc_seen'), seenMs = seen ? Date.parse(seen) : 0;
  out.push('Gateway: hidup (balasan ini lewat laptop gateway). Mode: ' + (waPcMode_() ? 'laptop' : String(all.WA_MODE || 'bukan laptop')) +
    '. Terakhir ambil antrean: ' + (seenMs ? botWita_(seenMs, 'HH:mm') + ' (' + lalu(seenMs) + ')' : 'belum tercatat / > 6 jam'));
  var tunggu = 0, gagal = 0, nanti = 0, tertua = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(WAQ_PREFIX_) !== 0) return;
    var j; try { j = JSON.parse(all[k]); } catch (e) { return; }
    if (j.due && j.due > now) { nanti++; return; }
    tunggu++;
    if (j.n) gagal++;
    if (!tertua || j.t < tertua) tertua = j.t;
  });
  out.push('Antrean: ' + tunggu + ' pesan menunggu kirim' + (gagal ? ' (' + gagal + ' gagal, dicoba ulang; dibuang setelah ' + WAQ_MAX_TRY_ + 'x)' : '') +
    (tertua ? ', tertua ' + lalu(tertua) : '') + '; ' + nanti + ' pengingat terjadwal.');
  var jadwal = BOT_JADWAL_.filter(function (j) {
    return (!j.day || Number(botWita_(now, 'u')) === j.day) && (!j.date || Number(botWita_(now, 'd')) === j.date);
  }).sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; }).map(function (j) {
    var done = all['BOT_SENT_' + j.id] === today;
    return (done ? '✅ ' : hm >= j.until ? '❌ ' : '⏳ ') + j.from + ' ' + (BOT_JADWAL_NAMA_[j.id] || j.id) +
      (done ? '' : hm >= j.until ? ' (terlewat, gateway mati saat jadwal?)' : ' (belum)');
  });
  out.push('', '*Jadwal hari ini*' + (String(all.BOT_JADWAL || '').trim().toLowerCase() === 'off' ? ' (BOT_JADWAL=off, semua jadwal mati)' : ''));
  out = out.concat(jadwal);
  var email = String(all.BOT_ALARM_EMAIL || '').trim(), trig = null;
  try { trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'cekGatewayBot'; }); } catch (e) {}
  out.push('', '*Lainnya*',
    'Alarm email gateway mati: ' + (email ? email.replace(/^(.{3}).*@/, '$1***@') : 'BOT_ALARM_EMAIL belum diisi') +
      (trig === null ? '' : trig ? ', trigger aktif' : ', trigger BELUM dipasang (jalankan pasangAlarmGateway)') + (all.BOT_GW_DOWN === '1' ? ' (status terakhir: mati)' : ''),
    'Excel WH terakhir: ' + (Number(all.BOT_STOKWH_LAST) ? botWita_(Number(all.BOT_STOKWH_LAST), 'dd/MM/yyyy HH:mm') + ' (' + lalu(Number(all.BOT_STOKWH_LAST)) + ')' : 'belum tercatat'),
    'Backup terakhir: ' + (all.BOT_SENT_BACKUP ? all.BOT_SENT_BACKUP.replace(/^(\d{4})(\d{2})(\d{2})$/, '$3/$2/$1') : 'belum pernah'));
  var cek = wsHealth_(), err = wsErrHariIni_();
  out.push('', '*Kesehatan web & spreadsheet*');
  out = out.concat(cek.items.map(function (c) { return (c.ok ? '✅ ' : '❌ ') + c.nama + ': ' + c.info; }));
  out.push('Error Portal Waspang hari ini: ' + (err.n ? err.n + 'x' : 'tidak ada'));
  out = out.concat(err.items.slice(-3).map(function (x) { return '• ' + x.jam + ' ' + x.aksi + ': ' + x.pesan; }));
  return out.join('\n');
}

// ---- Cek kesehatan: buka tiap spreadsheet/folder yang dipakai portal dan baca data terakhirnya. ----
// -> {ok, masalah: [teks], items: [{nama, ok, info, ms}]}
function wsHealth_() {
  var items = [], now = Date.now(), cek = function (nama, fn) {
    var t0 = Date.now();
    try { items.push({ nama: nama, ok: true, info: fn(), ms: Date.now() - t0 }); }
    catch (e) { items.push({ nama: nama, ok: false, info: String(e.message || e).slice(0, 150), ms: Date.now() - t0 }); }
  };
  var lalu = function (ms) {
    var m = Math.round((now - ms) / 60000);
    return m < 60 ? m + ' menit lalu' : m < 2880 ? Math.round(m / 60) + ' jam lalu' : Math.round(m / 1440) + ' hari lalu';
  };
  var tab = function (ss, nama) { var sh = ss.getSheetByName(nama); if (!sh) throw new Error('tab ' + nama + ' tidak ada'); return sh; };
  cek('Spreadsheet Waspang', function () {
    var ss = getWaspangSpreadsheet_(), dr = tab(ss, 'DAILY REPORT EMR'), last = dr.getLastRow();
    tab(ss, 'MASTER BOQ CLUSTER');
    var t = last >= 2 ? dr.getRange(last, 1).getValue() : null, ms = t instanceof Date ? t.getTime() : 0;
    return 'Daily Report terakhir ' + (ms ? botWita_(ms, 'dd/MM HH:mm') + ' (' + lalu(ms) + ')' : 'tidak terbaca');
  });
  cek('Spreadsheet FTTH', function () {
    var ss = SpreadsheetApp.openById(CONFIG.FTTH_SPREADSHEET_ID), ba = tab(ss, 'BA TRANSAKSI'), last = ba.getLastRow();
    ['DATA BASE', 'SALDO GUDANG', CONFIG.LOG_SHEET_NAME].forEach(function (n) { tab(ss, n); });
    var r = last >= 2 ? ba.getRange(last, 3, 1, 3).getDisplayValues()[0] : null;
    return 'BA terakhir ' + (r ? r[0] + ' ' + r[1] + ' (' + r[2] + ')' : 'tidak ada');
  });
  cek('Spreadsheet RPM BMI', function () {
    var ss = SpreadsheetApp.openById(CONFIG.SARAN_SPREADSHEET_ID);
    var n = tab(ss, 'USERS').getLastRow() - 1;
    tab(ss, CONFIG.SARAN_SHEET_NAME);
    return n + ' akun login';
  });
  cek('Folder dokumentasi', function () { return DriveApp.getFolderById(CONFIG.DOKUMENTASI_FOLDER_ID).getName(); });
  var masalah = items.filter(function (c) { return !c.ok; }).map(function (c) { return c.nama + ': ' + c.info; });
  if (masalah.length) wsErrCatat_('CEK_KESEHATAN', masalah.join('; '));
  return { ok: !masalah.length, masalah: masalah, items: items };
}

// ---- Hitungan error Portal Waspang per hari (Script Property WS_ERR): jumlah + 5 pesan terakhir. ----
function wsErrCatat_(aksi, pesan) {
  try {
    var props = PropertiesService.getScriptProperties(), now = Date.now(), d = botWita_(now, 'yyyyMMdd'), j = null;
    try { j = JSON.parse(props.getProperty('WS_ERR') || 'null'); } catch (e) { j = null; }
    if (!j || j.d !== d) j = { d: d, n: 0, items: [] };
    j.n++;
    j.items.push({ jam: botWita_(now, 'HH:mm'), aksi: String(aksi || '-'), pesan: String(pesan || '').replace(/\s+/g, ' ').slice(0, 160) });
    j.items = j.items.slice(-5);
    props.setProperty('WS_ERR', JSON.stringify(j));
  } catch (e) { /* mencatat error tidak boleh membuat error baru */ }
}

function wsErrHariIni_() {
  var j = null;
  try { j = JSON.parse(PropertiesService.getScriptProperties().getProperty('WS_ERR') || 'null'); } catch (e) { j = null; }
  return j && j.d === botWita_(Date.now(), 'yyyyMMdd') ? j : { n: 0, items: [] };
}

function pasangAlarmGateway() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cekGatewayBot') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cekGatewayBot').timeBased().everyMinutes(15).create();
  cekGatewayBot();
  console.log('Alarm gateway terpasang, email ke: ' + (PropertiesService.getScriptProperties().getProperty('BOT_ALARM_EMAIL') || '(BOT_ALARM_EMAIL belum diisi)'));
}

function cekGatewayBot() {
  try { botBackup_(); } catch (e) { console.error('Backup mingguan: ' + e); }
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
// LOG HISTORY dimulai lagi dari nol setiap kali terisi lebih dari LOG_RESET_ROWS baris: baris lama disalin dulu ke
// spreadsheet LOG ARSIP (logArsip_), lalu baris terbaru dipindah ke baris 5 dan baris lainnya dikosongkan (bukan dihapus, supaya
// format dan warna baris tetap). Bila arsip gagal, log tidak dikosongkan (dicoba lagi pada catatan berikutnya).
var LOG_ARSIP_SH = 'LOG ARSIP';
function logResetIfFull_(sh, row) {
  if (row - 4 <= LOG_RESET_ROWS) return;
  if (!logArsip_(sh, row - 5)) return;
  var last = sh.getRange(row, 1, 1, 6).getValues()[0].map(function (v) {
    return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
  });
  sh.getRange(5, 1, row - 4, 6).clearContent();
  sh.getRange(5, 1, 1, 6).setValues([last]);
}

// Salin n baris log (mulai baris 5) ke bawah tab LOG ARSIP di spreadsheet terpisah "LOG ARSIP - Portal BMI"
// (milik akun pemasang), supaya arsip yang terus bertambah tidak membebani spreadsheet FTTH.
var LOG_ARSIP_SS_ID = '1PT42Ioq2FsMyDkIciHOFev4cSYirHagRkpBi4qEQNOk';
function logArsip_(sh, n) {
  if (n < 1) return true;
  try {
    var ss = SpreadsheetApp.openById(LOG_ARSIP_SS_ID), ar = ss.getSheetByName(LOG_ARSIP_SH);
    if (!ar) {
      ar = ss.insertSheet(LOG_ARSIP_SH);
      ar.getRange(1, 1, 1, 6).setValues([['Waktu', 'Sumber', 'User', 'Peran', 'Aksi', 'Detail']]).setFontWeight('bold');
      ar.setFrozenRows(1);
    }
    var vals = sh.getRange(5, 1, n, 6).getValues().map(function (r) {
      return r.map(function (v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; });
    });
    var start = ar.getLastRow() + 1;
    if (ar.getMaxRows() < start + n - 1) ar.insertRowsAfter(ar.getMaxRows(), start + n - 1 - ar.getMaxRows());
    ar.getRange(start, 1, n, 6).setValues(vals);
    ar.getRange(start, 1, n, 1).setNumberFormat('dd mmm yyyy HH:mm');
    return true;
  } catch (e) { return false; }
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
        // Hanya nama perintah (isi catatan/pengingat tidak dicatat); pesan yang tidak dijawab bot dan perintah yang
        // hanya membaca data (stok, progres, ba, status, ...) tidak dicatat, supaya LOG HISTORY tidak cepat penuh.
        if (!p.cmd || waCmdBaca_(p)) return;
        aksi = 'Perintah Bot WA';
        detail = p.cmd + (/^(catat|ingatkan|permit|implementasi|impl|tim)$/.test(p.cmd) ? '' : ' ' + String(p.text || '').replace(/^[!\/]?\S+\s*/, '')).slice(0, 80);
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

// Perintah bot yang hanya membaca/menampilkan data (tidak mengubah Script Properties, sheet atau mengirim ke grup).
function waCmdBaca_(p) {
  var arg = String(p.text || '').trim().replace(/^[!\/]?\S+\s*/, '');
  if (/^(bantu|bantuan|menu|help|\?|stok|stock|saldo|progres|progress|rekap|site|cari|catatan|pengingat|stokmin|menipis|mingguan|mangkrak|bulanan|status|potongan|ba|panduan|pagi)$/.test(p.cmd)) return true;
  if (p.cmd === 'sore') return !/^kirim$/i.test(arg);
  if (p.cmd === 'boq') return !/^ok\b/i.test(arg);
  if (/^(tim|batas|wh)$/.test(p.cmd)) return !arg;
  return false;
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
