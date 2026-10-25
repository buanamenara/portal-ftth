/**
 * Web App untuk submit file BOQ (Excel) dan otomatis mengisi sheet DRAWING, WAREHOUSE, atau OPNAME.
 * Deploy: Deploy > Manage deployments > edit deployment > Version: New version.
 */

var LOGO_FILE_NAME = 'Logo_Buana_Menara_Indonesia.png';

var USERS_SHEET_NAME_ = 'USERS';
var CODE_SEP_ = '\u0001';

var VALID_SOW = ['Cluster', 'Subfeeder', 'Uplink', 'Hubfeeder', 'Mainfeeder', 'FWA'];

// Posisi kolom (1-based) tiap sheet tujuan. Kolom designator dibaca dari baris header sheet.
var SHEET_CONFIG = {
  DRAWING:   { sheetName: 'DRAWING',   nameCol: 1, sowCol: 2, picCol: 0, firstDesigCol: 3 },
  WAREHOUSE: { sheetName: 'WAREHOUSE', nameCol: 1, sowCol: 2, picCol: 0, firstDesigCol: 3 },
  OPNAME:    { sheetName: 'OPNAME',    nameCol: 2, sowCol: 3, picCol: 1, firstDesigCol: 4 }
};

// Daftar designator dan kata kunci pencariannya di kolom Description/Item BOQ.
var DESIGNATOR_MAP = [
  { name: 'FAT',              terms: ['pole mounted outdoor type (16 ports type)'] },
  { name: 'FDT 48',           terms: ['48 cores capacity pole mounted fdt'] },
  { name: 'FDT 72',           terms: ['72 cores capacity pole mounted fdt'] },
  { name: 'Cable 24C',        terms: ['sm g.652.d-adss 24 cores', 'fo core type sm g.652.d-adss 24 cores'] },
  { name: 'Cable 36C',        terms: ['sm g.652.d-adss 36 cores', 'fo core type sm g.652.d-adss 36 cores'] },
  { name: 'Cable 48C',        terms: ['sm g.652.d-adss 48 cores', 'fo core type sm g.652.d-adss 48 cores'] },
  { name: 'Cable 96C',        terms: ['sm g.652.d-adss 96 cores', 'fo core type sm g.652.d-adss 96 cores'] },
  { name: 'Cable 144C',       terms: ['sm g.652.d-adss 144 cores', 'fo core type sm g.652.d-adss 144 cores'] },
  { name: 'Pole 7/2,5',       terms: ['tiang udara 7 meter 2.5', 'tiang udara 7 meter 2,5', 'pole / tiang udara 7 meter 2.5'] },
  { name: 'Pole 7/3',         terms: ['tiang 7 meter 3 inch', 'pengadaan tiang 7 meter 3 inch'] },
  { name: 'Pole 7/4 or 7/5',  terms: ['tiang 7 meter 4', 'tiang 7 meter 5', 'pengadaan tiang 7 meter 4'] },
  { name: 'Pole 9/4 or 9/5',  terms: ['tiang tunggal 9 meter 4', 'tiang tunggal 9 meter 5', 'pengadaan tiang tunggal 9 meter 4'] },
  { name: 'HDPE 40/34',       terms: ['hdpe 40/34'] },
  { name: 'JC 48 C',          terms: ['joint closure type in-line 48', 'fiber optic joint closure type in-line 48'] },
  { name: 'JC 144 C',         terms: ['joint closure type in-line 144', 'fiber optic joint closure type in-line 144'] },
  { name: 'Suspension 48',    terms: ['suspension clamp'] },
  { name: 'Suspension 144',   terms: ['suspension clamp'] },
  { name: 'Pole Clam',        terms: ['pole clamp single'] },
  { name: 'Dead End',         terms: ['dead end fittings', 'clamps dead end fittings'] },
  { name: 'Dead End 144',     terms: ['dead end fittings', 'clamps dead end fittings'] },
  { name: 'Slack Hanger',     terms: ['cable loop holder', 'plat strip', 'cable hanger'] },
  { name: 'Plat Belt',        terms: ['plate belt 20mm'] },
  { name: 'Stopping',         terms: ['plate belt 20mm'] },
  { name: 'Buldogrip',        terms: ['buldog grip'] },
  { name: 'Sling Wire 6mm',   terms: ['sling messenger 6', 'strand wire 6'], includeInstal: true }
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('Portal FTTH - Buana Menara Indonesia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // boleh disematkan di Google Sites (banner Google tidak muncul di dalam iframe)
}

// Logo dikirim sebagai data URI supaya file di Drive tidak perlu dibagikan publik.
// CacheService membatasi tiap kunci maksimal 100 KB; logo (data URI base64) bisa lebih besar, jadi dipecah menjadi beberapa
// kunci bernomor (di bawah 90 KB tiap potong) dan disatukan lagi saat dibaca. Kunci "<key>_n" menyimpan jumlah potongan.
var CACHE_CHUNK = 90000;
function cachePutChunked_(cache, key, value, ttl) {
  var n = Math.ceil(value.length / CACHE_CHUNK), obj = {};
  for (var i = 0; i < n; i++) obj[key + '_' + i] = value.slice(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK);
  obj[key + '_n'] = String(n);
  cache.putAll(obj, ttl);
}
function cacheGetChunked_(cache, key) {
  var n = Number(cache.get(key + '_n'));
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '_' + i);
  var got = cache.getAll(keys), parts = [];
  for (var j = 0; j < n; j++) { var v = got[key + '_' + j]; if (v == null) return null; parts.push(v); }
  return parts.join('');
}
function getLogoDataUri_() {
  var cache = CacheService.getScriptCache(), key = 'logoDataUri_id1';
  var cached = cacheGetChunked_(cache, key);
  if (cached) return cached;
  var blob;
  try { blob = DriveApp.getFileById('1MgNk82btJrRILpiaPNv3CHL4eJuJGeWB').getBlob(); } catch (e) { return ''; }
  var uri = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  try { cachePutChunked_(cache, key, uri, 21600); } catch (e) { /* gagal menyimpan cache (mis. logo sangat besar); tetap dikirim tanpa cache */ }
  return uri;
}

// Satu baris BOQ yang di sheet punya 2 kolom.
// mode 'choose' (mis. "Suspension clamp" -> Suspension 48 / Suspension 144): jumlahnya masuk ke SATU kolom pilihan pengunggah.
// mode 'split' ("Plate belt 20mm" -> Plat Belt + Stopping): BOQ tidak punya baris Stopping, jadi aturannya
// (ditetapkan pemilik sheet): Plat Belt = 50% dari Plate belt BOQ (dibulatkan ke atas), Stopping = 100% volume Plate belt BOQ.
var BOQ_CHOICES = [
  { label: 'Suspension clamp', options: ['Suspension 48', 'Suspension 144'], mode: 'choose', bigger: 'Suspension 144' },
  { label: 'Dead end fittings', options: ['Dead End', 'Dead End 144'], mode: 'choose', bigger: 'Dead End 144' },
  { label: 'Plate belt 20mm', options: ['Plat Belt', 'Stopping'], mode: 'split', ratios: { 'Plat Belt': 0.5, 'Stopping': 1 } }
];

function boqDesigNames_() {
  return DESIGNATOR_MAP.map(function (d) { return d.name; });
}

function boqCheckTarget_(siteName, keterangan, target) {
  siteName = (siteName || '').trim();
  if (!siteName) throw new Error('Nama Site tidak boleh kosong.');
  if (VALID_SOW.indexOf(keterangan) === -1) {
    throw new Error('Keterangan harus salah satu dari: ' + VALID_SOW.join(', ') + '.');
  }
  target = target || 'DRAWING';
  if (!SHEET_CONFIG[target]) throw new Error('Tujuan sheet harus DRAWING, WAREHOUSE, atau OPNAME.');
  return { siteName: siteName, target: target };
}

/**
 * Langkah 1 (dari Form.html): baca BOQ dan kembalikan baris-baris untuk diperiksa pengunggah.
 * Belum menulis apa pun ke spreadsheet.
 */
function extractBoq_(base64Data, fileName) {
  var results = boqReadResults_(base64Data, fileName);
  var groupOf = {};
  BOQ_CHOICES.forEach(function (g) { g.options.forEach(function (n) { groupOf[n] = g; }); });
  // Kabel/JC 144 core di BOQ = tanda bahwa asesoris yang dipakai varian 144
  var is144 = (results['Cable 144C'] || 0) > 0 || (results['JC 144 C'] || 0) > 0;
  var rows = [];
  var zero = [];
  var done = {};
  DESIGNATOR_MAP.forEach(function (d) {
    var g = groupOf[d.name];
    if (!g) {
      if (results[d.name]) rows.push({ label: d.name, desig: d.name, qty: results[d.name], options: [], note: '' });
      else zero.push(d.name);
      return;
    }
    if (done[g.label]) return;
    done[g.label] = true;
    var total = results[g.options[0]] || 0;
    if (!total) { g.options.forEach(function (n) { zero.push(n); }); return; }
    if (g.mode === 'choose') {
      rows.push({
        label: g.label, desig: (is144 && g.bigger) ? g.bigger : g.options[0], qty: total, options: g.options,
        note: 'Di BOQ hanya ada satu baris "' + g.label + '", sedangkan sheet punya 2 kolom (' + g.options.join(' / ') + '). Pilih kolom yang sesuai.'
      });
    } else {
      g.options.forEach(function (n) {
        var ratio = g.ratios[n];
        var qty = ratio === 1 ? total : Math.ceil(total * ratio);
        var pct = Math.round(ratio * 100);
        rows.push({
          label: g.label + ' × ' + pct + '%', desig: n, qty: qty, options: [], rule: true,
          note: n + ' = ' + pct + '% dari "' + g.label + '" di BOQ (' + total + ')' + (ratio === 1 ? '' : ', dibulatkan ke atas') + '.'
        });
      });
    }
  });
  return { rows: rows, zero: zero, designators: boqDesigNames_(), heavy144: is144 };
}

/**
 * Langkah 2: tulis baris-baris yang sudah diperiksa ke sheet tujuan.
 * rows = [{ desig, qty }]; Designator yang tidak ada di rows ditulis 0 (seperti sebelumnya).
 * target = 'DRAWING', 'WAREHOUSE', atau 'OPNAME'. pic hanya dipakai untuk OPNAME (opsional).
 */
function saveBoq_(siteName, keterangan, target, pic, rows) {
  var chk = boqCheckTarget_(siteName, keterangan, target);
  siteName = chk.siteName;
  target = chk.target;
  pic = (pic || '').trim();

  var names = boqDesigNames_();
  var values = {};
  names.forEach(function (n) { values[n] = 0; });
  (rows || []).forEach(function (r, i) {
    var q = Number(String(r.qty == null ? '' : r.qty).replace(',', '.'));
    if (!(q > 0)) return;
    var d = String(r.desig || '').trim();
    if (names.indexOf(d) === -1) throw new Error('Baris ' + (i + 1) + ': pilih kolom Designator dulu.');
    values[d] += q;
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var written = writeToSheet_(target, siteName, keterangan, values, pic);
    return { siteName: siteName, keterangan: keterangan, target: target, values: values,
      skipped: written.skipped, row: written.row, created: written.created };
  } finally {
    lock.releaseLock();
  }
}

// Cek baris tujuan tanpa menulis: dipakai form untuk memberi tahu "baris N diperbarui" dan menampilkan nilai lama.
function checkBoqRow_(target, siteName, keterangan) {
  var chk = boqCheckTarget_(siteName, keterangan, target);
  var loc = boqLocate_(chk.target, chk.siteName, keterangan);
  var out = { found: !loc.created, row: loc.sheetRow, existing: {}, filled: 0, pic: '' };
  if (loc.created) return out;
  var rowVals = loc.allValues[loc.targetRow];
  DESIGNATOR_MAP.forEach(function (d) {
    var ci = loc.colMap[normalizeText_(d.name)];
    if (ci === undefined) return;
    var v = rowVals[ci];
    if (v !== '' && v !== null) { out.existing[d.name] = v; if (Number(v) !== 0) out.filled++; }
  });
  if (loc.cfg.picCol) out.pic = String(rowVals[loc.cfg.picCol - 1] || '');
  return out;
}

// Daftar PIC yang diizinkan (validasi data kolom PIC di OPNAME); kosong bila tidak ada daftar.
function getBoqPicOptions_() {
  try {
    var cfg = SHEET_CONFIG.OPNAME;
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.sheetName);
    if (!sh || !cfg.picCol) return [];
    var v = sh.getRange(1, cfg.nameCol, Math.min(sh.getLastRow(), 15), 1).getValues();
    for (var r = 0; r < v.length; r++) {
      var h = normalizeText_(v[r][0]);
      if (h === 'name' || h === 'site name') {
        var dv = sh.getRange(r + 3, cfg.picCol).getDataValidation();
        if (dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
          return (dv.getCriteriaValues()[0] || []).map(String);
        }
        return [];
      }
    }
  } catch (e) { /* tanpa daftar: form memakai isian bebas */ }
  return [];
}

// Konversi xlsx BOQ ke Google Sheet sementara lalu jumlahkan tiap Designator.
function boqReadResults_(base64Data, fileName) {
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, MimeType.MICROSOFT_EXCEL, fileName || 'upload.xlsx');

  // Convert xlsx -> Google Sheet sementara supaya bisa dibaca isinya
  var tempFile = Drive.Files.create({
    name: 'TEMP_BOQ_IMPORT_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_SHEETS
  }, blob);

  var results;
  try {
    var tempSs = SpreadsheetApp.openById(tempFile.id);
    var boqSheet = findBoqSheet_(tempSs);
    if (!boqSheet) {
      throw new Error('Tidak ditemukan sheet yang namanya diawali "BoQ" di file ini. ' +
        'Pastikan file BOQ-nya sesuai template (contoh nama sheet: "BoQ NRO Cluster" / "BoQ NRO Mainfeeder").');
    }
    results = extractValues_(boqSheet);
  } finally {
    try { Drive.Files.remove(tempFile.id); } catch (e) { /* abaikan gagal hapus temp file */ }
  }
  return results;
}

function findBoqSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (/^boq/i.test(sheets[i].getName().trim())) return sheets[i];
  }
  return null;
}

function extractValues_(sheet) {
  var data = sheet.getDataRange().getValues();
  var results = {};
  DESIGNATOR_MAP.forEach(function (d) {
    results[d.name] = sumMatchingRows_(data, d.terms, d.includeInstal);
  });
  return results;
}

// Cari baris di kolom B (Description/Item) yang mengandung salah satu kata kunci `terms`,
// tidak termasuk baris "Instal.../Pemasangan..." (kecuali includeInstal=true),
// lalu jumlahkan nilai di kolom D (Material Qty). Tiap baris dihitung SEKALI walau cocok dengan beberapa
// kata kunci (mis. "FO core type SM G.652.D-ADSS 24 cores" cocok dengan 2 kata kunci Cable 24C; dulu terhitung dobel).
function sumMatchingRows_(data, terms, includeInstal) {
  var total = 0;
  var termsLower = [].concat(terms).map(function (t) { return String(t).toLowerCase(); });
  for (var r = 0; r < data.length; r++) {
    var desc = String(data[r][1] || '').toLowerCase().trim();
    if (!termsLower.some(function (t) { return desc.indexOf(t) !== -1; })) continue;
    if (!includeInstal) {
      if (desc.indexOf('instal') === 0 || desc.indexOf('pemasangan') === 0) continue;
    }
    total += toNumber_(data[r][3]);
  }
  return total;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // Format Indonesia: "." pemisah ribuan, "," desimal
    var cleaned = v.replace(/\./g, '').replace(',', '.').trim();
    var n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// Karakter tak terlihat (mis. U+2060 di awal nama site hasil salin-tempel) dibuang supaya pencocokan nama tidak meleset.
function normalizeText_(s) {
  return String(s == null ? '' : s).replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Cari baris tujuan (Name + SOW cocok) tanpa menulis. created=true bila belum ada dan akan dibuat di baris baru.
function boqLocate_(target, siteName, keterangan) {
  var cfg = SHEET_CONFIG[target];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Sheet "' + cfg.sheetName + '" tidak ditemukan.');

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var nameIdx = cfg.nameCol - 1;
  var sowIdx = cfg.sowCol - 1;

  // Cari baris header (kolom Name berisi "Name" / "Site Name")
  var headerRow = -1;
  for (var r = 0; r < allValues.length; r++) {
    var h = normalizeText_(allValues[r][nameIdx]);
    if (h === 'name' || h === 'site name') { headerRow = r; break; }
  }
  if (headerRow === -1) throw new Error('Header "Name" tidak ditemukan di sheet ' + cfg.sheetName + '.');

  var headers = allValues[headerRow];
  // Kolom SOW dan awal kolom Designator dibaca dari judul kolom (bukan hanya dari SHEET_CONFIG), jadi kolom yang disisipkan
  // sebelum SOW (mis. "Status" di WAREHOUSE) tidak membuat SOW/Designator tertulis di kolom yang salah.
  for (var cs = 0; cs < headers.length; cs++) {
    if (/^(type\s*)?sow$/.test(normalizeText_(headers[cs]))) { sowIdx = cs; break; }
  }
  var firstDesig = Math.max(cfg.firstDesigCol, sowIdx + 2);
  cfg = { sheetName: cfg.sheetName, nameCol: cfg.nameCol, sowCol: sowIdx + 1, picCol: cfg.picCol, firstDesigCol: firstDesig };
  var colMap = {};
  for (var c = firstDesig - 1; c < headers.length; c++) {
    var key = normalizeText_(headers[c]);
    if (key) colMap[key] = c;
  }

  // Data dimulai 2 baris setelah header (ada 1 baris pemisah hitam di antaranya)
  var dataStart = headerRow + 2;

  var wantName = normalizeText_(siteName);
  var wantSow = normalizeText_(keterangan);
  var targetRow = -1;
  for (var r2 = dataStart; r2 < allValues.length; r2++) {
    var rowSite = normalizeText_(allValues[r2][nameIdx]);
    if (rowSite === '') continue;
    if (rowSite === wantName && normalizeText_(allValues[r2][sowIdx]) === wantSow) { targetRow = r2; break; }
  }

  var created = false;
  if (targetRow === -1) {
    created = true;
    var r3 = dataStart;
    while (r3 < allValues.length && normalizeText_(allValues[r3][nameIdx]) !== '') r3++;
    targetRow = r3;
  }
  return { cfg: cfg, sheet: sheet, allValues: allValues, colMap: colMap, targetRow: targetRow, sheetRow: targetRow + 1, created: created };
}

// Menulis hasil ke sheet tujuan. Mengembalikan { skipped: designator yang tidak ada di header sheet, row, created }.
function writeToSheet_(target, siteName, keterangan, results, pic) {
  var loc = boqLocate_(target, siteName, keterangan);
  var cfg = loc.cfg;
  var sheet = loc.sheet;
  var colMap = loc.colMap;
  var created = loc.created;
  var sheetRow = loc.sheetRow;
  // Name/SOW hanya ditulis untuk baris baru. Di WAREHOUSE dan OPNAME kolom Name berisi rumus ke DRAWING
  // (=DRAWING!$A..), jadi baris yang sudah ada tidak boleh ditimpa.
  if (created) {
    sheet.getRange(sheetRow, cfg.nameCol).setValue(siteName);
    sheet.getRange(sheetRow, cfg.sowCol).setValue(keterangan);
  }
  if (cfg.picCol && pic) sheet.getRange(sheetRow, cfg.picCol).setValue(pic);

  var skipped = [];
  DESIGNATOR_MAP.forEach(function (d) {
    var colIdx = colMap[normalizeText_(d.name)];
    if (colIdx === undefined) { skipped.push(d.name); return; }
    sheet.getRange(sheetRow, colIdx + 1).setValue(results[d.name]);
  });
  return { skipped: skipped, row: sheetRow, created: created };
}

// =====================================================================
// BA Material (Warehouse - BA Transaksi)
// Alur: extractBa_ (OCR + baca isi form + petakan ke kolom Designator) -> pengguna cek -> saveBa_
//       (simpan PDF ke Drive + isi satu baris di sheet BA TRANSAKSI, format matriks seperti WAREHOUSE)
// =====================================================================
var BA_FOLDER_NAME = 'BA Material BMI';
var BA_SHEET_NAME = 'BA TRANSAKSI';
var BA_FIXED = ['Name', 'SOW', 'Tanggal BA', 'Jam', 'Jenis Transaksi', 'Mandor / Subcont', 'Gudang'];
var BA_TAIL = ['Material Lain', 'Keterangan', 'ID BA', 'Waktu Submit', 'Nama File PDF', 'Link PDF', 'File ID', 'Nomor BA', 'Gudang Asal', 'Asal / Supplier'];
var BA_COL = { NAME: 1, SOW: 2, TGL: 3, JAM: 4, JENIS: 5, MANDOR: 6, GUDANG: 7, FIRSTDESIG: 8 };
var BA_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8,
  sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
var BA_SOW_ALIAS = { cl: 'Cluster', sf: 'Subfeeder', hf: 'Hubfeeder', mf: 'Mainfeeder', ul: 'Uplink' };

// Nama kolom Designator = header sheet WAREHOUSE (kolom setelah SOW pada baris yang kolom A-nya "Name").
// Cadangan bila WAREHOUSE tidak terbaca: DESIGNATOR_MAP.
function baWarehouseDesigs_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WAREHOUSE');
  if (sh && sh.getLastColumn() > 2) {
    var vals = sh.getRange(1, 1, Math.min(sh.getLastRow(), 15), sh.getLastColumn()).getValues();
    for (var r = 0; r < vals.length; r++) {
      if (normalizeText_(vals[r][0]) === 'name') {
        var out = [], from = 2;
        for (var cs = 0; cs < vals[r].length; cs++) { if (/^(type\s*)?sow$/.test(normalizeText_(vals[r][cs]))) { from = cs + 1; break; } }   // Designator dimulai setelah kolom SOW (ada kolom Status di antaranya)
        for (var c = from; c < vals[r].length; c++) {
          var h = baClean_(vals[r][c]);
          if (!h) { if (out.length) break; else continue; }
          out.push(h);
        }
        if (out.length) return out;
      }
    }
  }
  return DESIGNATOR_MAP.map(function (d) { return d.name; });
}

function baHeaders_() {
  return BA_FIXED.concat(baWarehouseDesigs_(), BA_TAIL);
}

// Susunan kolom sheet BA TRANSAKSI dibaca dari header-nya sendiri, jadi kolom Designator baru
// (disisipkan sebelum "Material Lain") otomatis ikut terpakai.
function baLayout_(sh) {
  var headers = sh ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(baClean_) : baHeaders_();
  var idxLain = headers.indexOf('Material Lain');
  var col = function (name) { return headers.indexOf(name) + 1; };
  return {
    headers: headers,
    desig: headers.slice(BA_COL.FIRSTDESIG - 1, idxLain),
    LAIN: idxLain + 1, KET: col('Keterangan'), ID: col('ID BA'), SUBMIT: col('Waktu Submit'),
    FILE: col('Nama File PDF'), LINK: col('Link PDF'), FILEID: col('File ID'), NOMOR: col('Nomor BA'), TOTAL: headers.length
  };
}

// Daftar Designator yang dipakai untuk pemetaan Nama Material.
function baDesigNames_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BA_SHEET_NAME);
  return baLayout_(sh).desig;
}

// Folder khusus BA Material di Drive supaya tidak tercampur dengan file lain.
function getBaFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BA_FOLDER_ID');
  if (id) {
    try {
      var saved = DriveApp.getFolderById(id);
      if (!saved.isTrashed()) return saved;
    } catch (e) { /* folder hilang, buat ulang */ }
  }
  var it = DriveApp.getFoldersByName(BA_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BA_FOLDER_NAME);
  props.setProperty('BA_FOLDER_ID', folder.getId());
  return folder;
}

function getOrCreateSubFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Sheet khusus BA TRANSAKSI (dibuat otomatis kalau belum ada, diletakkan setelah WAREHOUSE).
function getBaSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BA_SHEET_NAME);
  if (sh) return sh;
  var wh = ss.getSheetByName('WAREHOUSE');
  sh = ss.insertSheet(BA_SHEET_NAME, wh ? wh.getIndex() : ss.getNumSheets());
  var headers = baHeaders_();
  var n = headers.length;
  var C = baLayout_(null);
  var nDesig = C.desig.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  sh.getRange(1, 1, 1, n).setValues([headers])
    .setBackground('#1A1A1A').setFontColor('#C9972C').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 44);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.setTabColor('#C9972C');

  var fixedW = [300, 90, 105, 60, 115, 150, 140];
  fixedW.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setColumnWidths(BA_COL.FIRSTDESIG, nDesig, 78);
  sh.setColumnWidth(C.LAIN, 220);
  sh.setColumnWidth(C.KET, 200);
  sh.setColumnWidth(C.ID, 120);
  sh.setColumnWidth(C.SUBMIT, 150);
  sh.setColumnWidth(C.FILE, 280);
  sh.setColumnWidth(C.LINK, 90);
  sh.setColumnWidth(C.FILEID, 60);

  var rows = sh.getMaxRows() - 1;
  sh.getRange(2, BA_COL.TGL, rows, 1).setNumberFormat('dd mmm yyyy').setHorizontalAlignment('center');
  sh.getRange(2, BA_COL.JAM, rows, 1).setNumberFormat('@').setHorizontalAlignment('center');
  sh.getRange(2, BA_COL.JENIS, rows, 1).setHorizontalAlignment('center');
  sh.getRange(2, BA_COL.FIRSTDESIG, rows, nDesig).setHorizontalAlignment('center');
  sh.getRange(2, C.SUBMIT, rows, 1).setNumberFormat('dd mmm yyyy HH:mm');
  sh.getRange(1, 1, sh.getMaxRows(), n).createFilter();
  sh.hideColumns(C.FILEID);
  return sh;
}

function setupBaSheet_() {
  var sh = getBaSheet_();
  Logger.log('Sheet ' + sh.getName() + ' siap (' + sh.getLastColumn() + ' kolom); folder ' + getBaFolder_().getName());
}

// ---------- Ekstraksi ----------
function baClean_(s) {
  return String(s == null ? '' : s).replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').replace(/\u00A0/g, ' ').replace(/[ ]+/g, ' ').trim();
}

// Ubah dokumen hasil OCR menjadi daftar baris (sel tabel digabung dengan TAB) + daftar tabel.
function baDocToStruct_(document) {
  var body = document.getBody();
  var lines = [];
  var tables = [];
  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    var type = el.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      el.asParagraph().getText().split(/[\r\n\u000b]+/).forEach(function (l) {
        l = baClean_(l);
        if (l) lines.push(l);
      });
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      var lt = baClean_(el.asListItem().getText());
      if (lt) lines.push(lt);
    } else if (type === DocumentApp.ElementType.TABLE) {
      var t = el.asTable();
      var rows = [];
      for (var r = 0; r < t.getNumRows(); r++) {
        var row = t.getRow(r);
        var cells = [];
        for (var c = 0; c < row.getNumCells(); c++) cells.push(baClean_(row.getCell(c).getText()));
        rows.push(cells);
        var joined = cells.filter(function (x) { return x; }).join('\t');
        if (joined) lines.push(joined);
      }
      tables.push(rows);
    }
  }
  return { lines: lines, tables: tables };
}

function baQty_(s) {
  var t = String(s == null ? '' : s).replace(/\s+/g, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  var m = t.match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function baNormalizeSow_(raw) {
  var t = normalizeText_(raw);
  if (!t) return '';
  for (var i = 0; i < VALID_SOW.length; i++) {
    if (normalizeText_(VALID_SOW[i]) === t) return VALID_SOW[i];
  }
  if (BA_SOW_ALIAS[t]) return BA_SOW_ALIAS[t];
  return baClean_(raw);
}

// Satu kata SOW (Cluster, CL, ...) atau daftar pilihan seperti "Cluster / Subfeeder / Mainfeeder".
function baSowParts_(v) {
  return String(v == null ? '' : v).split(/\s*[\/,]\s*|\s+atau\s+/i).map(function (x) { return baClean_(x); }).filter(Boolean);
}

function baIsSingleSow_(t0) {
  var t = normalizeText_(t0);
  if (BA_SOW_ALIAS[t]) return true;
  for (var i = 0; i < VALID_SOW.length; i++) { if (normalizeText_(VALID_SOW[i]) === t) return true; }
  return false;
}

function baIsSowWord_(v) {
  var parts = baSowParts_(v);
  return parts.length > 0 && parts.every(baIsSingleSow_);
}

// Header form: dukung dua pola hasil OCR.
//  (a) "Label : nilai" dalam satu baris (PDF digital)
//  (b) blok label dulu, lalu blok nilai berawalan ":" (PDF hasil scan; urutan blok bisa berubah)
var BA_FIELD_LABELS = [
  { k: 'mandor', re: /^mandor\b/i },
  { k: 'gudang', re: /^gudang\b/i },
  { k: 'jenis', re: /^jenis\s*pekerjaan\b/i },
  { k: 'site', re: /^site\b/i }
];

function baHeaderFields_(flat) {
  var res = { mandor: '', gudang: '', jenis: '', site: '' };
  var tblIdx = -1;
  for (var t = 0; t < flat.length; t++) {
    if (/^(no|nama\s*material)\b/i.test(flat[t])) { tblIdx = t; break; }
  }
  var zone = flat.slice(0, tblIdx > -1 ? tblIdx : flat.length);
  var pendingLabels = [];
  var values = [];
  var started = false;
  var lastKind = '';   // 'field' | 'value' | 'label'
  var lastField = '';
  zone.forEach(function (l) {
    var lab = null;
    for (var i = 0; i < BA_FIELD_LABELS.length; i++) {
      if (BA_FIELD_LABELS[i].re.test(l)) { lab = BA_FIELD_LABELS[i]; break; }
    }
    if (lab) {
      started = true;
      var m = l.match(/[:;]\s*(.*)$/);
      if (m && m[1]) { res[lab.k] = baClean_(m[1]); lastKind = 'field'; lastField = lab.k; }
      else { pendingLabels.push(lab.k); lastKind = 'label'; }
      return;
    }
    if (/^[:;]/.test(l)) {
      started = true;
      // OCR kadang menyatukan dua nilai dalam satu baris: ": Gudang Banjarmasin :Subfeeder"
      l.replace(/^[:;]\s*/, '').split(/\s+[:;]\s*/).forEach(function (part) {
        part = baClean_(part);
        if (part) values.push(part);
      });
      lastKind = 'value';
      return;
    }
    if (started && !/^\*/.test(l)) {
      // lanjutan baris sebelumnya (mis. nama site yang terpotong ke baris kedua)
      if (lastKind === 'value' && values.length) values[values.length - 1] += ' ' + l;
      else if (lastKind === 'field' && lastField) res[lastField] += ' ' + l;
    }
  });

  // Nilai hasil scan dipasangkan menurut isinya (urutan blok OCR tidak tetap):
  // gudang = diawali "Gudang", SOW = kata SOW, site = paling cocok dengan DATA BASE, sisanya mandor.
  var need = pendingLabels.filter(function (k) { return !res[k]; });
  if (need.length) {
    var pool = values.slice();
    var take = function (pred) {
      var ix = -1;
      for (var q = 0; q < pool.length; q++) { if (pred(pool[q])) { ix = q; break; } }
      return ix > -1 ? pool.splice(ix, 1)[0] : '';
    };
    if (need.indexOf('gudang') > -1) res.gudang = take(function (v) { return /^gudang\b/i.test(v); });
    if (need.indexOf('jenis') > -1) res.jenis = take(function (v) { return baIsSowWord_(v); });
    if (need.indexOf('site') > -1 && pool.length) {
      var bestIdx = 0, bestScore = -1;
      pool.forEach(function (v, q) {
        var m2 = baMatchSite_(v, res.jenis);
        var sc = (m2 ? m2.score : 0) * 1000 + v.length;   // cocok DATA BASE lebih dulu, lalu yang lebih panjang
        if (sc > bestScore) { bestScore = sc; bestIdx = q; }
      });
      res.site = pool.splice(bestIdx, 1)[0];
    }
    if (need.indexOf('mandor') > -1 && pool.length) res.mandor = pool.shift();
  }
  return res;
}

function baItemsFromTables_(tables) {
  for (var t = 0; t < tables.length; t++) {
    var rows = tables[t];
    var h = -1;
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].some(function (c) { return /nama\s*material/i.test(c); })) { h = r; break; }
    }
    if (h === -1) continue;
    var hdr = rows[h];
    var nameCol = -1, qtyCol = -1, ketCol = -1;
    hdr.forEach(function (c, i) {
      if (nameCol === -1 && /nama\s*material/i.test(c)) nameCol = i;
      else if (qtyCol === -1 && /(ambil|kembali)/i.test(c)) qtyCol = i;   // utamakan kolom Ambil/Kembali (bukan Awal/Selisih)
      else if (ketCol === -1 && /keterangan/i.test(c)) ketCol = i;
    });
    if (qtyCol === -1) {
      hdr.forEach(function (c, i) { if (qtyCol === -1 && i !== nameCol && /(qty|jumlah)/i.test(c)) qtyCol = i; });
    }
    if (nameCol === -1 || qtyCol === -1) continue;
    var items = [];
    for (var k = h + 1; k < rows.length; k++) {
      var row = rows[k];
      if (row.length === hdr.length - 1 && /^no\b/i.test(hdr[0]) && !/^\d{1,3}\s*[.)]?$/.test(row[0] || '')) row = [''].concat(row);   // sel nomor baris kosong tidak ikut terbaca
      var nama = baStripNo_(baClean_(row[nameCol]));
      var qty = baQty_(row[qtyCol]);
      if (nama && qty !== null) items.push({ nama: nama, qty: qty, ket: ketCol > -1 ? baClean_(row[ketCol]) : '' });
    }
    return { items: items, header: hdr.join(' '), warnings: [] };
  }
  return null;
}

// Baris yang isinya hanya judul kolom (No, Nama Material, Awal/Kembali/Selisih (Qty), Keterangan, dst.)
function baIsHeaderLine_(l) {
  var t = l.replace(/nama\s*material|awal|kembali|selisih|ambil|pengembalian|keterangan|jumlah|\bqty\b|\bno\b|[()]/ig, ' ');
  return t.replace(/[\s:.\-]/g, '') === '';
}

// Template Pengembalian tidak punya nomor baris: "NAMA  qty" (kadang 2-3 angka: Awal, Kembali, Selisih).
// Angka di ujung baris dipisahkan dari nama; nama yang berakhiran angka (mis. "Suspension 48") dijaga
// dengan memilih jumlah angka paling sedikit yang membuat nama dikenali sebagai Designator.
function baNamedRows_(lines) {
  var items = [];
  var warnings = [];
  lines.forEach(function (l) {
    var words = l.split(' ').filter(Boolean);
    var nums = 0;
    while (nums < 3 && nums < words.length - 1 && /^\d+(?:[.,]\d+)?$/.test(words[words.length - 1 - nums])) nums++;
    if (nums === 0) {
      if (/[A-Za-z]/.test(l)) warnings.push('Baris "' + l + '" tidak punya Qty, dilewati.');
      return;
    }
    var k = 0;
    for (var c = 1; c <= nums; c++) {
      if (baMapDesignator_(words.slice(0, words.length - c).join(' '))) { k = c; break; }
    }
    if (!k) k = 1;
    var name = baStripNo_(words.slice(0, words.length - k).join(' '));
    var vals = words.slice(words.length - k).map(baQty_);
    var qty = vals.length > 1 ? vals[1] : vals[0];   // dengan 2-3 angka, kolom tengah = Kembali
    if (vals.length > 1) warnings.push('"' + name + '": ada ' + vals.length + ' angka (' + vals.join(', ') + '), diambil ' + qty + ' sebagai Qty, periksa.');
    items.push({ nama: name, qty: qty, ket: '' });
  });
  return { items: items, warnings: warnings };
}

// Tabel hasil OCR scan sering terbaca sebagai arus baris: nomor, nama, qty bercampur urutannya.
// Nomor baris dikenali karena berurutan (1,2,3...) dan diikuti nama; angka lain = Qty (urut sesuai baris).
// Bila tidak ada nomor baris (template Pengembalian), dipakai baNamedRows_.
function baItemsFromStream_(flat) {
  var start = -1;
  for (var i = 0; i < flat.length; i++) {
    if (/nama\s*material/i.test(flat[i])) { start = i; break; }
  }
  if (start === -1) return { items: [], header: '', warnings: [] };
  var end = flat.length;
  for (var e = start + 1; e < flat.length; e++) {
    if (/^(dibuat|diperiksa|disetujui|diterima|dikembalikan)\b/i.test(flat[e])) { end = e; break; }
  }
  var zone = flat.slice(start, end);
  var headerText = zone.join(' ');

  var toks = [];
  var cleanedLines = [];
  zone.forEach(function (l) {
    var cleaned = l.replace(/\bnama\s*material\b/ig, ' ').replace(/\bketerangan\b/ig, ' ')
      .replace(/\b(ambil|pengembalian|awal|kembali|selisih)\s*\(?\s*qty\s*\)?/ig, ' ')
      .replace(/^\s*\(?\s*qty\s*\)?\s*$/i, ' ').replace(/^\s*no\b/i, ' ');
    cleaned = baClean_(cleaned);
    if (!cleaned || baIsHeaderLine_(cleaned)) return;
    cleanedLines.push(cleaned);
    var m1 = cleaned.match(/^(\d{1,2})[.)]?\s+(.*[A-Za-z].*?)\s+(\d+(?:[.,]\d+)?)$/);
    var m2 = cleaned.match(/^(\d{1,2})[.)]?\s+(.*[A-Za-z].*)$/);
    if (m1) { toks.push(m1[1], m1[2], m1[3]); }
    else if (m2) { toks.push(m2[1], m2[2]); }
    else toks.push(cleaned);
  });

  var isNum = function (x) { return /^\d+(?:[.,]\d+)?$/.test(x); };
  var isText = function (x) { return /[A-Za-z]/.test(x); };
  var rows = [];
  var warnings = [];
  var expected = 1;
  var idx = 0;
  while (idx < toks.length) {
    var tk = toks[idx];
    var nx = toks[idx + 1];
    if (isNum(tk)) {
      var v = parseInt(tk, 10);
      if (v === expected && nx !== undefined && isText(nx)) {
        rows.push({ no: v, nama: nx, qty: null, ket: '' });
        expected++;
        idx += 2;
        continue;
      }
      if (v === expected && nx !== undefined && isNum(nx) && parseInt(nx, 10) === expected + 1) {
        // deretan nomor baris kosong (mis. 9,10,...,17): dilewati; blok Qty bisa muncul sesudahnya
        while (idx < toks.length && isNum(toks[idx]) && parseInt(toks[idx], 10) === expected && expected <= 40) { expected++; idx++; }
        continue;
      }
      var pend = null;
      for (var p = 0; p < rows.length; p++) { if (rows[p].qty === null) { pend = rows[p]; break; } }
      if (pend) pend.qty = baQty_(tk);
      idx++;
    } else {
      var last = null;
      for (var q = rows.length - 1; q >= 0; q--) { if (rows[q].qty !== null) { last = rows[q]; break; } }
      if (last && !last.ket) { last.ket = tk; warnings.push('Teks "' + tk + '" dianggap Keterangan untuk "' + last.nama + '", periksa.'); }
      else warnings.push('Teks "' + tk + '" tidak bisa dipasangkan ke baris material, periksa.');
      idx++;
    }
  }
  var items = [];
  rows.forEach(function (r) {
    if (r.qty === null) warnings.push('Qty untuk "' + r.nama + '" tidak terbaca.');
    else items.push({ nama: r.nama, qty: r.qty, ket: r.ket });
  });

  if (!items.length) {
    var named = baNamedRows_(cleanedLines);
    if (named.items.length) return { items: named.items, header: headerText, warnings: named.warnings };
  }
  return { items: items, header: headerText, warnings: warnings };
}

function baDetectJenis_(flat, headerText) {
  for (var i = 0; i < flat.length; i++) {
    var m = flat[i].match(/(pengambilan|pengembalian)\s+material/i);
    if (m) return /pengembalian/i.test(m[1]) ? 'Pengembalian' : 'Ambil';
  }
  var probe = headerText || '';
  if (/pengembalian\s*\(?\s*qty/i.test(probe)) return 'Pengembalian';
  if (/ambil\s*\(?\s*qty/i.test(probe)) return 'Ambil';
  return '';
}

// ---------- Pemetaan Nama Material -> kolom Designator ----------
function baNormMat_(s) {
  return normalizeText_(s).replace(/,/g, '.').replace(/[()"]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Mengembalikan nama Designator (string), daftar kandidat (array, bila ambigu), atau '' bila tidak dikenal.
function baMapDesignator_(nama) {
  var names = baDesigNames_();
  var d = baMapRaw_(nama, names);
  if (Array.isArray(d)) {
    d = d.filter(function (x) { return names.indexOf(x) > -1; });
    return d.length > 1 ? d : (d[0] || '');
  }
  return names.indexOf(d) > -1 ? d : '';
}

function baMapRaw_(nama, names) {
  var t = baNormMat_(nama);
  if (!t) return '';
  var i, m;
  for (i = 0; i < names.length; i++) {
    if (baNormMat_(names[i]) === t) return names[i];
  }
  m = t.match(/^(?:cable|kabel)\s*(?:adss\s*|fo\s*|sm\s*)*(24|36|48|96|144)\s*c?(?:\s*cores?)?$/);
  if (m) return 'Cable ' + m[1] + 'C';
  m = t.match(/^(?:tiang|pole)\s*(?:udara\s*|tunggal\s*)?(7|9)\s*(?:m|meter)?\s*[\/x-]?\s*(2\.5|3|4|5)(?:\s*inch)?$/);
  if (m) {
    if (m[1] === '7' && m[2] === '2.5') return 'Pole 7/2,5';
    if (m[1] === '7' && m[2] === '3') return 'Pole 7/3';
    if (m[1] === '7' && (m[2] === '4' || m[2] === '5')) return 'Pole 7/4 or 7/5';
    if (m[1] === '9' && (m[2] === '4' || m[2] === '5')) return 'Pole 9/4 or 9/5';
  }
  m = t.match(/^(?:jc|joint\s*closure)\s*(?:in-?line\s*)?(48|144)\s*c?$/);
  if (m) return m[1] === '48' ? 'JC 48 C' : 'JC 144 C';
  m = t.match(/^suspension(?:\s*clamp)?\s*(48|144)?$/);
  if (m) return m[1] ? 'Suspension ' + m[1] : ['Suspension 48', 'Suspension 144'];
  m = t.match(/^dead\s*end(?:\s*fittings?)?\s*(144)?$/);
  if (m) return m[1] ? 'Dead End 144' : ['Dead End', 'Dead End 144'];
  if (/^pole\s*clam[p]?(?:\s*single)?$/.test(t)) return 'Pole Clam';
  if (/^(?:slack\s*hanger|cable\s*loop\s*holder)$/.test(t)) return 'Slack Hanger';
  if (/^(?:plat|plate)\s*belt(?:\s*20\s*mm)?$/.test(t)) return 'Plat Belt';
  if (/^(?:buldog|bulldog)\s*grip$/.test(t)) return 'Buldogrip';
  if (/^sling\s*(?:wire|messenger)(?:\s*6\s*(?:mm)?)?$/.test(t)) return 'Sling Wire 6mm';
  if (/^(?:pipa\s*)?hdpe(?:\s*(?:duct|pipe))?(?:\s*40\s*\/?\s*34)?$/.test(t)) return 'HDPE 40/34';
  if (/^(?:pipa\s*)?galvanis(?:ed)?$/.test(t) || /^galvanized$/.test(t)) return 'Galvanis';
  return '';
}

// Petakan semua item; bila ambigu (mis. "Suspension" tanpa 48/144) pilih 144 hanya jika BA memuat material 144.
function baMapItems_(items) {
  var has144 = items.some(function (it) { return /144/.test(baNormMat_(it.nama)); });
  var warnings = [];
  items.forEach(function (it) {
    var d = baMapDesignator_(it.nama);
    it.desig = '';
    if (Array.isArray(d)) {
      it.desig = has144 ? d[1] : d[0];
      warnings.push('"' + it.nama + '" bisa masuk ' + d.join(' atau ') + '; dipilih ' + it.desig + ', periksa.');
    } else if (d) {
      it.desig = d;
    } else {
      warnings.push('Material "' + it.nama + '" belum punya kolom Designator (akan masuk kolom Material Lain kecuali kolom dipilih manual).');
    }
  });
  return warnings;
}

// Tanggal BA: "29 Juli 2026", "29/juli/2026", "29-07-2026", "29.07.26", tulisan bulan lengkap atau singkat. '' bila tidak terbaca.
function baParseDate_(text) {
  var SEP = '\\s*[\\/\\-. ,]\\s*';
  var res = [
    new RegExp('\\b(?:date|tanggal|tgl)\\b\\s*[:;.]?\\s*(\\d{1,2})' + SEP + '([a-z]{3,9})' + SEP + '(\\d{2,4})', 'i'),
    new RegExp('\\b(?:date|tanggal|tgl)\\b\\s*[:;.]?\\s*(\\d{1,2})' + SEP + '(\\d{1,2})' + SEP + '(\\d{2,4})', 'i'),
    new RegExp('(\\d{1,2})' + SEP + '(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|ags|sep|okt|nov|des)[a-z]*' + SEP + '(\\d{4})', 'i')
  ];
  for (var i = 0; i < res.length; i++) {
    var m = String(text || '').match(res[i]);
    if (!m) continue;
    var day = parseInt(m[1], 10), mon = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : BA_MONTHS[String(m[2]).toLowerCase().slice(0, 3)], yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    if (mon && mon >= 1 && mon <= 12 && day >= 1 && day <= 31 && yr >= 2000 && yr <= 2100) return yr + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
  }
  return '';
}

// Nomor baris yang ikut terbaca di depan nama material ("1. JC 48", "2) FAT") dibuang.
function baStripNo_(s) {
  return String(s == null ? '' : s).replace(/^\s*\d{1,3}\s*[.)]\s*/, '').trim();
}

function baParse_(struct) {
  // "*(Harus diisi lengkap)" kadang menempel di depan baris Mandor -> dibuang
  var flat = struct.lines.map(function (l) {
    return l.replace(/\t+/g, ' ').replace(/\*\s*\(\s*harus\s*diisi\s*lengkap\s*\)/ig, ' ').replace(/ +/g, ' ').trim();
  }).filter(Boolean);
  var fullText = flat.join('\n');
  var out = { jenis: '', tanggal: '', jam: '', mandor: '', gudang: '', sow: '', sowOptions: [], sowFromDb: false, site: '', items: [], warnings: [] };

  var hf = baHeaderFields_(flat);
  out.mandor = hf.mandor;
  out.gudang = hf.gudang;
  out.site = baClean_(hf.site);

  // Jenis Pekerjaan: kadang berisi beberapa pilihan ("Cluster / Subfeeder / Mainfeeder", yang tidak berlaku dicoret;
  // coretan tidak terbaca OCR). Bila begitu, SOW diambil dari DATA BASE kalau site-nya cocok, kalau tidak dikosongkan.
  var sowParts = baSowParts_(hf.jenis).map(baNormalizeSow_).filter(function (x) { return VALID_SOW.indexOf(x) > -1; });
  var multiSow = sowParts.length > 1 ? sowParts : null;
  if (multiSow) {
    out.sowOptions = multiSow;
    var ms = baMatchSite_(out.site, '');
    if (ms && ms.score >= 0.9 && multiSow.indexOf(ms.sow) > -1) { out.sow = ms.sow; out.sowFromDb = true; }
    else out.warnings.push('Jenis Pekerjaan di BA berisi beberapa pilihan (' + multiSow.join(' / ') + '); biasanya yang tidak berlaku dicoret. Pilih SOW yang benar.');
  } else {
    out.sow = baNormalizeSow_(hf.jenis);
  }

  // Tanggal & jam
  out.tanggal = baParseDate_(fullText);
  var tm = fullText.match(/\btime\b\s*[:;]?\s*(\d{1,2})\s*[:.]\s*(\d{2})/i);
  if (tm) out.jam = ('0' + tm[1]).slice(-2) + ':' + tm[2];

  // Item material: tabel dokumen dulu (PDF digital), cadangan arus baris (hasil scan)
  var fromTable = baItemsFromTables_(struct.tables);
  var res = (fromTable && fromTable.items.length) ? fromTable : baItemsFromStream_(flat);
  out.items = res.items;
  res.warnings.forEach(function (w) { out.warnings.push(w); });
  baMapItems_(out.items).forEach(function (w) { out.warnings.push(w); });
  out.jenis = baDetectJenis_(flat, res.header);

  if (!out.site) out.warnings.push('Site tidak terbaca, isi manual.');
  if (!out.tanggal) out.warnings.push('Tanggal tidak terbaca, isi manual.');
  if (!out.jenis) out.warnings.push('Jenis transaksi (Ambil/Pengembalian) tidak terbaca, pilih manual.');
  if (!out.items.length) out.warnings.push('Tabel material tidak terbaca, tambahkan baris secara manual.');
  out.raw = struct.lines.slice(0, 120).join('\n');
  return out;
}

// ---------- Pencocokan nama Site dengan DATA BASE ----------
function baReadDbSites_(region) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DATA BASE');
  if (!sh || sh.getLastRow() < 4) return [];
  var vals = sh.getRange(4, 1, sh.getLastRow() - 3, 3).getValues(); // A: Region, B: Name, C: SOW
  var out = [], rk = region ? regionKey_(region) : '';
  vals.forEach(function (r) {
    var n = baClean_(r[1]);
    if (!n) return;
    if (rk && regionKey_(r[0]) !== rk) return;          // kode region: hanya site region itu
    out.push({ name: n, sow: baClean_(r[2]), region: baClean_(r[0]) });
  });
  return out;
}

function baSiteKey_(s) {
  var t = normalizeText_(s).replace(/[^a-z0-9 ]/g, ' ');
  t = t.replace(/^(cluster|cl|sub\s*feeder|sf|uplink|hub\s*feeder|hf|main\s*feeder|mf|fwa)\s+/, '');
  return t.replace(/\s+/g, ' ').trim();
}

function baMatchSite_(site, sow, scope) {
  var key = baSiteKey_(site);
  if (!key) return null;
  var ta = key.split(' ');
  var best = null;
  baReadDbSites_(scope).forEach(function (d) {
    var k = baSiteKey_(d.name);
    var score;
    if (k === key) score = 1;
    else if (k.length >= 8 && (k.indexOf(key) > -1 || key.indexOf(k) > -1)) score = 0.9;
    else {
      var tb = k.split(' ');
      var inter = ta.filter(function (x) { return tb.indexOf(x) > -1; }).length;
      var union = ta.length + tb.length - inter;
      score = union ? inter / union : 0;
    }
    if (sow && d.sow && normalizeText_(d.sow) === normalizeText_(sow)) score += 0.05;
    if (!best || score > best.score) best = { name: d.name, sow: d.sow, score: score };
  });
  return best;
}

// Daftar nama site untuk isian otomatis di form (unik).
function getBaSiteNames_(scope) {
  var seen = {};
  var out = [];
  baReadDbSites_(scope).forEach(function (d) {
    if (!seen[d.name]) { seen[d.name] = true; out.push(d.name); }
  });
  return out;
}

// Dipanggil dari form: baca PDF (OCR) dan kembalikan hasil ekstraksi untuk dicek pengguna.
function extractBa_(base64Data, fileName, scope) {
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, MimeType.PDF, fileName || 'ba.pdf');
  var doc = Drive.Files.create({ name: 'TEMP_BA_' + new Date().getTime(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'id' });
  var parsed;
  try {
    parsed = baParse_(baDocToStruct_(DocumentApp.openById(doc.id)));
  } finally {
    try { Drive.Files.remove(doc.id); } catch (e) { /* abaikan gagal hapus temp file */ }
  }
  return baFinishParsed_(parsed, scope);
}

// Langkah akhir pembacaan BA: cocokkan site dengan DATA BASE, tambahkan daftar Designator dan nama site untuk form.
function baFinishParsed_(parsed, scope) {
  var match = baMatchSite_(parsed.site, parsed.sow, scope);
  parsed.match = match && match.score >= 0.6 ? { name: match.name, sow: match.sow, score: Math.round(match.score * 100) } : null;
  // Rekap BA dan REKON mencocokkan Site + SOW; SOW di BA yang berbeda dari DATA BASE membuat BA tidak menempel ke site itu.
  if (parsed.match && parsed.sow && parsed.match.sow && !parsed.sowFromDb && normalizeText_(parsed.match.sow) !== normalizeText_(parsed.sow)) {
    parsed.warnings.push('SOW di BA ("' + parsed.sow + '") berbeda dengan SOW site ini di DATA BASE ("' + parsed.match.sow + '"). Rekap BA dan REKON mencocokkan Site + SOW; pilih SOW yang sama dengan DATA BASE bila BA ini memang untuk site tersebut.');
  }
  parsed.designators = baDesigNames_();
  parsed.siteNames = getBaSiteNames_(scope);   // dikirim bersama hasil supaya daftar nama & petunjuk pasti terisi
  return parsed;
}

// Dipanggil dari form untuk PDF beranotasi: teks sudah dibaca di browser (pdf.js) dan dikirim sebagai baris + tabel, tanpa OCR.
function extractBaText_(struct, scope) {
  struct = struct || {};
  var lines = (Array.isArray(struct.lines) ? struct.lines : []).slice(0, 400)
    .map(function (l) { return baClean_(String(l == null ? '' : l).slice(0, 400)); }).filter(Boolean);
  var tables = (Array.isArray(struct.tables) ? struct.tables : []).slice(0, 5).map(function (t) {
    return (Array.isArray(t) ? t : []).slice(0, 200).map(function (r) {
      return (Array.isArray(r) ? r : []).slice(0, 12).map(function (c) { return baClean_(String(c == null ? '' : c).slice(0, 200)); });
    });
  });
  return baFinishParsed_(baParse_({ lines: lines, tables: tables }), scope);
}

// ---------- Simpan ----------
// data: { jenis, tanggal 'yyyy-MM-dd', jam, name, sow, mandor, gudang, items:[{nama, qty, ket, desig}], force }
function saveBa_(base64Data, fileName, data) {
  data = data || {};
  var name = baClean_(data.name);
  if (!name) throw new Error('Name (Site) tidak boleh kosong.');
  if (data.jenis !== 'Ambil' && data.jenis !== 'Pengembalian') throw new Error('Pilih jenis transaksi: Ambil atau Pengembalian.');
  var dm = String(data.tanggal || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) throw new Error('Tanggal BA belum diisi.');
  var desigNames = baDesigNames_();
  var items = (data.items || []).map(function (it) {
    var d = baClean_(it.desig);
    return { nama: baClean_(it.nama), qty: baQty_(it.qty), ket: baClean_(it.ket), desig: desigNames.indexOf(d) > -1 ? d : '' };
  }).filter(function (it) { return it.nama && it.qty !== null && it.qty > 0; });
  if (!items.length) throw new Error('Minimal satu material dengan Qty lebih dari 0.');
  var sow = baNormalizeSow_(data.sow);
  if (VALID_SOW.indexOf(sow) === -1) {
    throw new Error('SOW wajib dipilih (' + VALID_SOW.join(', ') + '). Bila di BA ada beberapa pilihan Jenis Pekerjaan, pilih yang tidak dicoret.');
  }
  var jam = baClean_(data.jam);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var tglSerial = (Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - Date.UTC(1899, 11, 30)) / 86400000;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getBaSheet_();
    var C = baLayout_(sh);

    // Cegah BA ganda (Site + SOW + tanggal + jam + jenis sama; BA otomatis Electric dan CW dibedakan lewat tipe di Nomor BA)
    if (!data.force) {
      var dupId = baFindDup_(sh, C, tz, name, sow, data.jenis, jam, data.tanggal, data.nomor ? String(data.nomor).split('/')[1] : '',
        data.nomor ? baItemsSig_(baClean_(data.mandor), items) : '');
      if (dupId) return { duplicate: true, idBa: dupId };
    }

    // Simpan PDF utuh di folder khusus (subfolder per bulan BA)
    // ID unik: beberapa BA yang disimpan beruntun bisa jatuh di detik yang sama (multi-upload)
    var idBa = 'BA-' + Utilities.formatDate(new Date(), tz, 'yyMMdd-HHmmss');
    if (sh.getLastRow() > 1) {
      var usedIds = sh.getRange(2, C.ID, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
      var baseId = idBa, seq = 1;
      while (usedIds.indexOf(idBa) > -1) { seq++; idBa = baseId + '-' + seq; }
    }
    var bytes = Utilities.base64Decode(base64Data);
    var safeName = String(fileName || 'BA.pdf').replace(/[\\\/:*?"<>|]/g, '_');
    var blob = Utilities.newBlob(bytes, MimeType.PDF, idBa + ' - ' + safeName);
    var folder = getOrCreateSubFolder_(getBaFolder_(), dm[1] + '-' + dm[2]);
    var file = folder.createFile(blob);

    // Satu baris per BA: Qty dijumlahkan ke kolom Designator yang sesuai
    var row = new Array(C.TOTAL);
    for (var c = 0; c < row.length; c++) row[c] = '';
    row[BA_COL.NAME - 1] = name;
    row[BA_COL.SOW - 1] = sow;
    row[BA_COL.TGL - 1] = tglSerial;
    row[BA_COL.JAM - 1] = jam;
    row[BA_COL.JENIS - 1] = data.jenis;
    row[BA_COL.MANDOR - 1] = baClean_(data.mandor);
    row[BA_COL.GUDANG - 1] = baClean_(data.gudang);
    var sums = {};
    var lain = [];
    var kets = [];
    items.forEach(function (it) {
      if (it.desig) sums[it.desig] = (sums[it.desig] || 0) + it.qty;
      else lain.push(it.nama + ' x' + it.qty);
      if (it.ket) kets.push(it.nama + ': ' + it.ket);
    });
    C.desig.forEach(function (nm, k) {
      if (sums[nm] !== undefined) row[BA_COL.FIRSTDESIG - 1 + k] = sums[nm];
    });
    row[C.LAIN - 1] = lain.join('; ');
    row[C.KET - 1] = kets.join('; ');
    row[C.ID - 1] = idBa;
    row[C.SUBMIT - 1] = new Date();
    row[C.FILE - 1] = safeName;
    row[C.FILEID - 1] = file.getId();
    if (C.NOMOR && data.nomor) row[C.NOMOR - 1] = String(data.nomor);

    var startRow = Math.max(sh.getLastRow(), 1) + 1;
    if (startRow > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
    sh.getRange(startRow, 1, 1, C.TOTAL).setValues([row]);
    sh.getRange(startRow, C.LINK).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText('Buka PDF').setLinkUrl(file.getUrl()).build());
    SpreadsheetApp.flush();

    var known = baReadDbSites_().some(function (d) { return normalizeText_(d.name) === normalizeText_(name); });
    return { ok: true, idBa: idBa, rows: items.length, name: name, sow: sow, jenis: data.jenis, inDb: known,
      lain: lain.length, fileUrl: file.getUrl(), fileId: file.getId() };
  } finally {
    lock.releaseLock();
  }
}

// Cari BA yang sama (Site + SOW + Jenis + jam + tanggal); mengembalikan ID BA-nya atau ''. Tipe Nomor BA (OUT-CW / OUT-EL / IN)
// dibandingkan hanya bila BA baru dan BA lama sama-sama punya Nomor BA, jadi Ambil CW dan Ambil Electric untuk site dan jam yang
// sama boleh dibuat berdampingan, sedangkan BA hasil upload (tanpa nomor) tetap dianggap sama.
function baFindDup_(sh, C, tz, name, sow, jenis, jam, tanggal, tipe, sig) {
  if (sh.getLastRow() < 2) return '';
  var ex = sh.getRange(2, 1, sh.getLastRow() - 1, C.TOTAL).getValues();
  for (var i = 0; i < ex.length; i++) {
    var exTgl = ex[i][BA_COL.TGL - 1], exNo = C.NOMOR ? String(ex[i][C.NOMOR - 1] || '') : '';
    var same = normalizeText_(ex[i][BA_COL.NAME - 1]) === normalizeText_(name) &&
      baNormalizeSow_(ex[i][BA_COL.SOW - 1]) === sow &&
      ex[i][BA_COL.JENIS - 1] === jenis &&
      String(ex[i][BA_COL.JAM - 1]) === jam &&
      exTgl instanceof Date && Utilities.formatDate(exTgl, tz, 'yyyy-MM-dd') === tanggal &&
      (!tipe || !exNo || exNo.split('/')[1] === tipe) &&
      (!sig || baRowSig_(ex[i], C) === sig);
    if (same) return String(ex[i][C.ID - 1]);
  }
  return '';
}

// Tanda isi BA (mandor + material + Qty). Untuk BA otomatis, BA di site, SOW, dan jam yang sama hanya dianggap ganda bila isinya sama persis
// (mis. BA dipecah dua karena lebih dari 34 baris, atau dua mandor mengambil hal berbeda, tetap boleh).
function baQtyKey_(v) { return Math.round(Number(v) * 1000) / 1000; }
function baItemsSig_(mandor, items) {
  var parts = [];
  items.forEach(function (it) { parts.push((it.desig ? 'd:' + it.desig : 'l:' + normalizeText_(it.nama)) + '=' + baQtyKey_(it.qty)); });
  parts.sort();
  return normalizeText_(mandor) + '|' + parts.join(';');
}
function baRowSig_(row, C) {
  var parts = [];
  C.desig.forEach(function (nm, k) {
    var v = row[BA_COL.FIRSTDESIG - 1 + k];
    if (v !== '' && v !== null && Number(v) !== 0) parts.push('d:' + nm + '=' + baQtyKey_(v));
  });
  String(row[C.LAIN - 1] || '').split('; ').forEach(function (s) {
    var m = s.match(/^(.*) x([\d.,]+)$/);
    if (m) parts.push('l:' + normalizeText_(m[1]) + '=' + baQtyKey_(String(m[2]).replace(',', '.')));
  });
  parts.sort();
  return normalizeText_(row[BA_COL.MANDOR - 1]) + '|' + parts.join(';');
}

// ---------- Riwayat & unduh ulang ----------
function getBaHistory_(scope) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BA_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return [];
  var C = baLayout_(sh);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, C.TOTAL).getValues();
  var out = [], okKeys = scope ? baScopeKeys_(scope) : null;
  vals.forEach(function (r) {
    var id = r[C.ID - 1];
    if (!id) return;
    if (okKeys && !okKeys[normalizeText_(r[BA_COL.NAME - 1])]) return;      // kode region: hanya BA site region itu
    var d = r[BA_COL.TGL - 1];
    var cnt = 0;
    for (var k = 0; k < C.desig.length; k++) { if (r[BA_COL.FIRSTDESIG - 1 + k] !== '') cnt++; }
    if (r[C.LAIN - 1]) cnt += String(r[C.LAIN - 1]).split(';').length;
    out.push({
      id: id, name: r[BA_COL.NAME - 1], sow: r[BA_COL.SOW - 1],
      tanggal: d instanceof Date ? Utilities.formatDate(d, tz, 'dd/MM/yyyy') : String(d),
      jenis: r[BA_COL.JENIS - 1], pdf: !!String(r[C.FILEID - 1] || ''), items: cnt, nomor: C.NOMOR ? String(r[C.NOMOR - 1] || '') : ''
    });
  });
  return out.slice(-100).reverse();
}

// Unduh ulang PDF asli. Hanya file yang tercatat di sheet BA TRANSAKSI yang bisa diminta.
function downloadBaPdf_(idBa, scope) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BA_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) throw new Error('Belum ada BA tersimpan.');
  var C = baLayout_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, C.TOTAL).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][C.ID - 1] === idBa) {
      if (scope && !baScopeKeys_(scope)[normalizeText_(vals[i][BA_COL.NAME - 1])]) break;      // BA region lain: diperlakukan tidak ditemukan
      if (!String(vals[i][C.FILEID - 1] || '')) throw new Error('BA ini tidak punya PDF (dicatat langsung sebagai Masuk).');
      var blob = DriveApp.getFileById(vals[i][C.FILEID - 1]).getBlob();
      return { name: blob.getName(), mime: 'application/pdf', data: Utilities.base64Encode(blob.getBytes()) };
    }
  }
  throw new Error('BA dengan ID ' + idBa + ' tidak ditemukan.');
}

// =====================================================================
// REKAP BA: material bersih (total Ambil dikurangi total Pengembalian) per Site dan SOW,
// dihitung otomatis dari sheet BA TRANSAKSI. Satu baris per pasangan Site + SOW yang punya BA.
// Bila kolom Designator baru ditambahkan di BA TRANSAKSI, jalankan lagi setupRekapBa_
// (menu "BA Transaksi" > "Perbarui REKAP BA"). Kolom Designator memakai satu rumus per sel;
// SUMIFS dengan kunci array di dalam ARRAYFORMULA terbukti memberi angka salah.
// =====================================================================
var REKAP_SHEET_NAME = 'REKAP BA';
var REKAP_FIRST_ROW = 6;
var REKAP_ROWS = 500;
var REKAP_FIRST_DESIG = 6;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BA Transaksi')
    .addItem('Buka REKAP BA (Gudang BMI)', 'bukaRekapBa')
    .addItem('Perbarui REKAP BA (Gudang BMI)', 'setupRekapBa')
    .addItem('Periksa struktur', 'cekStruktur')
    .addToUi();
}

// REKAP BA kini ada di spreadsheet Gudang BMI (pribadi; admin WH meminta akses editor sendiri ke pemilik). Menu ini hanya menampilkan tautannya.
function bukaRekapBa() {
  var ui = SpreadsheetApp.getUi(), id = PropertiesService.getScriptProperties().getProperty('BAG_SS_ID');
  if (!id) { ui.alert('REKAP BA', 'Spreadsheet Gudang BMI belum dibuat. Hubungi pemilik.', ui.ButtonSet.OK); return; }
  var html = HtmlService.createHtmlOutput('<div style="font-family:Arial;font-size:13px"><p>REKAP BA (material bersih per Site dan SOW) sekarang ada di spreadsheet <b>' + BAG_SS_NAME + '</b>.</p><p><a href="https://docs.google.com/spreadsheets/d/' + id + '/edit" target="_blank">Buka spreadsheet Gudang BMI</a></p><p style="color:#666;font-size:12px">Bila muncul halaman permintaan akses, klik Minta akses dan tunggu persetujuan pemilik.</p></div>').setWidth(430).setHeight(200);
  ui.showModalDialog(html, 'REKAP BA di Gudang BMI');
}

function baColLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function setupRekapBa_(targetSs, dataSheetName) {
  var ss = targetSs || SpreadsheetApp.getActiveSpreadsheet();      // targetSs/dataSheetName hanya untuk REKAP BA di spreadsheet lain (lihat rekapGudangUji)
  var ba = getBaSheet_();
  var C = baLayout_(ba);
  var nD = C.desig.length;
  var nCols = REKAP_FIRST_DESIG - 1 + nD;
  var r1 = REKAP_FIRST_ROW;
  var rN = REKAP_FIRST_ROW + REKAP_ROWS - 1;
  var q = "'" + (dataSheetName || BA_SHEET_NAME) + "'!";
  var qA = q + '$A:$A';
  var qE = q + '$' + baColLetter_(BA_COL.JENIS) + ':$' + baColLetter_(BA_COL.JENIS);
  var key = '$A$' + r1 + ':$A$' + rN;

  var sh = ss.getSheetByName(REKAP_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(REKAP_SHEET_NAME, targetSs ? ss.getNumSheets() : ba.getIndex());
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.clearConditionalFormatRules();
  if (sh.getMaxColumns() < nCols) sh.insertColumnsAfter(sh.getMaxColumns(), nCols - sh.getMaxColumns());
  if (sh.getMaxColumns() > nCols) sh.deleteColumns(nCols + 1, sh.getMaxColumns() - nCols);
  if (sh.getMaxRows() < rN) sh.insertRowsAfter(sh.getMaxRows(), rN - sh.getMaxRows());

  // Banner + keterangan
  // Sel gabungan tidak boleh melewati batas kolom yang dibekukan (kolom A), jadi A dan B:akhir terpisah.
  sh.getRange(1, 1, 1, nCols).setBackground('#1A1A1A').setFontColor('#C9972C').setFontWeight('bold')
    .setVerticalAlignment('middle');
  sh.getRange(1, 1).setValue('REKAP BA TRANSAKSI').setFontSize(15);
  sh.getRange(1, 2, 1, nCols - 1).merge().setHorizontalAlignment('left').setFontSize(11);
  sh.getRange(1, 2).setValue('Material bersih per Site dan SOW  =  total Ambil dikurangi total Pengembalian');
  sh.getRange(2, 1, 1, nCols).setBackground('#FBF1D6').setFontColor('#5C4A1B').setFontSize(10)
    .setVerticalAlignment('middle');
  sh.getRange(2, 1).setValue('Keterangan').setFontWeight('bold');
  sh.getRange(2, 2, 1, nCols - 1).merge().setFontStyle('italic').setWrap(true);
  sh.getRange(2, 2).setValue('Terisi otomatis dari sheet BA TRANSAKSI: satu baris per Site dan SOW yang sudah punya BA ' +
    '(Site yang sama dengan SOW berbeda tampil di baris terpisah, tidak digabung). ' +
    'Angka merah = pengembalian lebih banyak dari pengambilan.');
  sh.setRowHeight(1, 36);
  sh.setRowHeight(2, 34);
  sh.setRowHeight(3, 8);

  // Header
  var head = ['Name', 'SOW', 'BA Ambil', 'BA Pengembalian', 'BA Terakhir'].concat(C.desig);
  sh.getRange(4, 1, 1, nCols).setValues([head])
    .setBackground('#1A1A1A').setFontColor('#C9972C').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(4, 44);

  // Baris total (baris 5)
  sh.getRange(5, 1).setValue('TOTAL SEMUA SITE');
  sh.getRange(5, 1, 1, nCols).setBackground('#F3DFA8').setFontWeight('bold').setVerticalAlignment('middle')
    .setBorder(true, null, true, null, null, null, '#C9972C', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(5, 28);
  var lastLetter = baColLetter_(nCols);
  for (var c = 3; c <= 4; c++) {
    var L0 = baColLetter_(c);
    sh.getRange(5, c).setFormula('=SUM(' + L0 + r1 + ':' + L0 + rN + ')');
  }
  for (var k = 0; k < nD; k++) {
    var Lc = baColLetter_(REKAP_FIRST_DESIG + k);
    sh.getRange(5, REKAP_FIRST_DESIG + k).setFormula('=SUM(' + Lc + r1 + ':' + Lc + rN + ')');
  }

  // Isi: daftar pasangan Site + SOW unik (kolom A:B tumpah dari sel A6). Site yang sama dengan SOW
  // berbeda (mis. Cluster dan Subfeeder) jadi baris terpisah dan tidak digabung.
  var qSow = q + '$' + baColLetter_(BA_COL.SOW) + ':$' + baColLetter_(BA_COL.SOW);
  sh.getRange(r1, 1).setFormula('=IFERROR(SORT(UNIQUE(FILTER(HSTACK(' + q + '$A$2:$A;' + q + '$' + baColLetter_(BA_COL.SOW) + '$2:$' + baColLetter_(BA_COL.SOW) + ');' +
    q + '$A$2:$A<>""));1;TRUE;2;TRUE);"")');
  // Kolom C dst: satu rumus per sel (SUMIFS dengan kunci array di dalam ARRAYFORMULA memberi angka salah).
  // Kunci = Name ($A) DAN SOW ($B); $B&"" agar SOW kosong tetap cocok dengan sel SOW kosong.
  var tglCol = q + '$' + baColLetter_(BA_COL.TGL) + ':$' + baColLetter_(BA_COL.TGL);
  var crit = qA + ';$A' + r1 + ';' + qSow + ';$B' + r1 + '&""';
  var firstRowF = [
    '=IF($A' + r1 + '="";"";COUNTIFS(' + crit + ';' + qE + ';"Ambil"))',
    '=IF($A' + r1 + '="";"";COUNTIFS(' + crit + ';' + qE + ';"Pengembalian"))',
    '=IF($A' + r1 + '="";"";MAXIFS(' + tglCol + ';' + crit + '))'
  ];
  for (var j = 0; j < nD; j++) {
    var Ls = baColLetter_(BA_COL.FIRSTDESIG + j);
    var src = q + '$' + Ls + ':$' + Ls;
    firstRowF.push('=IF($A' + r1 + '="";"";ROUND(SUMIFS(' + src + ';' + crit + ';' + qE + ';"Ambil")-' +
      'SUMIFS(' + src + ';' + crit + ';' + qE + ';"Pengembalian");3))');
  }
  var fromRange = sh.getRange(r1, 3, 1, firstRowF.length);
  fromRange.setFormulas([firstRowF]);
  fromRange.copyTo(sh.getRange(r1 + 1, 3, REKAP_ROWS - 1, firstRowF.length));   // baris berikutnya menyalin rumus

  // Tampilan
  sh.getRange(r1, 5, REKAP_ROWS, 1).setNumberFormat('dd mmm yyyy');
  sh.getRange(r1, 2, REKAP_ROWS, nCols - 1).setHorizontalAlignment('center');
  sh.getRange(5, 2, 1, nCols - 1).setHorizontalAlignment('center');
  sh.getRange(r1, 1, REKAP_ROWS, nCols).setVerticalAlignment('middle');
  var widths = [300, 90, 70, 100, 105];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  if (nD) sh.setColumnWidths(REKAP_FIRST_DESIG, nD, 78);
  sh.setFrozenRows(5);
  sh.setFrozenColumns(1);
  sh.setTabColor('#C9972C');
  sh.setHiddenGridlines(true);

  var vals = sh.getRange(5, REKAP_FIRST_DESIG, rN - 4, nD);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#C5221F').setBold(true).setRanges([vals]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(0).setFontColor('#BBBBBB').setRanges([vals]).build()
  ]);
  SpreadsheetApp.flush();
  if (!targetSs) ss.toast('REKAP BA diperbarui (' + nD + ' kolom Designator).', 'BA Transaksi', 5);
  return sh;
}

// ===== Tombol menuju Portal Web di DASHBOARD =====
// Alamat yang dipakai tombol Dashboard: halaman GitHub Pages (repo buanamenara/portal-ftth, 1 file index.html) yang menampilkan portal 100% layar tanpa banner Google.
// Cadangan: situs Google Sites https://sites.google.com/view/portalftthbmi (tampil dalam kotak) dan alamat langsung web app (ada banner Google):
// https://script.google.com/macros/s/AKfycbwO25NZjRNu11QfyZQDGp1ZAPHdR-PwMwrc3U09lGUQ03KH91bNUl178-A7F246fm_djw/exec
var PORTAL_URL = 'https://buanamenara.github.io/portal-ftth/';

/**
 * Membuat kotak "PORTAL FTTH" di DASHBOARD, di antara banner dan kartu KPI (baris 5-9):
 * tombol emas di kiri (selalu terlihat di layar kecil) dan keterangan di sebelah kanannya.
 * Aman dijalankan ulang: bila kotak sudah ada, hanya digambar ulang (baris tidak disisipkan lagi).
 * Bila alamat portal berubah, ubah PORTAL_URL lalu jalankan fungsi ini lagi.
 */
function setupPortalButton_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DASHBOARD');
  if (!sh) throw new Error('Sheet DASHBOARD tidak ditemukan.');
  var TOP = 5, ROWS = 5;
  var GOLD = '#C9972C', INK = '#1A1A1A', MUTED = '#CFCFCF';
  var B = SpreadsheetApp.BorderStyle;

  var first = sh.getRange(TOP, 2);
  var exists = /^\s*(PORTAL FTTH|FTTH PROJECT CONTROL PORTAL)/.test(String(first.getValue())) || /HYPERLINK\(/i.test(first.getFormula());
  if (!exists) sh.insertRowsBefore(TOP, ROWS);

  var area = sh.getRange(TOP, 1, ROWS, 16);
  area.breakApart();
  area.clear();
  area.setBackground('#ffffff').setFontFamily('Arial').setVerticalAlignment('middle');
  sh.setRowHeight(TOP, 34);
  sh.setRowHeights(TOP + 1, 3, 26);
  sh.setRowHeight(TOP + 4, 12);

  // Kartu gelap B:O (sejajar dengan kartu KPI)
  sh.getRange(TOP, 2, 4, 14).setBackground(INK);

  // Tombol emas (B:D), efek timbul lewat garis tepi
  var btn = sh.getRange(TOP, 2, 4, 3).merge();
  btn.setFormula('=HYPERLINK("' + PORTAL_URL + '";"BUKA FTTH PROJECT CONTROL PORTAL  →")')
    .setBackground(GOLD).setFontColor(INK).setFontSize(20).setFontWeight('bold').setFontLine('none')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  btn.setBorder(true, true, null, null, null, null, '#EBCB7A', B.SOLID_MEDIUM);
  btn.setBorder(null, null, true, true, null, null, '#8A6A1B', B.SOLID_THICK);

  // Keterangan (E:O)
  var title = sh.getRange(TOP, 5, 1, 11).merge();
  title.setValue('   FTTH PROJECT CONTROL PORTAL  |  Portal FTTH & Portal Waspang')
    .setFontSize(14).setFontWeight('bold').setFontColor('#FFFFFF').setHorizontalAlignment('left');
  var desc = sh.getRange(TOP + 1, 5, 3, 11).merge();
  desc.setValue(
    '   Masuk sekali lewat FTTH Project Control Portal, lalu pilih portalnya:\n' +
    '   •  Portal FTTH – Submit BOQ (Excel)  →  DRAWING / WAREHOUSE / OPNAME (dicek ulang dulu sebelum dikirim)\n' +
    '   •  Portal FTTH – Warehouse BA Transaksi (buat BA otomatis, upload PDF BA bertanda tangan)  →  BA TRANSAKSI dan REKAP BA (spreadsheet Gudang BMI)\n' +
    '   •  Portal Waspang – Daily Report EMR, BOQ Plan cluster dan foto lapangan  →  spreadsheet Waspang, Google Drive dan grup WhatsApp')
    .setFontSize(11).setFontColor(MUTED).setHorizontalAlignment('left').setVerticalAlignment('middle').setWrap(true);

  SpreadsheetApp.flush();
}

// =====================================================================
// AKSES: web app dibuka untuk "Siapa saja" (tanpa login Google) supaya portal bisa dipakai di semua
// browser/HP, jadi SETIAP fungsi yang bisa dipanggil dari luar dijaga kode akses tim.
// - Fungsi berakhiran "_" bersifat privat (tidak bisa dipanggil dari browser).
// - Hanya fungsi publik di bawah ini yang bisa dipanggil halaman; semuanya memeriksa kode akses dulu.
// - Kode disimpan sebagai hash SHA-256 di Script Properties (kunci ACCESS_HASH), bukan teks asli.
//   Mengganti kode: jalankan fungsi sementara yang mengisi ACCESS_HASH dengan hash baru
//   (hash = base64(SHA-256("bmi-ftth|" + KODE-HURUF-BESAR))).
// - Kode REGION (nama region di DATA BASE, mis. "Banjarmasin") memberi akses seperti admin tetapi hanya untuk site region itu;
//   lihat bagian "AKSES PER REGION" di bawah.
// =====================================================================
var ACCESS_SALT_ = 'bmi-ftth|';

function hashAccess_(code) {
  var c = String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');   // huruf besar, tanpa tanda hubung/spasi
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, ACCESS_SALT_ + c));
}

// Peran dari kode: 'rpm' (super admin: semua menu) atau 'admin' (Submit BOQ + BA Transaksi). '' bila salah.
// ===== Sistem login per-user (Username & Password), sheet USERS =====
function ensureUsersSheet_() {
  var ss = rpmSs_();
  var sh = ss.getSheetByName(USERS_SHEET_NAME_);
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET_NAME_);
    sh.getRange(1, 1, 1, 6).setValues([['Username', 'Password', 'Nama', 'Role', 'Area', 'Status']]);
    sh.getRange(2, 1, 1, 6).setValues([['admin', 'GANTI_PASSWORD_AWAL', 'Administrator', 'admin', '', 'aktif']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

var usersCache_ = null;
// Daftar USERS juga disimpan 2 menit di cache skrip, supaya tiap panggilan portal tidak membuka spreadsheet RPM hanya untuk
// cek login. Cache dihapus saat user diubah lewat portal (usersReset_) dan saat tab USERS diedit langsung (pemicu logSheetEdit).
var USERS_CACHE_KEY_ = 'usersAll_v1', USERS_CACHE_TTL_ = 120;
function usersReset_() {
  usersCache_ = null;
  try { CacheService.getScriptCache().remove(USERS_CACHE_KEY_); } catch (e) { /* abaikan */ }
}
function usersAll_() {
  if (usersCache_) return usersCache_;
  try {
    var hit = CacheService.getScriptCache().get(USERS_CACHE_KEY_);
    if (hit) { usersCache_ = JSON.parse(hit); return usersCache_; }
  } catch (e) { /* baca dari sheet */ }
  var sh = ensureUsersSheet_();
  var lastRow = sh.getLastRow();
  var out = [];
  if (lastRow >= 2) {
    var vals = sh.getRange(2, 1, lastRow - 1, 6).getValues();
    vals.forEach(function (r, i) {
      if (!String(r[0]).trim()) return;
      out.push({
        row: i + 2,
        username: String(r[0]).trim(),
        password: String(r[1]),
        nama: String(r[2]).trim(),
        role: String(r[3]).trim().toLowerCase(),
        area: String(r[4]).trim(),
        status: String(r[5]).trim().toLowerCase() || 'aktif'
      });
    });
  }
  usersCache_ = out;
  try { CacheService.getScriptCache().put(USERS_CACHE_KEY_, JSON.stringify(out), USERS_CACHE_TTL_); } catch (e) { /* tanpa cache */ }
  return out;
}

function makeCode_(username, password) { return String(username) + CODE_SEP_ + String(password); }
function userByCode_(code) {
  var s = String(code == null ? '' : code);
  var i = s.indexOf(CODE_SEP_);
  if (i < 0) return null;
  var uname = s.substring(0, i).trim().toLowerCase();
  var pass = s.substring(i + 1);
  var users = usersAll_();
  for (var k = 0; k < users.length; k++) {
    if (users[k].username.toLowerCase() === uname && users[k].password === pass && users[k].status !== 'nonaktif') return users[k];
  }
  return null;
}

function roleOf_(code) {
  var u = userByCode_(code);
  return u ? u.role : '';
}

function failAccess_() {
  if (!usersAll_().length) {
    throw new Error('Belum ada user terdaftar di sheet USERS. Hubungi pemilik spreadsheet.');
  }
  Utilities.sleep(1500);   // memperlambat tebak-tebakan password
  throw new Error('Username atau password salah.');
}

// Fungsi Submit BOQ / BA Transaksi: boleh kode admin ATAU kode RPM (super admin).
function requireAccess_(code) {
  if (!roleOf_(code)) failAccess_();
}

// Fungsi menu RPM: hanya kode RPM.
function requireRpm_(code) {
  var r = roleOf_(code);
  if (r === 'rpm') return;
  if (!r) failAccess_();
  Utilities.sleep(1500);
  throw new Error('Menu ini khusus RPM.');
}

// Fungsi Administration: hanya kode admin (bukan RPM).
function requireAdmin_(code) {
  var r = roleOf_(code);
  if (r === 'rpm') return;
  if (!r) failAccess_();
  Utilities.sleep(1500);
  throw new Error('Menu ini khusus RPM.');
}

// Fungsi khusus pemilik/editor spreadsheet (dijalankan dari editor atau menu), tidak bisa dipanggil pengunjung web.
function ownerOnly_() {
  var a = Session.getActiveUser().getEmail();
  var e = Session.getEffectiveUser().getEmail();
  if (!a || a !== e) throw new Error('Fungsi ini hanya untuk pemilik spreadsheet.');
}

// =====================================================================
// RPM - BA Pekerjaan (Berita Acara Penyelesaian Pekerjaan) untuk Mandor
// Menu khusus RPM (kode akses RPM = super admin). Data tercatat di spreadsheet TERPISAH khusus RPM
// (id di Script Property RPM_SS_ID, dibuat oleh setupRpm), PDF dibuat otomatis (Google Docs -> PDF)
// dan disimpan di Drive folder "BA Pekerjaan RPM BMI/<tahun-bulan>". Kop surat ada di file KopSurat.gs.
// =====================================================================
var RPM_SS_NAME = 'RPM BMI - BA Pekerjaan';
var RPM_FOLDER_NAME = 'BA Pekerjaan RPM BMI';
var RPM_SH_BA = 'BA PEKERJAAN';
var RPM_SH_REKAP = 'REKAP PROGRES';
var RPM_SH_SET = 'PENGATURAN';
var RPM_HEAD = ['ID BA', 'Tanggal BA', 'Name (Site)', 'SOW', 'Jenis Pekerjaan', 'Judul Pekerjaan', 'Progres (%)',
  'Pelaksana (Mandor)', 'Pengawas/RPM', 'Project Manager', 'Jumlah Foto', 'Waktu Terbit', 'Nama File PDF', 'Link PDF', 'File ID'];
var RPM_C = { ID: 1, TGL: 2, NAME: 3, SOW: 4, JENIS: 5, JUDUL: 6, PROG: 7, MANDOR: 8, RPM: 9, PM: 10, FOTO: 11, WAKTU: 12, FILE: 13, LINK: 14, FILEID: 15 };
var RPM_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var RPM_ABBR = { 'Cluster': 'CL', 'Subfeeder': 'SF', 'Uplink': 'UL', 'Hubfeeder': 'HF', 'Mainfeeder': 'MF', 'FWA': 'FWA' };
var RPM_DEF = { pemberi: 'PT Buana Menara Indonesia', rpm: 'Ramadhani', pm: 'Barcelona Husen', mandors: ['Chandra Fersiandana', 'Indra Agrisetia'] };
var RPM_MAX_FOTO = 12;
var RPM_SIGN_W = 125, RPM_SIGN_H = 68;   // kotak tanda tangan standar (poin)

function rpmSs_() {
  var id = PropertiesService.getScriptProperties().getProperty('RPM_SS_ID');
  if (!id) throw new Error('Spreadsheet RPM belum dibuat. Pemilik: jalankan setupRpm dari editor Apps Script.');
  return SpreadsheetApp.openById(id);
}

function rpmSheet_(name) {
  var sh = rpmSs_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ada di spreadsheet RPM. Pemilik: jalankan setupRpm lagi.');
  return sh;
}

function rpmFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RPM_FOLDER_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* buat ulang */ }
  }
  var it = DriveApp.getFoldersByName(RPM_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(RPM_FOLDER_NAME);
  props.setProperty('RPM_FOLDER_ID', folder.getId());
  return folder;
}

// ---------- Pembuatan spreadsheet RPM (tema BMI: hitam + emas) ----------
function setupRpm_() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var id = props.getProperty('RPM_SS_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  var created = false;
  if (!ss) {
    ss = SpreadsheetApp.create(RPM_SS_NAME);
    props.setProperty('RPM_SS_ID', ss.getId());
    created = true;
  }
  ss.setSpreadsheetLocale('id_ID');   // rumus memakai titik koma, sama seperti spreadsheet utama
  try { ss.setSpreadsheetTimeZone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()); } catch (e) { /* biarkan */ }

  var ba = ss.getSheetByName(RPM_SH_BA) || ss.insertSheet(RPM_SH_BA);
  var rk = ss.getSheetByName(RPM_SH_REKAP) || ss.insertSheet(RPM_SH_REKAP);
  var st = ss.getSheetByName(RPM_SH_SET) || ss.insertSheet(RPM_SH_SET);
  var sr = ss.getSheetByName(SARAN_SH) || ss.insertSheet(SARAN_SH);
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (n !== RPM_SH_BA && n !== RPM_SH_REKAP && n !== RPM_SH_SET && n !== SARAN_SH) ss.deleteSheet(s);
  });
  rpmStyleBa_(ba);
  rpmStyleSet_(st);
  rpmStyleRekap_(rk);
  rpmStyleSaran_(sr);
  ss.setActiveSheet(ba);

  var folder = rpmFolder_();
  if (created) {
    try { DriveApp.getFileById(ss.getId()).moveTo(folder); } catch (e) { /* biarkan di Drive Saya */ }
  }
  SpreadsheetApp.flush();
  return { id: ss.getId(), url: ss.getUrl(), folder: folder.getUrl() };
}

function rpmBanner_(sh, n, title, desc) {
  sh.getRange(1, 1, 1, n).breakApart();
  sh.getRange(1, 1, 1, n).setBackground('#1A1A1A').setFontColor('#C9972C').setFontWeight('bold').setVerticalAlignment('middle');
  sh.getRange(1, 1).setValue(title).setFontSize(15);
  sh.getRange(1, 2, 1, n - 1).merge().setHorizontalAlignment('left').setFontSize(11);
  sh.getRange(1, 2).setValue(desc);
  sh.getRange(2, 1, 1, n).breakApart();
  sh.getRange(2, 1, 1, n).setBackground('#FBF1D6').setFontColor('#5C4A1B').setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(2, 1).setValue('Keterangan').setFontWeight('bold');
  sh.getRange(2, 2, 1, n - 1).merge().setFontStyle('italic').setWrap(true);
  sh.setRowHeight(1, 36);
  sh.setRowHeight(2, 30);
  sh.setRowHeight(3, 8);
}

function rpmHeader_(sh, head) {
  sh.getRange(4, 1, 1, head.length).setValues([head])
    .setBackground('#1A1A1A').setFontColor('#C9972C').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(4, 40);
}

function rpmStyleBa_(sh) {
  var n = RPM_HEAD.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'BA PEKERJAAN - RPM', 'Berita Acara Penyelesaian Pekerjaan yang diterbitkan RPM untuk Mandor (PDF dibuat otomatis oleh portal)');
  sh.getRange(2, 2).setValue('Terisi otomatis dari portal (menu BA Pekerjaan - RPM): satu baris per BA. Klik "Buka PDF" untuk melihat berkasnya. Jangan mengubah isi kolom secara manual.');
  rpmHeader_(sh, RPM_HEAD);
  [130, 100, 320, 90, 110, 380, 80, 170, 130, 130, 70, 140, 330, 90, 60].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var rows = Math.max(sh.getMaxRows() - 4, 1);
  sh.getRange(5, 1, rows, n).setVerticalAlignment('middle');
  sh.getRange(5, RPM_C.TGL, rows, 1).setNumberFormat('dd mmm yyyy').setHorizontalAlignment('center');
  sh.getRange(5, RPM_C.PROG, rows, 1).setNumberFormat('0"%"').setHorizontalAlignment('center');
  sh.getRange(5, RPM_C.FOTO, rows, 1).setHorizontalAlignment('center');
  sh.getRange(5, RPM_C.WAKTU, rows, 1).setNumberFormat('dd mmm yyyy HH:mm');
  sh.hideColumns(RPM_C.FILEID);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A5<>"";ISEVEN(ROW()))').setBackground('#FBF1D6')
      .setRanges([sh.getRange(5, 1, rows, n)]).build()
  ]);
  sh.setTabColor('#C9972C');
}

function rpmStyleSet_(sh) {
  var n = 6;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'PENGATURAN - RPM', 'Isian yang dipakai portal untuk membuat PDF BA Pekerjaan');
  sh.getRange(2, 2).setValue('Ubah nama di kolom "Isi" bila pejabatnya berganti. Nama Mandor baru otomatis ditambahkan ke Daftar Mandor saat BA diterbitkan.');
  sh.getRange(4, 1, 1, 2).setValues([['Pengaturan surat', 'Isi']]);
  sh.getRange(4, 4).setValue('Daftar Mandor');
  sh.getRange(4, 1, 1, n).setBackground('#1A1A1A').setFontColor('#C9972C').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(4, 32);
  sh.getRange(5, 1, 3, 1).setValues([['Pemberi Tugas'], ['Pengawas/RPM'], ['Project Manager Implementasi']]).setFontWeight('bold');
  var cur = sh.getRange(5, 2, 3, 1).getValues();
  if (!cur[0][0] && !cur[1][0] && !cur[2][0]) sh.getRange(5, 2, 3, 1).setValues([[RPM_DEF.pemberi], [RPM_DEF.rpm], [RPM_DEF.pm]]);
  if (!sh.getRange(5, 4).getValue()) sh.getRange(5, 4, RPM_DEF.mandors.length, 1).setValues(RPM_DEF.mandors.map(function (m) { return [m]; }));
  sh.getRange(5, 1, 3, 2).setBorder(true, true, true, true, true, true, '#C9972C', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(5, 4, 60, 1).setBorder(true, true, true, true, true, true, '#E8D9AE', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(5, 4, 60, 1).setBackground('#FFFDF7');
  sh.getRange(5, 2, 3, 1).setBackground('#FFFDF7');
  [240, 320, 30, 280, 30, 30].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setTabColor('#1A1A1A');
}

function rpmStyleRekap_(sh) {
  var n = 6;
  sh.clear();
  sh.clearConditionalFormatRules();
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  if (sh.getMaxRows() < 305) sh.insertRowsAfter(sh.getMaxRows(), 305 - sh.getMaxRows());
  rpmBanner_(sh, n, 'REKAP PROGRES - RPM', 'Progres tertinggi per Site + SOW + Jenis pekerjaan, dihitung otomatis dari sheet BA PEKERJAAN');
  sh.getRange(2, 2).setValue('Terisi otomatis dari sheet BA PEKERJAAN. Site yang sama dengan SOW atau jenis pekerjaan berbeda tampil di baris terpisah.');
  rpmHeader_(sh, ['Name (Site)', 'SOW', 'Jenis Pekerjaan', 'Progres Tertinggi', 'BA Terakhir', 'Jumlah BA']);
  var q = "'" + RPM_SH_BA + "'!";
  var crit = q + '$C:$C;$A5;' + q + '$D:$D;$B5&"";' + q + '$E:$E;$C5&""';
  sh.getRange(5, 1).setFormula('=IFERROR(SORT(UNIQUE(FILTER(HSTACK(' + q + '$C$5:$C;' + q + '$D$5:$D;' + q + '$E$5:$E);' + q + '$C$5:$C<>""));1;TRUE;2;TRUE;3;TRUE);"")');
  var f = [
    '=IF($A5="";"";MAXIFS(' + q + '$G:$G;' + crit + '))',
    '=IF($A5="";"";MAXIFS(' + q + '$B:$B;' + crit + '))',
    '=IF($A5="";"";COUNTIFS(' + crit + '))'
  ];
  var from = sh.getRange(5, 4, 1, 3);
  from.setFormulas([f]);
  from.copyTo(sh.getRange(6, 4, 299, 3));
  sh.getRange(5, 4, 300, 1).setNumberFormat('0"%"');
  sh.getRange(5, 5, 300, 1).setNumberFormat('dd mmm yyyy');
  sh.getRange(5, 2, 300, 5).setHorizontalAlignment('center');
  sh.getRange(5, 1, 300, n).setVerticalAlignment('middle');
  [320, 100, 130, 120, 110, 90].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  sh.setHiddenGridlines(true);
  sh.setTabColor('#C9972C');
}

// ---------- Data untuk formulir ----------
function rpmSettings_() {
  var sh = rpmSheet_(RPM_SH_SET);
  var v = sh.getRange(5, 2, 3, 1).getValues();
  var m = sh.getRange(5, 4, Math.max(sh.getLastRow() - 4, 1), 1).getValues();
  var mandors = [];
  m.forEach(function (r) { var t = baClean_(r[0]); if (t && mandors.indexOf(t) < 0) mandors.push(t); });
  return { pemberi: baClean_(v[0][0]) || RPM_DEF.pemberi, rpm: baClean_(v[1][0]) || RPM_DEF.rpm, pm: baClean_(v[2][0]) || RPM_DEF.pm, mandors: mandors };
}

function rpmInit_() {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return {
    settings: rpmSettings_(),
    sites: baReadDbSites_(),
    sows: VALID_SOW,
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    hasSign: !!PropertiesService.getScriptProperties().getProperty('RPM_SIGN_ID'),
    mandorSigns: rpmMandorSignNames_()   // nama mandor yang tanda tangannya sudah tersimpan
  };
}

// ---------- Isi surat ----------
function rpmDateId_(iso) {
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (parseInt(m[3], 10) + ' ' + RPM_BULAN[parseInt(m[2], 10) - 1] + ' ' + m[1]) : String(iso);
}

function rpmStatement_(d) {
  if (d.jenis === 'Electrical' && d.progres >= 100) {
    return 'Pekerjaan telah selesai dilaksanakan 100% dan dapat dilakukan pembayaran sebagaimana termuat di dalam perjanjian kerja sama.';
  }
  return 'Pekerjaan telah mulai dilaksanakan, progres mencapai ' + d.progres + ' % dan dapat dilakukan pembayaran sebagaimana termuat di dalam perjanjian kerja sama.';
}

function rpmFileName_(d) {
  var ab = RPM_ABBR[d.sow] || d.sow;
  var nm = d.jenis === 'Electrical'
    ? 'BA Pekerjaan Electrical ' + d.progres + '% ' + ab + ' ' + d.site
    : 'BA Pekerjaan ' + d.progres + '% Mandor ' + ab + ' ' + d.site;
  return nm.replace(/[\\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) + '.pdf';
}

function rpmImgBlob_(b64, mime, name) {
  var type = /png/i.test(mime || '') ? 'image/png' : 'image/jpeg';
  return Utilities.newBlob(Utilities.base64Decode(b64), type, name || 'gambar');
}

// Menaruh gambar di paragraf, dengan skala agar muat dalam maxW x maxH (poin).
function rpmPlaceImage_(par, blob, maxW, maxH) {
  var img = par.appendInlineImage(blob);
  var w = img.getWidth(), h = img.getHeight();
  var s = Math.min(maxW * 4 / 3 / w, maxH * 4 / 3 / h, 1e6);   // maxW/maxH dalam poin; gambar Docs dalam piksel
  img.setWidth(Math.round(w * s)).setHeight(Math.round(h * s));
  return img;
}

function rpmBuildDoc_(d, idBa, signRpm, signMandor) {
  var doc = DocumentApp.create('TMP_' + idBa);
  var body = doc.getBody();
  body.clear();
  body.setPageWidth(595.28).setPageHeight(841.89).setMarginTop(24).setMarginBottom(28).setMarginLeft(50).setMarginRight(50);
  var base = {};
  base[DocumentApp.Attribute.FONT_FAMILY] = 'Calibri';
  base[DocumentApp.Attribute.FONT_SIZE] = 12;
  base[DocumentApp.Attribute.FOREGROUND_COLOR] = '#000000';
  base[DocumentApp.Attribute.BOLD] = false;
  base[DocumentApp.Attribute.LINE_SPACING] = 1.15;
  body.setAttributes(base);
  var CENTER = DocumentApp.HorizontalAlignment.CENTER;
  var W = 495;   // lebar isi halaman (poin)

  function para(text, o) {
    o = o || {};
    var p = body.appendParagraph(text);
    p.setAlignment(o.align || DocumentApp.HorizontalAlignment.LEFT);
    p.setBold(!!o.bold);
    p.setSpacingBefore(o.before || 0);
    p.setSpacingAfter(o.after == null ? 6 : o.after);
    if (o.indent != null) p.setIndentStart(o.indent);
    if (o.first != null) p.setIndentFirstLine(o.first);
    p.setFontFamily('Calibri');
    p.setFontSize(o.size || 12);
    p.setForegroundColor(o.color || '#000000');
    p.setUnderline(!!o.underline);
    return p;
  }
  function plainTable(rows, widths) {
    var t = body.appendTable(rows);
    t.setBorderWidth(0);
    for (var r = 0; r < t.getNumRows(); r++) {
      for (var c = 0; c < t.getRow(r).getNumCells(); c++) {
        var cell = t.getCell(r, c);
        cell.setPaddingTop(1).setPaddingBottom(1).setPaddingLeft(2).setPaddingRight(2);
      }
    }
    widths.forEach(function (w, i) { t.setColumnWidth(i, w); });
    return t;
  }

  // Kop surat
  var p0 = body.getChild(0).asParagraph();
  p0.setSpacingAfter(4);
  var kop = p0.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(KOP_JPEG_B64), 'image/jpeg', 'kop.jpg'));
  kop.setWidth(Math.round(W * 4 / 3)).setHeight(Math.round(W * 4 / 3 * 255 / 1500));   // ukuran gambar Docs dalam piksel

  para('BERITA ACARA PENYELESAIAN PEKERJAAN', { align: CENTER, bold: true, before: 14, after: 12 });
  para('Pada hari ini tanggal ' + rpmDateId_(d.tanggal) + ', kami yang bertanda tangan di bawah ini', { after: 8 });
  plainTable([
    ['1.', 'Pemberi Tugas', ': ' + d.pemberi],
    ['2.', 'Pengawas/RPM', ': ' + d.rpm],
    ['3.', 'Pelaksana Pekerjaan', ': ' + d.mandor]
  ], [30, 150, 315]);
  para('Secara bersama-sama telah mengadakan hasil pemeriksaan pekerjaan ' + d.judul + ' dengan kesimpulan sebagai berikut :', { before: 12, after: 8 });
  para('1.  ' + rpmStatement_(d), { indent: 54, first: 36, after: 6 });
  para('2.  Perbaikan kerusakan yang timbul dan akan timbul dikemudian hari selama masa waktu tertuang dalam PKS akan menjadi tanggung jawab pihak pelaksana pekerjaan.', { indent: 54, first: 36, after: 6 });
  para('Demikian berita acara penyelesaian pekerjaan ini di buat agar di gunakan sebagai mana mestinya.', { before: 14, after: 16 });

  // Tanda tangan
  var sg = plainTable([
    ['Di setujui oleh :', 'Mengetahui :', 'Di ajukan oleh :'],
    ['Pengawas/RPM PT BMI', 'Project Manager Implementasi', 'Pelaksana pekerjaan'],
    ['', '', ''],
    ['(' + d.rpm + ')', '(' + d.pm + ')', '(' + d.mandor + ')']
  ], [165, 165, 165]);
  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 3; c++) {
      sg.getCell(r, c).getChild(0).asParagraph().setAlignment(CENTER).setSpacingAfter(2);
    }
  }
  for (var k = 0; k < 3; k++) sg.getCell(3, k).getChild(0).asParagraph().setUnderline(true);
  sg.getRow(2).setMinimumHeight(78);
  // Gambar tanda tangan sudah dipangkas ruang kosongnya oleh portal; di sini dipas ke kotak standar yang sama untuk RPM dan Mandor.
  if (signRpm) rpmPlaceImage_(sg.getCell(2, 0).getChild(0).asParagraph(), signRpm, RPM_SIGN_W, RPM_SIGN_H);
  if (signMandor) rpmPlaceImage_(sg.getCell(2, 2).getChild(0).asParagraph(), signMandor, RPM_SIGN_W, RPM_SIGN_H);
  para('ID: ' + idBa, { align: DocumentApp.HorizontalAlignment.RIGHT, size: 8, color: '#999999', before: 10, after: 0 });

  // Foto pekerjaan
  var photos = d.photoBlobs || [];
  if (photos.length) {
    body.appendPageBreak();
    var hp = para('FOTO PEKERJAAN :', { align: CENTER, bold: true, after: 14 });
    hp.setUnderline(true);
    var n = photos.length;
    var cols = n <= 2 ? n : (n === 4 ? 2 : 3);
    var rows = Math.ceil(n / cols);
    var grid = [];
    for (var i = 0; i < rows; i++) { var rr = []; for (var j = 0; j < cols; j++) rr.push(''); grid.push(rr); }
    var pt = body.appendTable(grid);
    pt.setBorderWidth(0);
    var cw = Math.floor(W / cols);
    for (var cc = 0; cc < cols; cc++) pt.setColumnWidth(cc, cw);
    photos.forEach(function (blob, idx) {
      var cell = pt.getCell(Math.floor(idx / cols), idx % cols);
      cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(2).setPaddingRight(2);
      var par = cell.getChild(0).asParagraph();
      par.setAlignment(CENTER).setSpacingAfter(0);
      rpmPlaceImage_(par, blob, cw - 6, 330);
    });
  }
  doc.saveAndClose();
  return doc.getId();
}

// ---------- Terbitkan BA ----------
function rpmCreate_(data) {
  data = data || {};
  var set = rpmSettings_();
  var d = {
    tanggal: String(data.tanggal || ''),
    site: baClean_(data.site),
    sow: baNormalizeSow_(data.sow),
    jenis: data.jenis === 'Electrical' ? 'Electrical' : 'Civil',
    judul: baClean_(data.judul),
    progres: Math.round(Number(data.progres)),
    mandor: baClean_(data.mandor),
    rpm: baClean_(data.rpm) || set.rpm,
    pm: baClean_(data.pm) || set.pm,
    pemberi: set.pemberi
  };
  var dm = d.tanggal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) throw new Error('Tanggal BA belum diisi.');
  if (!d.site) throw new Error('Nama Site belum diisi.');
  if (VALID_SOW.indexOf(d.sow) === -1) throw new Error('SOW wajib dipilih (' + VALID_SOW.join(', ') + ').');
  if (!d.mandor) throw new Error('Nama Mandor (Pelaksana Pekerjaan) belum diisi.');
  if (!d.judul) throw new Error('Judul pekerjaan belum diisi.');
  if (!(d.progres >= 1 && d.progres <= 100)) throw new Error('Progres harus antara 1 dan 100.');
  var photoIn = (data.photos || []).slice(0, RPM_MAX_FOTO);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var serial = (Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - Date.UTC(1899, 11, 30)) / 86400000;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = rpmSheet_(RPM_SH_BA);
    var last = sh.getLastRow();
    var ex = last >= 5 ? sh.getRange(5, 1, last - 4, RPM_HEAD.length).getValues() : [];

    if (!data.force) {
      for (var i = 0; i < ex.length; i++) {
        var etgl = ex[i][RPM_C.TGL - 1];
        if (normalizeText_(ex[i][RPM_C.NAME - 1]) === normalizeText_(d.site) && ex[i][RPM_C.SOW - 1] === d.sow &&
            ex[i][RPM_C.JENIS - 1] === d.jenis && Number(ex[i][RPM_C.PROG - 1]) === d.progres &&
            normalizeText_(ex[i][RPM_C.MANDOR - 1]) === normalizeText_(d.mandor) &&
            etgl instanceof Date && Utilities.formatDate(etgl, tz, 'yyyy-MM-dd') === d.tanggal) {
          return { duplicate: true, idBa: ex[i][RPM_C.ID - 1] };
        }
      }
    }

    var idBa = 'BAP-' + Utilities.formatDate(new Date(), tz, 'yyMMdd-HHmmss');
    var used = ex.map(function (r) { return String(r[0]); });
    var baseId = idBa, seq = 1;
    while (used.indexOf(idBa) > -1) { seq++; idBa = baseId + '-' + seq; }

    var props = PropertiesService.getScriptProperties();
    var signId = props.getProperty('RPM_SIGN_ID');
    var signRpm = null;
    if (signId) { try { signRpm = DriveApp.getFileById(signId).getBlob(); } catch (e) { signRpm = null; } }
    // tanda tangan Mandor: gambar yang diunggah untuk BA ini didahulukan, kalau tidak ada pakai yang tersimpan untuk nama mandor ini
    var signMandor = null, signMandorFrom = '';
    if (data.signMandor && data.signMandor.b64) {
      signMandor = rpmImgBlob_(data.signMandor.b64, data.signMandor.mime, 'ttd_mandor');
      signMandorFrom = 'khusus';
    } else {
      var ms = rpmMandorSigns_()[rpmMandorKey_(d.mandor)];
      if (ms && ms.id) {
        try { signMandor = DriveApp.getFileById(ms.id).getBlob(); signMandorFrom = 'tersimpan'; } catch (e) { signMandor = null; }
      }
    }
    d.photoBlobs = photoIn.map(function (p, k) { return rpmImgBlob_(p.b64, p.mime, 'foto_' + (k + 1)); });

    var docId = rpmBuildDoc_(d, idBa, signRpm, signMandor);
    var pdf = DriveApp.getFileById(docId).getAs(MimeType.PDF);
    var fileName = rpmFileName_(d);
    pdf.setName(fileName);
    var folder = getOrCreateSubFolder_(rpmFolder_(), dm[1] + '-' + dm[2]);
    var file = folder.createFile(pdf);
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* abaikan */ }

    var row = [idBa, serial, d.site, d.sow, d.jenis, d.judul, d.progres, d.mandor, d.rpm, d.pm, d.photoBlobs.length, new Date(), fileName, '', file.getId()];
    var start = Math.max(last, 4) + 1;
    if (start > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
    sh.getRange(start, 1, 1, RPM_HEAD.length).setValues([row]);
    sh.getRange(start, RPM_C.LINK).setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Buka PDF').setLinkUrl(file.getUrl()).build());

    // mandor baru masuk ke daftar
    if (set.mandors.indexOf(d.mandor) === -1) {
      var st = rpmSheet_(RPM_SH_SET);
      var r0 = 5;
      while (baClean_(st.getRange(r0, 4).getValue())) r0++;
      st.getRange(r0, 4).setValue(d.mandor);
    }
    SpreadsheetApp.flush();
    return { ok: true, idBa: idBa, fileName: fileName, fotos: d.photoBlobs.length, fileUrl: file.getUrl(), signMandor: signMandorFrom };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Riwayat & unduh ----------
function rpmHistory_() {
  var sh = rpmSheet_(RPM_SH_BA);
  if (sh.getLastRow() < 5) return [];
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var vals = sh.getRange(5, 1, sh.getLastRow() - 4, RPM_HEAD.length).getValues();
  var out = [];
  vals.forEach(function (r) {
    if (!r[0]) return;
    var t = r[RPM_C.TGL - 1];
    out.push({ id: r[0], tanggal: t instanceof Date ? Utilities.formatDate(t, tz, 'dd/MM/yyyy') : String(t),
      name: r[RPM_C.NAME - 1], sow: r[RPM_C.SOW - 1], jenis: r[RPM_C.JENIS - 1], judul: r[RPM_C.JUDUL - 1],
      progres: r[RPM_C.PROG - 1], mandor: r[RPM_C.MANDOR - 1] });
  });
  out.reverse();
  return out.slice(0, 100);
}

function rpmDownload_(idBa) {
  var sh = rpmSheet_(RPM_SH_BA);
  if (sh.getLastRow() < 5) throw new Error('Belum ada BA Pekerjaan.');
  var vals = sh.getRange(5, 1, sh.getLastRow() - 4, RPM_HEAD.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === idBa) {
      var blob = DriveApp.getFileById(vals[i][RPM_C.FILEID - 1]).getBlob();
      return { name: blob.getName(), mime: 'application/pdf', data: Utilities.base64Encode(blob.getBytes()) };
    }
  }
  throw new Error('BA dengan ID ' + idBa + ' tidak ditemukan.');
}

// Tanda tangan RPM (sekali unggah, dipakai otomatis di setiap PDF). b64 kosong = hapus.
function rpmSaveSign_(b64, mime) {
  var props = PropertiesService.getScriptProperties();
  var old = props.getProperty('RPM_SIGN_ID');
  if (!b64) {
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* abaikan */ } }
    props.deleteProperty('RPM_SIGN_ID');
    return { ok: true, hasSign: false };
  }
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > 1500000) throw new Error('Gambar tanda tangan terlalu besar (maks. 1,5 MB).');
  var blob = Utilities.newBlob(bytes, /png/i.test(mime || '') ? 'image/png' : 'image/jpeg', 'TTD_RPM_BMI');
  if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* abaikan */ } }
  var f = rpmFolder_().createFile(blob);
  props.setProperty('RPM_SIGN_ID', f.getId());
  return { ok: true, hasSign: true };
}

// Tanda tangan Mandor: disimpan per nama mandor di Script Property RPM_SIGN_MANDOR = {kunci: {id: fileId, name: nama}}.
// Dipakai otomatis di setiap BA untuk mandor itu. b64 kosong = hapus.
function rpmMandorKey_(name) { return normalizeText_(name); }

function rpmMandorSigns_() {
  var raw = PropertiesService.getScriptProperties().getProperty('RPM_SIGN_MANDOR');
  try { var o = raw ? JSON.parse(raw) : {}; return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}

function rpmMandorSignNames_() {
  var m = rpmMandorSigns_();
  return Object.keys(m).map(function (k) { return m[k].name || k; });
}

function rpmSaveMandorSign_(mandor, b64, mime) {
  var name = baClean_(mandor);
  if (!name) throw new Error('Isi dulu nama Mandor.');
  var key = rpmMandorKey_(name);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var map = rpmMandorSigns_();
    var old = map[key];
    if (!b64) {
      if (old && old.id) { try { DriveApp.getFileById(old.id).setTrashed(true); } catch (e) { /* abaikan */ } }
      delete map[key];
      props.setProperty('RPM_SIGN_MANDOR', JSON.stringify(map));
      return { ok: true, hasSign: false, mandor: name };
    }
    var bytes = Utilities.base64Decode(b64);
    if (bytes.length > 1500000) throw new Error('Gambar tanda tangan terlalu besar (maks. 1,5 MB).');
    var blob = Utilities.newBlob(bytes, /png/i.test(mime || '') ? 'image/png' : 'image/jpeg', 'TTD_MANDOR_' + name.replace(/[^A-Za-z0-9]+/g, '_'));
    if (old && old.id) { try { DriveApp.getFileById(old.id).setTrashed(true); } catch (e) { /* abaikan */ } }
    var f = rpmFolder_().createFile(blob);
    map[key] = { id: f.getId(), name: name };
    props.setProperty('RPM_SIGN_MANDOR', JSON.stringify(map));
    return { ok: true, hasSign: true, mandor: name };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// KURVA S CLUSTER: BASELINE, FORECAST, ACTUAL (HP RFS kumulatif per bulan, total semua region).
// Blok di DASHBOARD = bar judul + 5 kartu (Baseline, Forecast, Actual, Pencapaian, Selisih) + grafik 3 garis, tepat di atas
// "DATA PENDUKUNG CHART". Tabel sumber = "DATA KURVA S" (bagian bawah DASHBOARD), sel kuning boleh diubah:
//   - Baseline HP per bulan PER REGION (bawaan 1000; total area = nilai ini x jumlah region), bulan mulai, SOW,
//   - Forecast: jumlah bulan terakhir untuk kecepatan rata-rata (bawaan 3).
// Actual   = kolom "HP RFS" di DATA BASE menurut bulan (kolom Month) tiap site (kumulatif, berhenti di bulan berjalan).
// Forecast = dihitung PER REGION lalu dijumlahkan. Mulai dari bulan lalu (= Actual); bulan berjalan = Actual bulan lalu + MAKS(Actual
//            bulan ini + sisa jadwal, kecepatan); bulan berikutnya = bulan sebelumnya + MAKS(jadwal bulan itu, kecepatan).
//            Jadwal   = HP rencana (kolom HP SNDK/HP Rencana; kosong -> rata-rata HP per site RFS di region itu) site yang belum RFS
//                       dan bukan Drop menurut kolom Month; site tertunda (Month sudah lewat, belum RFS) masuk bulan berjalan.
//            Kecepatan = rata-rata HP RFS per bulan pada n bulan terakhir yang sudah lewat (per region).
// Kolom tabel: A Bulan, B Baseline/bulan/region, C Baseline kumulatif/region, D Actual/bulan, E Actual (kumulatif), F Pencapaian,
//   G Tanggal bulan, H Forecast (total), I..N Actual kumulatif per region, O Baseline (total), P..U Forecast kumulatif per region.
// Baris pembantu di bawah tabel (kolom H..N): kecepatan, rata-rata HP per site RFS, HP tertunda (per region).
// Sheet-side saja (dijalankan pemilik dari editor: setupKurvaS), tidak perlu deploy ulang web app. Aman dijalankan ulang.
// setupKurvaS_(sh): sh boleh salinan uji (mis. "TMP KURVA"); tanpa argumen = DASHBOARD.
// =====================================================================
var KURVA_BAR = 'KURVA S';
var KURVA_HELP = 'DATA KURVA S';
var KURVA_ROWS = 22;        // jumlah baris yang disisipkan di DASHBOARD
var KURVA_MONTHS = 12;      // jumlah bulan pada grafik (dihitung dari bulan mulai)
var KURVA_TARGET = 1000;    // Baseline HP per bulan per region (bawaan)
var KURVA_SPEED = 3;        // Forecast: kecepatan = rata-rata n bulan terakhir (bawaan)
var KB_M0 = 'DATE(YEAR(HARI_INI);MONTH(HARI_INI);1)';       // awal bulan berjalan
var KB_COLS = 21;           // kolom terakhir tabel (U)
var KB_C_BASE = 15;         // kolom O: Baseline total
var KB_C_FC0 = 16;          // kolom P: Forecast per region (6 slot)

function kurvaFindRow_(sh, prefix) {
  var n = Math.min(sh.getLastRow(), sh.getMaxRows());
  var v = sh.getRange(1, 1, n, 1).getDisplayValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).indexOf(prefix) === 0) return i + 1;
  return 0;
}

// Huruf kolom SOW, Month, dan HP RFS di DATA BASE (dicari dari judul di baris 1-4, jadi ikut bergeser bila kolom disisipkan).
function kurvaDbCols_(db) {
  var hdr = db.getRange(1, 1, 4, Math.max(db.getLastColumn(), 1)).getDisplayValues();
  function find(rx) {
    for (var r = 0; r < hdr.length; r++) for (var c = 0; c < hdr[r].length; c++) {
      if (rx.test(String(hdr[r][c]).replace(/\s+/g, ' ').trim())) return db.getRange(1, c + 1).getA1Notation().replace(/\d+/g, '');
    }
    throw new Error('Judul kolom ' + rx + ' tidak ditemukan di DATA BASE (baris 1-4).');
  }
  return { sow: find(/^SOW$/i), month: find(/^Month$/i), hp: find(/^HP RFS$/i) };
}

// Teks bulan (mis. "Sep 2026") dari sel tanggal.
function kbMonthText_(cell) {
  return 'CHOOSE(MONTH(' + cell + ');"Jan";"Feb";"Mar";"Apr";"Mei";"Jun";"Jul";"Agu";"Sep";"Okt";"Nov";"Des")&" "&YEAR(' + cell + ')';
}

function setupKurvaS_(shIn) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = shIn || ss.getSheetByName('DASHBOARD');
  var dbT = ss.getSheetByName('DATA BASE');
  if (!sh) throw new Error('Sheet DASHBOARD tidak ditemukan.');
  if (!dbT) throw new Error('Sheet DATA BASE tidak ditemukan.');
  prmEnsure_(ss);
  var GOLD = '#C9972C', INK = '#1A1A1A', GRID = '#BFBFBF', INPUT = '#FFF2CC', L = dokLetter_;
  var support = kurvaFindRow_(sh, 'DATA PENDUKUNG CHART');
  if (!support) throw new Error('Bagian "DATA PENDUKUNG CHART" tidak ditemukan di DASHBOARD.');
  var C = regCols_(dbT), ref = regRef_(dbT), planCol = dokFindCol_(dbT, /^HP( Rencana| SNDK)?$/i);
  var rSow = regRange_(ref, C.sow), rMon = regRange_(ref, C.mon), rHp = regRange_(ref, C.hp), rReg = regRange_(ref, C.region), rImp = regRange_(ref, C.impl);
  var rPlan = planCol ? regRange_(ref, planCol) : rHp;
  if (sh.getMaxColumns() < KB_COLS) sh.insertColumnsAfter(sh.getMaxColumns(), KB_COLS - sh.getMaxColumns());

  // ---- 1. sisipkan baris blok (sekali saja) ----
  var top = kurvaFindRow_(sh, KURVA_BAR);
  var inserted = false;
  if (!top) {
    top = support - 1;                       // baris kosong tepat di atas bar "DATA PENDUKUNG CHART"
    sh.insertRowsBefore(top, KURVA_ROWS);
    inserted = true;
  }
  var helpTop = kurvaFindRow_(sh, KURVA_HELP);
  if (!helpTop) helpTop = sh.getLastRow() + 3;
  var NR = KURVA_MONTHS;
  var P = helpTop + 1, HD = helpTop + 2, D1 = helpTop + 3, D2 = D1 + NR - 1;
  var M1 = D2 + 2, M2 = M1 + 1, M3 = M1 + 2, M4 = M1 + 3, M5 = M1 + 4, M6 = M1 + 5;
  // pastikan ada ruang kosong di bawah tabel sebelum blok berikutnya (mis. DATA KURVA S FWA)
  var colA = sh.getRange(helpTop + 1, 1, Math.max(sh.getLastRow() - helpTop, 1), 1).getDisplayValues(), below = 0;
  for (var q = 0; q < colA.length; q++) { if (String(colA[q][0]).indexOf('DATA ') === 0) { below = helpTop + 1 + q; break; } }
  if (below && below < M6 + 3) sh.insertRowsBefore(below, M6 + 3 - below);
  var list = regListRef_(sh);          // butuh blok DATA REGION (setupRegion); dihitung SETELAH baris disisipkan (alamat bergeser)

  // parameter yang sudah pernah diubah pemilik dipertahankan
  var keepBase = KURVA_TARGET, keepN = KURVA_SPEED;
  if (kurvaFindRow_(sh, KURVA_HELP)) {
    var pv = sh.getRange(P, 1, 1, 8).getValues()[0];
    if (/^Baseline/i.test(String(pv[0]))) {
      if (Number(pv[1]) > 0) keepBase = Number(pv[1]);
      if (Number(pv[7]) > 0) keepN = Number(pv[7]);
    }
  }

  // ---- 2. tabel sumber (DATA KURVA S) ----
  sh.getRange(helpTop, 1, M6 - helpTop + 1, KB_COLS).breakApart().clearContent().clearFormat().clearDataValidations();
  sh.getRange(helpTop, 1).setValue('DATA KURVA S - HP RFS per bulan: Baseline, Forecast, Actual (SOW Cluster; sel kuning boleh diubah)')
    .setFontFamily('Arial').setFontSize(10).setFontWeight('bold').setFontColor('#000000');
  sh.getRange(P, 1, 1, 8).setValues([['Baseline HP per bulan (per region)', keepBase, 'Bulan mulai', '', 'SOW', 'Cluster', 'Forecast: rata-rata (bulan)', keepN]]);
  sh.getRange(P, 4).setFormula('=MINIFS(' + rMon + ';' + rSow + ';$F$' + P + ';' + rMon + ';">0")');
  sh.getRange(P, 1, 1, 8).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  [1, 3, 5, 7].forEach(function (c) { sh.getRange(P, c).setFontWeight('bold').setHorizontalAlignment('left'); });
  [2, 4, 6, 8].forEach(function (c) {
    sh.getRange(P, c).setBackground(INPUT).setFontWeight('bold').setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, GRID, SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange(P, 2).setNumberFormat('#,##0');
  sh.getRange(P, 4).setNumberFormat('mmm yyyy');
  sh.getRange(P, 8).setNumberFormat('0');

  var hd = [['Bulan', 'Baseline / bulan / region (HP)', 'Baseline kumulatif / region (HP)', 'Actual / bulan (HP)', 'Actual', 'Pencapaian vs Baseline (%)', 'Tanggal bulan', 'Forecast']];
  sh.getRange(HD, 1, 1, 8).setValues(hd);
  var k, r;
  var hdrRegion = [], hdrFc = [];
  for (k = 0; k < REG_SLOTS; k++) {
    hdrRegion.push(regNameFx_(list, k + 1));
    hdrFc.push('=IF(' + L(REG_RC0 + k) + '$' + HD + '="";"";' + L(REG_RC0 + k) + '$' + HD + '&" (Forecast)")');
  }
  sh.getRange(HD, REG_RC0, 1, REG_SLOTS).setFormulas([hdrRegion]);
  sh.getRange(HD, KB_C_BASE).setValue('Baseline');
  sh.getRange(HD, KB_C_FC0, 1, REG_SLOTS).setFormulas([hdrFc]);
  sh.getRange(HD, 1, 1, KB_COLS).setBackground('#000000').setFontColor(GOLD).setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(HD, 46);

  // Forecast kumulatif per region (kolom P..U), baris r
  function fcFormula(kk, rr) {
    var ca = L(REG_RC0 + kk), cf = L(KB_C_FC0 + kk), nm = ca + '$' + HD;
    var prevA = rr > D1 ? ca + (rr - 1) : '0', prevF = rr > D1 ? cf + (rr - 1) : '0';
    var g = 'DATE(YEAR($G' + rr + ');MONTH($G' + rr + ');1)';
    var sched = 'SUMIFS(' + rPlan + ';' + rSow + ';$F$' + P + ';' + rReg + ';' + nm + ';' + rImp + ';"<>RFS";' + rImp + ';"<>Drop";' + rMon + ';$G' + rr + ')'
      + '+COUNTIFS(' + rSow + ';$F$' + P + ';' + rReg + ';' + nm + ';' + rImp + ';"<>RFS";' + rImp + ';"<>Drop";' + rMon + ';$G' + rr + ';' + rPlan + ';"")*' + ca + '$' + M2;
    return '=IF(' + nm + '="";"";LET(bulanIni;' + KB_M0 + ';bulanG;' + g + ';'
      + 'IF(bulanG<EDATE(bulanIni;-1);"";'
      + 'IF(bulanG=EDATE(bulanIni;-1);' + ca + rr + ';'
      + 'LET(jadwal;' + sched + ';'
      + 'IF(bulanG=bulanIni;' + prevA + '+MAX(' + ca + rr + '-' + prevA + '+jadwal+' + ca + '$' + M3 + ';' + ca + '$' + M1 + ');'
      + prevF + '+MAX(jadwal;' + ca + '$' + M1 + ')))))))';
  }

  var f = [];
  for (r = D1; r <= D2; r++) {
    var row = [
      '=' + kbMonthText_('G' + r),
      '=$B$' + P,
      '=SUM($B$' + D1 + ':B' + r + ')',
      '=SUMIFS(' + rHp + ';' + rSow + ';$F$' + P + ';' + rMon + ';G' + r + ')',
      '=IF(G' + r + '>HARI_INI;NA();SUM($D$' + D1 + ':D' + r + '))',
      '=IFERROR(E' + r + '/O' + r + ';"")',
      '=EDATE($D$' + P + ';ROWS($G$' + D1 + ':G' + r + ')-1)',
      '=IF(DATE(YEAR($G' + r + ');MONTH($G' + r + ');1)<EDATE(' + KB_M0 + ';-1);NA();SUM($P' + r + ':$U' + r + '))'
    ];
    for (k = 0; k < REG_SLOTS; k++) {
      var cl = L(REG_RC0 + k);
      row.push('=IF(' + cl + '$' + HD + '="";NA();IF($G' + r + '>HARI_INI;NA();SUMIFS(' + rHp + ';' + rSow + ';$F$' + P + ';' + rReg + ';' + cl + '$' + HD + ';' + rMon + ';"<="&$G' + r + ')))');
    }
    row.push('=IFERROR($C' + r + '*$B$' + M6 + ';"")');
    for (k = 0; k < REG_SLOTS; k++) row.push(fcFormula(k, r));
    f.push(row);
  }
  sh.getRange(D1, 1, NR, KB_COLS).setFormulas(f);
  var body = sh.getRange(D1, 1, NR, KB_COLS);
  body.setBackground('#FFFFFF').setFontColor('#000000').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(D1, 2, NR, 4).setNumberFormat('#,##0');
  sh.getRange(D1, 6, NR, 1).setNumberFormat('0.0%');
  sh.getRange(D1, 7, NR, 1).setNumberFormat('mmm yyyy').setFontColor('#888888');
  sh.getRange(D1, 8, NR, KB_COLS - 7).setNumberFormat('#,##0');

  // metrik (kolom A:B) dan baris pembantu Forecast per region (kolom H..N)
  sh.getRange(M1, 1, 6, 2).setValues([['Bulan ke-', ''], ['Baseline kumulatif', ''], ['Actual kumulatif', ''], ['Pencapaian', ''], ['Selisih (HP)', ''], ['Jumlah region', '']]);
  sh.getRange(M1, 2, 6, 1).setFormulas([
    ['=MAX(1;MIN(' + NR + ';(YEAR(HARI_INI)-YEAR($D$' + P + '))*12+MONTH(HARI_INI)-MONTH($D$' + P + ')+1))'],
    ['=IFERROR(INDEX($O$' + D1 + ':$O$' + D2 + ';B' + M1 + ');"")'],
    ['=IFERROR(INDEX($E$' + D1 + ':$E$' + D2 + ';B' + M1 + ');"")'],
    ['=IFERROR(B' + M3 + '/B' + M2 + ';"")'],
    ['=IFERROR(B' + M3 + '-B' + M2 + ';"")'],
    ['=MAX(1;COUNTIF(' + list + ';"?*")-1)']]);
  sh.getRange(M1, 1, 6, 2).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(M1, 1, 6, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(M1, 2, 6, 1).setHorizontalAlignment('center').setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(M2, 2, 2, 1).setNumberFormat('#,##0');
  sh.getRange(M4, 2).setNumberFormat('0.0%');
  sh.getRange(M5, 2).setNumberFormat('+#,##0;-#,##0;0');

  sh.getRange(M1, 8, 3, 1).setValues([['Kecepatan (HP/bulan)'], ['Rata-rata HP per site RFS'], ['Tertunda (HP)']])
    .setFontFamily('Arial').setFontSize(9).setFontWeight('bold').setHorizontalAlignment('left').setVerticalAlignment('middle').setWrap(true);
  var hlp = [[], [], []];
  for (k = 0; k < REG_SLOTS; k++) {
    var ca = L(REG_RC0 + k), nm = ca + '$' + HD;
    var col = '$' + ca + '$' + D1 + ':$' + ca + '$' + D2;
    hlp[0].push('=IF(' + nm + '="";"";IFERROR(LET(akhir;$B$' + M1 + '-1;awal;MAX(0;akhir-$H$' + P + ');IF(akhir<1;0;(INDEX(' + col + ';akhir)-IF(awal=0;0;INDEX(' + col + ';awal)))/(akhir-awal)));0))');
    hlp[1].push('=IF(' + nm + '="";"";IFERROR(SUMIFS(' + rHp + ';' + rSow + ';$F$' + P + ';' + rReg + ';' + nm + ';' + rImp + ';"RFS")/COUNTIFS(' + rSow + ';$F$' + P + ';' + rReg + ';' + nm + ';' + rImp + ';"RFS");0))');
    hlp[2].push('=IF(' + nm + '="";"";SUMIFS(' + rPlan + ';' + rSow + ';$F$' + P + ';' + rReg + ';' + nm + ';' + rImp + ';"<>RFS";' + rImp + ';"<>Drop";' + rMon + ';"<"&' + KB_M0 + ';' + rMon + ';">0")'
      + '+COUNTIFS(' + rSow + ';$F$' + P + ';' + rReg + ';' + nm + ';' + rImp + ';"<>RFS";' + rImp + ';"<>Drop";' + rMon + ';"<"&' + KB_M0 + ';' + rMon + ';">0";' + rPlan + ';"")*' + ca + '$' + M2 + ')');
  }
  sh.getRange(M1, REG_RC0, 3, REG_SLOTS).setFormulas(hlp).setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setNumberFormat('#,##0').setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);

  // #N/A (bulan yang belum terjadi / di luar rentang Forecast) disamarkan supaya tabel rapi; grafik tetap memakainya sebagai celah
  var rules = sh.getConditionalFormatRules().filter(function (rl) {
    var rg = rl.getRanges()[0]; return !(rg && rg.getRow() >= D1 && rg.getRow() + rg.getNumRows() - 1 <= D2) && !(rg && rg.getRow() >= top && rg.getRow() < top + 5);
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISNA(E' + D1 + ')').setFontColor('#FFFFFF').setRanges([sh.getRange(D1, 5, NR, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISNA(H' + D1 + ')').setFontColor('#FFFFFF').setRanges([sh.getRange(D1, 8, NR, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISNA(I' + D1 + ')').setFontColor('#FFFFFF').setRanges([sh.getRange(D1, REG_RC0, NR, REG_SLOTS)]).build());

  // ---- 3. bar + 5 kartu (baris top .. top+4); grafik dan panel TARGET RFS di bawahnya tidak disentuh ----
  var head = sh.getRange(top, 1, 5, 16);
  head.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setBorder(false, false, false, false, false, false);
  for (var rr = top; rr < top + 5; rr++) sh.setRowHeight(rr, 21);      // hanya baris judul + kartu (grafik dan panel TARGET RFS di bawahnya tidak disentuh)
  sh.setRowHeight(top, 26);
  sh.setRowHeight(top + 4, 8);
  var supportNow = kurvaFindRow_(sh, 'DATA PENDUKUNG CHART');
  sh.getRange(supportNow, 1, 1, 16).copyTo(sh.getRange(top, 1, 1, 16), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(top, 1).setValue('KURVA S - HP RFS KUMULATIF: BASELINE, FORECAST, ACTUAL (SOW CLUSTER, BULANAN)');
  var idxMonth = 'IFERROR(INDEX($A$' + D1 + ':$A$' + D2 + ';$B$' + M1 + ');"-")';
  var lastMonth = 'IFERROR(INDEX($A$' + D1 + ':$A$' + D2 + ';' + NR + ');"-")';
  var regSfx = '&IF($B$' + M6 + '>1;" - "&$B$' + M6 + '&" REGION";"")';
  var cards = [
    { c1: 2, c2: 4, val: '=$B$' + M2, fmt: '#,##0', lab: '="BASELINE s/d "&' + idxMonth + '&" (HP)"' + regSfx },
    { c1: 5, c2: 7, val: '=IFERROR(INDEX($H$' + D1 + ':$H$' + D2 + ';' + NR + ');"-")', fmt: '#,##0', lab: '="FORECAST s/d "&' + lastMonth + '&" (HP)"' },
    { c1: 8, c2: 10, val: '=$B$' + M3, fmt: '#,##0', lab: '="ACTUAL - HP RFS s/d "&' + idxMonth + '&" (HP)"' },
    { c1: 11, c2: 12, val: '=$B$' + M4, fmt: '0.0%', lab: 'PENCAPAIAN vs BASELINE' },
    { c1: 13, c2: 15, val: '=$B$' + M5, fmt: '+#,##0;-#,##0;0', lab: 'SELISIH vs BASELINE (HP)' }
  ];
  cards.forEach(function (cd) {
    var w = cd.c2 - cd.c1 + 1;
    var v = sh.getRange(top + 1, cd.c1, 2, w).merge();
    v.setFormula(cd.val).setNumberFormat(cd.fmt).setFontSize(26).setFontWeight('bold').setFontColor(GOLD).setHorizontalAlignment('center').setVerticalAlignment('middle');
    var lb = sh.getRange(top + 3, cd.c1, 1, w).merge();
    if (cd.lab.charAt(0) === '=') lb.setFormula(cd.lab); else lb.setValue(cd.lab);
    lb.setFontSize(10).setFontWeight('bold').setFontColor('#666666').setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(top + 1, cd.c1, 3, w).setBorder(true, true, true, true, false, false, GRID, SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange(top + 1, 5).setFontColor('#D2542B');                       // Forecast: oranye
  sh.getRange(top + 1, 2).setFontColor('#3D4F66');                       // Baseline: biru-abu
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#B00020').setRanges([sh.getRange(top + 1, 13, 2, 3)]).build());
  sh.setConditionalFormatRules(rules);

  // ---- 4. grafik: Baseline, Forecast, Actual (total semua region) ----
  sh.getCharts().forEach(function (c) {
    var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
    if (t.indexOf('Kurva S HP RFS') === 0) sh.removeChart(c);
  });
  var chart = sh.newChart().setChartType(Charts.ChartType.LINE)
    .addRange(sh.getRange(HD, 1, NR + 1, 1)).addRange(sh.getRange(HD, KB_C_BASE, NR + 1, 1)).addRange(sh.getRange(HD, 8, NR + 1, 1)).addRange(sh.getRange(HD, 5, NR + 1, 1))
    .setNumHeaders(1)
    .setPosition(top + 5, 2, 0, 4)
    .setOption('title', 'Kurva S HP RFS - Baseline, Forecast, Actual (SOW Cluster, total semua region, kumulatif per bulan)')
    .setOption('width', 747).setOption('height', 330)
    .setOption('useFirstColumnAsDomain', true)
    .setOption('colors', ['#3D4F66', '#D2542B', GOLD])
    .setOption('legend', { position: 'bottom' })
    .setOption('series', { 0: { lineWidth: 2.5, pointSize: 4 }, 1: { lineDashStyle: [7, 4], lineWidth: 3, pointSize: 5 }, 2: { lineWidth: 4, pointSize: 7 } })
    .setOption('vAxis', { title: 'HP (kumulatif)', format: '#,##0', minValue: 0 })
    .setOption('curveType', 'none')
    .build();
  sh.insertChart(chart);
  sh.getRange(top + KURVA_ROWS - 1, 2, 1, 14).breakApart().merge()
    .setFormula('="Baseline = "&FIXED($B$' + P + ';0)&" HP/bulan per region x "&$B$' + M6 + '&" region mulai "&$A$' + D1 + '&"  |  Actual = HP RFS di DATA BASE menurut bulan (kolom Month)  |  Forecast = Actual + sisa jadwal (HP rencana site belum RFS menurut Month; site tertunda masuk bulan berjalan) atau kecepatan rata-rata "&$H$' + P + '&" bulan terakhir, mana yang lebih besar  |  parameter (sel kuning): tabel DATA KURVA S di bagian bawah dashboard"')
    .setFontSize(9).setFontStyle('italic').setFontColor('#888888').setHorizontalAlignment('left').setVerticalAlignment('middle').setBackground('#FFFFFF');

  // ---- 5. tabel KURVA S PER REGION (tepat di bawah blok grafik) ----
  var tbl = kbRegionTable_(sh, ss);
  SpreadsheetApp.flush();
  var dash = kurvaDashForecast_(sh);
  return { top: top, inserted: inserted, helpTop: helpTop, tableRows: D1 + '-' + D2, metrics: M1 + '-' + M6, regionTable: tbl, garisPutus: dash };
}

// Tabel KURVA S PER REGION: Baseline, Actual, Pencapaian, Selisih, Forecast akhir periode, Forecast - Baseline akhir periode.
function kbRegionTable_(sh, ss) {
  var GOLD = '#C9972C', INK = '#1A1A1A', GRID = '#BFBFBF', L = dokLetter_;
  var K = regKC_(sh), top = K.top, NR = K.NR, HD = K.HD, D1 = K.D1, D2 = K.D2, M1 = K.M1, M2 = K.M2, M3 = K.M3, M4 = K.M4, M5 = K.M5;
  var list = regListRef_(sh);
  var tTop = regFindIn_(sh, 2, REG_KS_TITLE, top + KURVA_ROWS, top + KURVA_ROWS + REG_KS_ROWS + 2), inserted = false;
  if (!tTop) {
    tTop = top + KURVA_ROWS;
    if (String(sh.getRange(tTop, 1).getDisplayValue()).indexOf(KURVAF_BAR) !== 0) throw new Error('Baris di bawah blok Kurva S Cluster bukan blok Kurva S FWA (A' + tTop + '); tabel per region tidak dipasang.');
    sh.insertRowsBefore(tTop, REG_KS_ROWS);
    inserted = true;
    K = regKC_(sh); D1 = K.D1; D2 = K.D2; M1 = K.M1; M2 = K.M2; M3 = K.M3; M4 = K.M4; M5 = K.M5;
  }
  var blk = sh.getRange(tTop, 1, REG_KS_ROWS, 16);
  blk.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setFontWeight('normal')
    .setBorder(false, false, false, false, false, false).setVerticalAlignment('middle');
  sh.setRowHeight(tTop, 26); sh.setRowHeight(tTop + 1, 24); sh.setRowHeight(tTop + 2, 24);
  sh.setRowHeights(tTop + 3, REG_SLOTS, 22); sh.setRowHeight(tTop + REG_KS_ROWS - 1, 8);
  sh.getRange(tTop, 2, 1, 14).merge().setValue(REG_KS_TITLE + ' - BASELINE, FORECAST, ACTUAL (BASELINE SAMA UNTUK TIAP REGION)')
    .setBackground(INK).setFontColor('#E8C766').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  var cols = [[2, 3, 'Region', 'left'], [4, 5, 'Baseline s/d bulan ini (HP)', 'center'], [6, 7, 'Actual (HP)', 'center'], [8, 9, 'Pencapaian', 'center'],
    [10, 11, 'Selisih (HP)', 'center'], [12, 13, 'Forecast akhir periode (HP)', 'center'], [14, 15, 'Forecast - Baseline akhir (HP)', 'center']];
  cols.forEach(function (c) {
    sh.getRange(tTop + 1, c[0], 1, c[1] - c[0] + 1).merge();
    sh.getRange(tTop + 1, c[0]).setValue(c[2]).setHorizontalAlignment(c[3]).setWrap(true);
  });
  sh.getRange(tTop + 1, 2, 1, 14).setBackground(GOLD).setFontColor(INK).setFontWeight('bold').setVerticalAlignment('middle');
  sh.setRowHeight(tTop + 1, 34);
  var fm2 = { 4: '#,##0', 6: '#,##0', 8: '0.0%', 10: '+#,##0;-#,##0;0', 12: '#,##0', 14: '+#,##0;-#,##0;0' };
  function put(rr, c1, c2, fx) {
    if (c2 > c1) sh.getRange(rr, c1, 1, c2 - c1 + 1).merge();
    sh.getRange(rr, c1).setFormula(fx).setNumberFormat(fm2[c1]).setHorizontalAlignment('center');
  }
  var tr = tTop + 2, k;
  sh.getRange(tr, 2, 1, 2).merge();
  sh.getRange(tr, 2).setValue('TOTAL AREA').setHorizontalAlignment('left');
  put(tr, 4, 5, '=$B$' + M2); put(tr, 6, 7, '=$B$' + M3); put(tr, 8, 9, '=$B$' + M4); put(tr, 10, 11, '=$B$' + M5);
  put(tr, 12, 13, '=IFERROR(INDEX($H$' + D1 + ':$H$' + D2 + ';' + NR + ');"")');
  put(tr, 14, 15, '=IFERROR($L' + tr + '-INDEX($O$' + D1 + ':$O$' + D2 + ';' + NR + ');"")');
  sh.getRange(tr, 2, 1, 14).setBackground('#FBF1D6').setFontWeight('bold');
  for (k = 1; k <= REG_SLOTS; k++) {
    var rr2 = tr + k, bq = '$B' + rr2, ca = L(REG_RC0 + k - 1), cf = L(KB_C_FC0 + k - 1);
    sh.getRange(rr2, 2, 1, 2).merge();
    sh.getRange(rr2, 2).setFormula(regNameFx_(list, k)).setHorizontalAlignment('left').setFontWeight('bold');
    put(rr2, 4, 5, '=IF(' + bq + '="";"";IFERROR(INDEX($C$' + D1 + ':$C$' + D2 + ';$B$' + M1 + ');""))');
    put(rr2, 6, 7, '=IF(' + bq + '="";"";IFERROR(INDEX($' + ca + '$' + D1 + ':$' + ca + '$' + D2 + ';$B$' + M1 + ');""))');
    put(rr2, 8, 9, '=IF(' + bq + '="";"";IFERROR($F' + rr2 + '/$D' + rr2 + ';""))');
    put(rr2, 10, 11, '=IF(' + bq + '="";"";IFERROR($F' + rr2 + '-$D' + rr2 + ';""))');
    put(rr2, 12, 13, '=IF(' + bq + '="";"";IFERROR(INDEX($' + cf + '$' + D1 + ':$' + cf + '$' + D2 + ';' + NR + ');""))');
    put(rr2, 14, 15, '=IF(' + bq + '="";"";IFERROR($L' + rr2 + '-INDEX($C$' + D1 + ':$C$' + D2 + ';' + NR + ');""))');
  }
  sh.getRange(tTop, 2, REG_KS_ROWS - 1, 14).setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(tTop + 1, 2, 2 + REG_SLOTS, 14).setBorder(null, null, null, null, true, null, '#E6E6E6', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(tr, 2, 1, 14).setBorder(null, null, true, null, null, null, GRID, SpreadsheetApp.BorderStyle.SOLID);
  var rules = sh.getConditionalFormatRules().filter(function (rl) {
    var g0 = rl.getRanges()[0]; return !(g0 && g0.getRow() >= tTop && g0.getRow() < tTop + REG_KS_ROWS);
  });
  for (k = 1; k <= REG_SLOTS; k++) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B' + (tr + k) + '<>""').setFontColor(REG_COLORS[k - 1]).setRanges([sh.getRange(tr + k, 2, 1, 2)]).build());
  }
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($B' + (tr + 1) + '<>"";ISEVEN(ROW()))').setBackground('#FAF6EA').setRanges([sh.getRange(tr + 1, 4, REG_SLOTS, 12)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#B00020').setRanges([sh.getRange(tr, 10, 1 + REG_SLOTS, 2)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#B00020').setRanges([sh.getRange(tr, 14, 1 + REG_SLOTS, 2)]).build());
  sh.setConditionalFormatRules(rules);
  return { tableTop: tTop, inserted: inserted };
}

// =====================================================================
// KARTU TOTAL DONASI di DASHBOARD (tepat di bawah baris KPI): menampilkan subtotal kolom "Donasi" di DATA BASE
// (sel baris 1 pada kolom Donasi, mis. G1 = SUBTOTAL). Hanya merujuk sel itu, tanpa rentang/SUM lagi.
// Aman dijalankan ulang. Sheet-side (dijalankan pemilik dari editor: setupDonasi), tidak perlu deploy ulang web app.
// =====================================================================
function setupDonasi_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('DASHBOARD');
  var db = ss.getSheetByName('DATA BASE');
  if (!sh || !db) throw new Error('Sheet DASHBOARD atau DATA BASE tidak ditemukan.');
  var hdr = db.getRange(1, 1, 4, Math.max(db.getLastColumn(), 1)).getDisplayValues(), col = 0;
  for (var r = 0; r < hdr.length && !col; r++) for (var c = 0; c < hdr[r].length; c++) if (/^donasi$/i.test(String(hdr[r][c]).trim())) { col = c + 1; break; }
  if (!col) throw new Error('Kolom "Donasi" tidak ditemukan di DATA BASE (baris 1-4).');
  var src = db.getRange(1, col).getA1Notation();          // sel subtotal, mis. G1
  if (String(sh.getRange('B12').getDisplayValue()).indexOf('TOTAL SITE') !== 0) throw new Error('Baris KPI DASHBOARD tidak seperti biasa (B12 bukan "TOTAL SITE"); kartu donasi tidak dipasang.');
  var GOLD = '#C9972C', INK = '#1A1A1A';
  var top = 0, v = sh.getRange(10, 2, 25, 2).getDisplayValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).indexOf('TOTAL DONASI') === 0 || String(v[i][1]).indexOf('TOTAL DONASI') === 0) { top = 10 + i; break; }
  var inserted = false;
  if (!top) { top = 14; sh.insertRowsBefore(top, 4); inserted = true; }
  var blk = sh.getRange(top, 1, 4, 16);
  blk.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setBorder(false, false, false, false, false, false);
  sh.setRowHeight(top, 26);
  sh.setRowHeights(top + 1, 2, 30);
  sh.setRowHeight(top + 3, 8);
  var ttl = sh.getRange(top, 2, 1, 14).merge();
  ttl.setValue('TOTAL DONASI DIBAYARKAN').setBackground(INK).setFontColor('#E8C766').setFontSize(11).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('bottom');
  var val = sh.getRange(top + 1, 2, 2, 14).merge();
  val.setFormula("='DATA BASE'!" + src).setNumberFormat('"Rp"#,##0').setBackground(INK).setFontColor(GOLD).setFontSize(34).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(top, 2, 3, 14).setBorder(true, true, true, true, false, false, GOLD, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getImages().forEach(function (im) {
    var t = ''; try { t = im.getAltTextTitle(); } catch (e) { t = ''; }
    if (t.indexOf('DONASI_') === 0) im.remove();   // gambar dari versi lama kartu
  });
  SpreadsheetApp.flush();
  return { top: top, inserted: inserted, source: src };
}

// =====================================================================
// DOKUMEN PERMIT: kolom di DATA BASE + kartu di DASHBOARD
// Target: dokumen permit lengkap dan terkirim paling lambat 3 hari setelah donasi dibayar.
// Kolom di kanan "Donasi" (di bawah grup "Document"): Tgl Donasi Dibayar (diisi manual), Target Kirim Dokumen (rumus: tanggal bayar + 3 hari),
// 4 kotak centang (BA OPEN, PERJANJIAN DONASI, TANDA TERIMA DONASI, KWITANSI FOTO & KTP), Tgl Dokumen Terkirim (diisi manual),
// Status Dokumen (rumus). Letak kolom dicari dari judul baris 1-4, jadi tetap benar bila kolom disisipkan.
// setupDokumen dijalankan pemilik dari editor (sheet-side, tanpa deploy ulang web app; aman diulang, juga memigrasi versi lama
// tanpa kolom tanggal bayar). onEdit hanya memasang kotak centang saat kolom Name diisi di baris baru.
// =====================================================================
var DOK_DAYS = 3;
var DB_LAST_ROW = 1000;      // baris terakhir DATA BASE yang dibaca rumus Dashboard dan diberi rumus per-baris (kapasitas 996 site); satu-satunya tempat mengubah batas
var DOK_LAST_ROW = DB_LAST_ROW;
var DOK_ROWS = 11;           // jumlah baris blok kartu di DASHBOARD
var DOK_HEAD = ['Tgl Donasi Dibayar', 'Target Kirim Dokumen', 'BA OPEN', 'PERJANJIAN DONASI', 'TANDA TERIMA DONASI', 'KWITANSI, FOTO & KTP', 'Tgl Dokumen Terkirim', 'Status Dokumen'];
var DOK_KW_NOTE = 'KWITANSI, FOTO BUKTI PENYERAHAN DAN KTP PENERIMA KONTRIBUSI';

function dokLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Nomor kolom (1-based) dari judul di baris 1-4 (hdr = nilai tampilan baris 1-4); 0 bila tidak ada.
function dokFind_(hdr, rx) {
  for (var r = 0; r < hdr.length; r++) for (var c = 0; c < hdr[r].length; c++) {
    if (rx.test(String(hdr[r][c]).replace(/\s+/g, ' ').trim())) return c + 1;
  }
  return 0;
}
function dokHdr_(db) { return db.getRange(1, 1, 4, Math.max(db.getLastColumn(), 1)).getDisplayValues(); }
function dokFindCol_(db, rx) { return dokFind_(dokHdr_(db), rx); }

function dokCols_(db) {
  var h = dokHdr_(db);
  var o = {
    don: dokFind_(h, /^Donasi$/i), paid: dokFind_(h, /^Tgl Donasi Dibayar$/i), tgt: dokFind_(h, /^Target Kirim Dokumen$/i),
    ba: dokFind_(h, /^BA OPEN$/i), pj: dokFind_(h, /^PERJANJIAN DONASI$/i), tt: dokFind_(h, /^TANDA TERIMA DONASI$/i),
    kw: dokFind_(h, /^KWITANSI/i), sent: dokFind_(h, /^Tgl Dokumen Terkirim$/i), st: dokFind_(h, /^Status Dokumen$/i)
  };
  for (var k in o) if (!o[k]) return null;
  return o;
}

// Rumus Target Kirim Dokumen untuk baris r: Tgl Donasi Dibayar + DOK_DAYS hari (kosong bila tanggal bayar belum diisi).
function dokTargetFormula_(c, r) {
  var P = dokLetter_(c.paid) + r;
  return '=IF(' + P + '="";"";' + P + '+' + DOK_DAYS + ')';
}

// Rumus Status Dokumen untuk baris r (pemisah titik-koma sesuai lokal spreadsheet).
function dokStatusFormula_(c, r) {
  var L = dokLetter_, T = L(c.tgt) + r, S = L(c.sent) + r;
  var n = 'COUNTIF(' + L(c.ba) + r + ':' + L(c.kw) + r + ';TRUE)';
  return '=IF(' + T + '="";"";IF(' + S + '<>"";' +
    'IF(' + n + '<4;"Terkirim, kurang "&(4-' + n + ')&" dok";IF(' + S + '<=' + T + ';"Tepat waktu";"Terlambat "&(' + S + '-' + T + ')&" hari"));' +
    'IF(HARI_INI>' + T + ';"LEWAT "&(HARI_INI-' + T + ')&" hari ("&' + n + '&"/4)";' +
    'IF(' + n + '=4;"Lengkap, siap kirim";IF(HARI_INI=' + T + ';"Batas HARI INI ("&' + n + '&"/4)";"Sisa "&(' + T + '-HARI_INI)&" hari ("&' + n + '&"/4)")))))';
}

// Dipanggil onEdit: Name diisi di baris baru -> pasang kotak centang dokumen bila belum ada.
function dokOnEdit_(sh, rng) {
  var c = dokCols_(sh); if (!c) return;
  var r1 = Math.max(rng.getRow(), 5), r2 = Math.min(rng.getLastRow(), DOK_LAST_ROW); if (r2 < r1) return;
  var n = r2 - r1 + 1, nm = sh.getRange(r1, 2, n, 1).getValues();
  for (var j = 0; j < n; j++) {
    if (String(nm[j][0]).trim() === '') continue;
    var ck = sh.getRange(r1 + j, c.ba, 1, c.kw - c.ba + 1);
    if (!ck.getDataValidation()) ck.insertCheckboxes();
  }
}

// Pemicu sederhana (otomatis untuk ketikan/tempel manual). Juga mencatat tiap edit manual (semua tab) ke LOG HISTORY
// selama pemicu edit yang dipasang belum aktif (lihat logSheetEdit).
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var rg = e.range;
    var sh = rg.getSheet();
    if (sh.getName() === 'DATA BASE' && rg.getColumn() <= 2) {
      if (rg.getColumn() <= 1 && rg.getLastRow() >= 5) regSyncChart_();      // kolom Region diubah: sesuaikan jumlah garis Kurva S
      if (rg.getLastColumn() >= 2) dokOnEdit_(sh, rg);
    }
    if (!logEditByTrigger_()) logSheetEdit_(e, editorEmail_(), '');
  } catch (err) { /* jangan mengganggu pengetikan */ }
}

function dokSetupDb_(db) {
  var don = dokFindCol_(db, /^Donasi$/i);
  if (!don) throw new Error('Kolom "Donasi" tidak ditemukan di DATA BASE (baris 1-4).');
  var c = dokCols_(db), how = 'sudah ada';
  if (!c) {
    var h = dokHdr_(db), tgtN = dokFind_(h, /^Target Kirim Dokumen$/i), paidN = dokFind_(h, /^Tgl Donasi Dibayar$/i);
    if (tgtN && !paidN) {
      // migrasi dari versi lama (tanpa kolom tanggal bayar): sisipkan satu kolom tepat di kanan Donasi
      if (tgtN !== don + 1) throw new Error('Kolom "Target Kirim Dokumen" bukan tepat di kanan "Donasi"; migrasi dibatalkan.');
      db.insertColumnAfter(don);
      how = 'migrasi';
    } else if (!tgtN) {
      // pasang baru: 3 kolom kosong di kanan Donasi (disiapkan pemilik) + 5 kolom baru = 8 kolom
      var lastR = Math.max(db.getLastRow(), 5);
      var blank = db.getRange(1, don + 1, lastR, 3).getDisplayValues();
      for (var i = 0; i < blank.length; i++) for (var j = 0; j < 3; j++) {
        if (String(blank[i][j]).trim() !== '') throw new Error('Tiga kolom di kanan "Donasi" tidak kosong (baris ' + (i + 1) + '); kolom Dokumen tidak dipasang.');
      }
      db.insertColumnsAfter(don + 3, 5);
      how = 'baru';
    } else throw new Error('Sebagian judul kolom Dokumen sudah ada tetapi tidak lengkap; periksa baris 3 DATA BASE.');
    var t = don + 1;
    c = { don: don, paid: t, tgt: t + 1, ba: t + 2, pj: t + 3, tt: t + 4, kw: t + 5, sent: t + 6, st: t + 7 };
  }
  var GOLD = '#C9972C', INK = '#000000';
  var nm = db.getRange(5, 2, Math.max(db.getMaxRows() - 4, 1), 1).getValues(), lastData = 4;
  for (var k = 0; k < nm.length; k++) if (String(nm[k][0]).trim() !== '') lastData = 5 + k;
  var nData = Math.max(lastData - 4, 1), endRow = Math.min(DOK_LAST_ROW, db.getMaxRows());
  var nAll = endRow - 4, nCols = c.st - c.paid + 1;
  var L = dokLetter_;

  // simpan centang yang sudah ada (bila dijalankan ulang / migrasi) sebelum format disalin
  var ck = db.getRange(5, c.ba, nData, c.kw - c.ba + 1), prev = ck.getValues();

  // grup "Document" (digabung pemilik di baris 2) diperluas sampai kolom Status Dokumen
  var mg = db.getRange(2, c.don).getMergedRanges(), g0 = c.don, gTxt = 'Document';
  if (mg.length) { g0 = mg[0].getColumn(); gTxt = mg[0].getCell(1, 1).getDisplayValue() || gTxt; mg[0].breakApart(); }
  else gTxt = db.getRange(2, c.don).getDisplayValue() || gTxt;
  var grp = db.getRange(2, g0, 1, c.st - g0 + 1);
  grp.merge().setValue(gTxt).setBackground(INK).setFontColor(GOLD).setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // judul kolom (baris 3)
  var hd = db.getRange(3, c.paid, 1, nCols);
  hd.setValues([DOK_HEAD]).setBackground(INK).setFontColor(GOLD).setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  db.getRange(3, c.paid).setNote('Isi tanggal donasi dibayar (mis. 25/09/2026). Target Kirim Dokumen = tanggal ini + ' + DOK_DAYS + ' hari.');
  db.getRange(3, c.tgt).setNote('Otomatis: Tgl Donasi Dibayar + ' + DOK_DAYS + ' hari. Jangan diketik.');
  db.getRange(3, c.kw).setNote(DOK_KW_NOTE);
  db.getRange(3, c.sent).setNote('Isi tanggal dokumen lengkap dan sudah dikirim (mis. 25/09/2026).');
  if (db.getRowHeight(3) < 34) db.setRowHeight(3, 34);
  [110, 120, 80, 105, 105, 115, 115, 165].forEach(function (w, i) { db.setColumnWidth(c.paid + i, w); });

  // format isi: salin dari kolom Donasi (garis/warna sama), lalu atur format tiap kolom
  db.getRange(5, c.don, nAll, 1).copyTo(db.getRange(5, c.paid, nAll, nCols), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  var body = db.getRange(5, c.paid, nAll, nCols);
  body.setNumberFormat('0.###############').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(false);
  [c.paid, c.tgt, c.sent].forEach(function (col) { db.getRange(5, col, nAll, 1).setNumberFormat('dd mmm yyyy'); });
  db.getRange(5, c.st, nAll, 1).setFontWeight('bold');
  db.getRange(5, c.paid, nAll, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Isi tanggal donasi dibayar, mis. 25/09/2026').build());
  db.getRange(5, c.sent, nAll, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Isi tanggal dokumen dikirim, mis. 25/09/2026').build());

  // kotak centang (centang yang sudah ada dipertahankan)
  ck.insertCheckboxes();
  ck.setValues(prev.map(function (row) { return row.map(function (v) { return v === true; }); }));

  // rumus Target Kirim Dokumen dan Status Dokumen
  var ft = [], fs = [];
  for (var r = 5; r <= endRow; r++) { ft.push([dokTargetFormula_(c, r)]); fs.push([dokStatusFormula_(c, r)]); }
  db.getRange(5, c.tgt, ft.length, 1).setFormulas(ft);
  db.getRange(5, c.st, fs.length, 1).setFormulas(fs);

  // pewarnaan bersyarat (aturan lama milik kolom ini diganti)
  var rules = db.getConditionalFormatRules().filter(function (rl) {
    var g = rl.getRanges()[0]; return !(g && g.getColumn() >= c.paid && g.getColumn() <= c.st);
  });
  var stR = db.getRange(5, c.st, nAll, 1), allR = db.getRange(5, c.paid, nAll, nCols);
  function txt(prefix, bg, fc) { return SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith(prefix).setBackground(bg).setFontColor(fc).setRanges([stR]).build(); }
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=($B5<>"")*($' + L(c.don) + '5="")').setBackground('#F3F3F3').setFontColor('#8A8A8A').setRanges([allR]).build());
  rules.push(txt('Tepat waktu', '#E7F3E9', '#1E6B34'));
  ['Sisa', 'Batas', 'Lengkap'].forEach(function (p) { rules.push(txt(p, '#FBF1D6', '#7A5200')); });
  ['LEWAT', 'Terlambat', 'Terkirim'].forEach(function (p) { rules.push(txt(p, '#FBE5E5', '#9B1C1C')); });
  db.setConditionalFormatRules(rules);
  SpreadsheetApp.flush();
  return { how: how, cols: c, lastData: lastData, groupFrom: L(g0) };
}

function dokSetupCard_(sh, db) {
  var c = dokCols_(db);
  if (!c) throw new Error('Kolom Dokumen Permit belum ada di DATA BASE.');
  if (String(sh.getRange('B12').getDisplayValue()).indexOf('TOTAL SITE') !== 0) throw new Error('Baris KPI DASHBOARD tidak seperti biasa (B12 bukan "TOTAL SITE"); kartu tidak dipasang.');
  var GOLD = '#C9972C', INK = '#1A1A1A', GRID = '#BFBFBF', L = dokLetter_;
  var donTop = 0, top = 0, v = sh.getRange(10, 2, 30, 2).getDisplayValues();
  for (var i = 0; i < v.length; i++) {
    var a = String(v[i][0]), b = String(v[i][1]);
    if (a.indexOf('TOTAL DONASI') === 0 || b.indexOf('TOTAL DONASI') === 0) donTop = 10 + i;
    if (a.indexOf('DOKUMEN PERMIT') === 0 || b.indexOf('DOKUMEN PERMIT') === 0) top = 10 + i;
  }
  if (!donTop) throw new Error('Kartu Total Donasi belum ada di DASHBOARD; jalankan setupDonasi dulu.');
  var inserted = false;
  if (!top) { top = donTop + 4; sh.insertRowsBefore(top, DOK_ROWS); inserted = true; }

  var blk = sh.getRange(top, 1, DOK_ROWS, 16);
  blk.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setBorder(false, false, false, false, false, false);
  sh.setRowHeight(top, 26);
  sh.setRowHeights(top + 1, 2, 24);
  sh.setRowHeight(top + 3, 22);
  sh.setRowHeights(top + 4, 2, 24);
  sh.setRowHeights(top + 6, 4, 22);
  sh.setRowHeight(top + DOK_ROWS - 1, 8);

  var ttl = sh.getRange(top, 2, 1, 14).merge();
  ttl.setValue('DOKUMEN PERMIT: TARGET KIRIM ' + DOK_DAYS + ' HARI SETELAH DONASI').setBackground(INK).setFontColor('#E8C766').setFontSize(11).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  var ref = "'" + db.getName().replace(/'/g, "''") + "'!";     // nama sheet DATA BASE (parameter, supaya bisa diuji pada salinan)
  function rg(col) { return ref + '$' + L(col) + '$5:$' + L(col) + '$' + DOK_LAST_ROW; }
  var st = rg(c.st), paid = rg(c.paid);
  var tiles = [
    { c1: 2, c2: 4, f: '=COUNTIF(' + st + ';"Tepat waktu")', lab: 'TEPAT WAKTU' },
    { c1: 5, c2: 7, f: '=COUNTIF(' + st + ';"Sisa*")+COUNTIF(' + st + ';"Batas*")+COUNTIF(' + st + ';"Lengkap*")', lab: 'MASIH DI DALAM BATAS' },
    { c1: 8, c2: 11, f: '=COUNTIF(' + st + ';"LEWAT*")', lab: 'LEWAT BATAS, BELUM KIRIM' },
    { c1: 12, c2: 15, f: '=COUNTIF(' + st + ';"Terlambat*")+COUNTIF(' + st + ';"Terkirim, kurang*")', lab: 'KIRIM TERLAMBAT / KURANG DOKUMEN' }
  ];
  tiles.forEach(function (t) {
    var w = t.c2 - t.c1 + 1;
    sh.getRange(top + 1, t.c1, 2, w).merge().setFormula(t.f).setNumberFormat('0').setFontSize(26).setFontWeight('bold').setFontColor(GOLD)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(top + 3, t.c1, 1, w).merge().setValue(t.lab).setFontSize(10).setFontWeight('bold').setFontColor('#666666')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(top + 1, t.c1, 3, w).setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);
  });
  var okCell = 'B' + (top + 1), badCell = 'L' + (top + 1);
  sh.getRange(top + 4, 2, 1, 14).merge()
    .setFormula('="Site terlacak (Tgl Donasi Dibayar terisi): "&COUNT(' + paid + ')&"     |     "&IF(' + okCell + '+' + badCell + '=0;"Ketepatan kirim: - (belum ada dokumen yang dikirim)";"Ketepatan kirim: "&ROUND(100*' + okCell + '/(' + okCell + '+' + badCell + ');0)&"% ("&' + okCell + '&" dari "&(' + okCell + '+' + badCell + ')&" yang sudah dikirim)")')
    .setFontSize(10).setFontColor('#333333').setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);

  // tabel "Perlu segera dikirim": 4 site dengan Target Kirim paling awal yang belum ada Tgl Dokumen Terkirim
  var hr = top + 5;
  var heads = [[2, 7, 'Perlu segera dikirim', 'left'], [8, 11, 'Target Kirim', 'center'], [12, 15, 'Status', 'center']];
  heads.forEach(function (h) {
    sh.getRange(hr, h[0], 1, h[1] - h[0] + 1).merge().setValue(h[2]).setBackground(GOLD).setFontColor(INK).setFontWeight('bold')
      .setHorizontalAlignment(h[3]).setVerticalAlignment('middle');
  });
  var q = ref + '$B$5:$' + L(c.st) + '$' + DOK_LAST_ROW;
  var cn = function (col) { return 'Col' + (col - 1); };
  var qs = 'select Col1, ' + cn(c.tgt) + ', ' + cn(c.st) + ' where ' + cn(c.paid) + ' is not null and ' + cn(c.sent) + ' is null order by ' + cn(c.tgt) + ' limit 4';
  for (var k = 1; k <= 4; k++) {
    var r = hr + k;
    var fx = function (j, fb) { return '=IFERROR(INDEX(QUERY(' + q + ';"' + qs + '";0);' + k + ';' + j + ');"' + fb + '")'; };
    sh.getRange(r, 2, 1, 6).merge().setFormula(fx(1, k === 1 ? 'Tidak ada dokumen yang menunggu' : '')).setHorizontalAlignment('left').setVerticalAlignment('middle');
    sh.getRange(r, 8, 1, 4).merge().setFormula(fx(2, '')).setNumberFormat('dd mmm yyyy').setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(r, 12, 1, 4).merge().setFormula(fx(3, '')).setHorizontalAlignment('center').setVerticalAlignment('middle').setFontWeight('bold');
  }
  [[2, 7], [8, 11], [12, 15]].forEach(function (s) {
    sh.getRange(hr, s[0], 5, s[1] - s[0] + 1).setBorder(true, true, true, true, false, false, GRID, SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange(hr, 2, 5, 14).setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);

  // warna bersyarat kartu (aturan lama di blok ini diganti)
  var rules = sh.getConditionalFormatRules().filter(function (rl) {
    var g = rl.getRanges()[0]; return !(g && g.getRow() >= top && g.getRow() < top + DOK_ROWS);
  });
  var stT = sh.getRange(hr + 1, 12, 4, 4);
  function tx(p, bg, fc) { return SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith(p).setBackground(bg).setFontColor(fc).setRanges([stT]).build(); }
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#9B1C1C').setRanges([sh.getRange(top + 1, 8, 2, 4)]).build());
  ['Sisa', 'Batas', 'Lengkap'].forEach(function (p) { rules.push(tx(p, '#FBF1D6', '#7A5200')); });
  ['LEWAT', 'Terlambat', 'Terkirim'].forEach(function (p) { rules.push(tx(p, '#FBE5E5', '#9B1C1C')); });
  sh.setConditionalFormatRules(rules);
  SpreadsheetApp.flush();
  return { top: top, inserted: inserted, donTop: donTop };
}

function setupDokumen_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var db = ss.getSheetByName('DATA BASE'), sh = ss.getSheetByName('DASHBOARD');
  if (!db || !sh) throw new Error('Sheet DATA BASE atau DASHBOARD tidak ditemukan.');
  prmEnsure_(ss);
  var a = dokSetupDb_(db);
  var b = dokSetupCard_(sh, db);
  return { database: a, dashboard: b };
}

// =====================================================================
// KURVA S FWA: BASELINE, FORECAST, ACTUAL (site RFS kumulatif per bulan, SOW FWA). Tanpa HP: acuannya hanya TOTAL site FWA
// dan BULAN SELESAI (target). Blok dipasang tepat di bawah Kurva S Cluster; tabel sumber = "DATA KURVA S FWA" (bawah dashboard).
//   Baseline = total site FWA dibagi rata dari bulan mulai sampai bulan selesai (target); setelah itu garis berhenti.
//   Actual   = jumlah site FWA berstatus RFS menurut bulan (kolom Month), kumulatif sampai bulan berjalan.
//   Forecast = dari bulan lalu (= Actual): bulan berjalan = Actual bulan lalu + MAKS(RFS bulan ini + sisa jadwal, kecepatan);
//              bulan berikutnya = bulan sebelumnya + MAKS(jadwal bulan itu, kecepatan); tidak melebihi jumlah site FWA bukan Drop.
//              Jadwal = jumlah site FWA belum RFS dan bukan Drop menurut kolom Month (site tertunda masuk bulan berjalan);
//              Kecepatan = rata-rata RFS per bulan pada n bulan terakhir yang sudah lewat.
// Sel kuning boleh diubah: total (mis. diketik tetap), bulan selesai (target), rata-rata n bulan.
// Dijalankan pemilik dari editor: setupKurvaFwa (sheet-side, tanpa deploy ulang web app). Aman dijalankan ulang.
// =====================================================================
var KURVAF_BAR = 'KURVA S FWA';
var KURVAF_HELP = 'DATA KURVA S FWA';
var KURVAF_ROWS = 22;        // jumlah baris blok di DASHBOARD
var KURVAF_MONTHS = 12;      // jumlah bulan pada tabel/grafik (dari bulan mulai = Month terawal SOW FWA); Baseline berhenti di bulan selesai
var KURVAF_CHART = 'Progres FWA';           // awalan judul grafik FWA (dipakai untuk mengganti grafik lama)
var KURVAF_FINISH = [2026, 9];              // bulan selesai (target) bawaan: September 2026

function setupKurvaFwa_(sh) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sh = sh || ss.getSheetByName('DASHBOARD');
  var db = ss.getSheetByName('DATA BASE');
  if (!sh || !db) throw new Error('Sheet DASHBOARD atau DATA BASE tidak ditemukan.');
  prmEnsure_(ss);
  var GOLD = '#C9972C', GRID = '#BFBFBF', INPUT = '#FFF2CC', L = dokLetter_;
  var support = kurvaFindRow_(sh, 'DATA PENDUKUNG CHART');
  if (!support) throw new Error('Bagian "DATA PENDUKUNG CHART" tidak ditemukan di DASHBOARD.');
  var dbc = kurvaDbCols_(db), cImpN = dokFindCol_(db, /^Implementation Status$/i);
  if (!cImpN) throw new Error('Judul "Implementation Status" tidak ditemukan di DATA BASE (baris 1-4).');
  function rng(c) { return "'DATA BASE'!$" + c + '$5:$' + c + '$' + DB_LAST_ROW; }
  var rSow = rng(dbc.sow), rMon = rng(dbc.month), rImp = rng(dokLetter_(cImpN));
  if (sh.getMaxColumns() < 10) sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());

  // ---- 1. sisipkan baris blok (sekali saja) ----
  var top = kurvaFindRow_(sh, KURVAF_BAR), inserted = false;
  if (!top) { top = support - 1; sh.insertRowsBefore(top, KURVAF_ROWS); inserted = true; }
  var helpTop = kurvaFindRow_(sh, KURVAF_HELP);
  if (!helpTop) helpTop = sh.getLastRow() + 3;
  var NR = KURVAF_MONTHS;
  var P = helpTop + 1, HD = helpTop + 2, D1 = helpTop + 3, D2 = D1 + NR - 1;
  var M1 = D2 + 2, M2 = M1 + 1, M3 = M1 + 2, M4 = M1 + 3, M5 = M1 + 4;
  // pastikan ada 2 baris kosong di bawah tabel sebelum blok "DATA ..." berikutnya (tabel sekarang 12 bulan)
  var colA = sh.getRange(helpTop + 1, 1, Math.max(sh.getLastRow() - helpTop, 1), 1).getDisplayValues(), below = 0;
  for (var q = 0; q < colA.length; q++) { if (String(colA[q][0]).indexOf('DATA ') === 0) { below = helpTop + 1 + q; break; } }
  if (below && below < M5 + 3) sh.insertRowsBefore(below, M5 + 3 - below);

  // parameter yang sudah pernah diubah pemilik dipertahankan
  var keepTotal = null, keepFinish = new Date(KURVAF_FINISH[0], KURVAF_FINISH[1] - 1, 1), keepN = KURVA_SPEED;
  if (kurvaFindRow_(sh, KURVAF_HELP)) {
    var oldF = sh.getRange(P, 1, 1, 10).getFormulas()[0], oldV = sh.getRange(P, 1, 1, 10).getValues()[0];
    if (oldF[1] === '' && Number(oldV[1]) > 0) keepTotal = Number(oldV[1]);         // total diketik tetap
    if (/^Bulan selesai/i.test(String(oldV[6])) && oldV[7] instanceof Date) keepFinish = oldV[7];
    if (/^Forecast/i.test(String(oldV[8])) && Number(oldV[9]) > 0) keepN = Number(oldV[9]);
  }

  // ---- 2. tabel sumber (DATA KURVA S FWA) ----
  sh.getRange(helpTop, 1, M5 - helpTop + 1, 10).breakApart().clearContent().clearFormat().clearDataValidations();
  sh.getRange(helpTop, 1).setValue('DATA KURVA S FWA - site RFS per bulan: Baseline, Forecast, Actual (SOW FWA; sel kuning boleh diubah)')
    .setFontFamily('Arial').setFontSize(10).setFontWeight('bold').setFontColor('#000000');
  sh.getRange(P, 1, 1, 10).setValues([['Total target (site)', '', 'Bulan mulai', '', 'SOW', 'FWA', 'Bulan selesai (target)', keepFinish, 'Forecast: rata-rata (bulan)', keepN]]);
  if (keepTotal) sh.getRange(P, 2).setValue(keepTotal); else sh.getRange(P, 2).setFormula('=COUNTIF(' + rSow + ';$F$' + P + ')');
  sh.getRange(P, 4).setFormula('=MINIFS(' + rMon + ';' + rSow + ';$F$' + P + ';' + rMon + ';">0")');
  sh.getRange(P, 1, 1, 10).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  [1, 3, 5, 7, 9].forEach(function (c) { sh.getRange(P, c).setFontWeight('bold').setHorizontalAlignment('left'); });
  [2, 4, 6, 8, 10].forEach(function (c) {
    sh.getRange(P, c).setBackground(INPUT).setFontWeight('bold').setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, GRID, SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange(P, 2).setNumberFormat('#,##0');
  sh.getRange(P, 4).setNumberFormat('mmm yyyy');
  sh.getRange(P, 8).setNumberFormat('mmm yyyy');
  sh.getRange(P, 10).setNumberFormat('0');

  sh.getRange(HD, 1, 1, 10).setValues([['Bulan', 'Baseline / bulan (site)', 'Baseline kumulatif (site)', 'Actual / bulan (site)', 'Actual', 'Pencapaian kumulatif (%)', 'Tanggal bulan', 'Pencapaian bulan (%)', 'Forecast', 'Baseline']])
    .setBackground('#000000').setFontColor(GOLD).setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(HD, 34);

  var fin = 'DATE(YEAR($H$' + P + ');MONTH($H$' + P + ');1)';
  var mf = 'MAX(1;(YEAR($H$' + P + ')-YEAR($D$' + P + '))*12+MONTH($H$' + P + ')-MONTH($D$' + P + ')+1)';
  var f = [];
  for (var r = D1; r <= D2; r++) {
    var gm = 'DATE(YEAR($G' + r + ');MONTH($G' + r + ');1)';
    var prevE = r > D1 ? 'E' + (r - 1) : '0', prevI = r > D1 ? 'I' + (r - 1) : '0';
    var sched = 'COUNTIFS(' + rSow + ';$F$' + P + ';' + rImp + ';"<>RFS";' + rImp + ';"<>Drop";' + rMon + ';$G' + r + ')';
    var fc = '=LET(bulanIni;' + KB_M0 + ';bulanG;' + gm + ';'
      + 'IF(bulanG<EDATE(bulanIni;-1);NA();'
      + 'IF(bulanG=EDATE(bulanIni;-1);$E' + r + ';'
      + 'LET(jadwal;' + sched + ';'
      + 'IF(bulanG=bulanIni;MIN($I$' + M3 + ';' + prevE + '+MAX($E' + r + '-' + prevE + '+jadwal+$I$' + M2 + ';$I$' + M1 + '));'
      + 'MIN($I$' + M3 + ';' + prevI + '+MAX(jadwal;$I$' + M1 + ')))))))';
    f.push([
      '=' + kbMonthText_('G' + r),
      '=IF(' + gm + '<=' + fin + ';$B$' + P + '/' + mf + ';0)',
      '=SUM($B$' + D1 + ':B' + r + ')',
      '=COUNTIFS(' + rSow + ';$F$' + P + ';' + rMon + ';G' + r + ';' + rImp + ';"RFS")',
      '=IF(G' + r + '>HARI_INI;NA();SUM($D$' + D1 + ':D' + r + '))',
      '=IFERROR(E' + r + '/C' + r + ';"")',
      '=EDATE($D$' + P + ';ROWS($G$' + D1 + ':G' + r + ')-1)',
      '=IF(G' + r + '>HARI_INI;"";IFERROR(D' + r + '/B' + r + ';""))',
      fc,
      '=IF(' + gm + '>' + fin + ';NA();C' + r + ')'
    ]);
  }
  sh.getRange(D1, 1, NR, 10).setFormulas(f);
  var body = sh.getRange(D1, 1, NR, 10);
  body.setBackground('#FFFFFF').setFontColor('#000000').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(D1, 2, NR, 2).setNumberFormat('#,##0.0');
  sh.getRange(D1, 4, NR, 2).setNumberFormat('#,##0');
  sh.getRange(D1, 6, NR, 1).setNumberFormat('0.0%');
  sh.getRange(D1, 8, NR, 1).setNumberFormat('0.0%');
  sh.getRange(D1, 9, NR, 2).setNumberFormat('#,##0.0');
  sh.getRange(D1, 7, NR, 1).setNumberFormat('mmm yyyy').setFontColor('#888888');

  // metrik (A:B) dan pembantu Forecast (H:I)
  sh.getRange(M1, 1, 5, 2).setValues([['Bulan ke-', ''], ['Baseline kumulatif', ''], ['Actual kumulatif', ''], ['Pencapaian', ''], ['Selisih (site)', '']]);
  sh.getRange(M1, 2, 5, 1).setFormulas([
    ['=MAX(1;MIN(' + NR + ';(YEAR(HARI_INI)-YEAR($D$' + P + '))*12+MONTH(HARI_INI)-MONTH($D$' + P + ')+1))'],
    ['=IFERROR(INDEX($C$' + D1 + ':$C$' + D2 + ';B' + M1 + ');"")'],
    ['=IFERROR(INDEX($E$' + D1 + ':$E$' + D2 + ';B' + M1 + ');"")'],
    ['=IFERROR(B' + M3 + '/B' + M2 + ';"")'],
    ['=IFERROR(B' + M3 + '-B' + M2 + ';"")']]);
  sh.getRange(M1, 1, 5, 2).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(M1, 1, 5, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(M1, 2, 5, 1).setHorizontalAlignment('center').setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(M2, 2, 1, 1).setNumberFormat('#,##0.0');
  sh.getRange(M3, 2, 1, 1).setNumberFormat('#,##0');
  sh.getRange(M4, 2).setNumberFormat('0.0%');
  sh.getRange(M5, 2).setNumberFormat('+#,##0.0;-#,##0.0;0');

  var col = '$E$' + D1 + ':$E$' + D2, rngI = '$I$' + D1 + ':$I$' + D2;
  sh.getRange(M1, 8, 4, 1).setValues([['Kecepatan (site/bulan)'], ['Tertunda (site)'], ['Batas (site bukan Drop)'], ['Perkiraan selesai (Forecast)']])
    .setFontFamily('Arial').setFontSize(9).setFontWeight('bold').setHorizontalAlignment('left').setVerticalAlignment('middle').setWrap(true);
  sh.getRange(M1, 9, 4, 1).setFormulas([
    ['=IFERROR(LET(akhir;$B$' + M1 + '-1;awal;MAX(0;akhir-$J$' + P + ');IF(akhir<1;0;(INDEX(' + col + ';akhir)-IF(awal=0;0;INDEX(' + col + ';awal)))/(akhir-awal)));0)'],
    ['=COUNTIFS(' + rSow + ';$F$' + P + ';' + rImp + ';"<>RFS";' + rImp + ';"<>Drop";' + rMon + ';"<"&' + KB_M0 + ';' + rMon + ';">0")'],
    ['=COUNTIFS(' + rSow + ';$F$' + P + ';' + rImp + ';"<>Drop")'],
    ['=IFERROR(IF(COUNTIF(' + rngI + ';"<"&($I$' + M3 + '))>=COUNT(' + rngI + ');"lewat "&IFERROR(INDEX($A$' + D1 + ':$A$' + D2 + ';' + NR + ');"-");INDEX($A$' + D1 + ':$A$' + D2 + ';MAX(1;$B$' + M1 + '-1)+COUNTIF(' + rngI + ';"<"&($I$' + M3 + '))));"-")']]);
  sh.getRange(M1, 9, 4, 1).setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(M1, 9, 3, 1).setNumberFormat('#,##0.0');

  // #N/A (di luar rentang) disamarkan supaya tabel rapi; grafik tetap memakainya sebagai celah
  var rules = sh.getConditionalFormatRules().filter(function (rl) {
    var rg = rl.getRanges()[0];
    return !(rg && rg.getRow() >= D1 && rg.getRow() + rg.getNumRows() - 1 <= D2) && !(rg && rg.getRow() >= top && rg.getRow() < top + KURVAF_ROWS);
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISNA(E' + D1 + ')').setFontColor('#FFFFFF').setRanges([sh.getRange(D1, 5, NR, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISNA(I' + D1 + ')').setFontColor('#FFFFFF').setRanges([sh.getRange(D1, 9, NR, 2)]).build());

  // ---- 3. blok di DASHBOARD: bar + 5 kartu + grafik ----
  var blk = sh.getRange(top, 1, KURVAF_ROWS, 16);
  blk.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setBorder(false, false, false, false, false, false);
  for (var rr = top; rr < top + KURVAF_ROWS; rr++) sh.setRowHeight(rr, 21);
  sh.setRowHeight(top, 26);
  sh.setRowHeight(top + 4, 8);
  var supportNow = kurvaFindRow_(sh, 'DATA PENDUKUNG CHART');
  sh.getRange(supportNow, 1, 1, 16).copyTo(sh.getRange(top, 1, 1, 16), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(top, 1).setValue('KURVA S FWA - SITE RFS KUMULATIF: BASELINE, FORECAST, ACTUAL (SOW FWA, BULANAN)');

  var idxMonth = 'IFERROR(INDEX($A$' + D1 + ':$A$' + D2 + ';$B$' + M1 + ');"-")';
  var finText = kbMonthText_('$H$' + P);
  var finIdx = 'MAX(1;MIN(' + NR + ';(YEAR($H$' + P + ')-YEAR($D$' + P + '))*12+MONTH($H$' + P + ')-MONTH($D$' + P + ')+1))';
  var cards = [
    { c1: 2, c2: 4, val: '=$B$' + M2, fmt: '#,##0.0', lab: '="BASELINE s/d "&' + idxMonth + '&" (site) - target selesai "&' + finText },
    { c1: 5, c2: 7, val: '=IFERROR(INDEX($I$' + D1 + ':$I$' + D2 + ';' + finIdx + ');"-")', fmt: '#,##0.0', lab: '="FORECAST s/d "&' + finText + '&" | selesai "&$I$' + M4 },
    { c1: 8, c2: 10, val: '=$B$' + M3, fmt: '#,##0', lab: '="ACTUAL - SITE RFS s/d "&' + idxMonth + '&" (site)"' },
    { c1: 11, c2: 12, val: '=$B$' + M4, fmt: '0.0%', lab: 'PENCAPAIAN vs BASELINE' },
    { c1: 13, c2: 15, val: '=$B$' + M5, fmt: '+#,##0.0;-#,##0.0;0', lab: 'SELISIH vs BASELINE (site)' }
  ];
  cards.forEach(function (cd) {
    var w = cd.c2 - cd.c1 + 1;
    var v = sh.getRange(top + 1, cd.c1, 2, w).merge();
    v.setFormula(cd.val).setNumberFormat(cd.fmt).setFontSize(26).setFontWeight('bold').setFontColor(GOLD).setHorizontalAlignment('center').setVerticalAlignment('middle');
    var lb = sh.getRange(top + 3, cd.c1, 1, w).merge();
    if (cd.lab.charAt(0) === '=') lb.setFormula(cd.lab); else lb.setValue(cd.lab);
    lb.setFontSize(10).setFontWeight('bold').setFontColor('#666666').setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(top + 1, cd.c1, 3, w).setBorder(true, true, true, true, false, false, GRID, SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange(top + 1, 2).setFontColor('#3D4F66');
  sh.getRange(top + 1, 5).setFontColor('#D2542B');
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#B00020').setRanges([sh.getRange(top + 1, 13, 2, 3)]).build());
  sh.setConditionalFormatRules(rules);

  // ---- 4. grafik ----
  sh.getCharts().forEach(function (c) {
    var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
    if (t.indexOf(KURVAF_CHART) === 0) sh.removeChart(c);
  });
  var chart = sh.newChart().setChartType(Charts.ChartType.LINE)
    .addRange(sh.getRange(HD, 1, NR + 1, 1)).addRange(sh.getRange(HD, 10, NR + 1, 1)).addRange(sh.getRange(HD, 9, NR + 1, 1)).addRange(sh.getRange(HD, 5, NR + 1, 1))
    .setNumHeaders(1)
    .setPosition(top + 5, 2, 0, 4)
    .setOption('title', KURVAF_CHART + ' - Kurva S Baseline, Forecast, Actual (site RFS kumulatif per bulan)')
    .setOption('width', 1587).setOption('height', 330)
    .setOption('useFirstColumnAsDomain', true)
    .setOption('colors', ['#3D4F66', '#D2542B', GOLD])
    .setOption('legend', { position: 'bottom' })
    .setOption('series', { 0: { lineWidth: 2.5, pointSize: 4 }, 1: { lineDashStyle: [7, 4], lineWidth: 3, pointSize: 5 }, 2: { lineWidth: 4, pointSize: 7 } })
    .setOption('vAxis', { title: 'Site (kumulatif)', format: '#,##0', minValue: 0 })
    .setOption('curveType', 'none')
    .build();
  sh.insertChart(chart);
  sh.getRange(top + KURVAF_ROWS - 1, 2, 1, 14).merge()
    .setFormula('="Baseline = total "&FIXED($B$' + P + ';0)&" site FWA dibagi rata "&' + mf + '&" bulan ("&$A$' + D1 + '&" s/d "&' + finText + '&" = "&FIXED($B$' + P + '/' + mf + ';1)&" site/bulan)  |  Actual = site FWA berstatus RFS menurut bulan (kolom Month)  |  Forecast = Actual + jadwal Month site belum RFS atau kecepatan rata-rata "&$J$' + P + '&" bulan terakhir (yang lebih besar), maksimal "&$I$' + M3 + '&" site (tanpa Drop); perkiraan selesai "&$I$' + M4 + '&"  |  "&COUNTIFS(' + rSow + ';$F$' + P + ';' + rImp + ';"RFS";' + rMon + ';"")&" site RFS belum punya Month (belum terhitung)  |  sel kuning: tabel DATA KURVA S FWA di bawah dashboard"')
    .setFontSize(9).setFontStyle('italic').setFontColor('#888888').setHorizontalAlignment('left').setVerticalAlignment('middle');
  SpreadsheetApp.flush();
  var dash = kurvaDashForecast_(sh);
  return { top: top, inserted: inserted, helpTop: helpTop, tableRows: D1 + '-' + D2, metrics: M1 + '-' + M5, garisPutus: dash };
}

// Uji di salinan: menyalin DASHBOARD menjadi "TMP KURVA" lalu memasang Kurva S baru di salinan itu (DASHBOARD asli tidak disentuh).
function testKurvaBfa_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var old = ss.getSheetByName('TMP KURVA');
  if (old) ss.deleteSheet(old);
  var tmp = ss.getSheetByName('DASHBOARD').copyTo(ss).setName('TMP KURVA');
  var a = setupKurvaS_(tmp), b = setupKurvaFwa_(tmp);
  return { cluster: a, fwa: b, sheetId: tmp.getSheetId() };
}
function hapusTmpKurva_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), t = ss.getSheetByName('TMP KURVA');
  if (t) ss.deleteSheet(t);
  return { deleted: !!t };
}
// Garis Forecast putus-putus. SpreadsheetApp tidak bisa mengatur gaya garis, jadi dipasang lewat layanan lanjutan "Google Sheets API"
// (Editor > Layanan > Google Sheets API, pengenal Sheets). Bila layanan belum aktif, dilewati dan dilaporkan; grafik tetap tampil (garis penuh).
// Dipanggil otomatis di akhir setupKurvaS_ dan setupKurvaFwa_; garisForecastPutus() memasangnya ke grafik yang sudah ada tanpa membangun ulang.
function kurvaDashForecast_(sh) {
  try {
    if (typeof Sheets === 'undefined') return { ok: false, why: 'Layanan lanjutan Google Sheets API belum diaktifkan' };
    var ssId = sh.getParent().getId(), sid = sh.getSheetId();
    var res = Sheets.Spreadsheets.get(ssId, { fields: 'sheets(properties(sheetId),charts(chartId,spec))' });
    var reqs = [];
    (res.sheets || []).forEach(function (s) {
      if (s.properties.sheetId !== sid) return;
      (s.charts || []).forEach(function (c) {
        var spec = c.spec || {};
        if (!spec.basicChart || !/Baseline, Forecast, Actual/.test(String(spec.title || ''))) return;
        var sr = spec.basicChart.series || [];
        if (sr.length < 3) return;
        sr[1].lineStyle = { type: 'MEDIUM_DASHED', width: 3 };      // seri ke-2 = Forecast
        reqs.push({ updateChartSpec: { chartId: c.chartId, spec: spec } });
      });
    });
    if (reqs.length) Sheets.Spreadsheets.batchUpdate({ requests: reqs }, ssId);
    return { ok: true, charts: reqs.length };
  } catch (e) {
    return { ok: false, why: String(e) };
  }
}

// =====================================================================
// TARGET RFS (SOW Cluster) di DASHBOARD, di sebelah kanan grafik Kurva S Cluster: pilih "Bulan target", daftar site Cluster
// dengan Month = bulan itu terisi otomatis dari DATA BASE (nama, HP, status), plus jumlah site, total HP target, HP sudah RFS,
// dan pencapaian. Month dipakai sebagai bulan target RFS. HP = kolom "HP Rencana" (tepat di kanan SNDK); bila kosong dipakai HP RFS.
// Daftar bulan pendukung ada di bagian bawah DASHBOARD (DATA TARGET RFS). Kapasitas daftar TRFS_CAP baris; bila lebih banyak,
// baris terakhir menampilkan "+N site lainnya". setupTargetRfs dijalankan pemilik dari editor (sheet-side, tanpa deploy ulang); aman diulang.
// =====================================================================
var TRFS_SOW = 'Cluster';
var TRFS_MONTHS = 24;
var TRFS_HP = 'HP Rencana';
var TRFS_LAST = DB_LAST_ROW;
var TRFS_CAP = 10;
var TRFS_HELP = 'DATA TARGET RFS';
var TRFS_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Kolom (A1, huruf) -> nomor kolom.
function trfsColNum_(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

// Rumus di sheet lain yang merujuk kolom SNDK..ABD di DATA BASE (menyisipkan kolom di tengahnya bisa mengubah hasilnya).
function trfsFindRefs_(ss, db) {
  var h = dokHdr_(db), a = dokFind_(h, /^SNDK$/i), b = dokFind_(h, /^ABD$/i), found = [];
  if (!a || !b) return found;
  var re = /'DATA BASE'!\$?([A-Z]{1,3})\$?\d*(?::\$?([A-Z]{1,3})\$?\d*)?/g;
  ss.getSheets().forEach(function (sh) {
    if (sh.getSheetId() === db.getSheetId()) return;
    var lr = sh.getLastRow(), lc = sh.getLastColumn(); if (!lr || !lc) return;
    var f = sh.getRange(1, 1, lr, lc).getFormulas();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < f[i].length; j++) {
      var s = f[i][j]; if (!s || s.indexOf("'DATA BASE'!") < 0) continue;
      var m; re.lastIndex = 0;
      while ((m = re.exec(s))) {
        var c1 = trfsColNum_(m[1]), c2 = m[2] ? trfsColNum_(m[2]) : c1;
        if (Math.min(c1, c2) <= b && Math.max(c1, c2) >= a && !(c1 === c2 && (c1 < a || c1 > b))) {
          found.push(sh.getName() + '!' + sh.getRange(i + 1, j + 1).getA1Notation() + ' ' + s.slice(0, 90));
        }
      }
    }
  });
  return found;
}

// Sisipkan kolom "HP Rencana" tepat di kanan SNDK (aman diulang).
function trfsAddHpColumn_(db) {
  var h = dokHdr_(db), hp = dokFind_(h, /^HP( Rencana| SNDK)?$/i);
  if (hp) return { col: hp, added: false };
  var sndk = dokFind_(h, /^SNDK$/i), apd = dokFind_(h, /^APD$/i);
  if (!sndk || apd !== sndk + 1) throw new Error('Kolom SNDK dan APD tidak berdampingan; kolom HP Rencana tidak dipasang.');
  db.insertColumnAfter(sndk);
  var c = sndk + 1, maxR = db.getMaxRows();
  db.getRange(3, sndk, maxR - 2, 1).copyTo(db.getRange(3, c, maxR - 2, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  db.getRange(3, c).setValue(TRFS_HP).setNote('Rencana HP site (khusus SOW Cluster). Dipakai panel TARGET RFS di Dashboard; bila kosong dipakai HP RFS.');
  db.getRange(5, c, maxR - 4, 1).setNumberFormat('#,##0').setHorizontalAlignment('center').setVerticalAlignment('middle');
  db.setColumnWidth(c, 95);
  // grup di baris 2 (DRAWING): pastikan gabungannya mencakup kolom baru
  var mr = db.getRange(2, sndk).getMergedRanges();
  if (mr.length && mr[0].getLastColumn() < c) {
    var g0 = mr[0].getColumn(), txt = mr[0].getCell(1, 1).getValue();
    var bg = mr[0].getCell(1, 1).getBackground(), fc = mr[0].getCell(1, 1).getFontColor();
    mr[0].breakApart();
    db.getRange(2, g0, 1, c - g0 + 1).merge().setValue(txt).setBackground(bg).setFontColor(fc)
      .setFontWeight('bold').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  SpreadsheetApp.flush();
  return { col: c, added: true };
}

// Label bulan terakhir yang punya data Cluster (nama bulan + tahun) untuk pilihan awal.
function trfsDefaultLabel_(db) {
  var h = dokHdr_(db), sow = dokFind_(h, /^SOW$/i), mon = dokFind_(h, /^Month$/i), best = 0;
  var v = db.getRange(5, 1, Math.max(db.getLastRow() - 4, 1), Math.max(sow, mon)).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][sow - 1]).trim() === TRFS_SOW && v[i][mon - 1] instanceof Date) best = Math.max(best, v[i][mon - 1].getTime());
  }
  var d = best ? new Date(best) : new Date();
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return TRFS_BULAN[+Utilities.formatDate(d, tz, 'M') - 1] + ' ' + Utilities.formatDate(d, tz, 'yyyy');
}

// Panel di DASHBOARD (kolom H:O, mulai baris top+5 = baris grafik Kurva S Cluster). `top` = baris judul blok Kurva S Cluster.
function trfsPanel_(sh, db, top, cap, label, regLabel, undo) {
  cap = cap || TRFS_CAP;
  var GOLD = '#C9972C', INK = '#1A1A1A', GRID = '#BFBFBF', INPUT = '#FFF2CC';
  var h = dokHdr_(db), C = {
    name: dokFind_(h, /^Name$/i), region: dokFind_(h, /^Region$/i), sow: dokFind_(h, /^SOW$/i), mon: dokFind_(h, /^Month$/i),
    plan: dokFind_(h, /^HP( Rencana| SNDK)?$/i), hp: dokFind_(h, /^HP RFS$/i), impl: dokFind_(h, /^Implementation Status$/i)
  };
  for (var k in C) if (!C[k]) throw new Error('Judul kolom "' + k + '" tidak ditemukan di DATA BASE (baris 1-4).');
  var ref = "'" + db.getName().replace(/'/g, "''") + "'!";
  function fx(col) { return ref + '$' + dokLetter_(col) + '$5:$' + dokLetter_(col) + '$' + TRFS_LAST; }
  function fo(col) { return ref + '$' + dokLetter_(col) + '$5:$' + dokLetter_(col); }
  var sowR = fx(C.sow), monR = fx(C.mon), planR = fx(C.plan), hpR = fx(C.hp), implR = fx(C.impl), regR = fx(C.region);

  var r0 = top + 5, nRows = 5 + cap, c0 = 8;
  var area = sh.getRange(r0, c0, nRows, 8), fm = area.getFormulas(), dv = area.getDisplayValues();
  var mine = String(sh.getRange(r0, c0).getDisplayValue()).indexOf('TARGET RFS CLUSTER') === 0;
  if (!mine) for (var i = 0; i < fm.length; i++) for (var j = 0; j < fm[i].length; j++) {
    if (fm[i][j] !== '' || dv[i][j] !== '') throw new Error('Area panel di DASHBOARD (H' + r0 + ':O' + (r0 + nRows - 1) + ') tidak kosong; panel tidak dipasang.');
  }

  // pilihan yang sedang aktif dipertahankan bila panel dipasang ulang; daftar region (SEMUA REGION + region) dari blok DATA REGION
  var RH = regHelperEnsure_(sh, db, undo), rs = r0 + 1, keepMonth = '', keepReg = '';
  if (mine) { keepMonth = String(sh.getRange(rs, 10).getDisplayValue()); keepReg = String(sh.getRange(rs, 13).getDisplayValue()); }
  if (keepMonth && /^[A-Za-z]+ \d{4}$/.test(keepMonth)) label = keepMonth;
  var regList = sh.getRange(RH.first, 1, REG_LIST_ROWS, 1).getDisplayValues().map(function (x) { return String(x[0]); });
  var regPick = regLabel || (keepReg && regList.indexOf(keepReg) >= 0 ? keepReg : REG_ALL);
  if (undo && mine) regUndo_(undo, 'panel TARGET RFS', function () {
    sh.getRange(rs, 13, 1, 3).clearDataValidations().setBackground('#FFFFFF');
    for (var i = 0; i < fm.length; i++) for (var j = 0; j < fm[i].length; j++) {
      var c2 = sh.getRange(r0 + i, c0 + j);
      if (fm[i][j] !== '') c2.setFormula(fm[i][j]); else if (dv[i][j] !== '') c2.setValue(dv[i][j]);
    }
  });

  // ---- daftar bulan pendukung (bagian bawah DASHBOARD) ----
  var helpTop = kurvaFindRow_(sh, TRFS_HELP);
  if (!helpTop) helpTop = sh.getLastRow() + 3;
  var L1 = helpTop + 2, LN = helpTop + 1 + TRFS_MONTHS, pickRow = LN + 2, P = '$B$' + pickRow;
  var selCell = '$J$' + rs;
  sh.getRange(helpTop, 1, TRFS_MONTHS + 4, 3).clearContent().clearFormat();
  sh.getRange(helpTop, 1).setValue('DATA TARGET RFS - daftar bulan untuk pilihan (SOW ' + TRFS_SOW + ')').setFontFamily('Arial').setFontSize(10).setFontWeight('bold').setFontColor('#000000');
  sh.getRange(helpTop + 1, 1, 1, 2).setValues([['Bulan', 'Tanggal']]).setBackground('#000000').setFontColor(GOLD).setFontWeight('bold')
    .setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center');
  var mf = [];
  for (var r = L1; r <= LN; r++) {
    mf.push([
      '=CHOOSE(MONTH(B' + r + ');"Januari";"Februari";"Maret";"April";"Mei";"Juni";"Juli";"Agustus";"September";"Oktober";"November";"Desember")&" "&YEAR(B' + r + ')',
      r === L1 ? '=IFERROR(MINIFS(' + monR + ';' + sowR + ';"' + TRFS_SOW + '";' + monR + ';">0");DATE(2026;1;1))' : '=EDATE(B' + (r - 1) + ';1)'
    ]);
  }
  sh.getRange(L1, 1, TRFS_MONTHS, 2).setFormulas(mf).setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setHorizontalAlignment('center');
  sh.getRange(L1, 2, TRFS_MONTHS, 1).setNumberFormat('dd mmm yyyy');
  sh.getRange(pickRow, 1).setValue('Tanggal terpilih').setFontFamily('Arial').setFontSize(10).setFontWeight('bold').setFontColor('#000000');
  sh.getRange(pickRow, 2).setFormula('=IFERROR(INDEX($B$' + L1 + ':$B$' + LN + ';MATCH(' + selCell + ';$A$' + L1 + ':$A$' + LN + ';0));"")')
    .setNumberFormat('dd mmm yyyy').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setHorizontalAlignment('center');

  // ---- panel ----
  var pr = sh.getRange(r0, c0, nRows, 8);
  pr.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000')
    .setBorder(false, false, false, false, false, false).setVerticalAlignment('middle');
  sh.getRange(r0, c0, 1, 8).merge().setValue('TARGET RFS CLUSTER').setBackground(INK).setFontColor('#E8C766').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(rs, 8, 1, 2).merge().setValue('BULAN TARGET (pilih)').setFontSize(9).setFontWeight('bold').setFontColor('#666666').setHorizontalAlignment('center');
  var sel1 = sh.getRange(rs, 10);
  sel1.clearDataValidations(); sel1.setNumberFormat('@'); sel1.setValue(label);      // teks murni (jangan sampai diubah Sheets menjadi tanggal)
  var sel = sh.getRange(rs, 10, 1, 3).merge();
  sel.setBackground(INPUT).setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);
  sel.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange(L1, 1, TRFS_MONTHS, 1), true).setAllowInvalid(false).build());
  var sel2c = sh.getRange(rs, 13);
  sel2c.clearDataValidations(); sel2c.setNumberFormat('@'); sel2c.setValue(regPick);      // teks murni
  var sel2 = sh.getRange(rs, 13, 1, 3).merge();
  sel2.setBackground(INPUT).setFontWeight('bold').setFontSize(11).setFontStyle('normal').setFontColor('#000000').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);
  sel2.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange(RH.first, 1, REG_LIST_ROWS, 1), true).setAllowInvalid(false)
    .setHelpText('Pilih ' + REG_ALL + ' atau satu region').build());

  var rl = r0 + 2, rv = r0 + 3, cnt = '$H$' + rv;
  var selReg = '$M$' + rs, regF = '((' + selReg + '="' + REG_ALL + '")+(' + regR + '=' + selReg + ')>0)';
  var selE = '(' + sowR + '="' + TRFS_SOW + '")*(' + monR + '=' + P + ')*' + regF;
  var kp = [
    [8, 'JUMLAH SITE', '=SUMPRODUCT(' + selE + ')', '0'],
    [10, 'TOTAL HP TARGET', '=SUMPRODUCT(' + selE + '*(' + planR + '+(' + planR + '="")*' + hpR + '))', '#,##0'],
    [12, 'HP SUDAH RFS', '=SUMPRODUCT(' + selE + '*(' + implR + '="RFS")*' + hpR + ')', '#,##0'],
    [14, 'PENCAPAIAN', '=IFERROR(L' + rv + '/J' + rv + ';0)', '0.0%']
  ];
  kp.forEach(function (t) {
    sh.getRange(rl, t[0], 1, 2).merge().setValue(t[1]).setFontSize(9).setFontWeight('bold').setFontColor('#666666').setHorizontalAlignment('center');
    sh.getRange(rv, t[0], 1, 2).merge().setFormula(t[2]).setNumberFormat(t[3]).setFontSize(16).setFontWeight('bold').setFontColor(GOLD).setHorizontalAlignment('center');
    sh.getRange(rl, t[0], 2, 2).setBorder(true, true, true, true, false, false, GRID, SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.setRowHeight(rv, 26);

  var rh = r0 + 4;
  sh.getRange(rh, 8, 1, 5).merge().setValue('Nama Site (otomatis)').setHorizontalAlignment('left');
  sh.getRange(rh, 13).setValue('HP').setHorizontalAlignment('center');
  sh.getRange(rh, 14, 1, 2).merge().setValue('Status').setHorizontalAlignment('center');
  sh.getRange(rh, 8, 1, 8).setBackground(GOLD).setFontColor(INK).setFontWeight('bold');
  var cond = fo(C.sow) + '="' + TRFS_SOW + '";' + fo(C.mon) + '=' + P + ';((' + selReg + '="' + REG_ALL + '")+(' + fo(C.region) + '=' + selReg + ')>0)';
  for (var q = 1; q <= cap; q++) {
    var rr = rh + q, ov = 'AND(' + q + '=' + cap + ';' + cnt + '>' + cap + ')';
    sh.getRange(rr, 8, 1, 5).merge()
      .setFormula('=IF(' + q + '>' + cnt + ';"";IF(' + ov + ';"+"&(' + cnt + '-' + (cap - 1) + ')&" site lainnya";' + q + '&". "&INDEX(FILTER(' + fo(C.name) + ';' + cond + ');' + q + ')))')
      .setHorizontalAlignment('left');
    sh.getRange(rr, 13)
      .setFormula('=IF(OR(' + q + '>' + cnt + ';' + ov + ');"";IFERROR(INDEX(FILTER(ARRAYFORMULA(IF(' + fo(C.plan) + '<>"";' + fo(C.plan) + ';' + fo(C.hp) + '));' + cond + ');' + q + ');""))')
      .setNumberFormat('#,##0').setHorizontalAlignment('center');
    sh.getRange(rr, 14, 1, 2).merge()
      .setFormula('=IF(OR(' + q + '>' + cnt + ';' + ov + ');"";IFERROR(INDEX(FILTER(ARRAYFORMULA(IF(' + fo(C.impl) + '="";"-";SUBSTITUTE(' + fo(C.impl) + ';" Implementation";"")));' + cond + ');' + q + ');""))')
      .setHorizontalAlignment('center');
  }
  sh.getRange(rh + 1, 8, cap, 8).setBorder(null, null, true, null, null, true, '#E6E6E6', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(r0, c0, nRows, 8).setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);

  // warna status (aturan lama di area panel diganti)
  var stR = sh.getRange(rh + 1, 14, cap, 2);
  var rules = sh.getConditionalFormatRules().filter(function (rl2) {
    var g = rl2.getRanges()[0]; return !(g && g.getRow() >= r0 && g.getRow() < r0 + nRows && g.getColumn() >= c0);
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('RFS').setBackground('#E7F3E9').setFontColor('#1E6B34').setBold(true).setRanges([stR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('On Going').setBackground('#FBF1D6').setFontColor('#7A5200').setBold(true).setRanges([stR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Drop').setBackground('#FBE5E5').setFontColor('#9B1C1C').setBold(true).setRanges([stR]).build());
  sh.setConditionalFormatRules(rules);
  SpreadsheetApp.flush();
  return { r0: r0, helpTop: helpTop, pickRow: pickRow, cap: cap };
}

// Sempitkan grafik Kurva S Cluster supaya panel muat di sebelah kanan (lebar kolom B:G).
function trfsResizeChart_(sh, width) {
  var done = false;
  sh.getCharts().forEach(function (c) {
    var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
    if (t.indexOf('Kurva S HP RFS') === 0) { sh.updateChart(c.modify().setOption('width', width || 747).build()); done = true; }
  });
  return done;
}

function setupTargetRfs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), db = ss.getSheetByName('DATA BASE'), sh = ss.getSheetByName('DASHBOARD');
  if (!db || !sh) throw new Error('Sheet DATA BASE atau DASHBOARD tidak ditemukan.');
  var a = { col: dokFind_(dokHdr_(db), /^HP( Rencana| SNDK)?$/i), added: false };
  if (!a.col) {
    var refs = trfsFindRefs_(ss, db);
    if (refs.length) throw new Error('Ada rumus lain yang merujuk kolom SNDK..ABD di DATA BASE; kolom HP Rencana tidak dipasang: ' + refs.slice(0, 5).join(' || '));
    a = trfsAddHpColumn_(db);
  }
  var top = kurvaFindRow_(sh, KURVA_BAR);
  if (!top) throw new Error('Blok Kurva S Cluster tidak ditemukan di DASHBOARD.');
  var p = trfsPanel_(sh, db, top, TRFS_CAP, trfsDefaultLabel_(db));
  var resized = trfsResizeChart_(sh, 747);
  return { hpColumn: a, panel: p, chartResized: resized };
}

// =====================================================================
// PENGATURAN: satu tempat untuk tanggal acuan (HARI_INI), nama region/wilayah dan batas baris DATA BASE.
// Blok kecil di bagian bawah DASHBOARD (judul "PENGATURAN (jangan dihapus)"); sel bernama HARI_INI, NAMA_REGION, NAMA_WILAYAH.
// setupParameter dijalankan pemilik dari editor (sheet-side, tanpa deploy ulang web app; aman diulang):
//  - TODAY() di Status Dokumen dan Kurva S diganti HARI_INI (satu sel =TODAY(); bila diketik tanggal tetap, semua status
//    dan kurva dihitung pada tanggal itu),
//  - judul dan subjudul DASHBOARD memakai NAMA_WILAYAH dan NAMA_REGION (region lain: ganti di satu sel),
//  - batas baris rumus 300 -> DB_LAST_ROW (1000) di DASHBOARD dan DATA BASE, dengan penanda kapasitas (blok dan subjudul),
//  - gerbang otomatis: tampilan DASHBOARD dan DATA BASE dibandingkan sebelum/sesudah; bila ada selisih semuanya dikembalikan.
// =====================================================================
var PRM_TITLE = 'PENGATURAN (jangan dihapus)';

// Nama region (A3) dan wilayah (A2) yang sedang tampil di DASHBOARD.
function prmParse_(sh) {
  var region = 'Banjarmasin', wilayah = 'KALIMANTAN SELATAN', head = '';
  var f3 = String(sh.getRange('A3').getFormula() || sh.getRange('A3').getDisplayValue());
  var m3 = f3.match(/Region ([^"|&]+?)\s*\|/);
  if (m3) region = m3[1].trim();
  var v2 = String(sh.getRange('A2').getDisplayValue()), k = v2.lastIndexOf(' \u2014 ');
  if (k > 0) { head = v2.slice(0, k); wilayah = v2.slice(k + 3).trim(); }
  return { region: region, wilayah: wilayah, head: head };
}

// Pasang blok PENGATURAN dan sel bernama bila belum ada (nilai yang sudah ada tidak diubah).
function prmEnsure_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('DASHBOARD');
  if (!sh) throw new Error('Sheet DASHBOARD tidak ditemukan.');
  var top = kurvaFindRow_(sh, PRM_TITLE), made = false;
  if (!top) {
    var p = prmParse_(sh), INPUT = '#FFF2CC', GRID = '#BFBFBF';
    top = sh.getLastRow() + 3;
    if (top + 6 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), top + 6 - sh.getMaxRows());
    var blk = sh.getRange(top, 1, 5, 6);
    blk.clearContent().clearFormat();
    blk.setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setVerticalAlignment('middle');
    sh.getRange(top, 1).setValue(PRM_TITLE).setFontWeight('bold');
    sh.getRange(top + 1, 1, 4, 1).setValues([['Tanggal acuan (HARI_INI)'], ['Nama region (NAMA_REGION)'], ['Nama wilayah judul (NAMA_WILAYAH)'], ['Baris DATA BASE terisi / kapasitas']]).setFontWeight('bold');
    sh.getRange(top + 1, 2).setFormula('=TODAY()').setNumberFormat('dd mmm yyyy');
    sh.getRange(top + 2, 2).setNumberFormat('@').setValue(p.region);
    sh.getRange(top + 3, 2).setNumberFormat('@').setValue(p.wilayah);
    var rB = 'B' + (top + 4), rC = 'C' + (top + 4);
    sh.getRange(top + 4, 2).setFormula("=COUNTA('DATA BASE'!$B$5:$B$" + DB_LAST_ROW + ')').setNumberFormat('#,##0');
    sh.getRange(top + 4, 3).setValue(DB_LAST_ROW - 4).setNumberFormat('#,##0');
    sh.getRange(top + 4, 4).setFormula('=IF(' + rB + '>' + rC + ';"MELEBIHI KAPASITAS";IF(' + rB + '>=' + rC + '*9/10;"HAMPIR PENUH";"aman"))');
    sh.getRange(top + 1, 5, 4, 1).setValues([
      ['Rumus =TODAY(). Bila diketik tanggal tetap, semua status dokumen dan Kurva S dihitung pada tanggal itu; kembalikan ke =TODAY() setelahnya.'],
      ['Tampil di subjudul DASHBOARD ("Region ..."). Ganti di sini untuk region lain.'],
      ['Tampil di judul DASHBOARD. Ganti di sini untuk wilayah lain.'],
      ['Rumus DASHBOARD membaca DATA BASE baris 5 sampai ' + DB_LAST_ROW + '. Bila HAMPIR PENUH, minta admin menaikkan batas.']
    ]).setFontColor('#777777').setHorizontalAlignment('left');
    sh.getRange(top + 1, 2, 4, 3).setHorizontalAlignment('center').setFontWeight('bold');
    sh.getRange(top + 2, 2, 2, 1).setBackground(INPUT);
    sh.getRange(top + 1, 1, 4, 4).setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
    rapikanLabelPengaturan_(sh);
    made = true;
  }
  var have = {}; ss.getNamedRanges().forEach(function (n) { have[n.getName()] = true; });
  var want = { HARI_INI: top + 1, NAMA_REGION: top + 2, NAMA_WILAYAH: top + 3 }, added = [];
  Object.keys(want).forEach(function (nm) {
    if (!have[nm]) { ss.setNamedRange(nm, sh.getRange(want[nm], 2)); added.push(nm); }
  });
  return { top: top, made: made, namesAdded: added };
}

// TODAY() -> HARI_INI dan batas baris DATA BASE 300 -> DB_LAST_ROW di dalam satu rumus (rentang mulai baris 4 atau 5).
function prmMap_(x) {
  return x.replace(/TODAY\(\)/g, 'HARI_INI')
    .replace(/('DATA BASE'!\$?[A-Z]{1,3}\$?[45]:\$?[A-Z]{1,3}\$?)300(?![0-9])/g, function (m, a) { return a + DB_LAST_ROW; });
}

// Tulis ulang rumus yang berubah (per kolom, baris berurutan sekaligus). Baris skipFrom..skipTo tidak disentuh. Mengembalikan jumlah sel.
function prmRewrite_(shx, nRows, nCols, undo, skipFrom, skipTo) {
  var fm = shx.getRange(1, 1, nRows, nCols).getFormulas(), runs = [], n = 0;
  for (var c = 0; c < nCols; c++) {
    var run = null;
    for (var r = 0; r < nRows; r++) {
      var x = fm[r][c], y = x;
      if (x && !(skipFrom && r + 1 >= skipFrom && r + 1 <= skipTo)) y = prmMap_(x);
      if (x && y !== x) {
        if (!run) { run = { r0: r + 1, c: c + 1, old: [], nw: [] }; runs.push(run); }
        run.old.push([x]); run.nw.push([y]); n++;
      } else run = null;
    }
  }
  runs.forEach(function (u) {
    undo.push({ sh: shx, r: u.r0, c: u.c, arr: u.old });
    shx.getRange(u.r0, u.c, u.nw.length, 1).setFormulas(u.nw);
  });
  return n;
}

function setupParameter_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var db = ss.getSheetByName('DATA BASE'), sh = ss.getSheetByName('DASHBOARD');
  if (!db || !sh) throw new Error('Sheet DATA BASE atau DASHBOARD tidak ditemukan.');
  var c = dokCols_(db);
  if (!c) throw new Error('Kolom Dokumen Permit belum ada di DATA BASE; jalankan setupDokumen dulu.');
  var nc = sh.getLastColumn(), oldLast = sh.getLastRow(), dbCols = db.getLastColumn();
  var stF = db.getRange(5, c.st, db.getMaxRows() - 4, 1).getFormulas(), oldCap = 0;
  for (var i = 0; i < stF.length; i++) if (stF[i][0] !== '') oldCap = 5 + i;
  if (!oldCap) throw new Error('Rumus Status Dokumen tidak ditemukan di DATA BASE.');
  var dv0 = sh.getRange(1, 1, oldLast, nc).getDisplayValues(), bv0 = db.getRange(1, 1, oldCap, dbCols).getDisplayValues();
  var oldRules = db.getConditionalFormatRules(), undo = [], pr = null, extended = false;
  var res = { dashCells: 0, dbCells: 0, extendedFrom: oldCap, extendedTo: oldCap, left300: 0 };

  function rollback() {
    undo.slice().reverse().forEach(function (u) {
      var rg = u.sh.getRange(u.r, u.c, u.arr ? u.arr.length : 1, 1);
      if (u.arr) rg.setFormulas(u.arr); else if (u.formula) rg.setFormula(u.formula); else rg.setValue(u.value);
    });
    if (extended) {
      db.getRange(oldCap + 1, c.tgt, DB_LAST_ROW - oldCap, 1).clearContent();
      db.getRange(oldCap + 1, c.st, DB_LAST_ROW - oldCap, 1).clearContent();
      db.setConditionalFormatRules(oldRules);
    }
    if (pr) {
      pr.namesAdded.forEach(function (nm) { ss.removeNamedRange(nm); });
      if (pr.made) sh.getRange(pr.top, 1, 5, 6).clear();
    }
    SpreadsheetApp.flush();
  }

  try {
    pr = prmEnsure_(ss);

    // 1. DASHBOARD dan DATA BASE: TODAY() -> HARI_INI, batas baris -> DB_LAST_ROW
    res.dashCells = prmRewrite_(sh, oldLast, nc, undo, pr.top, pr.top + 4);
    res.dbCells = prmRewrite_(db, oldCap, dbCols, undo, 0, 0);

    // 2. judul (A2) dan subjudul (A3) DASHBOARD memakai parameter
    var a2 = sh.getRange('A2'), a3 = sh.getRange('A3'), p = prmParse_(sh);
    if (!a2.getFormula() && p.head) {
      undo.push({ sh: sh, r: 2, c: 1, value: a2.getValue(), formula: '' });
      a2.setFormula('="' + p.head.replace(/"/g, '""') + ' \u2014 "&UPPER(NAMA_WILAYAH)');
    }
    var f3 = a3.getFormula();
    if (f3 && f3.indexOf('NAMA_REGION') < 0 && /^="Region [^"|]+?\s*\|/.test(f3)) {
      var g3 = f3.replace(/^="Region [^"|]+?(\s*\|[^"]*")/, function (m, a) { return '="Region "&NAMA_REGION&"' + a; });
      var rB = '$B$' + (pr.top + 4), rC = '$C$' + (pr.top + 4);
      if (g3.indexOf('PERHATIAN') < 0) g3 += '&IF(' + rB + '>=' + rC + '*9/10;"   |   PERHATIAN: DATA BASE terisi "&' + rB + '&" dari "&' + rC + '&" baris";"")';
      undo.push({ sh: sh, r: 3, c: 1, formula: f3 });
      a3.setFormula(g3);
    }

    // 3. DATA BASE baris oldCap+1 .. DB_LAST_ROW: format, validasi tanggal, rumus Target dan Status, warna bersyarat
    if (oldCap < DB_LAST_ROW) {
      if (db.getMaxRows() < DB_LAST_ROW) db.insertRowsAfter(db.getMaxRows(), DB_LAST_ROW - db.getMaxRows());
      var n = DB_LAST_ROW - oldCap, nCol = c.st - c.paid + 1;
      var src = db.getRange(oldCap, c.paid, 1, nCol), dst = db.getRange(oldCap + 1, c.paid, n, nCol);
      extended = true;
      src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      var ft = [], fs = [];
      for (var r = oldCap + 1; r <= DB_LAST_ROW; r++) { ft.push([dokTargetFormula_(c, r)]); fs.push([dokStatusFormula_(c, r)]); }
      db.getRange(oldCap + 1, c.tgt, n, 1).setFormulas(ft);
      db.getRange(oldCap + 1, c.st, n, 1).setFormulas(fs);
      db.setConditionalFormatRules(oldRules.map(function (rl) {
        var rs = rl.getRanges();
        var hit = rs.some(function (g) { return g.getColumn() >= c.paid && g.getLastColumn() <= c.st && g.getLastRow() === oldCap; });
        if (!hit) return rl;
        return rl.copy().setRanges(rs.map(function (g) { return db.getRange(g.getRow(), g.getColumn(), DB_LAST_ROW - g.getRow() + 1, g.getNumColumns()); })).build();
      }));
      res.extendedTo = DB_LAST_ROW;
    }

    // 4. gerbang: tampilan sebelum = sesudah (A3 hanya boleh berubah pada jam "Update terakhir" dan penanda kapasitas)
    SpreadsheetApp.flush();
    var diffs = [], dv1 = sh.getRange(1, 1, oldLast, nc).getDisplayValues(), bv1 = db.getRange(1, 1, oldCap, dbCols).getDisplayValues();
    function cmp(nm, a, b, rows, cols) {
      for (var i2 = 0; i2 < rows; i2++) for (var j = 0; j < cols; j++) {
        if (a[i2][j] === b[i2][j]) continue;
        if (nm === 'DASHBOARD' && i2 === 2 && j === 0 && a[i2][j].split('Update terakhir')[0] === b[i2][j].split('Update terakhir')[0]) continue;
        diffs.push(nm + '!' + dokLetter_(j + 1) + (i2 + 1) + ' [' + String(a[i2][j]).slice(0, 40) + '] -> [' + String(b[i2][j]).slice(0, 40) + ']');
      }
    }
    cmp('DASHBOARD', dv0, dv1, oldLast, nc);
    cmp('DATA BASE', bv0, bv1, oldCap, dbCols);
    if (extended) {
      var ex = db.getRange(oldCap + 1, c.tgt, DB_LAST_ROW - oldCap, c.st - c.tgt + 1).getDisplayValues();
      for (var q = 0; q < ex.length; q++) for (var w = 0; w < ex[q].length; w++) if (ex[q][w] !== '') diffs.push('DATA BASE baris ' + (oldCap + 1 + q) + ' kolom ' + dokLetter_(c.tgt + w) + ' tidak kosong: ' + ex[q][w]);
    }
    var names = {}; ss.getNamedRanges().forEach(function (nn) { names[nn.getName()] = true; });
    ['HARI_INI', 'NAMA_REGION', 'NAMA_WILAYAH'].forEach(function (nm) { if (!names[nm]) diffs.push('sel bernama ' + nm + ' tidak ada'); });
    if (diffs.length) throw new Error('GERBANG GAGAL (' + diffs.length + ' selisih), semua dikembalikan: ' + diffs.slice(0, 8).join(' || '));

    // sisa rujukan baris 300 di DASHBOARD (hanya laporan)
    sh.getRange(1, 1, oldLast, nc).getFormulas().forEach(function (row) { row.forEach(function (x) { if (x && /\$?[A-Z]{1,3}\$?300(?![0-9])/.test(x)) res.left300++; }); });
    res.param = pr;
    return res;
  } catch (e) {
    try { rollback(); } catch (e2) { e = new Error(e.message + ' | ROLLBACK GAGAL: ' + e2.message); }
    throw e;
  }
}

// =====================================================================
// REGION: banyak region dalam satu DATA BASE (kolom "Region", kolom A). Daftar region otomatis dari kolom itu (blok "DATA REGION"
// di bagian bawah DASHBOARD). Yang dipasang di DASHBOARD:
//  - tabel "RINGKASAN PER REGION" (KPI, donasi, dokumen lewat batas per region + TOTAL AREA) tepat di bawah kartu Dokumen Permit,
//  - Kurva S Cluster dengan satu garis berwarna per region (target sama per region) dan tabel "KURVA S PER REGION" di bawah grafik,
//  - pilihan Region pada panel TARGET RFS (SEMUA REGION atau satu region).
// setupRegion dijalankan pemilik dari editor (sheet-side, tanpa deploy ulang; aman diulang). Gerbang otomatis: isi DASHBOARD lama
// dibandingkan sebelum/sesudah; bila ada selisih semua perubahan (baris sisipan, rumus, grafik, panel) dikembalikan.
// Garis grafik mengikuti jumlah region; onEdit (kolom A DATA BASE) menyesuaikannya otomatis saat region baru muncul.
// =====================================================================
var REG_ALL = 'SEMUA REGION';
var REG_HELP = 'DATA REGION';
var REG_SLOTS = 6;            // jumlah region yang ditampilkan (baris tabel dan garis Kurva S)
var REG_LIST_ROWS = 14;       // baris yang dicadangkan untuk daftar (SEMUA REGION + region) di blok DATA REGION
var REG_TBL_TITLE = 'RINGKASAN PER REGION';
var REG_TBL_ROWS = 10;        // judul + header + TOTAL AREA + REG_SLOTS baris + pemisah
var REG_KS_TITLE = 'KURVA S PER REGION';
var REG_KS_ROWS = 10;
var REG_RC0 = 9;              // kolom I: region pertama di tabel DATA KURVA S
var REG_COLORS = ['#C9972C', '#378ADD', '#1D9E75', '#7F77DD', '#D85A30', '#D4537E'];

function regCols_(db) {
  var h = dokHdr_(db), C = {
    region: dokFind_(h, /^Region$/i), name: dokFind_(h, /^Name$/i), sow: dokFind_(h, /^SOW$/i), mon: dokFind_(h, /^Month$/i),
    hp: dokFind_(h, /^HP RFS$/i), impl: dokFind_(h, /^Implementation Status$/i), permit: dokFind_(h, /^Permit Status$/i),
    don: dokFind_(h, /^Donasi$/i), opname: dokFind_(h, /^OPNAME$/i), baclose: dokFind_(h, /^BA CLOSING$/i), docst: dokFind_(h, /^Status Dokumen$/i)
  };
  for (var k in C) if (!C[k]) throw new Error('Judul kolom "' + k + '" tidak ditemukan di DATA BASE (baris 1-4).');
  return C;
}
function regRef_(db) { return "'" + db.getName().replace(/'/g, "''") + "'!"; }
function regRange_(ref, col) { var L = dokLetter_(col); return ref + '$' + L + '$5:$' + L + '$' + DB_LAST_ROW; }

// Baris pertama (kolom col, teks diawali prefix) pada baris from..to; 0 bila tidak ada.
function regFindIn_(sh, col, prefix, from, to) {
  to = Math.min(to, sh.getMaxRows());
  if (to < from) return 0;
  var v = sh.getRange(from, col, to - from + 1, 1).getDisplayValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).indexOf(prefix) === 0) return from + i;
  return 0;
}

// Catatan pembatalan (gerbang gagal): tiap langkah mendaftarkan cara mengembalikannya.
function regUndo_(undo, label, fn) { undo.push({ label: label, fn: fn }); }

// Alamat daftar region (SEMUA REGION + region) menurut posisi blok DATA REGION saat ini (dihitung ulang setelah baris disisipkan).
function regListRef_(sh) {
  var t = kurvaFindRow_(sh, REG_HELP);
  if (!t) throw new Error('Blok DATA REGION tidak ditemukan di DASHBOARD.');
  return '$A$' + (t + 1) + ':$A$' + (t + REG_LIST_ROWS);
}
// Nama region ke-k (k = 1..REG_SLOTS); kosong bila belum ada.
function regNameFx_(list, k) { return '=IFERROR(INDEX(' + list + ';' + (k + 1) + ')&"";"")'; }

// Blok DATA REGION: A(top+1) = SEMUA REGION, A(top+2..) = daftar region unik dari kolom Region (urutan kemunculan pertama).
function regHelperEnsure_(sh, db, undo) {
  var C = regCols_(db), ref = regRef_(db), top = kurvaFindRow_(sh, REG_HELP), made = false;
  if (!top) {
    top = sh.getLastRow() + 3;
    var need = top + REG_LIST_ROWS + 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    var t0 = top;
    if (undo) regUndo_(undo, 'blok DATA REGION', function () { sh.getRange(t0, 1, REG_LIST_ROWS + 1, 3).clear(); });
    sh.getRange(top, 1, REG_LIST_ROWS + 1, 3).clearContent().clearFormat();
    sh.getRange(top, 1).setValue(REG_HELP + ' - daftar region otomatis dari kolom Region di DATA BASE (jangan dihapus)')
      .setFontFamily('Arial').setFontSize(10).setFontWeight('bold').setFontColor('#000000');
    sh.getRange(top + 1, 1).setValue(REG_ALL);
    var rr = regRange_(ref, C.region);
    sh.getRange(top + 2, 1).setFormula('=IFERROR(UNIQUE(FILTER(' + rr + ';' + rr + '<>""));"")');
    sh.getRange(top + 1, 1, REG_LIST_ROWS, 1).setFontFamily('Arial').setFontSize(10).setFontColor('#000000');
    made = true;
  }
  SpreadsheetApp.flush();
  return { top: top, first: top + 1, last: top + REG_LIST_ROWS, made: made };
}

// Tabel RINGKASAN PER REGION tepat di bawah kartu Dokumen Permit.
function regTableBuild_(sh, db, undo) {
  var C = regCols_(db), ref = regRef_(db), GOLD = '#C9972C', INK = '#1A1A1A', GRID = '#BFBFBF';
  [['B12', 'TOTAL SITE'], ['D12', 'TOTAL HOMEPASS'], ['F12', 'SITE STATUS RFS'], ['H12', 'OPNAME SELESAI'], ['J12', 'PERMIT APPROVED'], ['L12', 'BA CLOSING'], ['N12', 'SITE DROP']].forEach(function (n) {
    if (String(sh.getRange(n[0]).getDisplayValue()).indexOf(n[1]) !== 0) throw new Error('Baris KPI DASHBOARD tidak seperti biasa (' + n[0] + ' bukan "' + n[1] + '"); tabel region tidak dipasang.');
  });
  var donTop = regFindIn_(sh, 2, 'TOTAL DONASI', 10, 40), dokTop = regFindIn_(sh, 2, 'DOKUMEN PERMIT', 10, 60);
  if (!donTop || !dokTop) throw new Error('Kartu Total Donasi atau Dokumen Permit tidak ditemukan di DASHBOARD.');
  var top = regFindIn_(sh, 2, REG_TBL_TITLE, dokTop, dokTop + 60), inserted = false;
  if (!top) {
    top = dokTop + DOK_ROWS;
    sh.insertRowsBefore(top, REG_TBL_ROWS);
    inserted = true;
    var t0 = top;
    if (undo) regUndo_(undo, 'baris tabel region', function () { sh.deleteRows(t0, REG_TBL_ROWS); });
  }
  var list = regListRef_(sh);      // sesudah penyisipan
  var blk = sh.getRange(top, 1, REG_TBL_ROWS, 16);
  blk.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setFontWeight('normal')
    .setBorder(false, false, false, false, false, false).setVerticalAlignment('middle');
  sh.setRowHeight(top, 26); sh.setRowHeight(top + 1, 24); sh.setRowHeight(top + 2, 24);
  sh.setRowHeights(top + 3, REG_SLOTS, 22); sh.setRowHeight(top + REG_TBL_ROWS - 1, 8);

  var nameR = regRange_(ref, C.name), regR = regRange_(ref, C.region), hpR = regRange_(ref, C.hp), implR = regRange_(ref, C.impl),
    perR = regRange_(ref, C.permit), donR = regRange_(ref, C.don), opR = regRange_(ref, C.opname), baR = regRange_(ref, C.baclose), stR = regRange_(ref, C.docst);
  var una = 'COUNTIFS(' + nameR + ';"<>";' + regR + ';"")';
  sh.getRange(top, 2, 1, 14).merge()
    .setFormula('="' + REG_TBL_TITLE + '"&IF(' + una + '>0;"   |   PERHATIAN: "&' + una + '&" site belum diberi Region";"")')
    .setBackground(INK).setFontColor('#E8C766').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');

  var cols = [[2, 3, 'Region', 'left'], [4, 4, 'Site', 'center'], [5, 5, 'HP RFS', 'center'], [6, 6, '% RFS', 'center'], [7, 7, '% Opname', 'center'],
    [8, 8, '% Permit', 'center'], [9, 9, '% BA Closing', 'center'], [10, 10, 'Drop', 'center'], [11, 13, 'Donasi', 'center'], [14, 15, 'Dokumen lewat batas', 'center']];
  cols.forEach(function (c) {
    if (c[1] > c[0]) sh.getRange(top + 1, c[0], 1, c[1] - c[0] + 1).merge();
    sh.getRange(top + 1, c[0]).setValue(c[2]).setHorizontalAlignment(c[3]);
  });
  sh.getRange(top + 1, 2, 1, 14).setBackground(GOLD).setFontColor(INK).setFontWeight('bold').setVerticalAlignment('middle');

  var fmt = { 4: '0', 5: '#,##0', 6: '0.0%', 7: '0.0%', 8: '0.0%', 9: '0.0%', 10: '0', 11: '"Rp"#,##0', 14: '0' };
  function put(r, c1, c2, f) {
    if (c2 > c1) sh.getRange(r, c1, 1, c2 - c1 + 1).merge();
    sh.getRange(r, c1).setFormula(f).setNumberFormat(fmt[c1]).setHorizontalAlignment('center');
  }
  var tr = top + 2;
  sh.getRange(tr, 2, 1, 2).merge();
  sh.getRange(tr, 2).setValue('TOTAL AREA').setHorizontalAlignment('left');
  put(tr, 4, 4, '=$B$10'); put(tr, 5, 5, '=$D$10'); put(tr, 6, 6, '=$F$10'); put(tr, 7, 7, '=$H$10'); put(tr, 8, 8, '=$J$10'); put(tr, 9, 9, '=$L$10'); put(tr, 10, 10, '=$N$10');
  put(tr, 11, 13, '=$B$' + (donTop + 1)); put(tr, 14, 15, '=$H$' + (dokTop + 1));
  sh.getRange(tr, 2, 1, 14).setBackground('#FBF1D6').setFontWeight('bold');

  for (var k = 1; k <= REG_SLOTS; k++) {
    var r = tr + k, b = '$B' + r;
    var g = function (expr) { return '=IF(' + b + '="";"";' + expr + ')'; };
    sh.getRange(r, 2, 1, 2).merge();
    sh.getRange(r, 2).setFormula(regNameFx_(list, k)).setHorizontalAlignment('left').setFontWeight('bold');
    put(r, 4, 4, g('COUNTIFS(' + regR + ';' + b + ';' + nameR + ';"<>")'));
    put(r, 5, 5, g('SUMIFS(' + hpR + ';' + regR + ';' + b + ')'));
    put(r, 6, 6, g('IFERROR(COUNTIFS(' + regR + ';' + b + ';' + implR + ';"RFS")/$D' + r + ';0)'));
    put(r, 7, 7, g('IFERROR(COUNTIFS(' + regR + ';' + b + ';' + opR + ';TRUE)/$D' + r + ';0)'));
    put(r, 8, 8, g('IFERROR(COUNTIFS(' + regR + ';' + b + ';' + perR + ';"Approved")/$D' + r + ';0)'));
    put(r, 9, 9, g('IFERROR(COUNTIFS(' + regR + ';' + b + ';' + baR + ';TRUE)/$D' + r + ';0)'));
    put(r, 10, 10, g('COUNTIFS(' + regR + ';' + b + ';' + implR + ';"Drop")'));
    put(r, 11, 13, g('SUMIFS(' + donR + ';' + regR + ';' + b + ')'));
    put(r, 14, 15, g('COUNTIFS(' + regR + ';' + b + ';' + stR + ';"LEWAT*")'));
  }
  sh.getRange(top, 2, REG_TBL_ROWS - 1, 14).setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(top + 1, 2, 2 + REG_SLOTS, 14).setBorder(null, null, null, null, true, null, '#E6E6E6', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(tr, 2, 1, 14).setBorder(null, null, true, null, null, null, GRID, SpreadsheetApp.BorderStyle.SOLID);
  var rules = sh.getConditionalFormatRules().filter(function (rl) {
    var g0 = rl.getRanges()[0]; return !(g0 && g0.getRow() >= top && g0.getRow() < top + REG_TBL_ROWS);
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($B' + (tr + 1) + '<>"";ISEVEN(ROW()))').setBackground('#FAF6EA').setRanges([sh.getRange(tr + 1, 2, REG_SLOTS, 14)]).build());
  sh.setConditionalFormatRules(rules);
  SpreadsheetApp.flush();
  return { top: top, inserted: inserted, donTop: donTop, dokTop: dokTop };
}

// Koordinat blok Kurva S Cluster dan tabel DATA KURVA S menurut posisi saat ini.
function regKC_(sh) {
  var top = kurvaFindRow_(sh, KURVA_BAR), helpTop = kurvaFindRow_(sh, KURVA_HELP);
  if (!top || !helpTop) throw new Error('Blok Kurva S Cluster belum ada di DASHBOARD; jalankan setupKurvaS dulu.');
  var NR = KURVA_MONTHS, D1 = helpTop + 3, D2 = D1 + NR - 1, M1 = D2 + 2;
  return { top: top, helpTop: helpTop, NR: NR, P: helpTop + 1, HD: helpTop + 2, D1: D1, D2: D2, M1: M1, M2: M1 + 1, M3: M1 + 2, M4: M1 + 3, M5: M1 + 4, M6: M1 + 5 };
}

// Grafik Kurva S Cluster: target + satu garis per region (jumlah garis = jumlah region terisi di header tabel DATA KURVA S).
function regKurvaChart_(sh, HD, NR) {
  return { chart: false, n: 0 };      // v59: grafik Kurva S kini 3 garis (Baseline, Forecast, Actual) dan dibangun oleh setupKurvaS_
  var names = sh.getRange(HD, REG_RC0, 1, REG_SLOTS).getDisplayValues()[0], n = 0;
  for (var i = 0; i < names.length; i++) if (String(names[i]).trim() !== '') n = i + 1;
  n = Math.max(n, 1);
  var found = null;
  sh.getCharts().forEach(function (c) {
    var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
    if (t.indexOf('Kurva S HP RFS') === 0) found = c;
  });
  if (!found) return { chart: false, n: n };
  var b = found.modify().clearRanges().addRange(sh.getRange(HD, 1, NR + 1, 1)).addRange(sh.getRange(HD, 3, NR + 1, 1));
  var colors = ['#7A7A7A'], series = { 0: { lineDashStyle: [6, 4], lineWidth: 2, pointSize: 0 } };
  for (i = 0; i < n; i++) {
    b.addRange(sh.getRange(HD, REG_RC0 + i, NR + 1, 1));
    colors.push(REG_COLORS[i]);
    series[i + 1] = { lineWidth: i === 0 ? 4 : 3, pointSize: i === 0 ? 7 : 6 };
  }
  b.setOption('colors', colors).setOption('series', series);
  sh.updateChart(b.build());
  return { chart: true, n: n };
}

// onEdit (kolom A DATA BASE): sesuaikan jumlah garis Kurva S bila jumlah region berubah.
function regSyncChart_() {
  return;      // v59: jumlah region tidak lagi mengubah jumlah garis grafik (3 garis tetap); kolom region di DATA KURVA S memakai rumus
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('DASHBOARD');
  if (!sh) return;
  var helpTop = kurvaFindRow_(sh, KURVA_HELP);
  if (!helpTop || !kurvaFindRow_(sh, REG_HELP)) return;
  SpreadsheetApp.flush();
  var HD = helpTop + 2, names = sh.getRange(HD, REG_RC0, 1, REG_SLOTS).getDisplayValues()[0], n = 0;
  for (var i = 0; i < names.length; i++) if (String(names[i]).trim() !== '') n = i + 1;
  n = Math.max(n, 1);
  var cur = -1;
  sh.getCharts().forEach(function (c) {
    var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
    if (t.indexOf('Kurva S HP RFS') === 0) cur = c.getRanges().length - 2;
  });
  if (cur >= 0 && cur !== n) regKurvaChart_(sh, HD, KURVA_MONTHS);
}

// Tabel DATA KURVA S: kolom realisasi kumulatif per region; kartu = TOTAL AREA; grafik; tabel KURVA S PER REGION di bawah grafik.
function regKurvaBuild_(sh, db, undo) {
  return { skipped: 'v59: Kurva S per region dibangun oleh setupKurvaS_ (Baseline, Forecast, Actual)' };
  var K = regKC_(sh), C = regCols_(db), ref = regRef_(db), GOLD = '#C9972C', INK = '#1A1A1A', GRID = '#BFBFBF', L = dokLetter_;
  var top = K.top, NR = K.NR, P = K.P, HD = K.HD, D1 = K.D1, D2 = K.D2, M1 = K.M1, M2 = K.M2, M3 = K.M3, M4 = K.M4, M5 = K.M5, M6 = K.M6;
  var list = regListRef_(sh);
  var rHp = regRange_(ref, C.hp), rSow = regRange_(ref, C.sow), rMon = regRange_(ref, C.mon), rReg = regRange_(ref, C.region);

  // pemeriksaan letak: kartu dan tabel bulan seperti yang dipasang setupKurvaS
  var f2 = sh.getRange(M2, 2).getFormula(), cB = sh.getRange(top + 3, 2).getFormula(), cE = sh.getRange(top + 3, 5).getFormula();
  if (f2.indexOf('INDEX($C$' + D1 + ':$C$' + D2) < 0) throw new Error('Rumus target kumulatif di DATA KURVA S (B' + M2 + ') tidak seperti biasa; Kurva S per region tidak dipasang.');
  if (cB.indexOf('="TARGET KUMULATIF s/d ') !== 0 || cE.indexOf('="REALISASI KUMULATIF') !== 0) throw new Error('Label kartu Kurva S tidak seperti biasa; Kurva S per region tidak dipasang.');

  // ---- 1. kolom region di DATA KURVA S ----
  if (undo) regUndo_(undo, 'kolom region DATA KURVA S', function () { sh.getRange(HD, REG_RC0, NR + 1, REG_SLOTS).clear(); sh.getRange(M6, 1, 1, 2).clear(); });
  var hd = [], rows = [], k, r;
  for (k = 1; k <= REG_SLOTS; k++) hd.push(regNameFx_(list, k));
  sh.getRange(HD, REG_RC0, 1, REG_SLOTS).setFormulas([hd]).setBackground('#000000').setFontColor(GOLD).setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  for (r = D1; r <= D2; r++) {
    var row = [];
    for (k = 0; k < REG_SLOTS; k++) {
      var cl = L(REG_RC0 + k);
      row.push('=IF(' + cl + '$' + HD + '="";NA();IF($G' + r + '>HARI_INI;NA();SUMIFS(' + rHp + ';' + rSow + ';$F$' + P + ';' + rReg + ';' + cl + '$' + HD + ';' + rMon + ';"<="&$G' + r + ')))');
    }
    rows.push(row);
  }
  var body = sh.getRange(D1, REG_RC0, NR, REG_SLOTS);
  body.setFormulas(rows).setBackground('#FFFFFF').setFontColor('#000000').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID).setNumberFormat('#,##0');
  var rulesH = sh.getConditionalFormatRules().filter(function (rl) {
    var g0 = rl.getRanges()[0]; return !(g0 && g0.getRow() === D1 && g0.getColumn() === REG_RC0 && g0.getNumRows() === NR);
  });
  rulesH.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISNA(' + L(REG_RC0) + D1 + ')').setFontColor('#FFFFFF').setRanges([body]).build());
  sh.setConditionalFormatRules(rulesH);
  sh.getRange(M6, 1, 1, 2).setValues([['Jumlah region', '']]);
  sh.getRange(M6, 2).setFormula('=MAX(1;COUNTIF(' + list + ';"?*")-1)');
  sh.getRange(M6, 1, 1, 2).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(M6, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(M6, 2).setHorizontalAlignment('center').setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);

  // ---- 2. kartu = TOTAL AREA (target = target per region x jumlah region; jumlah region 1 = tampilan lama) ----
  var M2r = M2;      // nilai (bukan variabel) untuk pembatalan: M2 bergeser lagi setelah baris tabel disisipkan
  if (undo) regUndo_(undo, 'kartu Kurva S', function () { sh.getRange(M2r, 2).setFormula(f2); sh.getRange(top + 3, 2).setFormula(cB); sh.getRange(top + 3, 5).setFormula(cE); });
  sh.getRange(M2, 2).setFormula('=IFERROR(INDEX($C$' + D1 + ':$C$' + D2 + ';B' + M1 + ')*$B$' + M6 + ';"")');
  var nB = cB, nE = cE, sfx = '&IF($B$' + M6 + '>1;" - "&$B$' + M6 + '&" REGION";"")', tail = '&" (HP)"';
  if (nB.indexOf('REGION') < 0) {
    if (nB.slice(-tail.length) !== tail) throw new Error('Label kartu target tidak seperti biasa.');
    nB = nB + sfx;
  }
  if (nE.indexOf('per region') < 0) {
    if (nE.indexOf('&" HP/bulan)"') < 0) throw new Error('Label kartu realisasi tidak seperti biasa.');
    nE = nE.replace('&" HP/bulan)"', function () { return '&" HP/bulan"&IF($B$' + M6 + '>1;" per region";"")&")"'; });
  }
  sh.getRange(top + 3, 2).setFormula(nB);
  sh.getRange(top + 3, 5).setFormula(nE);

  // ---- 3. grafik ----
  var oldChart = null;
  sh.getCharts().forEach(function (c) {
    var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
    if (t.indexOf('Kurva S HP RFS') === 0) {
      var o = c.getOptions(), sg = function (kk) { try { return o.get(kk); } catch (e2) { return null; } };
      oldChart = { ranges: c.getRanges(), colors: sg('colors'), series: sg('series') };
    }
  });
  if (undo && oldChart) regUndo_(undo, 'grafik Kurva S', function () {
    sh.getCharts().forEach(function (c) {
      var t = ''; try { t = String(c.getOptions().get('title')); } catch (e) { t = ''; }
      if (t.indexOf('Kurva S HP RFS') !== 0) return;
      var bb = c.modify().clearRanges();
      oldChart.ranges.forEach(function (g) { bb.addRange(g); });
      if (oldChart.colors) bb.setOption('colors', oldChart.colors);
      if (oldChart.series) bb.setOption('series', oldChart.series);
      sh.updateChart(bb.build());
    });
  });
  var ch = regKurvaChart_(sh, HD, NR);

  // ---- 4. tabel KURVA S PER REGION tepat di bawah blok grafik ----
  var tTop = regFindIn_(sh, 2, REG_KS_TITLE, top + KURVA_ROWS, top + KURVA_ROWS + REG_KS_ROWS + 2), inserted = false;
  if (!tTop) {
    tTop = top + KURVA_ROWS;
    if (String(sh.getRange(tTop, 1).getDisplayValue()).indexOf(KURVAF_BAR) !== 0) throw new Error('Baris di bawah blok Kurva S Cluster bukan blok Kurva S FWA (A' + tTop + '); tabel per region tidak dipasang.');
    sh.insertRowsBefore(tTop, REG_KS_ROWS);
    inserted = true;
    var t0 = tTop;
    if (undo) regUndo_(undo, 'baris tabel kurva', function () { sh.deleteRows(t0, REG_KS_ROWS); });
  }
  K = regKC_(sh);                  // koordinat baru (baris di bawah tabel bergeser)
  D1 = K.D1; D2 = K.D2; M1 = K.M1; M2 = K.M2; M3 = K.M3; M4 = K.M4; M5 = K.M5;
  list = regListRef_(sh);
  var blk = sh.getRange(tTop, 1, REG_KS_ROWS, 16);
  blk.breakApart().clearContent().setBackground('#FFFFFF').setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setFontWeight('normal')
    .setBorder(false, false, false, false, false, false).setVerticalAlignment('middle');
  sh.setRowHeight(tTop, 26); sh.setRowHeight(tTop + 1, 24); sh.setRowHeight(tTop + 2, 24);
  sh.setRowHeights(tTop + 3, REG_SLOTS, 22); sh.setRowHeight(tTop + REG_KS_ROWS - 1, 8);
  sh.getRange(tTop, 2, 1, 14).merge().setValue(REG_KS_TITLE + ' - TARGET SAMA UNTUK TIAP REGION')
    .setBackground(INK).setFontColor('#E8C766').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  var cols = [[2, 3, 'Region', 'left'], [4, 5, 'Target kumulatif (HP)', 'center'], [6, 8, 'Realisasi kumulatif (HP)', 'center'], [9, 11, 'Pencapaian', 'center'], [12, 15, 'Selisih (HP)', 'center']];
  cols.forEach(function (c) {
    sh.getRange(tTop + 1, c[0], 1, c[1] - c[0] + 1).merge();
    sh.getRange(tTop + 1, c[0]).setValue(c[2]).setHorizontalAlignment(c[3]);
  });
  sh.getRange(tTop + 1, 2, 1, 14).setBackground(GOLD).setFontColor(INK).setFontWeight('bold').setVerticalAlignment('middle');
  var fm2 = { 4: '#,##0', 6: '#,##0', 9: '0.0%', 12: '+#,##0;-#,##0;0' };
  function put(rr, c1, c2, f) {
    if (c2 > c1) sh.getRange(rr, c1, 1, c2 - c1 + 1).merge();
    sh.getRange(rr, c1).setFormula(f).setNumberFormat(fm2[c1]).setHorizontalAlignment('center');
  }
  var tr = tTop + 2;
  sh.getRange(tr, 2, 1, 2).merge();
  sh.getRange(tr, 2).setValue('TOTAL AREA').setHorizontalAlignment('left');
  put(tr, 4, 5, '=$B$' + M2); put(tr, 6, 8, '=$B$' + M3); put(tr, 9, 11, '=$B$' + M4); put(tr, 12, 15, '=$B$' + M5);
  sh.getRange(tr, 2, 1, 14).setBackground('#FBF1D6').setFontWeight('bold');
  for (k = 1; k <= REG_SLOTS; k++) {
    var rr2 = tr + k, bq = '$B' + rr2, cq = L(REG_RC0 + k - 1);
    sh.getRange(rr2, 2, 1, 2).merge();
    sh.getRange(rr2, 2).setFormula(regNameFx_(list, k)).setHorizontalAlignment('left').setFontWeight('bold');
    put(rr2, 4, 5, '=IF(' + bq + '="";"";IFERROR(INDEX($C$' + D1 + ':$C$' + D2 + ';$B$' + M1 + ');""))');
    put(rr2, 6, 8, '=IF(' + bq + '="";"";IFERROR(INDEX($' + cq + '$' + D1 + ':$' + cq + '$' + D2 + ';$B$' + M1 + ');""))');
    put(rr2, 9, 11, '=IF(' + bq + '="";"";IFERROR($F' + rr2 + '/$D' + rr2 + ';""))');
    put(rr2, 12, 15, '=IF(' + bq + '="";"";IFERROR($F' + rr2 + '-$D' + rr2 + ';""))');
  }
  sh.getRange(tTop, 2, REG_KS_ROWS - 1, 14).setBorder(true, true, true, true, false, false, INK, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(tTop + 1, 2, 2 + REG_SLOTS, 14).setBorder(null, null, null, null, true, null, '#E6E6E6', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(tr, 2, 1, 14).setBorder(null, null, true, null, null, null, GRID, SpreadsheetApp.BorderStyle.SOLID);
  var rules = sh.getConditionalFormatRules().filter(function (rl) {
    var g0 = rl.getRanges()[0]; return !(g0 && g0.getRow() >= tTop && g0.getRow() < tTop + REG_KS_ROWS);
  });
  for (k = 1; k <= REG_SLOTS; k++) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B' + (tr + k) + '<>""').setFontColor(REG_COLORS[k - 1]).setRanges([sh.getRange(tr + k, 2, 1, 2)]).build());
  }
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($B' + (tr + 1) + '<>"";ISEVEN(ROW()))').setBackground('#FAF6EA').setRanges([sh.getRange(tr + 1, 4, REG_SLOTS, 12)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#B00020').setRanges([sh.getRange(tr, 12, 1 + REG_SLOTS, 4)]).build());
  sh.setConditionalFormatRules(rules);
  SpreadsheetApp.flush();
  return { top: top, tableTop: tTop, inserted: inserted, chartSeries: ch.n, helpTop: K.helpTop, metrics: M1 + '-' + M6 };
}

// Susun semuanya (dengan gerbang): DATA REGION -> tabel per region -> Kurva S per region -> pilihan Region di panel TARGET RFS.
// sh/db boleh salinan uji (TMP). gate = true: isi DASHBOARD lama harus sama sesudahnya (kecuali sel yang memang diubah), bila tidak dikembalikan.
function regSetupAll_(ss, sh, db, gate) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  sh = sh || ss.getSheetByName('DASHBOARD'); db = db || ss.getSheetByName('DATA BASE');
  if (!sh || !db) throw new Error('Sheet DASHBOARD atau DATA BASE tidak ditemukan.');
  if (!ss.getRangeByName('HARI_INI')) throw new Error('Sel bernama HARI_INI belum ada; jalankan setupParameter dulu.');
  var nc = 16, oldLast = sh.getLastRow(), dv0 = sh.getRange(1, 1, oldLast, nc).getDisplayValues(), undo = [];
  var dokTop0 = regFindIn_(sh, 2, 'DOKUMEN PERMIT', 10, 60);
  var tbl0 = dokTop0 ? regFindIn_(sh, 2, REG_TBL_TITLE, dokTop0, dokTop0 + 60) : 0;
  var kTop0 = kurvaFindRow_(sh, KURVA_BAR);
  var ks0 = kTop0 ? regFindIn_(sh, 2, REG_KS_TITLE, kTop0, kTop0 + KURVA_ROWS + REG_KS_ROWS + 2) : 0;
  var tblIns0 = (dokTop0 && !tbl0) ? dokTop0 + DOK_ROWS : 0, ksIns0 = (kTop0 && !ks0) ? kTop0 + KURVA_ROWS : 0;
  var panel0 = kTop0 ? kTop0 + 6 : 0;              // baris pemilih panel TARGET RFS (koordinat lama)
  var res = {};
  function shift(r) { return r + (tblIns0 && r >= tblIns0 ? REG_TBL_ROWS : 0) + (ksIns0 && r >= ksIns0 ? REG_KS_ROWS : 0); }
  function rollback() {
    var errs = [];
    undo.slice().reverse().forEach(function (u) { try { u.fn(); } catch (e) { errs.push(u.label + ': ' + String(e).slice(0, 140)); } });
    SpreadsheetApp.flush();
    return errs;
  }
  try {
    res.helper = regHelperEnsure_(sh, db, undo);
    res.table = regTableBuild_(sh, db, undo);
    res.kurva = regKurvaBuild_(sh, db, undo);
    res.panel = trfsPanel_(sh, db, kurvaFindRow_(sh, KURVA_BAR), TRFS_CAP, trfsDefaultLabel_(db), undefined, undo);
    SpreadsheetApp.flush();
    if (gate) {
      var newLast = sh.getLastRow(), dv1 = sh.getRange(1, 1, newLast, nc).getDisplayValues(), diffs = [];
      for (var i = 0; i < oldLast; i++) for (var j = 0; j < nc; j++) {
        var a = dv0[i][j]; if (a === '') continue;
        var r1 = shift(i + 1), b = r1 <= newLast ? dv1[r1 - 1][j] : '#none';
        if (a === b) continue;
        if (i === 2 && j === 0 && a.split('Update terakhir')[0] === String(b).split('Update terakhir')[0]) continue;
        if (panel0 && i + 1 === panel0 && j >= 12 && a === 'pilih dari daftar') continue;      // pemilih Region menggantikan petunjuk
        diffs.push('DASHBOARD!' + dokLetter_(j + 1) + (i + 1) + '->' + r1 + ' [' + String(a).slice(0, 40) + '] -> [' + String(b).slice(0, 40) + ']');
      }
      if (diffs.length) throw new Error('GERBANG GAGAL (' + diffs.length + ' selisih), semua dikembalikan: ' + diffs.slice(0, 8).join(' || '));
    }
    return res;
  } catch (e) {
    var errs = rollback();
    if (errs.length) e.message += ' || GAGAL MENGEMBALIKAN: ' + errs.join(' ; ');
    throw e;
  }
}
function setupRegion_() { return regSetupAll_(null, null, null, true); }

// =====================================================================
// LENGTH (panjang kabel): kolom "Length" di DATA BASE tepat di kanan "HP RFS" (masuk grup IMPLEMENTATION).
// Isi = jumlah semua kolom "Cable ..." (24C, 36C, 48C, 96C, 144C) di sheet OPNAME pada baris yang Name dan TypeSOW-nya sama dengan
// Name dan SOW site itu; kosong bila tidak ada kabel. Rumus tiap baris sampai DB_LAST_ROW, subtotal di baris 1 (seperti HP RFS).
// Letak kolom di OPNAME dicari dari judul baris 1 (Name, TypeSOW, Cable ...). setupLength dijalankan pemilik dari editor
// (sheet-side, tanpa deploy ulang; aman diulang: kolom tidak disisipkan dua kali). Gerbang: isi DATA BASE dan semua sheet yang merujuk
// DATA BASE dibandingkan sebelum/sesudah (kolom di kanan Length bergeser satu); bila ada selisih kolom dihapus lagi.
// =====================================================================
var LEN_HEAD = 'Length';
var LEN_SHEET = 'OPNAME';
var LEN_OP_LAST = 1000;
var LEN_NOTE = 'Panjang kabel (meter) dari sheet OPNAME: jumlah kolom Cable 24C/36C/48C/96C/144C pada baris yang Name dan SOW-nya sama. Otomatis, jangan diketik. Kosong bila tidak ada kabel.';

function lenOpCols_(op) {
  var v = op.getRange(1, 1, 4, Math.max(op.getLastColumn(), 1)).getDisplayValues();      // judul di baris 1-4 (data mulai baris 5, seperti DATA BASE)
  for (var r = 0; r < v.length; r++) {
    var name = 0, sow = 0, cab = [];
    v[r].forEach(function (x, i) {
      var s = String(x).replace(/\s+/g, ' ').trim();
      if (/^Name$/i.test(s)) name = i + 1; else if (/^TypeSOW$/i.test(s)) sow = i + 1; else if (/^Cable\b/i.test(s)) cab.push(i + 1);
    });
    if (name && sow && cab.length) return { name: name, sow: sow, cab: cab };
  }
  throw new Error('Judul Name, TypeSOW, atau kolom Cable tidak ditemukan di baris 1-4 sheet ' + op.getName() + '.');
}

// Rumus Length untuk baris r di DATA BASE (nL, sL = huruf kolom Name dan SOW).
function lenFormula_(oc, opName, r, nL, sL) {
  var ref = "'" + opName.replace(/'/g, "''") + "'!";
  function rg(c) { var L = dokLetter_(c); return ref + '$' + L + '$5:$' + L + '$' + LEN_OP_LAST; }
  var parts = oc.cab.map(function (c) { return 'SUMIFS(' + rg(c) + ';' + rg(oc.name) + ';$' + nL + r + ';' + rg(oc.sow) + ';$' + sL + r + ')'; });
  return '=IF($' + nL + r + '="";"";LET(panjang;' + parts.join('+') + ';IF(panjang=0;"";panjang)))';
}

// Pasang kolom Length (bila belum ada) dan rumusnya di sheet db. undo (boleh kosong) menerima cara membatalkan penyisipan kolom.
function lenBuild_(db, op, undo) {
  var h = dokHdr_(db), hp = dokFind_(h, /^HP RFS$/i), nameN = dokFind_(h, /^Name$/i), sowN = dokFind_(h, /^SOW$/i), col = dokFind_(h, /^Length$/i);
  if (!hp || !nameN || !sowN) throw new Error('Judul HP RFS, Name, atau SOW tidak ditemukan di DATA BASE (baris 1-4).');
  var oc = lenOpCols_(op), inserted = false, maxR = db.getMaxRows();
  if (maxR < DB_LAST_ROW) throw new Error('DATA BASE kurang dari ' + DB_LAST_ROW + ' baris.');
  if (!col) {
    if (String(db.getRange(3, hp + 1).getDisplayValue()).trim() !== '') throw new Error('Kolom di kanan "HP RFS" sudah punya judul di baris 3; kolom Length tidak disisipkan.');
    db.insertColumnAfter(hp);
    col = hp + 1; inserted = true;
    var c0 = col;
    if (undo) regUndo_(undo, 'kolom Length', function () { db.deleteColumn(c0); });
    db.getRange(1, hp).copyTo(db.getRange(1, col), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);        // subtotal baris 1 seperti HP RFS
    var mr = db.getRange(2, hp).getMergedRanges();                                                            // grup IMPLEMENTATION diperluas
    if (mr.length && mr[0].getLastColumn() < col) {
      var g0 = mr[0].getColumn(), cell = mr[0].getCell(1, 1), txt = cell.getValue(), bg = cell.getBackground(), fc = cell.getFontColor();
      mr[0].breakApart();
      db.getRange(2, g0, 1, col - g0 + 1).merge().setValue(txt).setBackground(bg).setFontColor(fc)
        .setFontWeight('bold').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
    }
    db.setColumnWidth(col, 95);
  }
  var hd = db.getRange(3, col);
  db.getRange(3, hp).copyTo(hd, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  hd.setValue(LEN_HEAD).setNote(LEN_NOTE);
  db.getRange(5, hp, maxR - 4, 1).copyTo(db.getRange(5, col, maxR - 4, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  db.getRange(5, col, maxR - 4, 1).setNumberFormat('#,##0').setHorizontalAlignment('center').setVerticalAlignment('middle');
  var nL = dokLetter_(nameN), sL = dokLetter_(sowN), f = [];
  for (var r = 5; r <= DB_LAST_ROW; r++) f.push([lenFormula_(oc, op.getName(), r, nL, sL)]);
  db.getRange(5, col, f.length, 1).setFormulas(f);
  SpreadsheetApp.flush();
  return { col: col, inserted: inserted, opCols: oc };
}

// Nilai yang seharusnya (dihitung lepas dari rumus): jumlah kolom Cable di OPNAME per pasangan Name|SOW (tanpa beda huruf besar/kecil).
function lenExpected_(db, op) {
  var h = dokHdr_(db), nameN = dokFind_(h, /^Name$/i), sowN = dokFind_(h, /^SOW$/i), oc = lenOpCols_(op);
  var ov = op.getRange(5, 1, LEN_OP_LAST - 4, op.getLastColumn()).getValues(), sum = {};
  ov.forEach(function (r) {
    var k = String(r[oc.name - 1]).trim().toLowerCase() + '|' + String(r[oc.sow - 1]).trim().toLowerCase(), s = 0;
    oc.cab.forEach(function (c) { s += Number(r[c - 1]) || 0; });
    if (String(r[oc.name - 1]).trim() !== '') sum[k] = (sum[k] || 0) + s;
  });
  var dv = db.getRange(5, 1, DB_LAST_ROW - 4, Math.max(nameN, sowN)).getValues();
  return dv.map(function (r) {
    if (String(r[nameN - 1]).trim() === '') return '';
    var s = sum[String(r[nameN - 1]).trim().toLowerCase() + '|' + String(r[sowN - 1]).trim().toLowerCase()] || 0;
    return s === 0 ? '' : s;
  });
}

function setupLength_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), db = ss.getSheetByName('DATA BASE'), op = ss.getSheetByName(LEN_SHEET);
  if (!db || !op) throw new Error('Sheet DATA BASE atau ' + LEN_SHEET + ' tidak ditemukan.');
  var undo = [], watch = [], dbLr = db.getLastRow(), dbLc = db.getLastColumn(), dbv0 = db.getRange(1, 1, dbLr, dbLc).getDisplayValues(), had = !!dokFindCol_(db, /^Length$/i);
  ss.getSheets().forEach(function (s) {              // sheet lain yang rumusnya merujuk DATA BASE
    if (s.getSheetId() === db.getSheetId()) return;
    var lr = s.getLastRow(), lc = s.getLastColumn(); if (!lr || !lc) return;
    var f = s.getRange(1, 1, lr, lc).getFormulas(), hit = false;
    for (var i = 0; i < f.length && !hit; i++) for (var j = 0; j < f[i].length; j++) if (f[i][j] && f[i][j].indexOf("'DATA BASE'!") >= 0) { hit = true; break; }
    if (hit) watch.push({ sh: s, lr: lr, lc: lc, dv: s.getRange(1, 1, lr, lc).getDisplayValues() });
  });
  try {
    var res = lenBuild_(db, op, undo), diffs = [];
    var dbv1 = db.getRange(1, 1, dbLr, db.getLastColumn()).getDisplayValues();
    for (var i2 = 0; i2 < dbLr; i2++) for (var j2 = 0; j2 < dbLc; j2++) {
      var nj = (res.inserted && j2 + 1 >= res.col) ? j2 + 1 : j2, a = dbv0[i2][j2], b = dbv1[i2][nj];
      if (a !== b) diffs.push('DATA BASE!' + dokLetter_(j2 + 1) + (i2 + 1) + '->' + dokLetter_(nj + 1) + ' [' + String(a).slice(0, 30) + '] -> [' + String(b).slice(0, 30) + ']');
    }
    watch.forEach(function (w) {
      var v1 = w.sh.getRange(1, 1, w.lr, w.lc).getDisplayValues();
      for (var i3 = 0; i3 < w.lr; i3++) for (var j3 = 0; j3 < w.lc; j3++) {
        if (w.dv[i3][j3] === v1[i3][j3]) continue;
        if (w.sh.getName() === 'DASHBOARD' && i3 === 2 && j3 === 0 && w.dv[i3][j3].split('Update terakhir')[0] === v1[i3][j3].split('Update terakhir')[0]) continue;
        diffs.push(w.sh.getName() + '!' + dokLetter_(j3 + 1) + (i3 + 1) + ' [' + String(w.dv[i3][j3]).slice(0, 30) + '] -> [' + String(v1[i3][j3]).slice(0, 30) + ']');
      }
    });
    var exp = lenExpected_(db, op), got = db.getRange(5, res.col, DB_LAST_ROW - 4, 1).getValues(), bad = [];
    for (var q = 0; q < exp.length; q++) if (!(exp[q] === '' ? String(got[q][0]) === '' : Math.abs(Number(got[q][0]) - exp[q]) < 1e-9)) bad.push('baris ' + (q + 5) + ' exp ' + exp[q] + ' got ' + got[q][0]);
    if (bad.length) diffs.push('Length tidak sama dengan hitungan independen (' + bad.length + '): ' + bad.slice(0, 4).join(' ; '));
    if (diffs.length) throw new Error('GERBANG GAGAL (' + diffs.length + ' selisih), kolom dikembalikan: ' + diffs.slice(0, 8).join(' || '));
    var filled = 0, total = 0; exp.forEach(function (x) { if (x !== '') { filled++; total += x; } });
    return { col: dokLetter_(res.col), inserted: res.inserted, hadColumn: had, filledRows: filled, totalLength: total, watched: watch.map(function (w) { return w.sh.getName(); }) };
  } catch (e) {
    var errs = [];
    undo.slice().reverse().forEach(function (u) { try { u.fn(); } catch (e2) { errs.push(u.label + ': ' + String(e2).slice(0, 120)); } });
    SpreadsheetApp.flush();
    if (errs.length) e.message += ' || GAGAL MENGEMBALIKAN: ' + errs.join(' ; ');
    throw e;
  }
}

// =====================================================================
// ATP dan RECTI (tahap sesudah RFS): 6 kolom di DATA BASE tepat di kanan "Length" (sebelum OPNAME), dalam dua grup di baris 2:
//   ATP:   ATP (dropdown status), ATP Start, ATP End
//   RECTI: RECTI (dropdown status), RECTI Start, RECTI End
// Start/End diisi manual (validasi tanggal). Warna status = warna sel (aturan warna bersyarat). Validasi sampai DB_LAST_ROW.
// (Versi sebelumnya punya kolom Rate (%) dan tabel rate di DASHBOARD; keduanya dibuang atas permintaan pemilik, lihat atpDropOld_.)
// setupAtp dijalankan pemilik dari editor (sheet-side, tanpa deploy ulang; aman diulang: kolom tidak disisipkan dua kali). Gerbang:
// isi DATA BASE dan sheet yang merujuknya dibandingkan sebelum/sesudah (kolom bergeser menurut yang dibuang/disisipkan).
// =====================================================================
var ATP_HEAD = ['ATP', 'ATP Start', 'ATP End', 'RECTI', 'RECTI Start', 'RECTI End'];
var ATP_STATUS = [
  ['Waiting for Schedule', 'ON ATP PROCESS', 'ATP FUND PAID', 'Waiting for Signature', 'Completed'],
  ['Fixing Punching list', 'Wait for 2nd ATP Schedule', 'SIGNED', 'Document send to HO', 'Completed']
];
var ATP_COLORS = [
  [['#CFE2F3', '#1C4587'], ['#FCE5CD', '#B45F06'], ['#FFF2CC', '#7F6000'], ['#F4CCCC', '#990000'], ['#D9EAD3', '#274E13']],
  [['#CFE2F3', '#1C4587'], ['#FFF2CC', '#7F6000'], ['#F4CCCC', '#990000'], ['#D9EAD3', '#274E13'], ['#EFEFEF', '#434343']]
];
var ATP_TABLE = 'DATA ATP RECTI';      // judul tabel rate lama di DASHBOARD (dibersihkan bila masih ada)
var ATP_NOTES = [
  'Status ATP (dropdown): Waiting for Schedule, ON ATP PROCESS, ATP FUND PAID, Waiting for Signature, Completed.',
  'Tanggal mulai ATP (mis. 25/09/2026).', 'Tanggal selesai ATP (mis. 25/09/2026).',
  'Status RECTI (dropdown): Fixing Punching list, Wait for 2nd ATP Schedule, SIGNED, Document send to HO, Completed.',
  'Tanggal mulai RECTI (mis. 25/09/2026).', 'Tanggal selesai RECTI (mis. 25/09/2026).'
];

// Rumus (di sheet mana pun) yang merujuk kolom-kolom col (nomor kolom di DATA BASE); rumus di dalam kolom itu sendiri diabaikan.
function atpRefsTo_(ss, db, cols) {
  var found = [], letters = cols.map(function (c) { return dokLetter_(c); });
  ss.getSheets().forEach(function (s) {
    var lr = s.getLastRow(), lc = s.getLastColumn(); if (!lr || !lc) return;
    var isDb = s.getSheetId() === db.getSheetId(), f = s.getRange(1, 1, lr, lc).getFormulas();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < f[i].length; j++) {
      var x = f[i][j]; if (!x) continue;
      if (isDb && cols.indexOf(j + 1) >= 0) continue;
      if (!isDb && x.indexOf("'DATA BASE'!") < 0) continue;
      for (var k = 0; k < letters.length; k++) {
        if (new RegExp('(^|[^A-Za-z0-9_$])\\$?' + letters[k] + '\\$?[0-9]').test(x)) { found.push(s.getName() + '!' + dokLetter_(j + 1) + (i + 1) + ' ' + x.slice(0, 60)); break; }
      }
    }
  });
  return found;
}

// Buang kolom "ATP Rate (%)" dan "RECTI Rate (%)" (bila ada) beserta tabel rate dan sel bernama RATE_ATP/RATE_RECTI di sh.
function atpDropOld_(ss, db, sh) {
  var h = dokHdr_(db), cols = [dokFind_(h, /^ATP Rate \(%\)$/i), dokFind_(h, /^RECTI Rate \(%\)$/i)].filter(function (c) { return c > 0; });
  cols.sort(function (a, b) { return b - a; });
  if (cols.length) {
    var refs = atpRefsTo_(ss, db, cols);
    if (refs.length) throw new Error('Ada rumus lain yang merujuk kolom Rate; tidak dibuang: ' + refs.slice(0, 4).join(' || '));
    cols.forEach(function (c) { db.deleteColumn(c); });
  }
  var top = kurvaFindRow_(sh, ATP_TABLE), cleared = false;
  if (top) { sh.getRange(top, 1, 8, 6).clear(); cleared = true; }
  var names = [];
  ss.getNamedRanges().forEach(function (n) {
    var nm = n.getName();
    if ((nm === 'RATE_ATP' || nm === 'RATE_RECTI') && n.getRange().getSheet().getSheetId() === sh.getSheetId()) { names.push(nm); n.remove(); }
  });
  return { removedCols: cols, tableCleared: cleared, names: names };
}

// Pasang enam kolom (bila belum ada) di db, validasi, dan warna status. Kolom Rate versi lama dibuang lebih dulu.
function atpBuild_(ss, db, sh, undo) {
  var dropped = atpDropOld_(ss, db, sh);
  var h = dokHdr_(db), len = dokFind_(h, /^Length$/i), first = dokFind_(h, /^ATP$/i), inserted = false, maxR = db.getMaxRows();
  if (!len) throw new Error('Kolom Length belum ada di DATA BASE; jalankan setupLength dulu.');
  if (maxR < DB_LAST_ROW) throw new Error('DATA BASE kurang dari ' + DB_LAST_ROW + ' baris.');
  if (!first) {
    if (String(db.getRange(3, len + 1).getDisplayValue()).trim() !== '') throw new Error('Kolom di kanan "Length" sudah punya judul di baris 3; kolom ATP tidak disisipkan.');
    db.insertColumnsAfter(len, 6);
    first = len + 1; inserted = true;
    var c0 = first;
    if (undo) regUndo_(undo, 'enam kolom ATP RECTI', function () { db.deleteColumns(c0, 6); });
    db.getRange(3, len, maxR - 2, 1).copyTo(db.getRange(3, first, maxR - 2, 6), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  // grup di baris 2 (gaya sama dengan grup IMPLEMENTATION)
  var src = db.getRange(2, dokFind_(h, /^Implementation Status$/i)), bg = src.getBackground(), fc = src.getFontColor();
  [[first, 3, 'ATP'], [first + 3, 3, 'RECTI']].forEach(function (g) {
    db.getRange(2, g[0], 1, g[1]).breakApart().merge().setValue(g[2]).setBackground(bg).setFontColor(fc)
      .setFontWeight('bold').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
  });
  [150, 100, 100, 170, 100, 100].forEach(function (w, i) { db.setColumnWidth(first + i, w); });
  db.getRange(3, first, 1, 6).setValues([ATP_HEAD]);
  ATP_NOTES.forEach(function (n, i) { db.getRange(3, first + i).setNote(n); });
  var nB = maxR - 4, vr = DB_LAST_ROW - 4;
  db.getRange(5, first, nB, 6).setHorizontalAlignment('center').setVerticalAlignment('middle');
  [1, 2, 4, 5].forEach(function (i) { db.getRange(5, first + i, nB, 1).setNumberFormat('dd mmm yyyy'); });
  [0, 1].forEach(function (g) {
    var c = first + g * 3, nm = g ? 'RECTI' : 'ATP';
    db.getRange(5, c, vr, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ATP_STATUS[g], true).setAllowInvalid(false).setHelpText('Pilih status ' + nm).build());
    [1, 2].forEach(function (k) {
      db.getRange(5, c + k, vr, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Isi tanggal, mis. 25/09/2026').build());
    });
  });
  // warna status (aturan lama pada kolom ATP/RECTI diganti)
  var rules = db.getConditionalFormatRules().filter(function (rl) {
    var g0 = rl.getRanges()[0]; return !(g0 && g0.getColumn() >= first && g0.getColumn() <= first + 5);
  });
  [0, 1].forEach(function (g) {
    var rg = db.getRange(5, first + g * 3, vr, 1);
    ATP_STATUS[g].forEach(function (s, i) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(ATP_COLORS[g][i][0]).setFontColor(ATP_COLORS[g][i][1]).setBold(true).setRanges([rg]).build());
    });
  });
  db.setConditionalFormatRules(rules);
  SpreadsheetApp.flush();
  return { first: first, inserted: inserted, dropped: dropped };
}

// Pemeriksaan bagian baru; mengembalikan daftar masalah (kosong = baik).
function atpVerify_(ss, db, sh, res) {
  var p = [], f = res.first, h = db.getRange(3, f, 1, 6).getDisplayValues()[0], all = dokHdr_(db);
  ATP_HEAD.forEach(function (x, i) { if (h[i] !== x) p.push('judul kolom ' + dokLetter_(f + i) + ' = "' + h[i] + '", seharusnya "' + x + '"'); });
  if (dokFind_(all, /Rate \(%\)$/i) && /ATP|RECTI/i.test(String(all[2][dokFind_(all, /Rate \(%\)$/i) - 1]))) p.push('kolom Rate masih ada');
  [0, 1].forEach(function (g) {
    var dvv = db.getRange(5, f + g * 3).getDataValidation(), vals = dvv ? dvv.getCriteriaValues()[0] : null;
    if (!vals || vals.join('|') !== ATP_STATUS[g].join('|')) p.push('dropdown status ' + (g ? 'RECTI' : 'ATP') + ' tidak sesuai');
    if (!db.getRange(DB_LAST_ROW, f + g * 3).getDataValidation()) p.push('dropdown baris ' + DB_LAST_ROW + ' tidak ada');
  });
  var left = ss.getNamedRanges().filter(function (n) { return (n.getName() === 'RATE_ATP' || n.getName() === 'RATE_RECTI') && n.getRange().getSheet().getSheetId() === sh.getSheetId(); });
  if (left.length) p.push('sel bernama rate masih ada');
  if (kurvaFindRow_(sh, ATP_TABLE)) p.push('tabel rate masih ada di DASHBOARD');
  return p;
}

function setupAtp_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), db = ss.getSheetByName('DATA BASE'), sh = ss.getSheetByName('DASHBOARD');
  if (!db || !sh) throw new Error('Sheet DATA BASE atau DASHBOARD tidak ditemukan.');
  var undo = [], watch = [], dbLr = db.getLastRow(), dbLc = db.getLastColumn(), dbv0 = db.getRange(1, 1, dbLr, dbLc).getDisplayValues(), h0 = dokHdr_(db);
  var had = !!dokFind_(h0, /^ATP$/i), rateOld = [dokFind_(h0, /^ATP Rate \(%\)$/i), dokFind_(h0, /^RECTI Rate \(%\)$/i)].filter(function (c) { return c > 0; });
  var tbl0 = kurvaFindRow_(sh, ATP_TABLE);      // tabel rate lama (bila ada) memang dibersihkan
  ss.getSheets().forEach(function (s) {              // sheet lain yang rumusnya merujuk DATA BASE
    if (s.getSheetId() === db.getSheetId()) return;
    var lr = s.getLastRow(), lc = s.getLastColumn(); if (!lr || !lc) return;
    var f = s.getRange(1, 1, lr, lc).getFormulas(), hit = false;
    for (var i = 0; i < f.length && !hit; i++) for (var j = 0; j < f[i].length; j++) if (f[i][j] && f[i][j].indexOf("'DATA BASE'!") >= 0) { hit = true; break; }
    if (hit) watch.push({ sh: s, lr: lr, lc: lc, dv: s.getRange(1, 1, lr, lc).getDisplayValues() });
  });
  try {
    var res = atpBuild_(ss, db, sh, undo), diffs = [];
    var dbv1 = db.getRange(1, 1, dbLr, db.getLastColumn()).getDisplayValues();
    for (var i2 = 0; i2 < dbLr; i2++) for (var j2 = 0; j2 < dbLc; j2++) {
      var old = j2 + 1;
      if (rateOld.indexOf(old) >= 0) continue;                                       // kolom Rate dibuang
      var shiftLeft = rateOld.filter(function (c) { return c < old; }).length;
      var nj = j2 - shiftLeft + ((res.inserted && old >= res.first) ? 6 : 0), a = dbv0[i2][j2], b = dbv1[i2][nj];
      if (a !== b) diffs.push('DATA BASE!' + dokLetter_(old) + (i2 + 1) + '->' + dokLetter_(nj + 1) + ' [' + String(a).slice(0, 30) + '] -> [' + String(b).slice(0, 30) + ']');
    }
    watch.forEach(function (w) {
      var v1 = w.sh.getRange(1, 1, w.lr, w.lc).getDisplayValues();
      for (var i3 = 0; i3 < w.lr; i3++) for (var j3 = 0; j3 < w.lc; j3++) {
        if (w.dv[i3][j3] === v1[i3][j3]) continue;
        if (w.sh.getName() === 'DASHBOARD' && i3 === 2 && j3 === 0 && w.dv[i3][j3].split('Update terakhir')[0] === v1[i3][j3].split('Update terakhir')[0]) continue;
        if (w.sh.getName() === 'DASHBOARD' && tbl0 && i3 + 1 >= tbl0 && i3 + 1 < tbl0 + 8) continue;
        diffs.push(w.sh.getName() + '!' + dokLetter_(j3 + 1) + (i3 + 1) + ' [' + String(w.dv[i3][j3]).slice(0, 30) + '] -> [' + String(v1[i3][j3]).slice(0, 30) + ']');
      }
    });
    atpVerify_(ss, db, sh, res).forEach(function (x) { diffs.push(x); });
    if (diffs.length) throw new Error('GERBANG GAGAL (' + diffs.length + ' selisih): ' + diffs.slice(0, 8).join(' || '));
    return { firstCol: dokLetter_(res.first), lastCol: dokLetter_(res.first + 5), inserted: res.inserted, hadColumns: had, removedRateCols: res.dropped.removedCols.map(function (c) { return dokLetter_(c); }), tableCleared: res.dropped.tableCleared, namesRemoved: res.dropped.names, watched: watch.map(function (w) { return w.sh.getName(); }) };
  } catch (e) {
    var errs = [];
    undo.slice().reverse().forEach(function (u) { try { u.fn(); } catch (e2) { errs.push(u.label + ': ' + String(e2).slice(0, 120)); } });
    SpreadsheetApp.flush();
    if (errs.length) e.message += ' || GAGAL MENGEMBALIKAN: ' + errs.join(' ; ');
    throw e;
  }
}

// =====================================================================
// PR NUMBER: satu kolom di DATA BASE tepat di kanan kolom terakhir grup DRAWING (ABD), sebelum Implementation Status, dengan label
// "PR NUMBER" digabung baris 2-3 (seperti OPNAME dan BA CLOSING). Diisi manual (teks bebas, mis. nomor Purchase Request; format teks supaya angka nol di depan dan
// kode seperti "PR-001" tidak berubah). setupPr dijalankan pemilik dari editor (sheet-side, tanpa deploy ulang; aman diulang: kolom
// tidak disisipkan dua kali). Gerbang: isi DATA BASE dan sheet yang merujuk DATA BASE dibandingkan sebelum/sesudah (kolom di kanan bergeser
// satu); bila ada selisih kolom dihapus lagi.
// =====================================================================
var PR_HEAD = 'PR Number';
var PR_GROUP = 'PR NUMBER';
var PR_NOTE = 'Nomor PR (Purchase Request) site ini. Diisi manual, teks bebas (mis. PR-001).';

function prBuild_(db, undo) {
  var h = dokHdr_(db), abd = dokFind_(h, /^ABD$/i), impl = dokFind_(h, /^Implementation Status$/i), col = dokFind_(h, /^PR Number$/i), inserted = false, maxR = db.getMaxRows();
  if (!abd || !impl) throw new Error('Judul kolom ABD atau Implementation Status tidak ditemukan di DATA BASE (baris 1-4).');
  if (!col) {
    if (impl !== abd + 1) throw new Error('Kolom di kanan ABD bukan Implementation Status; kolom PR Number tidak disisipkan.');
    db.insertColumnAfter(abd);
    col = abd + 1; inserted = true;
    var c0 = col;
    if (undo) regUndo_(undo, 'kolom PR Number', function () { db.deleteColumn(c0); });
    db.getRange(3, abd, maxR - 2, 1).copyTo(db.getRange(3, col, maxR - 2, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    db.setColumnWidth(col, 130);
    // kolom tunggal seperti OPNAME dan BA CLOSING: label di baris 2 digabung dengan baris 3, gaya sama dengan grup IMPLEMENTATION
    var src = db.getRange(2, impl + 1), bg = src.getBackground(), fc = src.getFontColor();
    db.getRange(2, col, 2, 1).breakApart().merge().setValue(PR_GROUP).setBackground(bg).setFontColor(fc)
      .setFontWeight('bold').setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  }
  db.getRange(2, col).setNote(PR_NOTE);
  var body = db.getRange(5, col, maxR - 4, 1);
  body.clearDataValidations().setNumberFormat('@').setHorizontalAlignment('center').setVerticalAlignment('middle');
  SpreadsheetApp.flush();
  return { col: col, inserted: inserted };
}

function setupPr_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), db = ss.getSheetByName('DATA BASE');
  if (!db) throw new Error('Sheet DATA BASE tidak ditemukan.');
  var undo = [], watch = [], dbLr = db.getLastRow(), dbLc = db.getLastColumn(), dbv0 = db.getRange(1, 1, dbLr, dbLc).getDisplayValues(), had = !!dokFindCol_(db, /^PR Number$/i);
  ss.getSheets().forEach(function (s) {              // sheet lain yang rumusnya merujuk DATA BASE
    if (s.getSheetId() === db.getSheetId()) return;
    var lr = s.getLastRow(), lc = s.getLastColumn(); if (!lr || !lc) return;
    var f = s.getRange(1, 1, lr, lc).getFormulas(), hit = false;
    for (var i = 0; i < f.length && !hit; i++) for (var j = 0; j < f[i].length; j++) if (f[i][j] && f[i][j].indexOf("'DATA BASE'!") >= 0) { hit = true; break; }
    if (hit) watch.push({ sh: s, lr: lr, lc: lc, dv: s.getRange(1, 1, lr, lc).getDisplayValues() });
  });
  try {
    var res = prBuild_(db, undo), diffs = [];
    var dbv1 = db.getRange(1, 1, dbLr, db.getLastColumn()).getDisplayValues();
    for (var i2 = 0; i2 < dbLr; i2++) for (var j2 = 0; j2 < dbLc; j2++) {
      var nj = (res.inserted && j2 + 1 >= res.col) ? j2 + 1 : j2, a = dbv0[i2][j2], b = dbv1[i2][nj];
      if (a !== b) diffs.push('DATA BASE!' + dokLetter_(j2 + 1) + (i2 + 1) + '->' + dokLetter_(nj + 1) + ' [' + String(a).slice(0, 30) + '] -> [' + String(b).slice(0, 30) + ']');
    }
    watch.forEach(function (w) {
      var v1 = w.sh.getRange(1, 1, w.lr, w.lc).getDisplayValues();
      for (var i3 = 0; i3 < w.lr; i3++) for (var j3 = 0; j3 < w.lc; j3++) {
        if (w.dv[i3][j3] === v1[i3][j3]) continue;
        if (w.sh.getName() === 'DASHBOARD' && i3 === 2 && j3 === 0 && w.dv[i3][j3].split('Update terakhir')[0] === v1[i3][j3].split('Update terakhir')[0]) continue;
        diffs.push(w.sh.getName() + '!' + dokLetter_(j3 + 1) + (i3 + 1) + ' [' + String(w.dv[i3][j3]).slice(0, 30) + '] -> [' + String(v1[i3][j3]).slice(0, 30) + ']');
      }
    });
    var h1 = dokHdr_(db), abd = dokFind_(h1, /^ABD$/i);
    if (res.col !== abd + 1) diffs.push('PR Number tidak tepat di kanan ABD');
    if (db.getRange(2, res.col).getDisplayValue().toUpperCase() !== PR_GROUP && db.getRange(3, res.col).getDisplayValue().toUpperCase() !== PR_GROUP) diffs.push('judul PR NUMBER tidak ada di baris 2 atau 3');
    if (db.getRange(5, res.col).getDataValidation() || db.getRange(DB_LAST_ROW, res.col).getDataValidation()) diffs.push('kolom PR Number masih punya validasi bawaan');
    if (diffs.length) throw new Error('GERBANG GAGAL (' + diffs.length + ' selisih), kolom dikembalikan: ' + diffs.slice(0, 8).join(' || '));
    return { col: dokLetter_(res.col), inserted: res.inserted, hadColumn: had, watched: watch.map(function (w) { return w.sh.getName(); }) };
  } catch (e) {
    var errs = [];
    undo.slice().reverse().forEach(function (u) { try { u.fn(); } catch (e2) { errs.push(u.label + ': ' + String(e2).slice(0, 120)); } });
    SpreadsheetApp.flush();
    if (errs.length) e.message += ' || GAGAL MENGEMBALIKAN: ' + errs.join(' ; ');
    throw e;
  }
}

// =====================================================================
// AKSES PER REGION: kode akses region = nama region di DATA BASE (kolom Region; tanpa beda huruf besar/kecil, spasi, dan tanda baca,
// mis. "Banjarmasin" atau "pontianak"). Tidak ada rahasia yang disimpan: daftar region dibaca langsung dari DATA BASE, jadi region baru
// otomatis punya kodenya. Kode region berperan seperti "admin" (Submit BOQ dan BA Transaksi, tanpa menu RPM) tetapi dibatasi ke region itu:
//  - daftar nama site dan pencocokan hasil baca BA hanya dari site region itu,
//  - BOQ dan BA hanya boleh untuk site yang terdaftar di DATA BASE dengan Region itu (REGION_ALLOW_NEW_SITE = false),
//  - riwayat BA dan unduh PDF hanya untuk BA milik site region itu.
// Kode admin dan RPM (hash di Script Properties) tetap memberi akses ke semua region.
// CATATAN KEAMANAN: nama region bukan rahasia (tampil di DASHBOARD), jadi kode ini mudah ditebak. Cukup untuk memisahkan tim
// per region, bukan untuk menahan orang luar. Bila perlu lebih kuat, kode region bisa dibuat nama + angka rahasia (ubah regionOfCode_).
// Fungsi berakhiran "_" tetap privat; hanya fungsi publik di bawah yang bisa dipanggil dari browser.
// =====================================================================
var REGION_ALLOW_NEW_SITE = false;     // true = site yang belum ada di DATA BASE (region mana pun) boleh dipakai kode region

function regionKey_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

// Nama region (persis seperti di DATA BASE) bila kode cocok dengan salah satunya; '' bila bukan kode region.
function regionOfCode_(code) {
  var k = regionKey_(code);
  if (k.length < 3) return '';
  var db = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DATA BASE');
  if (!db) return '';
  var c = dokFind_(dokHdr_(db), /^Region$/i);
  if (!c) return '';
  var v = db.getRange(5, c, Math.max(db.getLastRow() - 4, 1), 1).getValues();
  for (var i = 0; i < v.length; i++) {
    var r = String(v[i][0]).trim();
    if (r && regionKey_(r) === k) return r;
  }
  return '';
}

// Batas region untuk kode ini: '' = semua region (kode admin atau RPM), nama region untuk kode region.
function scopeOf_(code) {
  var u = userByCode_(code);
  return u ? u.area : '';
}

// Himpunan nama site (dinormalkan) milik region scope di DATA BASE.
function baScopeKeys_(scope) {
  var keys = {};
  baReadDbSites_(scope).forEach(function (d) { keys[normalizeText_(d.name)] = true; });
  return keys;
}

// Tolak site yang bukan milik region scope (scope kosong = tanpa batas). Pesan sengaja sama untuk site region lain dan site tak dikenal.
function regionCheckSite_(scope, siteName) {
  if (!scope) return;
  var key = normalizeText_(siteName), mine = false, other = false;
  baReadDbSites_().forEach(function (d) {
    if (normalizeText_(d.name) !== key) return;
    if (regionKey_(d.region) === regionKey_(scope)) mine = true; else other = true;
  });
  if (mine) return;
  if (!other && REGION_ALLOW_NEW_SITE) return;
  throw new Error('Site "' + String(siteName || '').trim() + '" tidak terdaftar di region ' + scope + '. Minta admin mendaftarkannya di DATA BASE (kolom Region) dulu.');
}

// =====================================================================
// PEMERIKSAAN STRUKTUR DAN PEMANTAUAN BEBAN
// Kode mencari kolom DATA BASE lewat judul (baris 1-4), jadi mengganti nama judul bisa membuat fitur berhenti diam-diam.
//  - cekStruktur (menu "BA Transaksi" > "Periksa struktur", hanya pemilik): daftar judul kolom, sel bernama, dan blok bantu yang
//    dibutuhkan fitur dan mana yang hilang.
//  - Blok PENGATURAN di DASHBOARD punya tiga baris pantauan (setupMonitor): status judul kolom (OK atau HILANG: ...), kapasitas
//    REKAP BA, dan jumlah BA di BA TRANSAKSI (REKAP BA menghitung ribuan rumus terhadap seluruh BA TRANSAKSI, jadi melambat bila BA
//    membengkak). Subjudul DASHBOARD memberi PERHATIAN bila ada yang hampir penuh atau berat.
// =====================================================================
var STRUKTUR_WAJIB = [
  ['Region', /^Region$/i, 'tabel/grafik per region, akses portal per region'],
  ['Name', /^Name$/i, 'semua fitur'], ['SOW', /^SOW$/i, 'Kurva S, Target RFS, Length'], ['Month', /^Month$/i, 'Kurva S, Target RFS'],
  ['Permit Status', /^Permit Status$/i, 'ringkasan per region'], ['Donasi', /^Donasi$/i, 'kartu donasi, ringkasan per region'],
  ['Tgl Donasi Dibayar', /^Tgl Donasi Dibayar$/i, 'Dokumen Permit'], ['Target Kirim Dokumen', /^Target Kirim Dokumen$/i, 'Dokumen Permit'],
  ['BA OPEN', /^BA OPEN$/i, 'Dokumen Permit'], ['PERJANJIAN DONASI', /^PERJANJIAN DONASI$/i, 'Dokumen Permit'],
  ['TANDA TERIMA DONASI', /^TANDA TERIMA DONASI$/i, 'Dokumen Permit'], ['KWITANSI ...', /^KWITANSI/i, 'Dokumen Permit'],
  ['Tgl Dokumen Terkirim', /^Tgl Dokumen Terkirim$/i, 'Dokumen Permit'], ['Status Dokumen', /^Status Dokumen$/i, 'Dokumen Permit, ringkasan per region'],
  ['HP (rencana): HP / HP Rencana / HP SNDK', /^HP( Rencana| SNDK)?$/i, 'panel TARGET RFS'],
  ['SNDK', /^SNDK$/i, 'kolom HP rencana'], ['APD', /^APD$/i, 'kolom HP rencana'], ['ABD', /^ABD$/i, 'PR Number'],
  ['Implementation Status', /^Implementation Status$/i, 'Kurva S, Target RFS, ringkasan per region'], ['HP RFS', /^HP RFS$/i, 'Kurva S, Target RFS, KPI'],
  ['Length', /^Length$/i, 'ATP RECTI (posisi)'], ['ATP', /^ATP$/i, 'ATP RECTI'], ['RECTI', /^RECTI$/i, 'ATP RECTI'],
  ['OPNAME', /^OPNAME$/i, 'ringkasan per region'], ['BA CLOSING', /^BA CLOSING$/i, 'ringkasan per region'], ['PR Number', /^PR Number$/i, 'PR Number']
];
var MON_LABELS = ['Judul kolom DATA BASE dibutuhkan fitur', 'REKAP BA: baris terisi / kapasitas', 'BA TRANSAKSI: jumlah BA / batas pantau'];
var MON_BA_LIMIT = 2000;      // perkiraan: di atas ini REKAP BA (ribuan rumus terhadap seluruh BA TRANSAKSI) mulai terasa lambat

// Hasil pemeriksaan: { missing: [...], notes: [...] }; kosong = struktur baik.
function cekStruktur_(db) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = { missing: [], notes: [] };
  db = db || ss.getSheetByName('DATA BASE');
  if (!db) { out.missing.push('sheet DATA BASE'); return out; }
  var h = dokHdr_(db);
  STRUKTUR_WAJIB.forEach(function (x) { if (!dokFind_(h, x[1])) out.missing.push(x[0] + ' (dipakai: ' + x[2] + ')'); });
  ['HARI_INI', 'NAMA_REGION', 'NAMA_WILAYAH'].forEach(function (n) { if (!ss.getRangeByName(n)) out.notes.push('sel bernama ' + n + ' tidak ada (jalankan setupParameter)'); });
  var sh = ss.getSheetByName('DASHBOARD');
  if (!sh) out.notes.push('sheet DASHBOARD tidak ada');
  else [[PRM_TITLE, 'blok PENGATURAN'], [REG_HELP, 'blok DATA REGION'], [KURVA_HELP, 'tabel DATA KURVA S'], [TRFS_HELP, 'daftar bulan DATA TARGET RFS']].forEach(function (b) {
    if (!kurvaFindRow_(sh, b[0])) out.notes.push(b[1] + ' tidak ditemukan di DASHBOARD');
  });
  if (sh) { var stale = dashStale_(sh); if (stale.length) out.notes.push(stale.length + ' rumus DASHBOARD membaca DATA BASE hanya sampai baris kurang dari ' + DB_LAST_ROW + ' (mis. ' + dokLetter_(stale[0].c) + stale[0].r + '); jalankan perbaikiRentangDashboard'); }
  var op = ss.getSheetByName(LEN_SHEET);
  if (!op) out.notes.push('sheet ' + LEN_SHEET + ' tidak ada'); else { try { lenOpCols_(op); } catch (e) { out.notes.push(String(e.message)); } }
  return out;
}

function cekStruktur() {
  ownerOnly_();
  var r = cekStruktur_(), msg = (r.missing.length ? 'Judul kolom hilang:\n- ' + r.missing.join('\n- ') : 'Judul kolom DATA BASE: semua ada.') + (r.notes.length ? '\n\nCatatan:\n- ' + r.notes.join('\n- ') : '');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Periksa struktur', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* dari editor tanpa jendela sheet */ }
  return r;
}

// Rumus status judul kolom untuk sel di DASHBOARD (memeriksa baris 1-4 DATA BASE; COUNTIF, jadi judul harus persis, jangan ada spasi ekstra).
function monHeadersFx_(dbName) {
  var names = ['Region', 'Name', 'SOW', 'Month', 'Permit Status', 'Donasi', 'Tgl Donasi Dibayar', 'Target Kirim Dokumen', 'BA OPEN', 'PERJANJIAN DONASI', 'TANDA TERIMA DONASI',
    'KWITANSI*', 'Tgl Dokumen Terkirim', 'Status Dokumen', 'SNDK', 'APD', 'ABD', 'Implementation Status', 'HP RFS', 'Length', 'ATP', 'RECTI', 'OPNAME', 'BA CLOSING', 'PR NUMBER'];
  var ref = "'" + dbName.replace(/'/g, "''") + "'!$A$1:$AZ$4";
  var arr = '{' + names.map(function (x) { return '"' + x + '"'; }).join(';') + '}';      // tanpa LET: di dalam LET, COUNTIF dengan larik hanya menghasilkan satu nilai
  return '=IF(SUMPRODUCT(--(COUNTIF(' + ref + ';' + arr + ')=0))=0;"OK";"HILANG: "&TEXTJOIN(", ";TRUE;FILTER(' + arr + ';COUNTIF(' + ref + ';' + arr + ')=0)))';
}

// Tiga baris pantauan di bawah blok PENGATURAN + peringatan di subjudul DASHBOARD. sh/dbName boleh salinan uji.
function setupMonitor_(sh, dbName, gate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sh = sh || ss.getSheetByName('DASHBOARD'); dbName = dbName || 'DATA BASE';
  if (!sh) throw new Error('Sheet DASHBOARD tidak ditemukan.');
  var top = kurvaFindRow_(sh, PRM_TITLE);
  if (!top) throw new Error('Blok PENGATURAN belum ada; jalankan setupParameter dulu.');
  var built = String(sh.getRange(top + 5, 1).getDisplayValue()) === MON_LABELS[0], undo = [];
  var nc = 16, oldLast = sh.getLastRow(), dv0 = sh.getRange(1, 1, oldLast, nc).getDisplayValues(), a3f = sh.getRange('A3').getFormula();
  try {
    if (!built) {
      if (String(sh.getRange(top + 5, 1).getDisplayValue()).trim() !== '' && String(sh.getRange(top + 5, 1).getDisplayValue()).indexOf(REG_HELP) !== 0) throw new Error('Baris tepat di bawah blok PENGATURAN tidak kosong; pantauan tidak dipasang.');
      sh.insertRowsAfter(top + 4, 3);
      var t0 = top;
      regUndo_(undo, 'baris pantauan', function () { sh.deleteRows(t0 + 5, 3); });
    }
    var GRID = '#BFBFBF', r1 = top + 5, r2 = top + 6, r3 = top + 7;
    var blk = sh.getRange(r1, 1, 3, 6);
    blk.clearContent().clearFormat().setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setVerticalAlignment('middle');
    sh.getRange(r1, 1, 3, 1).setValues([[MON_LABELS[0]], [MON_LABELS[1]], [MON_LABELS[2]]]).setFontWeight('bold');
    sh.getRange(r1, 2).setFormula(monHeadersFx_(dbName));
    var qBa = "'" + BA_SHEET_NAME + "'!", cN = qBa + '$A$2:$A', cS = qBa + '$' + baColLetter_(BA_COL.SOW) + '$2:$' + baColLetter_(BA_COL.SOW);
    sh.getRange(r2, 2).setFormula('=IFERROR(ROWS(UNIQUE(FILTER(HSTACK(' + cN + ';' + cS + ');' + cN + '<>"")));0)');      // Site+SOW yang punya BA = baris REKAP BA yang dibutuhkan (dihitung dari BA TRANSAKSI, REKAP BA ada di Gudang BMI)
    sh.getRange(r2, 3).setValue(REKAP_ROWS);
    sh.getRange(r2, 4).setFormula('=IF(B' + r2 + '>C' + r2 + ';"MELEBIHI KAPASITAS";IF(B' + r2 + '>=C' + r2 + '*9/10;"HAMPIR PENUH";"aman"))');
    sh.getRange(r3, 2).setFormula("=COUNTIF('" + BA_SHEET_NAME + "'!$A$2:$A;\"?*\")");
    sh.getRange(r3, 3).setValue(MON_BA_LIMIT);
    sh.getRange(r3, 4).setFormula('=IF(B' + r3 + '>=C' + r3 + ';"BERAT: REKAP BA bisa lambat";IF(B' + r3 + '>=C' + r3 + '*8/10;"MULAI BERAT";"aman"))');
    sh.getRange(r2, 2, 2, 2).setNumberFormat('#,##0');
    sh.getRange(r1, 2, 3, 3).setHorizontalAlignment('center').setFontWeight('bold');
    sh.getRange(r1, 2, 1, 3).merge();
    sh.getRange(r1, 1, 3, 4).setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(r1, 5, 3, 1).setValues([
      ['Otomatis: OK bila semua judul kolom yang dibutuhkan fitur ada di DATA BASE (baris 1-4). Bila HILANG, fitur terkait berhenti sampai judulnya dikembalikan.'],
      ['REKAP BA (di spreadsheet Gudang BMI) memuat satu baris per Site+SOW yang punya BA; angka dihitung dari BA TRANSAKSI. Bila HAMPIR PENUH, minta admin menaikkan REKAP_ROWS lalu jalankan Perbarui REKAP BA.'],
      ['REKAP BA (di Gudang BMI) menghitung ribuan rumus terhadap seluruh BA TRANSAKSI; di atas batas pantau (perkiraan) Sheets bisa melambat. Bila BERAT, minta admin meringankan.']
    ]).setFontColor('#777777').setHorizontalAlignment('left').setFontWeight('normal');
    rapikanLabelPengaturan_(sh);
    // peringatan di subjudul (idempotent)
    var f3 = sh.getRange('A3').getFormula();
    if (f3.indexOf('REKAP BA hampir') < 0) {
      var sfx = '&IF(OR($D$' + r2 + '<>"aman";$D$' + r3 + '<>"aman");"   |   PERHATIAN: "&IF($D$' + r2 + '<>"aman";"REKAP BA "&$B$' + r2 + '&" dari "&$C$' + r2 + '&" baris (REKAP BA hampir penuh). ";"")&IF($D$' + r3 + '<>"aman";"BA TRANSAKSI "&$B$' + r3 + '&" baris ("&$D$' + r3 + '&")";"");"")';
      if (f3.charAt(0) !== '=') throw new Error('Subjudul DASHBOARD (A3) bukan rumus; peringatan tidak dipasang.');
      regUndo_(undo, 'subjudul', function () { sh.getRange('A3').setFormula(a3f); });
      sh.getRange('A3').setFormula(f3 + sfx);
    }
    SpreadsheetApp.flush();
    var probs = [];
    var st = String(sh.getRange(r1, 2).getDisplayValue());
    if (st !== 'OK') probs.push('status judul kolom = "' + st.slice(0, 80) + '" (harus OK)');
    var bav = ss.getSheetByName(BA_SHEET_NAME), bl = bav.getLastRow(), expBa = 0, pairs = {};
    if (bl > 1) bav.getRange(2, 1, bl - 1, BA_COL.SOW).getValues().forEach(function (x) { if (typeof x[0] === 'string' && x[0].length > 0) { expBa++; pairs[x[0].toLowerCase() + '|' + String(x[1]).toLowerCase()] = 1; } });
    var expRekap = Object.keys(pairs).length;
    if (Number(sh.getRange(r2, 2).getValue()) !== expRekap) probs.push('Site+SOW punya BA ' + sh.getRange(r2, 2).getValue() + ' vs hitungan ' + expRekap);
    if (Number(sh.getRange(r3, 2).getValue()) !== expBa) probs.push('BA TRANSAKSI ' + sh.getRange(r3, 2).getValue() + ' vs hitungan ' + expBa);
    if (/^#/.test(String(sh.getRange('A3').getDisplayValue()))) probs.push('subjudul galat: ' + sh.getRange('A3').getDisplayValue());
    if (gate) {
      var newLast = sh.getLastRow(), dv1 = sh.getRange(1, 1, newLast, nc).getDisplayValues();
      for (var i = 0; i < oldLast; i++) for (var j = 0; j < nc; j++) {
        var a = dv0[i][j]; if (a === '') continue;
        var rr = (!built && i + 1 >= top + 5) ? i + 1 + 3 : i + 1, b = rr <= newLast ? dv1[rr - 1][j] : '#none';
        if (j === 4 && rr >= r1 && rr <= r3) continue;      // teks keterangan pantauan boleh berubah
        if (a === b) continue;
        if (i === 2 && j === 0 && a.split('Update terakhir')[0] === String(b).split('Update terakhir')[0]) continue;
        probs.push('DASHBOARD!' + dokLetter_(j + 1) + (i + 1) + '->' + rr + ' [' + String(a).slice(0, 30) + '] -> [' + String(b).slice(0, 30) + ']');
      }
    }
    if (probs.length) throw new Error('GERBANG GAGAL (' + probs.length + '): ' + probs.slice(0, 6).join(' || '));
    return { top: top, rows: [r1, r2, r3], inserted: !built, status: st, rekap: expRekap, ba: expBa };
  } catch (e) {
    var errs = [];
    undo.slice().reverse().forEach(function (u) { try { u.fn(); } catch (e2) { errs.push(u.label + ': ' + String(e2).slice(0, 100)); } });
    SpreadsheetApp.flush();
    if (errs.length) e.message += ' || GAGAL MENGEMBALIKAN: ' + errs.join(' ; ');
    throw e;
  }
}
function setupMonitor() { ownerOnly_(); return setupMonitor_(null, null, true); }

// ----- Fungsi publik untuk halaman portal -----
function checkAccess(code) {
  var u = userByCode_(code);
  if (!u) failAccess_();
  return { role: u.role, name: u.nama, area: u.area };
}
function loginUser(username, password) {
  var code = makeCode_(String(username || '').trim(), String(password || ''));
  var u = userByCode_(code);
  if (!u) failAccess_();
  logHistory_('Portal', u.nama || u.username, u.role, 'Login Portal FTTH', u.username);
  return { code: code, role: u.role, name: u.nama, area: u.area };
}
// Masuk lewat Gateway FTTH Project Control Portal (login sekali): halaman membawa tiket sekali pakai (?sso=...) dari Gateway.
// Tiket dicek ke Gateway (bukan ke browser), lalu sesi dibuat sama seperti loginUser.
var GATEWAY_URL_ = 'https://script.google.com/macros/s/AKfycby4nXXb8JKdAJodp6MdrNfdmNODiCdWr4ouZPKOP6w4wz1tDZLCSqe11eeU9oHYgmVxeQ/exec';
function ssoLogin(ticket) {
  var t = String(ticket || '');
  if (!/^[A-Za-z0-9]{32,80}$/.test(t)) throw new Error('Tiket Gateway tidak valid. Silakan login lagi.');
  var res = UrlFetchApp.fetch(GATEWAY_URL_ + '?sso_verify=' + t, { muteHttpExceptions: true });
  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) { /* bukan JSON: dianggap gagal */ }
  var uname = data && data.ok ? String(data.username || '').trim().toLowerCase() : '';
  var users = uname ? usersAll_() : [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.username.toLowerCase() === uname && u.status !== 'nonaktif') {
      logHistory_('Portal', u.nama || u.username, u.role, 'Buka Portal FTTH', u.username);
      return { code: makeCode_(u.username, u.password), role: u.role, name: u.nama, area: u.area };
    }
  }
  throw new Error('Sesi Gateway sudah habis. Silakan login lagi.');
}
function adminListUsers(code) {
  requireAdmin_(code);
  return usersAll_().map(function (u) { return { username: u.username, nama: u.nama, role: u.role, area: u.area, status: u.status }; });
}
function adminAddUser(code, data) {
  requireAdmin_(code);
  data = data || {};
  var username = String(data.username || '').trim();
  if (!username) throw new Error('Username wajib diisi.');
  if (!/^[A-Za-z0-9_.]{3,30}$/.test(username)) throw new Error('Username hanya boleh huruf, angka, titik, underscore (3-30 karakter).');
  var password = String(data.password || '');
  if (password.length < 4) throw new Error('Password minimal 4 karakter.');
    var role = (data.role === 'rpm') ? 'rpm' : (data.role === 'waspang' ? 'waspang' : 'admin');
  var nama = String(data.nama || '').trim() || username;
  var area = String(data.area || '').trim();
  usersReset_();
  var sh = ensureUsersSheet_();
  var existing = usersAll_();
  if (existing.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) throw new Error('Username sudah dipakai.');
  sh.appendRow([username, password, nama, role, area, 'aktif']);
  usersReset_();
  logHistory_('Portal', logUser_(code), logRole_(code), 'Tambah User', username + ' (role: ' + role + ')');
  return { ok: true };
}
function adminUpdateUser(code, username, data) {
  requireAdmin_(code);
  data = data || {};
  usersReset_();
  var sh = ensureUsersSheet_();
  var users = usersAll_();
  var target = users.filter(function (u) { return u.username.toLowerCase() === String(username || '').trim().toLowerCase(); })[0];
  if (!target) throw new Error('User tidak ditemukan.');
  var nama = data.nama != null ? String(data.nama).trim() : target.nama;
    var role = data.role === 'rpm' ? 'rpm' : (data.role === 'admin' ? 'admin' : (data.role === 'waspang' ? 'waspang' : target.role));
  var area = data.area != null ? String(data.area).trim() : target.area;
  var status = data.status === 'nonaktif' ? 'nonaktif' : (data.status === 'aktif' ? 'aktif' : target.status);
  sh.getRange(target.row, 3, 1, 4).setValues([[nama, role, area, status]]);
  usersReset_();
  logHistory_('Portal', logUser_(code), logRole_(code), 'Edit User', target.username + ' (role: ' + role + ', status: ' + status + ')');
  return { ok: true };
}
function adminResetPassword(code, username, newPassword) {
  requireAdmin_(code);
  var password = String(newPassword || '');
  if (password.length < 4) throw new Error('Password minimal 4 karakter.');
  usersReset_();
  var sh = ensureUsersSheet_();
  var users = usersAll_();
  var target = users.filter(function (u) { return u.username.toLowerCase() === String(username || '').trim().toLowerCase(); })[0];
  if (!target) throw new Error('User tidak ditemukan.');
  sh.getRange(target.row, 2, 1, 1).setValue(password);
  usersReset_();
  logHistory_('Portal', logUser_(code), logRole_(code), 'Reset Password', target.username);
  return { ok: true };
}
function adminDeleteUser(code, username) {
  requireAdmin_(code);
  var caller = userByCode_(code);
  if (caller && caller.username.toLowerCase() === String(username || '').trim().toLowerCase()) throw new Error('Tidak bisa menghapus akun sendiri yang sedang login.');
  usersReset_();
  var sh = ensureUsersSheet_();
  var users = usersAll_();
  var target = users.filter(function (u) { return u.username.toLowerCase() === String(username || '').trim().toLowerCase(); })[0];
  if (!target) throw new Error('User tidak ditemukan.');
  sh.deleteRow(target.row);
  usersReset_();
  logHistory_('Portal', logUser_(code), logRole_(code), 'Hapus User', target.username);
  return { ok: true };
}
// Ubah password sendiri (self-service): semua role boleh, wajib tahu password lama. Beda dari adminResetPassword
// (khusus RPM, tanpa perlu tahu password lama) yang dipakai RPM untuk mengatur ulang password user lain.
function changeMyPassword(code, oldPassword, newPassword) {
  requireAccess_(code);
  var u = userByCode_(code);
  if (String(oldPassword || '') !== u.password) { Utilities.sleep(1000); throw new Error('Password lama salah.'); }
  var newPass = String(newPassword || '');
  if (newPass.length < 4) throw new Error('Password baru minimal 4 karakter.');
  usersReset_();
  var sh = ensureUsersSheet_();
  sh.getRange(u.row, 2, 1, 1).setValue(newPass);
  usersReset_();
  logHistory_('Portal', logUser_(code), logRole_(code), 'Ubah Password Sendiri', u.username);
  return { ok: true };
}

function getLogoDataUri() { return getLogoDataUri_(); }   // hanya logo, tidak sensitif (tampil di layar masuk)
function getBoqPicOptions(code) { requireAccess_(code); return getBoqPicOptions_(); }
function checkBoqRow(code, target, siteName, keterangan) { requireAccess_(code); regionCheckSite_(scopeOf_(code), siteName); return checkBoqRow_(target, siteName, keterangan); }
// ----- Opname PDF (tujuan OPNAME): form "MyRepublic Project Opname Submission Form" dibaca lalu dikembalikan sebagai baris untuk diperiksa -----
// PDF ini hasil scan/foto (mis. via CamScanner): OCR Google Docs membaca isi tabel sebagai teks biasa per baris, BUKAN sebagai elemen
// Table, dan urutannya TIDAK selalu rapi per baris tabel - baris yang sel deskripsinya turun 2 baris (teks panjang) membuat Detail/
// Supplier/Qty baris itu "telat" muncul, nyelip di antara baris berikutnya (terbukti dari PDF asli: qty baris ke-7 baru muncul setelah
// baris ke-8 mulai). Jadi dibaca sebagai ALIRAN TOKEN (bukan baris-per-baris berurutan): tiap kali ketemu "Material"/"Service" (kolom
// Detail) atau "internal"/"buana_menara_indonesia_" (kolom Supplier) atau angka Qty, token itu dipasangkan ke baris TERTUA yang masih
// menunggu bagian itu (FIFO) - bukan ke baris yang baru saja dibuka. Qty di form aslinya ditulis tangan, jadi OCR bisa salah baca angka
// atau deskripsi bisa sedikit tercampur kalau urutannya sangat kacau - selalu periksa ulang hasilnya di pratinjau sebelum kirim.
var OPNAME_INFO_KEYS = ['cluster name', 'area', 'hp rfs', 'pr number', 'po number', 'drm date', 'rfs declare date'];
var OPNAME_INFO_LABELS = ['cluster name', 'drm net type', 'vendor', 'area', 'hp po', 'hp rfs', 'drm date', 'pr number', 'rfs declare date', 'po number'];
var OPNAME_DETAIL_RE = /^(material|service)$/i;
var OPNAME_SUPPLIER_RE = /^(internal|buana[\s_]*menara[\s_]*indonesia[\s_]*)$/i;

function opnameInfoFromTables_(tables) {
  var info = {};
  tables.forEach(function (rows) {
    rows.forEach(function (cells) {
      for (var c = 0; c < cells.length - 1; c++) {
        var k = String(cells[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (OPNAME_INFO_KEYS.indexOf(k) > -1 && !info[k] && cells[c + 1]) info[k] = cells[c + 1];
      }
    });
  });
  return info;
}

// Baris yang bukan nilai field manapun (judul kolom tabel material, atau label field lain): batas supaya nilai tidak "bocor" dari field kosong.
function opnameIsStopLine_(k) {
  return OPNAME_INFO_LABELS.indexOf(opnameInfoLabel_(k)) > -1 || /^(no\.?|material\s*description|detail|supplier|remarks)$/.test(k) || /^qty/.test(k) ||
    /^(i+\.?\s*)?(detail material|cluster information)/.test(k);
}
// Label info cluster dikenali walau spasinya hilang/bertambah di hasil OCR ("HPRFS", "PR  Number"); kembali ke nama baku labelnya.
function opnameInfoLabel_(k) {
  var c = String(k || '').replace(/[^a-z0-9]/g, '');
  for (var i = 0; i < OPNAME_INFO_LABELS.length; i++) { if (OPNAME_INFO_LABELS[i].replace(/\s+/g, '') === c) return OPNAME_INFO_LABELS[i]; }
  return k;
}

// Dua pola: "Label: nilai" satu baris (PDF digital), atau label lalu nilainya di baris berikutnya (hasil OCR scan/foto; sel kosong
// langsung lompat ke label berikutnya atau ke judul tabel material, tanpa baris kosong).
function opnameInfoFromLines_(lines) {
  var info = {};
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    var m = raw.match(/^(.*?)\s*[:;]\s*(.+)$/);
    if (m) {
      var k1 = opnameInfoLabel_(m[1].toLowerCase().replace(/\s+/g, ' ').trim());
      if (OPNAME_INFO_KEYS.indexOf(k1) > -1 && !info[k1]) info[k1] = baClean_(m[2]);
      continue;
    }
    var k = opnameInfoLabel_(raw.toLowerCase().replace(/\s+/g, ' ').trim());
    if (OPNAME_INFO_LABELS.indexOf(k) === -1) continue;
    var nxt = (i + 1 < lines.length) ? lines[i + 1] : '';
    var nxtKey = nxt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (nxt && !opnameIsStopLine_(nxtKey) && OPNAME_INFO_KEYS.indexOf(k) > -1 && !info[k]) info[k] = baClean_(nxt);
  }
  return info;
}

// Dicoba dulu untuk jaga-jaga bila OCR membentuk elemen Table asli (jarang untuk PDF hasil scan/foto).
function opnameItemsFromTables_(tables) {
  for (var t = 0; t < tables.length; t++) {
    var rows = tables[t];
    var h = -1;
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].some(function (c) { return /description/i.test(c); })) { h = r; break; }
    }
    if (h === -1) continue;
    var hdr = rows[h];
    var noCol = -1, descCol = -1, detCol = -1, qtyCol = -1;
    hdr.forEach(function (c, i) {
      if (noCol === -1 && /^no\.?$/i.test(String(c).trim())) noCol = i;
      else if (descCol === -1 && /description/i.test(c)) descCol = i;
      else if (detCol === -1 && /detail/i.test(c)) detCol = i;
      else if (qtyCol === -1 && /qty/i.test(c)) qtyCol = i;
    });
    if (descCol === -1 || qtyCol === -1) continue;
    var items = [];
    for (var k = h + 1; k < rows.length; k++) {
      var row = rows[k];
      var desc = baClean_(row[descCol]);
      if (!desc) continue;
      var noTxt = noCol > -1 ? baClean_(row[noCol]) : String(items.length + 1);
      items.push({ no: parseInt(noTxt, 10) || (items.length + 1), desc: desc, detail: detCol > -1 ? baClean_(row[detCol]) : '', qtyText: baClean_(row[qtyCol]) });
    }
    if (items.length) return items;
  }
  return [];
}

// Pecah tiap baris jadi token: NO (angka diikuti teks = nomor baris), TEXT (bagian deskripsi), DETAIL (Material/Service),
// SUPPLIER (internal/buana_menara_indonesia_), QTY (angka/desimal/tanda "-" berdiri sendiri). Satu baris bisa memuat beberapa
// token sekaligus (mis. "7 Label FAT (include QR Code) Material buana_menara_indonesia_").
function opnameTokenize_(lines) {
  var toks = [];
  for (var i = 0; i < lines.length; i++) {
    var l = baClean_(lines[i]);
    if (!l) continue;
    if (/^note\s*:?$/i.test(l)) { toks.push({ t: 'END' }); break; }
    if (/^(no\.?|detail|supplier|remarks)$/i.test(l) || /^qty/i.test(l) || /^material\s*description$/i.test(l)) continue;
    var parts = l.split(/(material|service|internal|buana[\s_]*menara[\s_]*indonesia[\s_]*)/i);
    for (var p = 0; p < parts.length; p++) {
      var seg = baClean_(parts[p]);
      if (!seg) continue;
      if (OPNAME_DETAIL_RE.test(seg)) { toks.push({ t: 'DETAIL', v: seg }); continue; }
      if (OPNAME_SUPPLIER_RE.test(seg)) { toks.push({ t: 'SUPPLIER', v: seg }); continue; }
      if (/^\d{1,3}$/.test(seg)) { toks.push({ t: 'NUM', v: parseInt(seg, 10) }); continue; }
      if (/^[\d.,\-\u2013\u2014]+$/.test(seg) && seg.length <= 8) { toks.push({ t: 'QTY', v: seg }); continue; }
      var m = seg.match(/^(\d{1,3})[.)]?\s+(.+)$/);
      if (m && !/^cores?\b/i.test(m[2])) { toks.push({ t: 'NO', v: parseInt(m[1], 10) }); toks.push({ t: 'TEXT', v: m[2] }); continue; }
      toks.push({ t: 'TEXT', v: seg });
    }
  }
  return toks;
}

// Katalog nama material yang mungkin muncul di PDF Opname (dikumpulkan dari beberapa PDF asli): dipakai untuk mengenali kapan
// deskripsi sebuah baris masih terpotong (sambungannya nyelip di baris lain) supaya tidak keliru dianggap baris baru - itulah
// yang sebelumnya membuat baris-baris sesudahnya ikut kacau berantai. Daftar ini tidak perlu lengkap 100%; kalau ada nama
// material yang sering terpotong dan belum ada di sini, tambahkan saja (besar/kecil huruf dan tanda baca tidak berpengaruh).
var OPNAME_CATALOG_RAW_ = [
  'FO core type SM G.652.D-ADSS 24 cores', 'FO core type SM G.652.D-ADSS 36 cores', 'FO core type SM G.652.D-ADSS 48 cores',
  'FO core type SM G.652.D-ADSS 96 cores', 'FO core type SM G.652.D-ADSS 144 cores',
  '48 cores capacity pole mounted FDT', '72 cores capacity pole mounted FDT',
  'Pole mounted outdoor type (16 ports type)', 'Splicing',
  'Label Cable (on pole, in Handhole)', 'Label FDT', 'Label FAT (include QR Code)', 'Label Pole',
  'Pengadaan Tiang 7 meter 3 inch', 'Pengadaan Tiang 7 meter 4 STEL L-003 1996', 'Pengadaan Tiang Tunggal 9 meter 4 STEL L-003 1996',
  'Pole / Tiang Udara 7 Meter 2.5', 'Cable loop holder/plat strip/Cable hanger', 'Instalasi strand wire/sling messenger 6 mm',
  '1. Plate belt 20mm', '2. Suspension clamp', '4. Buldog grip', '9. Steel clamp', '10. Pole clamp single',
  '12.Clamps Dead end Fittings/clamp buaya', '12. Bahan Pondasi tiang', 'Testcomm OTDR & OPM FDT - FAT',
  'Fiber Optic Joint Closure Type In-line 48 Core', 'Fiber Optic Joint Closure Type In-line 144 Core',
  'Instal Sub Duct / HDPE 40/34 warna Ungu, 3 Strip Putih', '72 cores capacity ground mounted FDT'
];
function opnameNorm_(s) {
  return String(s || '').replace(/^\s*\d{1,3}[.)]?\s*/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
var OPNAME_CATALOG_ = OPNAME_CATALOG_RAW_.map(opnameNorm_);
function opnameCatalogExact_(desc) { return OPNAME_CATALOG_.indexOf(opnameNorm_(desc)) > -1; }
function opnameCatalogPrefix_(desc) {
  var n = opnameNorm_(desc);
  if (n.length < 4) return false;
  for (var i = 0; i < OPNAME_CATALOG_.length; i++) { if (OPNAME_CATALOG_[i].indexOf(n) === 0) return true; }
  return false;
}

// Baris yang desc-nya diawali salah satu frasa katalog (boleh ada tambahan teks di belakang, mis. catatan yang ikut
// terbaca) dianggap "bersih"/bisa dipercaya untuk otomatis dipetakan ke kolom Designator. Dipakai sebagai gerbang
// kepercayaan di opnameMapRows_: potongan baris yang nyasar (ekor baris lain + awal baris ini tergabung jadi satu baris
// OCR, lihat opnameItemsFromLines_) kadang kebetulan masih mengandung salah satu kata kunci DESIGNATOR_MAP di tengah
// teksnya - tanpa gerbang ini baris semacam itu bisa salah otomatis masuk ke kolom yang sebenarnya tidak sesuai.
function opnameCatalogStartsWith_(desc) {
  var n = opnameNorm_(desc);
  for (var i = 0; i < OPNAME_CATALOG_.length; i++) {
    var c = OPNAME_CATALOG_[i];
    if (c.length >= 4 && n.indexOf(c) === 0) return true;
  }
  return false;
}

// Cadangan utama (PDF hasil scan/foto): dibaca sebagai aliran token (lihat opnameTokenize_). Detail/Supplier/Qty dipasangkan ke
// baris TERTUA yang masih membutuhkannya (FIFO). Teks yang nyasar setelah sebuah baris baru selesai (deskripsinya kelihatan masih
// terpotong, dicek lewat OPNAME_CATALOG_) disambung ke baris itu, BUKAN dianggap awal baris baru - mencegah baris nyasar "mencuri"
// slot Qty baris-baris sesudahnya (penyebab utama hasil sebelumnya berantakan berantai).
function opnameItemsFromLines_(lines) {
  var start = -1;
  for (var i = 0; i < lines.length; i++) { if (/^material\s*description$/i.test(baClean_(lines[i]))) { start = i; break; } }
  if (start === -1) { for (var j = 0; j < lines.length; j++) { if (/description/i.test(lines[j])) { start = j; break; } } }
  if (start === -1) return [];
  var toks = opnameTokenize_(lines.slice(start + 1));
  var pending = [];
  var lastRow = null;
  var descBuf = [];
  var curNo = null;
  var nextNo = 1;

  function startNewFromBuf() {
    var text = descBuf.join(' ').replace(/\s+/g, ' ').trim();
    descBuf = [];
    if (text) {
      pending.push({ no: curNo, desc: text, detail: undefined, supplier: undefined, qtyText: undefined });
      lastRow = pending[pending.length - 1];
    }
    curNo = null;
  }

  // Bila baris yang menerima angka Qty ini sudah menunggu lama (banyak baris lain sudah dibuat sesudahnya), tandai
  // qtySuspect: urutan baca OCR untuk kolom Qty tulisan tangan kadang tidak sama dengan urutan baris sebenarnya, jadi
  // angka ini mungkin sebenarnya milik baris lain yang lebih baru. Lihat opnameMapRows_ untuk peringatannya di layar.
  function assignQty_(qtyText) {
    for (var p3 = 0; p3 < pending.length; p3++) {
      if (pending[p3].supplier !== undefined && pending[p3].qtyText === undefined) {
        pending[p3].qtyText = qtyText;
        pending[p3].qtySuspect = (pending.length - 1 - p3) >= 2;
        lastRow = pending[p3];
        return;
      }
    }
  }

  for (var k = 0; k < toks.length; k++) {
    var tk = toks[k];
    if (tk.t === 'END') break;
    if (tk.t === 'TEXT') {
      if (lastRow && !descBuf.length && curNo === null && !opnameCatalogExact_(lastRow.desc)) {
        var glue = /[-\/]$/.test(lastRow.desc) ? '' : ' ';
        var merged = lastRow.desc + glue + tk.v;
        if (opnameCatalogPrefix_(merged)) { lastRow.desc = merged; continue; }
      }
      descBuf.push(tk.v);
      continue;
    }
    if (tk.t === 'NUM') {
      // Nomor baris yang terbaca berdiri sendiri (nyelip di tengah deskripsi yang terpotong jadi 2 baris) bentuknya
      // sama persis dengan angka Qty - hanya dipercaya sebagai nomor baris bila memang melanjutkan urutan sebelumnya
      // (1,2,3,...) DAN baris yang sedang dibangun belum punya nomor; selain itu diperlakukan sebagai Qty seperti biasa.
      if (tk.v === nextNo && curNo === null) { curNo = tk.v; nextNo = tk.v + 1; continue; }
      assignQty_(String(tk.v));
      continue;
    }
    if (tk.t === 'NO') { startNewFromBuf(); curNo = tk.v; nextNo = tk.v + 1; continue; }
    if (tk.t === 'DETAIL') {
      startNewFromBuf();
      for (var p1 = 0; p1 < pending.length; p1++) { if (pending[p1].detail === undefined) { pending[p1].detail = tk.v; break; } }
      continue;
    }
    if (tk.t === 'SUPPLIER') {
      for (var p2 = 0; p2 < pending.length; p2++) { if (pending[p2].detail !== undefined && pending[p2].supplier === undefined) { pending[p2].supplier = tk.v; break; } }
      continue;
    }
    if (tk.t === 'QTY') { assignQty_(tk.v); continue; }
  }
  startNewFromBuf();

  var items = [];
  var incomplete = [];
  pending.forEach(function (r) {
    if (r.detail !== undefined && r.supplier !== undefined && r.qtyText !== undefined) {
      items.push({ no: r.no, desc: r.desc, detail: r.detail, qtyText: r.qtyText, qtySuspect: !!r.qtySuspect });
    } else if (r.desc && r.desc.length > 4 && !/bahan pondasi/i.test(r.desc)) {
      incomplete.push((r.no ? (r.no + '. ') : '') + r.desc);
    }
  });
  items.sort(function (a, b) { return (a.no || 999) - (b.no || 999); });
  items.forEach(function (it, idx) { if (!it.no) it.no = idx + 1; });
  return { items: items, incomplete: incomplete };
}

// === OCR.space (gratis, tanpa billing) - lihat panduan setup dari Claude untuk OCRSPACE_API_KEY ===
// Kunci gratis OCR.space hanya menerima file sampai 1 MB, sedangkan PDF opname hasil scan HP biasanya 1-27 MB. Karena itu halaman
// PDF dirender dulu jadi gambar JPG kecil di browser (Form.html, pdf.js) dan dikirim per halaman (pageImages = daftar base64 JPG).
// PDF utuh hanya dikirim bila gambar halaman tidak ada (browser gagal merender) dan ukurannya masih di bawah 1 MB.
var OCRSPACE_MAX_BYTES_ = 1024 * 1024;
function ocrSpaceAnnotatePdf_(base64Pdf, pageImages) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OCRSPACE_API_KEY');
  if (!apiKey) return null;
  var base = { apikey: apiKey, OCREngine: '2', isOverlayRequired: 'true', isTable: 'true', scale: 'true' };
  var reqs = [];
  var imgs = (pageImages || []).filter(function (b) { return b && typeof b === 'string'; }).slice(0, 3);
  if (imgs.length) {
    imgs.forEach(function (b64) {
      var pl = { base64Image: 'data:image/jpeg;base64,' + b64, filetype: 'JPG' };
      Object.keys(base).forEach(function (k) { pl[k] = base[k]; });
      reqs.push({ url: 'https://api.ocr.space/parse/image', method: 'post', payload: pl, muteHttpExceptions: true });
    });
  } else {
    if (Math.floor(String(base64Pdf || '').length * 3 / 4) > OCRSPACE_MAX_BYTES_) {
      return { error: 'PDF lebih dari 1 MB dan gambar halamannya tidak terkirim dari browser (batas OCR.space gratis 1 MB per file)' };
    }
    var plp = { base64Image: 'data:application/pdf;base64,' + base64Pdf, filetype: 'PDF' };
    Object.keys(base).forEach(function (k) { plp[k] = base[k]; });
    reqs.push({ url: 'https://api.ocr.space/parse/image', method: 'post', payload: plp, muteHttpExceptions: true });
  }
  var resps;
  try {
    resps = UrlFetchApp.fetchAll(reqs);
  } catch (e) {
    return { error: 'Gagal memanggil OCR.space: ' + e };
  }
  var merged = { ParsedResults: [] };
  for (var i = 0; i < resps.length; i++) {
    var json;
    try { json = JSON.parse(resps[i].getContentText()); } catch (e2) { return { error: 'Respons OCR.space tidak bisa dibaca: ' + resps[i].getContentText().slice(0, 300) }; }
    if (json.IsErroredOnProcessing) return { error: 'OCR.space error' + (imgs.length ? ' (halaman ' + (i + 1) + ')' : '') + ': ' + (json.ErrorMessage || json.ErrorDetails || JSON.stringify(json).slice(0, 300)) };
    (json.ParsedResults || []).forEach(function (r) { merged.ParsedResults.push(r); });
  }
  return { json: merged };
}

function ocrSpaceWords_(json) {
  var words = [];
  var results = (json && json.ParsedResults) || [];
  results.forEach(function (r) {
    var lines = r.TextOverlay && r.TextOverlay.Lines;
    if (!lines) return;
    lines.forEach(function (ln) {
      (ln.Words || []).forEach(function (w) {
        words.push({ text: w.WordText, x0: Math.round(w.Left), y0: Math.round(w.Top), x1: Math.round(w.Left + w.Width), y1: Math.round(w.Top + w.Height) });
      });
    });
  });
  return words;
}

// Tabel material dibaca dari posisi kata OCR.space. Dicek dengan 12 PDF opname asli (folder uploads/opname-examples di project
// files Claude): semua memakai form yang sama, tabel bisa berlanjut ke halaman 2 (judul kolom diulang di sana, tapi posisinya
// bergeser karena tiap halaman difoto/di-scan terpisah), dan halaman terakhir berisi QR + catatan (bukan tabel). Karena itu:
//  - kolom dihitung PER HALAMAN dari judul kolom halaman itu sendiri;
//  - baris ditentukan dari nomor di kolom No dan kata Material/Service di kolom Detail (keduanya tercetak, lebih stabil daripada
//    qty tulisan tangan); teks deskripsi dan qty masuk ke baris yang posisinya paling dekat;
//  - semua jarak diukur relatif terhadap tinggi huruf dan jarak antar baris (resolusi foto berbeda-beda, 1470-3125 px lebar).
function opnameKey_(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function opnameLev_(a, b) {
  if (a === b) return 0;
  var m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  var prev = [];
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) {
    var cur = [i];
    for (var k = 1; k <= n; k++) cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Kata OCR dianggap sama dengan kata target bila beda hurufnya sedikit (mis. "Supplicr", "Rernarks", "Arca").
function opnameLike_(word, target) {
  var k = opnameKey_(word);
  if (!k) return false;
  var tol = target.length <= 3 ? 0 : (target.length <= 8 ? 1 : 2);
  return opnameLev_(k, target) <= tol;
}

function opnameMedian_(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function (a, b) { return a - b; });
  return s[Math.floor(s.length / 2)];
}

function opnameOcrWords_(json) {
  var words = [];
  ((json && json.ParsedResults) || []).forEach(function (pg, pi) {
    ((pg.TextOverlay && pg.TextOverlay.Lines) || []).forEach(function (ln) {
      var prev = null;
      (ln.Words || []).forEach(function (w) {
        var t = baClean_(w.WordText);
        if (!t) return;
        var x0 = Number(w.Left), y0 = Number(w.Top), x1 = x0 + Number(w.Width), y1 = y0 + Number(w.Height);
        // OCR.space memecah satu kata menjadi beberapa token dengan kotak yang persis sama ("2026" "-" "02" "-" "13",
        // "G" "." "652" "." "D" "-"): digabung lagi tanpa spasi supaya tanggal/angka tetap utuh.
        if (prev && prev.x0 === x0 && prev.x1 === x1 && prev.y0 === y0 && prev.y1 === y1) { prev.t += t; return; }
        prev = { p: pi, t: t, x0: x0, x1: x1, y0: y0, y1: y1, xc: (x0 + x1) / 2, yc: (y0 + y1) / 2, h: Math.max(1, y1 - y0) };
        words.push(prev);
      });
    });
  });
  return words;
}

// Judul kolom tabel material di satu halaman: "Material Description" + minimal Detail atau Supplier di baris yang sama.
function opnameFindHeader_(pw) {
  var sorted = pw.slice().sort(function (a, b) { return a.yc - b.yc; });
  for (var i = 0; i < sorted.length; i++) {
    var m = sorted[i];
    var mk = opnameKey_(m.t);
    var glued = mk.indexOf('material') === 0 && mk.indexOf('descr') > 0;   // "MaterialDescription" terbaca jadi satu kata
    if (!glued && !opnameLike_(m.t, 'material')) continue;
    var u = m.h;
    var same = function (w) { return Math.abs(w.yc - m.yc) < 2.2 * u; };
    var right = pw.filter(function (w) { return w !== m && same(w) && w.x0 > m.x0; });
    var desc = glued ? m : right.filter(function (w) { return opnameLike_(w.t, 'description'); })[0];
    if (!desc) continue;
    var pick = function (t) { return right.filter(function (w) { return w.x0 > desc.x1 - u && opnameLike_(w.t, t); })[0] || null; };
    var detail = pick('detail'), supplier = pick('supplier'), remarks = pick('remarks');
    if (!detail && !supplier) continue;
    var qty = right.filter(function (w) { return w.x0 > desc.x1 && /^(qty|oty|qly|gty|qt|aty)$/.test(opnameKey_(w.t)); })[0] || null;
    var no = pw.filter(function (w) { return same(w) && w.x1 <= m.x0 && /^n[o0]\.?$/i.test(w.t); }).sort(function (a, b) { return b.x1 - a.x1; })[0] || null;
    var hw = [m, desc, detail, supplier, remarks, no].filter(Boolean);
    var qtyHw = qty ? [qty] : [];
    // Judul Qty dua baris ("Qty Project" / "Opname"): hanya untuk batas kanan kolom Qty. Batas bawah judul diambil dari judul
    // satu baris saja, karena "Opname" turun hampir sejajar dengan baris pertama teks material di kolom sebelah.
    pw.forEach(function (w) {
      if (same(w) && w.x0 > (supplier || detail || desc).x1 && /^(project|opname)$/.test(opnameKey_(w.t))) qtyHw.push(w);
    });
    return {
      material: m, desc: desc, detail: detail, supplier: supplier, remarks: remarks, qty: qty, no: no, qtyHw: qtyHw,
      u: opnameMedian_(hw.map(function (w) { return w.h; })) || u,
      top: Math.min.apply(null, hw.concat(qtyHw).map(function (w) { return w.y0; })),
      bottom: Math.max.apply(null, hw.map(function (w) { return w.y1; }))
    };
  }
  return null;
}

var OPNAME_QTY_CHARS_RE_ = /^[0-9OoDQIl|!iJjZzSs$GbT?B&gqA.,\-\u2013\u2014\u4e00_~]+$/;
// Angka Qty tulisan tangan: huruf yang sering tertukar OCR diubah ke angka (g/q->9, O/D->0, l/I->1, S->5, Z->2, B->8, T->7, G/b->6),
// spasi dibuang ("2. 438" -> "2.438"). bad=true bila masih ada karakter selain angka/titik/koma (tetap ditampilkan untuk dicek).
function opnameQtyFix_(raw) {
  var s = String(raw || '').replace(/\s+/g, '');
  if (!s) return { text: '', fixed: false, bad: false };
  if (/^[-\u2013\u2014\u4e00_~]+$/.test(s)) return { text: '-', fixed: false, bad: false };
  var t = s.replace(/[OoDQ]/g, '0').replace(/[Il|!iJj]/g, '1').replace(/[Zz]/g, '2').replace(/[Ss$]/g, '5').replace(/[Gb]/g, '6')
    .replace(/[T?]/g, '7').replace(/[B&]/g, '8').replace(/[gq]/g, '9').replace(/A/g, '4').replace(/^[.,]+|[.,]+$/g, '');
  return { text: t, fixed: t !== s, bad: !/^\d[\d.,]*$/.test(t) };
}

function opnameItemsFromOcrJson_(json) {
  var all = opnameOcrWords_(json);
  var none = function (why) { return { items: [], incomplete: [], missingNos: [], why: why, dbg: '' }; };
  if (!all.length) return none('OCR.space tidak mengembalikan posisi kata');
  var pages = {};
  all.forEach(function (w) { (pages[w.p] = pages[w.p] || []).push(w); });
  var items = [], orphans = [], dbg = [], pagesNoHeader = [], headerSeen = false;
  Object.keys(pages).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) {
    var pw = pages[p];
    var H = opnameFindHeader_(pw);
    if (!H) {
      // Halaman tanpa judul kolom: halaman QR/catatan (wajar), atau tabel yang tidak terbaca (diberi tahu bila ada kata Material/Service)
      if (headerSeen && pw.filter(function (w) { return /^(material|service)$/i.test(w.t); }).length >= 3) pagesNoHeader.push(p + 1);
      return;
    }
    headerSeen = true;
    var u = H.u;
    var below = pw.filter(function (w) { return w.yc > H.bottom && H.qtyHw.indexOf(w) < 0; });
    // Batas kanan kolom No
    var noRight = H.no ? H.no.x1 + 0.3 * u : H.material.x0 - 2.5 * u;
    // Batas kiri kolom Detail: kata Material/Service di kolom itu rata kiri, jadi x0-nya hampir sama di semua baris
    var isDet = function (w) { var k = opnameKey_(w.t); return opnameLev_(k.slice(0, 8), 'material') <= 2 || opnameLev_(k.slice(0, 7), 'service') <= 1; };
    var detTok = below.filter(function (w) { return w.x0 > H.desc.x0 && isDet(w); });
    var detailLeft = detTok.length >= 2 ? opnameMedian_(detTok.map(function (w) { return w.x0; })) - 0.5 * u
      : (H.detail ? (H.desc.x1 + H.detail.x0) / 2 : H.desc.x1 + 2 * u);
    detTok = detTok.filter(function (w) { return w.x0 >= detailLeft - u; });
    // Batas kiri kolom Qty: sesudah teks supplier (internal / buana_menara_indonesia_)
    var supTok = below.filter(function (w) { return w.x0 > detailLeft && /buana|menara|indones|internal|interna/.test(opnameKey_(w.t)); });
    var longSup = supTok.filter(function (w) { return /indones/.test(opnameKey_(w.t)); });
    var supRight = longSup.length >= 2 ? opnameMedian_(longSup.map(function (w) { return w.x1; })) : (supTok.length ? Math.max.apply(null, supTok.map(function (w) { return w.x1; })) : 0);
    var qtyLeft = Math.max(supRight ? supRight + 0.3 * u : 0, (H.supplier && H.qty) ? (H.supplier.x1 + H.qty.x0) / 2 : 0);
    if (!qtyLeft) qtyLeft = H.qty ? H.qty.x0 - 1.5 * u : (H.supplier ? H.supplier.x1 + 3 * u : 0);
    if (!qtyLeft) { dbg.push('hal ' + (p + 1) + ': kolom Qty tidak ketemu'); return; }
    var qtyHeadRight = H.qtyHw.length ? Math.max.apply(null, H.qtyHw.map(function (w) { return w.x1; })) : qtyLeft + 6 * u;
    var qtyRight = H.remarks ? (qtyHeadRight + H.remarks.x0) / 2 : qtyHeadRight + 3 * u;
    // Batas bawah tabel: tulisan "Note :" di bawah baris terakhir
    var noteW = below.filter(function (w) { return (/^note/.test(opnameKey_(w.t)) && w.x0 < detailLeft) || /^(form)?approval$/.test(opnameKey_(w.t)); })
      .sort(function (a, b) { return a.y0 - b.y0; })[0];
    var bottom = noteW ? noteW.y0 : Infinity;
    var inTable = function (w) { return w.yc > H.bottom && w.yc < bottom; };

    // Titik baris: nomor di kolom No + kata Material/Service di kolom Detail, digabung bila tingginya sama
    var marks = [];
    below.forEach(function (w) {
      // harus mulai di dalam kolom No: "12." di awal teks "12.Clamps Dead end" bukan nomor baris
      if (!inTable(w) || w.x1 > noRight + 0.2 * u || (H.no && w.x0 > H.no.x1)) return;
      var f = opnameQtyFix_(w.t.replace(/\.$/, ''));
      if (!f.bad && /^\d{1,2}$/.test(f.text)) marks.push({ y: w.yc, no: parseInt(f.text, 10), w: w });
    });
    detTok.forEach(function (w) { if (inTable(w)) marks.push({ y: w.yc, det: /^s/.test(opnameKey_(w.t)) ? 'Service' : 'Material' }); });
    marks.sort(function (a, b) { return a.y - b.y; });
    // Toleransi "sejajar" dari jarak antar kata Detail (satu per baris), bukan dari tinggi huruf: foto yang sedikit miring membuat
    // nomor di kiri dan kata Detail di tengah tidak persis setinggi
    var detY = marks.filter(function (mk) { return mk.det; }).map(function (mk) { return mk.y; });
    var dGaps = [];
    for (var g = 1; g < detY.length; g++) dGaps.push(detY[g] - detY[g - 1]);
    var mergeTol = dGaps.length >= 2 ? Math.max(0.6 * u, 0.4 * opnameMedian_(dGaps)) : 0.6 * u;
    var anchors = [];
    marks.forEach(function (mk) {
      var last = anchors[anchors.length - 1];
      if (last && Math.abs(mk.y - last.y) < mergeTol && !(mk.det && last.det) && !(mk.no !== undefined && last.no !== undefined)) {
        if (mk.no !== undefined && last.no === undefined) last.no = mk.no;
        if (mk.det && !last.det) last.det = mk.det;
        if (mk.no === undefined) last.y = (last.y + mk.y) / 2;
      } else {
        anchors.push({ y: mk.y, no: mk.no, det: mk.det, desc: [], qty: [] });
      }
    });
    // Nomor yang berdiri sendiri tanpa kata Detail sejajar dan jauh dari baris lain = kemungkinan bukan nomor baris (coretan dsb.)
    if (!anchors.length) { dbg.push('hal ' + (p + 1) + ': tidak ada baris'); return; }
    var gaps = [];
    for (var a = 1; a < anchors.length; a++) gaps.push(anchors[a].y - anchors[a - 1].y);
    var P = gaps.length ? opnameMedian_(gaps) : 2.5 * u;
    var nearest = function (y, maxD) {
      var best = null, bd = Infinity;
      anchors.forEach(function (an) { var d = Math.abs(an.y - y); if (d < bd) { bd = d; best = an; } });
      return bd <= maxD ? best : null;
    };
    var noWords = marks.filter(function (mk) { return mk.w; }).map(function (mk) { return mk.w; });
    below.forEach(function (w) {
      if (!inTable(w) || noWords.indexOf(w) > -1) return;
      if (w.xc > noRight - 0.3 * u && w.xc < detailLeft && w.x1 > noRight) {
        var an = nearest(w.yc, 0.8 * P);
        if (an) an.desc.push(w); else if (w.yc < anchors[anchors.length - 1].y + 1.5 * P) orphans.push(w.t);
      } else if (w.xc >= qtyLeft && w.xc < qtyRight) {
        // satuan meter yang kadang ikut ditulis di belakang angka kabel ("1.050M", "2.511 M") dibuang
        var qt = w.t.replace(/(\d)\s*(m|mtr|meter)\.?$/i, '$1');
        if (!OPNAME_QTY_CHARS_RE_.test(qt)) return;
        var aq = nearest(w.yc, 1.0 * P);
        if (aq) aq.qty.push({ t: qt, x0: w.x0, yc: w.yc });
      } else if (w.x0 > detailLeft && w.x0 < qtyLeft) {
        // angka yang menempel di ujung teks supplier ("buana_menara_indonesia_12")
        var tail = w.t.match(/indonesia_?([0-9][0-9.,]*)$/i);
        if (tail) { var at = nearest(w.yc, 1.0 * P); if (at) at.qty.push({ t: tail[1], x0: w.x1, yc: w.yc }); }
      }
    });
    anchors.forEach(function (an) {
      var lines = [];
      an.desc.sort(function (x, y) { return x.yc - y.yc; }).forEach(function (w) {
        var ln = lines[lines.length - 1];
        if (ln && Math.abs(ln.y - w.yc) < 0.5 * u) ln.ws.push(w); else lines.push({ y: w.yc, ws: [w] });
      });
      var desc = lines.map(function (ln) {
        return ln.ws.sort(function (x, y) { return x.x0 - y.x0; }).map(function (w) { return w.t; }).join(' ');
      }).join(' ').replace(/\s+/g, ' ').replace(/([-\/])\s+/g, '$1').trim();
      var qRaw = an.qty.sort(function (x, y) { return x.x0 - y.x0; }).map(function (w) { return w.t; }).join('');
      var q = opnameQtyFix_(qRaw);
      if (!desc && !q.text) return;
      items.push({ no: an.no, desc: desc, detail: an.det || '', supplier: '', qtyText: q.bad ? qRaw : q.text, qtyRaw: qRaw, qtySuspect: q.bad, qtyFixed: q.fixed, _p: p, _y: an.y });
    });
    dbg.push('hal ' + (p + 1) + ': ' + anchors.length + ' baris, jarak baris ' + Math.round(P) + ' px, kolom qty x ' + Math.round(qtyLeft) + '-' + Math.round(qtyRight));
  });
  if (!headerSeen) return none('judul kolom Material Description / Detail / Supplier tidak ditemukan');
  // Nomor baris yang tidak terbaca: diisi dari urutan (baris sebelumnya + 1)
  var seen = {}, prevNo = 0;
  items.forEach(function (it) {
    if (!it.no || it.no <= prevNo || seen[it.no]) it.no = prevNo + 1;
    seen[it.no] = true;
    prevNo = it.no;
  });
  var missingNos = [];
  for (var n = 1; n <= prevNo; n++) if (!seen[n]) missingNos.push(n);
  var incomplete = orphans.length ? ['teks di luar baris tabel: ' + orphans.join(' ')] : [];
  if (pagesNoHeader.length) incomplete.push('halaman ' + pagesNoHeader.join(', ') + ' berisi tabel tetapi judul kolomnya tidak terbaca');
  return { items: items, incomplete: incomplete, missingNos: missingNos, why: items.length ? '' : 'tidak ada baris dengan deskripsi', dbg: dbg.join(' | ') };
}

// Info cluster (tabel bagian I) dari posisi kata: label di kiri, nilai di sel sebelah kanannya. Nilai bisa beberapa baris
// (nama cluster panjang), jadi batas baris dihitung dari jarak antar label, bukan dari urutan teks.
var OPNAME_INFO_FIELDS_ = [
  ['cluster name', 'clustername', 0], ['vendor', 'vendor', 0], ['area', 'area', 0], ['drm date', 'drmdate', 0], ['rfs declare date', 'rfsdeclaredate', 0],
  ['drm net type', 'drmnettype', 1], ['hp po', 'hppo', 1], ['hp rfs', 'hprfs', 1], ['pr number', 'prnumber', 1], ['po number', 'ponumber', 1]
];
function opnameInfoFromOcrJson_(json) {
  var info = {};
  var pw = opnameOcrWords_(json).filter(function (w) { return w.p === 0; });
  if (!pw.length) return info;
  var H = opnameFindHeader_(pw);
  if (H) pw = pw.filter(function (w) { return w.y1 < H.top; });
  var u = opnameMedian_(pw.map(function (w) { return w.h; })) || 10;
  // Kata disusun per baris visual, lalu label dicari sebagai 1-4 kata berurutan yang (setelah spasi dibuang) mirip nama label.
  // Dicari per kata, bukan per potongan teks, karena nilai yang panjang ("Buana Menara Indonesia") bisa menempel ke label di
  // sel sebelahnya ("HP PO") tanpa jarak yang jelas.
  var lines = [];
  pw.slice().sort(function (a, b) { return a.yc - b.yc; }).forEach(function (w) {
    var ln = lines.filter(function (l) { return Math.abs(l.y - w.yc) < 0.5 * u; })[0];
    if (ln) ln.ws.push(w); else lines.push({ y: w.yc, ws: [w] });
  });
  var used = [];
  var labels = [[], []];
  // Semua calon label dikumpulkan dulu: kata yang sama bisa muncul di nilai (mis. cluster "OPEN AREA JL ..." mengandung "AREA").
  // Label yang calonnya hanya satu dipakai sebagai patokan posisi kolom label; bila calonnya lebih dari satu, dipilih yang
  // posisi kirinya paling dekat dengan label lain di kolom yang sama.
  var cands = OPNAME_INFO_FIELDS_.map(function (f) {
    var tol = f[1].length <= 8 ? 1 : 2;
    var list = [];
    lines.forEach(function (ln) {
      var ws = ln.ws.slice().sort(function (a, b) { return a.x0 - b.x0; });
      for (var i = 0; i < ws.length; i++) {
        var key = '';
        for (var n = 0; n < 4 && i + n < ws.length; n++) {
          key += opnameKey_(ws[i + n].t);
          var dk = opnameLev_(key, f[1]);
          if (dk <= tol && !OPNAME_INFO_FIELDS_.some(function (g) { return g !== f && opnameLev_(key, g[1]) < dk; })) { list.push(ws.slice(i, i + n + 1)); break; }
          if (key.length > f[1].length + tol) break;
        }
      }
    });
    return { f: f, list: list };
  });
  var colX = [[], []];
  cands.forEach(function (c) { if (c.list.length === 1) colX[c.f[2]].push(c.list[0][0].x0); });
  cands.forEach(function (c) {
    var list = c.list.filter(function (ws) { return !ws.some(function (w) { return used.indexOf(w) > -1; }); });
    if (!list.length) return;
    var ref = opnameMedian_(colX[c.f[2]]);
    var found = (list.length === 1 || !colX[c.f[2]].length) ? list[0]
      : list.slice().sort(function (a, b) { return Math.abs(a[0].x0 - ref) - Math.abs(b[0].x0 - ref); })[0];
    found.forEach(function (w) { used.push(w); });
    labels[c.f[2]].push({ key: c.f[0], x0: found[0].x0, x1: found[found.length - 1].x1, yc: found.reduce(function (s, w) { return s + w.yc; }, 0) / found.length });
  });
  if (!labels[0].length && !labels[1].length) return info;
  var right0 = labels[0].length ? Math.max.apply(null, labels[0].map(function (l) { return l.x1; })) : null;
  var left1 = labels[1].length ? Math.min.apply(null, labels[1].map(function (l) { return l.x0; })) : Infinity;
  var right1 = labels[1].length ? Math.max.apply(null, labels[1].map(function (l) { return l.x1; })) : null;
  [0, 1].forEach(function (c) {
    var L = labels[c].sort(function (a, b) { return a.yc - b.yc; });
    if (!L.length) return;
    var xLo = c === 0 ? right0 : right1, xHi = c === 0 ? left1 : Infinity;
    var gaps = [];
    for (var i = 1; i < L.length; i++) gaps.push(L[i].yc - L[i - 1].yc);
    var P = gaps.length ? Math.min.apply(null, gaps) : 2.5 * u;
    L.forEach(function (l, i) {
      var b = (i + 1 < L.length) ? L[i + 1].yc - P / 2 : l.yc + P / 2;
      var t = l.yc - (b - l.yc);
      var vw = pw.filter(function (w) { return used.indexOf(w) < 0 && w.xc > xLo && w.xc < xHi && w.yc > t && w.yc < b; });
      var vl = [];
      vw.sort(function (a, b2) { return a.yc - b2.yc; }).forEach(function (w) {
        var ln = vl[vl.length - 1];
        if (ln && Math.abs(ln.y - w.yc) < 0.5 * u) ln.ws.push(w); else vl.push({ y: w.yc, ws: [w] });
      });
      var val = baClean_(vl.map(function (ln) { return ln.ws.sort(function (a, b2) { return a.x0 - b2.x0; }).map(function (w) { return w.t; }).join(' '); }).join(' '));
      val = baClean_(val.replace(/\|/g, ' '));   // garis tepi sel yang ikut terbaca ("| 135")
      if (val) info[l.key] = val;
    });
  });
  return info;
}

// Tahap uji coba: panggil OCR.space dan tampilkan kata + posisinya (atau teks polos bila mode tabel tidak tersedia)
// di kotak "Teks hasil OCR PDF Opname" supaya bisa dibandingkan dengan OCR yang dipakai sekarang. Belum dipakai untuk
// menyusun baris - aman, tidak mengubah hasil yang ada.
function opnameOcrSpaceProbe_(v, coord) {
  if (!v) return '(OCR.space belum di-setup: Script Property OCRSPACE_API_KEY belum diisi.)';
  if (v.error) return '(OCR.space error: ' + v.error + ')';
  var words = ocrSpaceWords_(v.json);
  var lines = ['=== HASIL OCR.space (OCREngine 2, isTable) ==='];
  if (coord && coord.items.length) {
    lines.push('Tabel dari posisi kata (dipakai untuk isi tabel): ' + coord.items.length + ' baris');
    if (coord.dbg) lines.push('Nomor baris terbaca: ' + coord.dbg);
    coord.items.forEach(function (it) { lines.push(it.no + ' | ' + it.desc + ' | ' + it.detail + ' | qty: ' + it.qtyText); });
    (coord.incomplete || []).forEach(function (s) { lines.push('(tidak lengkap) ' + s); });
  } else {
    lines.push('(Tabel dari posisi kata tidak terbaca, memakai teks biasa' + (coord && coord.why ? ': ' + coord.why : '') + ')');
  }
  if (words.length) {
    lines.push(words.length + ' kata terdeteksi, contoh ' + Math.min(80, words.length) + ' kata pertama:');
    words.slice(0, 80).forEach(function (w) { lines.push(w.text + '  @(' + w.x0 + ',' + w.y0 + ')-(' + w.x1 + ',' + w.y1 + ')'); });
  } else {
    lines.push('(Tidak ada data posisi kata. Teks polos hasil OCR.space:)');
    (v.json.ParsedResults || []).forEach(function (r, i) {
      lines.push('--- Halaman ' + (i + 1) + ' ---');
      lines.push(String(r.ParsedText || '').slice(0, 1500));
    });
  }
  return lines.join('\n');
}

function opnameDocParse_(doc) {
  var struct = baDocToStruct_(doc);
  var info = opnameInfoFromTables_(struct.tables);
  var fromLines = opnameInfoFromLines_(struct.lines);
  Object.keys(fromLines).forEach(function (k) { if (!info[k]) info[k] = fromLines[k]; });
  var items = opnameItemsFromTables_(struct.tables);
  var incomplete = [];
  if (!items.length) {
    var res = opnameItemsFromLines_(struct.lines);
    items = res.items;
    incomplete = res.incomplete;
  }
  return { info: info, items: items, incomplete: incomplete, lines: struct.lines, raw: struct.lines.slice(0, 150).join('\n') };
}

// Qty di form memakai titik sebagai pemisah ribuan (4.074 = 4074). "-" atau kosong = 0.
function opnameQty_(t) {
  var s = String(t || '').trim();
  if (!s || /^[-\u2013\u2014]+$/.test(s)) return 0;
  var v = Number(s.replace(/\./g, '').replace(/,/g, '.'));
  return isNaN(v) ? 0 : v;
}

// Normalisasi teks untuk pencocokan: huruf kecil, spasi di sekitar titik, strip, garis miring dan kurung dibuang.
function opnameNormMatch_(s) {
  return String(s || '').toLowerCase().replace(/\s*([.\/(),\-])\s*/g, '$1').replace(/\s+/g, ' ').trim();
}
// Kata kunci tambahan untuk teks OCR yang kurang rapi (contoh: "G . 652 . D - 24 cores", "/ TIANG UDARA 7 2.5").
var OPNAME_EXTRA_TERMS_ = {
  'Cable 24C': ['g.652.d-24 cores'],
  'Cable 36C': ['g.652.d-36 cores'],
  'Cable 48C': ['g.652.d-48 cores'],
  'Cable 96C': ['g.652.d-96 cores'],
  'Cable 144C': ['g.652.d-144 cores'],
  'FDT 48': ['48 cores capacity', 'cores capacity pole mounted'],
  'FDT 72': ['72 cores capacity ground mounted', '72 cores capacity'],
  'FAT': ['outdoor type (16 type)', 'mounted outdoor type'],
  'Pole 7/2,5': ['tiang udara 7 2.5', 'udara 7 2.5'],
  'Pole 7/3': ['pengadaan tiang 7 meter 3', 'tiang 7 meter 3'],
  'Pole 9/4 or 9/5': ['tiang 9 meter 4', 'tiang 9 meter 5'],   // baris tambahan di Note: "21. Tiang 9 meter 4" Material Internal = 3"
  'Slack Hanger': ['loop holder'],
  'Plat Belt': ['belt 20mm'],
  'Stopping': ['belt 20mm'],
};

// Nama material di PDF selalu salah satu baris katalog di atas (form-nya sama untuk semua cluster), jadi teks OCR yang sedikit
// salah eja ("Platc bclt 20mm", "Suspcnsion clamp", awal kata terpotong) dicocokkan ke baris katalog terdekat lebih dulu,
// baru dicari kolom Designator-nya. Kemiripan dihitung dari pasangan huruf (Dice); harus jelas lebih mirip daripada baris
// katalog yang masuk ke kolom LAIN (mis. kabel 24 vs 36 cores), kalau ragu teks asli OCR yang dipakai.
function opnameFullNorm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function opnameBigrams_(s) {
  var g = {};
  for (var i = 0; i < s.length - 1; i++) { var k = s.substr(i, 2); g[k] = (g[k] || 0) + 1; }
  return { g: g, n: Math.max(0, s.length - 1) };
}
function opnameDice_(a, b) {
  if (!a.n || !b.n) return 0;
  var inter = 0;
  Object.keys(a.g).forEach(function (k) { if (b.g[k]) inter += Math.min(a.g[k], b.g[k]); });
  return 2 * inter / (a.n + b.n);
}
var OPNAME_CATALOG_BG_ = null;
function opnameCatalogBest_(desc) {
  var n = opnameFullNorm_(desc);
  if (n.length < 4) return null;
  if (!OPNAME_CATALOG_BG_) OPNAME_CATALOG_BG_ = OPNAME_CATALOG_RAW_.map(function (t) { return { text: t, bg: opnameBigrams_(opnameFullNorm_(t)), target: opnameTargetOf_(t) }; });
  var bg = opnameBigrams_(n);
  var scored = OPNAME_CATALOG_BG_.map(function (c) { return { text: c.text, target: c.target, score: opnameDice_(bg, c.bg) }; })
    .sort(function (a, b) { return b.score - a.score; });
  var best = scored[0];
  var rival = scored.filter(function (c) { return c.target !== best.target; })[0];
  if (best.score < 0.72) return null;
  if (rival && best.score - rival.score < 0.06) return null;
  return best;
}
// Ke mana sebuah baris katalog akan masuk (nama Designator, atau jenis baris yang dilewati) - dipakai untuk membedakan "rival".
function opnameTargetOf_(text) {
  var d = String(text).toLowerCase();
  if (/splicing|testcomm|otdr/.test(d)) return 'service';
  if (/^label\b/.test(d)) return 'label:' + d;
  if (/bahan pondasi/.test(d)) return 'pondasi';
  var dn = opnameNormMatch_(text), hit = '';
  DESIGNATOR_MAP.forEach(function (dm) {
    if (hit) return;
    var terms = dm.terms.concat(OPNAME_EXTRA_TERMS_[dm.name] || []);
    if (terms.some(function (t) { return dn.indexOf(opnameNormMatch_(t)) > -1; })) hit = dm.name;
  });
  return hit || ('lain:' + d);
}

// Cek silang antar baris (aturan form opname, terbukti di 12 PDF contoh): jumlah semua tiang = Label Pole = Bahan Pondasi tiang,
// jumlah FAT = Label FAT = Testcomm OTDR, jumlah FDT = Label FDT. Kalau tidak sama, kemungkinan ada angka tulisan tangan yang
// salah baca - diberi peringatan dengan angka-angkanya supaya pengunggah tahu baris mana yang harus dicocokkan dengan PDF.
// Tiang tambahan di Note ("Tiang 9 meter 4"") ikut dijumlah.
var OPNAME_CHECKS_ = [
  { name: 'jumlah tiang', parts: /^(pengadaantiang|poletiangudara|tiang\d)/, refs: /^(labelpole|12bahanpondasitiang|bahanpondasitiang)$/ },
  { name: 'jumlah FAT', parts: /^polemountedoutdoortype/, refs: /^(labelfatincludeqrcode|testcommotdr)/ },
  { name: 'jumlah FDT', parts: /corescapacity(pole|ground)mountedfdt$/, refs: /^labelfdt$/ }
];
function opnameCheckKey_(it) { return opnameFullNorm_(it.canon || it.desc); }
function opnameCheckVal_(it) { return (it.qtyText === '' || it.qtySuspect) ? null : opnameQty_(it.qtyText); }
// Anggota satu aturan cek silang (baris terakhir menang bila nama sama, seperti sebelumnya)
function opnameCheckMembers_(items, ck) {
  var last = {};
  items.forEach(function (it) { last[opnameCheckKey_(it)] = it; });
  var pick = function (re) { return Object.keys(last).filter(function (k) { return re.test(k); }).map(function (k) { return last[k]; }); };
  return { parts: pick(ck.parts), refs: pick(ck.refs) };
}
// true = cocok, false = tidak cocok, null = tidak bisa dicek (baris tidak ada / qty kosong)
function opnameCheckPass_(m, valOf) {
  if (!m.parts.length || !m.refs.length) return null;
  var all = m.parts.concat(m.refs);
  if (all.some(function (it) { return valOf(it) === null; })) return null;
  var sum = m.parts.reduce(function (s, it) { return s + valOf(it); }, 0);
  return m.refs.every(function (it) { return valOf(it) === sum; });
}
function opnameCrossCheck_(items) {
  var warns = [];
  OPNAME_CHECKS_.forEach(function (ck) {
    var m = opnameCheckMembers_(items, ck);
    if (opnameCheckPass_(m, opnameCheckVal_) !== false) return;
    var sum = m.parts.reduce(function (s, it) { return s + opnameCheckVal_(it); }, 0);
    warns.push('Cek silang ' + ck.name + ' tidak cocok: ' + m.parts.map(function (it) { return 'no ' + it.no + ' = ' + opnameCheckVal_(it); }).join(' + ') + ' = ' + sum +
      ', sedangkan ' + m.refs.map(function (it) { return (it.canon || it.desc) + ' (no ' + it.no + ') = ' + opnameCheckVal_(it); }).join(', ') +
      '. Biasanya angkanya sama. Cocokkan baris-baris ini dengan PDF asli: bisa karena tulisan tangan salah terbaca, bisa juga angkanya memang berbeda di PDF.');
  });
  return warns;
}

// Urutan qty dari teks OCR Google (Drive). Google membaca angka tulisan tangan lebih tepat daripada OCR.space, tetapi tanpa
// posisi: angka qty muncul sebagai baris sendiri, tercampur dengan nomor baris. Pembedanya: qty selalu datang SETELAH kata
// Material/Service baris itu (kolom Detail), nomor baris datang sebelumnya. Jadi setiap kata Material/Service menambah satu
// "qty yang ditunggu", dan baris yang isinya hanya angka dipakai sebagai qty bila ada yang ditunggu.
function opnameGoogleQtySeq_(lines) {
  var seq = [], pending = 0, inTable = false;
  (lines || []).forEach(function (raw) {
    var l = baClean_(raw);
    if (!l) return;
    if (/material\s*description/i.test(l)) { inTable = true; return; }   // judul tabel (juga di halaman 2)
    if (!inTable) return;
    if (/^note\b/i.test(l) || /^(form\s+)?approval\b/i.test(l)) { inTable = false; pending = 0; return; }
    if (/^(no\.?|detail|supplier|remarks|opname|qty.*)$/i.test(l)) return;
    var qm = l.match(/^([0-9][0-9.,]*|[-\u2013\u2014])\s*(m|mtr|meter)?\.?$/i);
    if (qm) {
      if (pending > 0) { seq.push(qm[1]); pending--; }
      return;
    }
    var ws = l.split(/\s+/);
    var lastTok = -1;
    ws.forEach(function (w, i) { if (/^(material|service)$/i.test(w)) { pending++; lastTok = i; } });
    // qty yang menempel di ujung baris Detail/Supplier ("Material internal 14")
    var tm = l.match(/\s([0-9][0-9.,]*)\s*(m|mtr|meter)?\.?$/i);
    if (lastTok > -1 && pending > 0 && tm && ws.length - lastTok >= 3) { seq.push(tm[1]); pending--; }
  });
  return seq;
}

// Baris tambahan yang ditulis di Note di bawah tabel, contoh: "21. Tiang 9 meter 4" Material Internal = 3".
function opnameNoteItems_(lines) {
  var out = [], inNote = false;
  (lines || []).forEach(function (raw) {
    var l = baClean_(raw);
    if (/^note\b/i.test(l)) { inNote = true; l = baClean_(l.replace(/^note\s*:?/i, '')); }
    if (!inNote || !l) return;
    if (/approval/i.test(l)) { inNote = false; return; }
    var m = l.match(/^(\d{1,3})\s*[.)]?\s+(.+?)\s*[=:]\s*([0-9][0-9.,]*)\s*(m|mtr|meter)?\.?$/i);
    if (!m) return;
    var desc = m[2], detail = '';
    var dm = desc.match(/^(.*?)\s+((material|service)\b.*)$/i);
    if (dm) { desc = dm[1]; detail = dm[2]; }
    out.push({ no: parseInt(m[1], 10), desc: baClean_(desc), detail: baClean_(detail), supplier: '', qtyText: m[3], fromNote: true });
  });
  return out;
}

// Qty hasil OCR.space (per baris, dari posisi kata) dicocokkan dengan urutan qty OCR Google: kedua urutan disejajarkan
// (seperti diff) supaya baris yang qty-nya kosong di salah satu sisi tidak menggeser baris lain. Qty kosong/tidak jelas di
// OCR.space diisi dari Google; bila keduanya beda, angka Google yang dipakai (lebih tepat di 12 contoh) dan angka OCR.space
// disimpan sebagai alternatif untuk cek silang.
function opnameAlignQty_(items, seq) {
  var n = items.length, m = seq.length;
  if (!n || !m) return 0;
  var blank = function (it) { return it.qtyText === '' || !!it.qtySuspect; };
  // Angka Google yang sama dengan nomor baris ini atau baris berikutnya bisa jadi nomor baris yang ikut terambil: tidak dipakai
  // untuk mengisi/mengganti qty (hanya dihitung sebagai cocok bila OCR.space membaca angka yang sama).
  var rowNoLike = function (it, g) { var v = opnameQty_(g); return it.no && (v === it.no || v === it.no + 1); };
  var same = function (it, g) { return !blank(it) && opnameQty_(it.qtyText) === opnameQty_(g); };
  var score = function (it, g) {
    if (same(it, g)) return 3;
    if (rowNoLike(it, g)) return -1;
    return blank(it) ? 1 : -1;
  };
  var gapItem = function (it) { return blank(it) ? -0.5 : -2; };
  var D = [], B = [];
  for (var i = 0; i <= n; i++) { D.push([]); B.push([]); for (var j = 0; j <= m; j++) { D[i].push(0); B[i].push(''); } }
  for (i = 1; i <= n; i++) { D[i][0] = D[i - 1][0] + gapItem(items[i - 1]); B[i][0] = 'i'; }
  for (j = 1; j <= m; j++) { D[0][j] = D[0][j - 1] - 2; B[0][j] = 'g'; }
  for (i = 1; i <= n; i++) {
    for (j = 1; j <= m; j++) {
      var a = D[i - 1][j - 1] + score(items[i - 1], seq[j - 1]), b = D[i - 1][j] + gapItem(items[i - 1]), c = D[i][j - 1] - 2;
      if (a >= b && a >= c) { D[i][j] = a; B[i][j] = 'm'; } else if (b >= c) { D[i][j] = b; B[i][j] = 'i'; } else { D[i][j] = c; B[i][j] = 'g'; }
    }
  }
  var pairs = [];
  i = n; j = m;
  while (i > 0 || j > 0) {
    var d = B[i][j];
    if (d === 'm') { pairs.push([i - 1, j - 1]); i--; j--; } else if (d === 'i') i--; else j--;
  }
  var changed = 0;
  pairs.forEach(function (pr) {
    var it = items[pr[0]], g = String(seq[pr[1]]);
    if (!same(it, g) && rowNoLike(it, g)) return;
    if (blank(it)) {
      it.qtyFrom = it.qtyText === '' ? 'kosong' : '"' + (it.qtyRaw || it.qtyText) + '"';
      it.qtyGg = g; it.qtyText = g; it.qtySuspect = false; it.qtyFixed = false; it.qtyGoogle = 'isi'; changed++;
    } else if (same(it, g)) {
      it.qtyFixed = false;   // huruf yang diartikan angka, dan Google membaca angka yang sama: sudah pasti
    } else {
      it.qtyOs = it.qtyText; it.qtyGg = g; it.qtyAlt = it.qtyText; it.qtyText = g; it.qtyFixed = false; it.qtyGoogle = 'beda'; changed++;
    }
  });
  return changed;
}

// Bila angka OCR.space dan Google berbeda, cek silang dipakai sebagai penentu: kombinasi yang membuat aturan cocok dipilih.
// Baris yang angkanya dikonfirmasi cek silang tidak perlu ditandai PERIKSA lagi.
function opnameResolveByCheck_(items) {
  OPNAME_CHECKS_.forEach(function (ck) {
    var mem = opnameCheckMembers_(items, ck);
    var all = mem.parts.concat(mem.refs);
    var alts = all.filter(function (it) { return it.qtyGoogle === 'beda'; });
    if (alts.length > 4) return;
    var good = [];
    for (var mask = 0; mask < (1 << alts.length); mask++) {
      var valOf = function (it) {
        var k = alts.indexOf(it);
        if (k > -1 && (mask >> k) & 1) return opnameQty_(it.qtyAlt);
        return opnameCheckVal_(it);
      };
      if (opnameCheckPass_(mem, valOf) === true) good.push(mask);
    }
    if (good.length !== 1) return;
    alts.forEach(function (it, k) {
      if ((good[0] >> k) & 1) { var t = it.qtyText; it.qtyText = it.qtyAlt; it.qtyAlt = t; }
    });
    all.forEach(function (it) { if (it.qtyGoogle) it.qtyChecked = true; });
  });
}

function opnameMapRows_(items) {
  var rows = [];
  var skipped = [];
  // Kabel/JC 144 core terisi = asesoris yang dipakai varian 144 (sama seperti BOQ Excel)
  var is144 = items.some(function (it) { return /144\s*cores?\b|in-line 144/i.test(it.canon || it.desc) && opnameQty_(it.qtyText) > 0; });
  // Keterangan singkat asal qty yang ditampilkan di bawah nama item (baris yang tidak ditandai Cek Qty)
  var qtyInfoOf = function (it) {
    var t = '';
    if (it.qtyChecked && it.qtyGoogle === 'isi') t = 'Qty dari OCR Google (OCR.space: ' + it.qtyFrom + '), cocok dengan cek silang.';
    else if (it.qtyChecked && it.qtyGoogle === 'beda') t = 'OCR Google membaca ' + it.qtyGg + ', OCR.space membaca ' + it.qtyOs + '; dipakai ' + it.qtyText + ' karena cocok dengan cek silang.';
    if (it.fromNote) t += (t ? ' ' : '') + 'Baris dari Note di bawah tabel PDF.';
    return t;
  };
  items.forEach(function (it) {
    var n0 = rows.length;
    mapOne(it);
    var info = qtyInfoOf(it);
    if (info) for (var k = n0; k < rows.length; k++) if (!rows[k].qtySuspect) rows[k].qtyInfo = info;
  });
  function mapOne(it) {
    var qty = opnameQty_(it.qtyText);
    // Nama baku dari katalog bila teks OCR-nya dikenali (lihat opnameCatalogBest_); teks asli OCR disebut di catatan bila berbeda
    if (it.canon === undefined) it.canon = (opnameCatalogBest_(it.desc) || {}).text || '';
    var desc = it.canon || it.desc;
    var ocrNote = (it.canon && opnameFullNorm_(it.canon) !== opnameFullNorm_(it.desc)) ? 'Teks OCR "' + it.desc + '" dikenali sebagai baris ini. ' : '';
    var d = desc.toLowerCase();
    var suspect = !!(it.qtySuspect || it.qtyFixed);
    var suspectNote = '';
    if (it.qtyRaw !== undefined) {
      if (it.qtySuspect) suspectNote = 'PERIKSA QTY INI: tulisan tangan terbaca "' + it.qtyRaw + '", angkanya tidak jelas - cocokkan dengan PDF asli. ';
      else if (it.qtyFixed) suspectNote = 'PERIKSA QTY INI: tulisan tangan terbaca "' + it.qtyRaw + '", diartikan ' + it.qtyText + ' - cocokkan dengan PDF asli. ';
    }
    if (it.qtyGoogle === 'isi') {
      if (it.qtyChecked) suspectNote += 'Qty diambil dari OCR Google (OCR.space: ' + it.qtyFrom + '), cocok dengan cek silang. ';
      else { suspect = true; suspectNote += 'PERIKSA QTY INI: qty diambil dari OCR Google karena OCR.space membaca ' + it.qtyFrom + ' - cocokkan dengan PDF asli. '; }
    } else if (it.qtyGoogle === 'beda') {
      var both = 'OCR Google membaca ' + it.qtyGg + ', OCR.space membaca ' + it.qtyOs + '; dipakai ' + it.qtyText;
      if (it.qtyChecked) suspectNote += 'Qty: ' + both + ' karena cocok dengan cek silang. ';
      else { suspect = true; suspectNote += 'PERIKSA QTY INI: ' + both + ' - cocokkan dengan PDF asli. '; }
    }
    if (it.fromNote) suspectNote += 'Baris ini dari Note di bawah tabel PDF. ';
    if (it.qtyRaw === undefined && !it.qtyGoogle && suspect) {
      suspectNote = 'PERIKSA QTY INI: angka ini kemungkinan tertukar dengan baris lain (urutan baca OCR untuk kolom Qty tulisan tangan tidak selalu sama dengan urutan barisnya) - cocokkan dengan PDF asli. ';
    }
    suspectNote = ocrNote + suspectNote;
    if (/splicing|testcomm|otdr/.test(d) || /service/i.test(it.detail)) {
      if (qty > 0) skipped.push(it.no + '. ' + desc + ' (service, tidak masuk kolom)');
      return;
    }
    if (/^label\b/.test(d)) {
      if (qty > 0) skipped.push(it.no + '. ' + desc + ' (label, tidak masuk kolom)');
      return;
    }
    if (/bahan pondasi/i.test(d)) {
      if (qty > 0) skipped.push(it.no + '. ' + desc + ' (tidak masuk kolom)');
      return;
    }
    var dn = opnameNormMatch_(desc);
    var hit = null;
    var keysMatched = [];
    DESIGNATOR_MAP.forEach(function (dm) {
      var terms = dm.terms.concat(OPNAME_EXTRA_TERMS_[dm.name] || []);
      var ok = terms.some(function (t) { return dn.indexOf(opnameNormMatch_(t)) > -1; });
      if (!ok) return;
      if (!hit) hit = dm.name;
      var key = dm.terms.map(opnameNormMatch_).join('|');
      if (keysMatched.indexOf(key) < 0) keysMatched.push(key);
    });
    if (keysMatched.length > 1) {
      if (!(qty > 0)) return;
      rows.push({ label: desc, desig: '', qty: qty, options: [], qtySuspect: suspect, note: suspectNote + 'Beberapa nama material tergabung dalam satu baris (OCR menggabungkan baris). Periksa PDF lalu pilih kolom atau tambah baris.' });
      return;
    }
    // Baris tambahan tulisan tangan (contoh asli: halaman 2 berisi "1 | Kabel 36 | internal | 2.511 M"): kata kabel/cable + jumlah core
    if (!hit && !keysMatched.length) {
      var core = desc.match(/(?:^|\D)(24|36|48|96|144)(?:\D|$)/);
      var isCable = desc.split(/\s+/).some(function (w) { var k = opnameKey_(w); return k.length >= 4 && (opnameLev_(k, 'kabel') <= 2 || opnameLev_(k, 'cable') <= 2); });
      if (core && isCable && boqDesigNames_().indexOf('Cable ' + core[1] + 'C') > -1) {
        hit = 'Cable ' + core[1] + 'C';
        suspect = true;
        suspectNote += 'Baris tulisan tangan "' + it.desc + '" dikenali sebagai kabel ' + core[1] + ' core - pastikan benar. ';
      }
    }
    if (!hit) {
      if (!(qty > 0)) return;
      if (/qr code|label/.test(dn) || dn.length < 8) return;
      rows.push({ label: desc, desig: '', qty: qty, options: [], qtySuspect: suspect, note: suspectNote + 'Tidak ada kolom Designator yang cocok. Pilih kolomnya atau hapus baris.' });
      return;
    }
    var noQty = it.qtyText === '' ? 'Qty tidak terbaca dari PDF, isi manual jika perlu. ' : '';
    var group = null;
    BOQ_CHOICES.forEach(function (g) { if (g.options.indexOf(hit) > -1) group = g; });
    if (group) {
      if (group.mode === 'split') {
        group.options.forEach(function (opt) {
          var ratio = group.ratios[opt] || 1;
          var part = Math.ceil(qty * ratio);
          if (part > 0) rows.push({ label: desc, desig: opt, qty: part, options: [], qtySuspect: suspect, note: suspectNote + noQty + (ratio === 1 ? 'Sama dengan volume Plate belt (aturan BA Transaksi).' : 'Setengah volume Plate belt, dibulatkan ke atas (aturan BA Transaksi).') });
        });
        return;
      }
      rows.push({ label: desc, desig: (is144 && group.bigger) ? group.bigger : group.options[0], qty: qty, options: group.options, qtySuspect: suspect, note: suspectNote + noQty + 'Pilih kolom sesuai ukuran kabel/material' });
    } else {
      rows.push({ label: desc, desig: hit, qty: qty, options: [], qtySuspect: suspect, note: suspectNote + noQty });
    }
  }
  return { rows: rows, skipped: skipped };
}

function extractOpnamePdf_(base64Data, fileName, scope, pageImages) {
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, MimeType.PDF, fileName || 'opname.pdf');
  var doc = Drive.Files.create({ name: 'TEMP_OPNAME_' + new Date().getTime(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'en' });
  var parsed;
  try {
    parsed = opnameDocParse_(DocumentApp.openById(doc.id));
  } finally {
    try { Drive.Files.remove(doc.id); } catch (e) { /* abaikan gagal hapus temp file */ }
  }
  var warnings = [];
  var ocr = ocrSpaceAnnotatePdf_(base64Data, pageImages);
  var coord = null;
  var coordErr = '';
  try {
    coord = (ocr && ocr.json) ? opnameItemsFromOcrJson_(ocr.json) : null;
  } catch (e) {
    coordErr = String(e);
    coord = null;
  }
  var coordUsed = !!(coord && coord.items.length);
  if (coordUsed) { parsed.items = coord.items; parsed.incomplete = coord.incomplete; }
  // Info cluster dari posisi kata lebih tepat (nama cluster yang panjangnya 2-3 baris tetap utuh); teks biasa jadi cadangan
  if (ocr && ocr.json) {
    try {
      var infoXY = opnameInfoFromOcrJson_(ocr.json);
      // Posisi kata sudah menemukan sebagian besar field: field yang kosong di sana memang kosong di PDF. Teks biasa tidak dipakai
      // untuk mengisinya, karena di teks biasa nilai field berikutnya bisa terbaca sebagai nilai field kosong ("PO Number: RFS Declare Date ...").
      if (Object.keys(infoXY).length >= 3) parsed.info = {};
      Object.keys(infoXY).forEach(function (k) { parsed.info[k] = infoXY[k]; });
    } catch (e) { /* tetap memakai info dari teks biasa */ }
  }
  Object.keys(parsed.info).forEach(function (k) { parsed.info[k] = baClean_(String(parsed.info[k]).replace(/\|/g, ' ')); });
  var googleSeq = [];
  if (coordUsed) {
    try {
      googleSeq = opnameGoogleQtySeq_(parsed.lines);
      opnameAlignQty_(parsed.items, googleSeq);
    } catch (e) { warnings.push('Mencocokkan qty dengan OCR Google gagal: ' + e); }
  }
  // Baris tambahan di Note bawah tabel (teks Google; cadangan teks OCR.space)
  var notes = opnameNoteItems_(parsed.lines);
  if (!notes.length && ocr && ocr.json) {
    var osLines = [];
    (ocr.json.ParsedResults || []).forEach(function (r) { osLines = osLines.concat(String(r.ParsedText || '').split(/\r?\n/)); });
    notes = opnameNoteItems_(osLines);
  }
  notes.forEach(function (nt) {
    if (!parsed.items.some(function (it) { return it.no === nt.no; })) parsed.items.push(nt);
  });
  parsed.items.forEach(function (it) { it.canon = (opnameCatalogBest_(it.desc) || {}).text || ''; });
  opnameResolveByCheck_(parsed.items);
  opnameCrossCheck_(parsed.items).forEach(function (w) { warnings.push(w); });
  if (coordErr) warnings.push('Membaca tabel dari posisi kata OCR.space gagal, memakai teks biasa: ' + coordErr);
  if (!coordUsed && !coordErr && parsed.items.length) {
    var why = !ocr ? 'OCR.space belum di-setup (Script Property OCRSPACE_API_KEY kosong)' : (ocr.error || (coord && coord.why) || 'tabel tidak terbaca');
    warnings.push('Tabel dibaca dari teks biasa (kurang akurat untuk qty tulisan tangan) karena ' + why + '. Cocokkan SETIAP baris dengan PDF asli sebelum kirim.');
  }
  if (coord && coord.missingNos.length) warnings.push('Nomor baris yang tidak terbaca di kolom No: ' + coord.missingNos.join(', ') + '. Periksa PDF aslinya.');
  if (!parsed.items.length) {
    warnings.push('Tidak ada baris material yang terbaca dari PDF. Periksa teks hasil OCR di bawah ("Teks hasil OCR PDF Opname"), lalu kirim ke admin untuk disesuaikan polanya.');
  }
  if (parsed.incomplete && parsed.incomplete.length) {
    warnings.push('Ada ' + parsed.incomplete.length + ' baris di PDF yang kelihatannya TIDAK LENGKAP terbaca dan TIDAK MASUK tabel di bawah: ' + parsed.incomplete.join('; ') + '. Periksa PDF aslinya, tambahkan baris itu secara manual lewat "+ Tambah baris" bila memang ada.');
  }
  var mapped = opnameMapRows_(parsed.items);
  var ocrSpaceProbe = opnameOcrSpaceProbe_(ocr, coord);
  // Nama cluster di PDF jarang persis sama dengan Name di DATA BASE (mis. tanpa "BANJARMASIN", atau ada tambahan RT): dicarikan
  // nama site yang paling mirip supaya isian Nama Site tidak membuat baris baru di sheet OPNAME karena beda ejaan.
  var cluster = parsed.info['cluster name'] || '';
  var siteMatch = '';
  if (cluster) {
    try {
      var sm = baMatchSite_(cluster, '', scope);
      if (sm && sm.score >= 0.5) siteMatch = sm.name;
    } catch (e) { /* DATA BASE tidak terbaca: pengunggah memilih manual */ }
    if (!siteMatch) warnings.push('Nama cluster di PDF ("' + cluster + '") tidak ditemukan di DATA BASE. Pilih Nama Site dari daftar supaya tidak membuat baris baru.');
  }
  return {
    clusterName: cluster,
    siteMatch: siteMatch,
    area: parsed.info['area'] || '',
    hpRfs: parsed.info['hp rfs'] || '',
    prNumber: parsed.info['pr number'] || '',
    poNumber: parsed.info['po number'] || '',
    drmDate: parsed.info['drm date'] || '',
    rfsDate: parsed.info['rfs declare date'] || '',
    designators: boqDesigNames_(),
    rows: mapped.rows,
    skipped: mapped.skipped,
    warnings: warnings,
    raw: ocrSpaceProbe + '\n\n' + (coordUsed ? '=== TEKS OCR GOOGLE (dipakai untuk mencocokkan qty: ' + googleSeq.length + ' angka qty: ' + googleSeq.join(', ') + ') ===' : '=== HASIL OCR LAMA (masih dipakai untuk mengisi tabel saat ini) ===') + '\n' + parsed.raw,
    jumlahBaris: parsed.items.length
  };
}
function extractOpnamePdf(code, base64Data, fileName, pageImages) { requireAccess_(code); return extractOpnamePdf_(base64Data, fileName, scopeOf_(code), pageImages); }

function extractBoq(code, base64Data, fileName) { requireAccess_(code); return extractBoq_(base64Data, fileName); }
function saveBoq(code, siteName, keterangan, target, pic, rows) {
  requireAccess_(code); regionCheckSite_(scopeOf_(code), siteName);
  var res = saveBoq_(siteName, keterangan, target, pic, rows);
  logHistory_('Portal', logUser_(code), logRole_(code), 'Submit BOQ', siteName + ' (' + keterangan + ') -> ' + target);
  return res;
}
function getBaSiteNames(code) { requireAccess_(code); return getBaSiteNames_(scopeOf_(code)); }
function extractBa(code, base64Data, fileName) { requireAccess_(code); return extractBa_(base64Data, fileName, scopeOf_(code)); }
function extractBaText(code, struct) { requireAccess_(code); return extractBaText_(struct, scopeOf_(code)); }
function saveBa(code, base64Data, fileName, data) {
  requireAccess_(code); regionCheckSite_(scopeOf_(code), data && data.name);
  var res = saveBa_(base64Data, fileName, data);
  if (res && res.ok) logHistory_('Portal', logUser_(code), logRole_(code), 'Submit BA Transaksi', (data && data.name || '') + ' - ' + (res.idBa || ''));
  return res;
}
function getBaHistory(code) { requireAccess_(code); return getBaHistory_(scopeOf_(code)); }
function downloadBaPdf(code, idBa) {
  requireAccess_(code);
  var res = downloadBaPdf_(idBa, scopeOf_(code));
  logHistory_('Portal', logUser_(code), logRole_(code), 'Unduh PDF BA Transaksi', String(idBa || ''));
  return res;
}

// ----- BA Masuk (Pembelian / Transfer): dicatat langsung di BA TRANSAKSI, tanpa PDF -----
var BA_JENIS_MASUK = ['Masuk - Pembelian', 'Masuk - Transfer'];

// Pastikan kolom Gudang Asal dan Asal / Supplier ada di header BA TRANSAKSI (ditambahkan di ujung kanan, data lama tidak bergeser).
function baEnsureMasukCols_(sh) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(baClean_);
  ['Gudang Asal', 'Asal / Supplier'].forEach(function (h) {
    if (head.indexOf(h) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
      head.push(h);
    }
  });
}

function saveMasuk_(data) {
  data = data || {};
  var jenis = baClean_(data.jenis);
  if (BA_JENIS_MASUK.indexOf(jenis) < 0) throw new Error('Pilih jenis: Masuk - Pembelian atau Masuk - Transfer.');
  var dm = String(data.tanggal || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) throw new Error('Tanggal belum diisi.');
  var gudang = baClean_(data.gudang);
  if (!gudang) throw new Error('Gudang tujuan belum diisi.');
  var gAsal = baClean_(data.gudangAsal);
  if (jenis === 'Masuk - Transfer') {
    if (!gAsal) throw new Error('Transfer wajib mengisi Gudang asal.');
    if (normalizeText_(gAsal) === normalizeText_(gudang)) throw new Error('Gudang asal dan tujuan tidak boleh sama.');
  }
  var desigNames = baDesigNames_();
  var items = (data.items || []).map(function (it) {
    var d = baClean_(it.desig);
    return { nama: baClean_(it.nama), qty: baQty_(it.qty), ket: baClean_(it.ket), desig: desigNames.indexOf(d) > -1 ? d : '' };
  }).filter(function (it) { return (it.nama || it.desig) && it.qty !== null && it.qty > 0; });
  if (!items.length) throw new Error('Minimal satu material dengan Qty lebih dari 0.');
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var tglSerial = (Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - Date.UTC(1899, 11, 30)) / 86400000;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getBaSheet_();
    baEnsureMasukCols_(sh);
    var C = baLayout_(sh);
    var cGA = C.headers.indexOf('Gudang Asal') + 1;
    var cAS = C.headers.indexOf('Asal / Supplier') + 1;
    var idBa = 'MSK-' + Utilities.formatDate(new Date(), tz, 'yyMMdd-HHmmss');
    if (sh.getLastRow() > 1) {
      var usedIds = sh.getRange(2, C.ID, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
      var baseId = idBa, seq = 1;
      while (usedIds.indexOf(idBa) > -1) { seq++; idBa = baseId + '-' + seq; }
    }
    var row = new Array(C.TOTAL);
    for (var c = 0; c < row.length; c++) row[c] = '';
    row[BA_COL.TGL - 1] = tglSerial;
    row[BA_COL.JAM - 1] = baClean_(data.jam);
    row[BA_COL.JENIS - 1] = jenis;
    row[BA_COL.MANDOR - 1] = baClean_(data.mandor);
    row[BA_COL.GUDANG - 1] = gudang;
    row[cGA - 1] = gAsal;
    row[cAS - 1] = baClean_(data.asal);
    var sums = {}, lain = [], kets = [];
    items.forEach(function (it) {
      if (it.desig) sums[it.desig] = (sums[it.desig] || 0) + it.qty;
      else lain.push(it.nama + ' x' + it.qty);
      if (it.ket) kets.push(it.nama + ': ' + it.ket);
    });
    C.desig.forEach(function (nm, k) {
      if (sums[nm] !== undefined) row[BA_COL.FIRSTDESIG - 1 + k] = sums[nm];
    });
    row[C.LAIN - 1] = lain.join('; ');
    row[C.KET - 1] = [baClean_(data.keterangan)].concat(kets).filter(function (x) { return x; }).join('; ');
    row[C.ID - 1] = idBa;
    row[C.SUBMIT - 1] = new Date();

    var startRow = Math.max(sh.getLastRow(), 1) + 1;
    if (startRow > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
    sh.getRange(startRow, 1, 1, C.TOTAL).setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true, idBa: idBa, jumlahItem: items.length };
  } finally {
    lock.releaseLock();
  }
}

function saveMasuk(code, data) {
  requireAccess_(code);
  var res = saveMasuk_(data);
  logHistory_('Portal', logUser_(code), logRole_(code), 'Simpan BA Masuk', (data && data.jenis || '') + ' ke ' + (data && data.gudang || '') + ' - ' + res.idBa);
  return res;
}
function getBaDesignators(code) { requireAccess_(code); return baDesigNames_(); }

// SALDO GUDANG: rumus dari sheet BA TRANSAKSI (bukan input manual). Jalankan ulang bila gudang atau Designator berubah.
function setupSaldoGudang() { ownerOnly_(); return setupSaldoGudang_(); }
// Nama gudang dikelompokkan per kunci tanpa awalan "Gudang " (Banjarmasin dan Gudang Banjarmasin = satu gudang).
function baGudangKey_(g) {
  return String(g || '').replace(/^\s*gudang\s+/i, '').replace(/\s+/g, ' ').trim();
}

function setupSaldoGudang_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(BA_SHEET_NAME);
  if (!src) throw new Error('Sheet BA TRANSAKSI belum ada.');
  baEnsureMasukCols_(src);
  var C = baLayout_(src);
  var cGA = C.headers.indexOf('Gudang Asal') + 1;
  var keys = {};
  var last = src.getLastRow();
  if (last > 1) {
    src.getRange(2, BA_COL.GUDANG, last - 1, 1).getValues().concat(src.getRange(2, cGA, last - 1, 1).getValues()).forEach(function (r) {
      var k = baGudangKey_(r[0]);
      if (k) keys[k] = true;
    });
  }
  var list = Object.keys(keys).sort();
  var sh = ss.getSheetByName('SALDO GUDANG') || ss.insertSheet('SALDO GUDANG');
  sh.clear();
  sh.getRange(1, 1).setValue('Saldo material per gudang  ~  dihitung dari BA TRANSAKSI, jangan diisi manual');
  sh.getRange(2, 1).setValue('Saldo = Masuk + Pengembalian - Ambil - Transfer keluar.  Masuk = Masuk - Pembelian / Transfer di gudang tujuan.  Transfer keluar = Masuk - Transfer di gudang asal.');
  var head = ['Gudang', 'Designator', 'Masuk', 'Pengembalian', 'Ambil', 'Transfer keluar', 'Saldo'];
  sh.getRange(3, 1, 1, head.length).setValues([head]);
  var q = "'" + BA_SHEET_NAME + "'!";
  var gR = q + '$' + baColLetter_(BA_COL.GUDANG) + ':$' + baColLetter_(BA_COL.GUDANG);
  var gaR = q + '$' + baColLetter_(cGA) + ':$' + baColLetter_(cGA);
  var jR = q + '$' + baColLetter_(BA_COL.JENIS) + ':$' + baColLetter_(BA_COL.JENIS);
  function total(vR, rng, k, jen) {
    var kk = k.replace(/"/g, '""');
    return 'SUMIFS(' + vR + ';' + rng + ';"Gudang ' + kk + '";' + jR + ';"' + jen + '")+SUMIFS(' + vR + ';' + rng + ';"' + kk + '";' + jR + ';"' + jen + '")';
  }
  var names = [], formulas = [];
  var r0 = 4;
  list.forEach(function (k) {
    C.desig.forEach(function (d, i) {
      var col = baColLetter_(BA_COL.FIRSTDESIG + i);
      var vR = q + '$' + col + ':$' + col;
      var r = r0 + names.length;
      names.push(['Gudang ' + k, d]);
      formulas.push([
        '=' + total(vR, gR, k, 'Masuk*'),
        '=' + total(vR, gR, k, 'Pengembalian'),
        '=' + total(vR, gR, k, 'Ambil'),
        '=' + total(vR, gaR, k, 'Masuk - Transfer'),
        '=C' + r + '+D' + r + '-E' + r + '-F' + r
      ]);
    });
  });
  if (names.length) {
    sh.getRange(r0, 1, names.length, 2).setValues(names);
    sh.getRange(r0, 3, names.length, 5).setFormulas(formulas);
  }
  sh.setFrozenRows(3);
  return { ok: true, gudang: list.length, baris: names.length };
}

// ----- Fungsi pemilik (menu "BA Transaksi" dan editor Apps Script) -----
function setupRekapBa() { ownerOnly_(); return setupRekapBaGudang_(); }      // REKAP BA kini di spreadsheet Gudang BMI
function setupPortalButton() { ownerOnly_(); return setupPortalButton_(); }
function setupRpm() { ownerOnly_(); return setupRpm_(); }
function setupKurvaS() { ownerOnly_(); return setupKurvaS_(); }
function setupDonasi() { ownerOnly_(); return setupDonasi_(); }
function setupDokumen() { ownerOnly_(); return setupDokumen_(); }
function setupTargetRfs() { ownerOnly_(); return setupTargetRfs_(); }
function setupKurvaFwa() { ownerOnly_(); return setupKurvaFwa_(); }
function ujiKurvaBfa() { ownerOnly_(); return testKurvaBfa_(); }        // uji di salinan DASHBOARD ("TMP KURVA"), DASHBOARD asli tidak disentuh
function hapusTmpKurva() { ownerOnly_(); return hapusTmpKurva_(); }
function garisForecastPutus() { ownerOnly_(); return kurvaDashForecast_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DASHBOARD')); }
// ---------------------------------------------------------------------
// PROTOTIPE (uji, spreadsheet sementara): REKAP BA di spreadsheet lain (mis. Gudang BMI), BA TRANSAKSI tetap di spreadsheet utama.
// Data BA ditarik dengan SATU IMPORTRANGE ke sheet 'DATA BA' (kolom A sampai Designator terakhir); REKAP BA menghitung dari sheet lokal itu.
//  1. rekapGudangUji: membuat spreadsheet sementara "TMP REKAP BA (uji)" berisi DATA BA + REKAP BA (spreadsheet utama tidak disentuh).
//  2. Buka spreadsheet sementara itu, klik sel A1 di DATA BA, pilih "Izinkan akses" (sekali saja).
//  3. rekapGudangBanding: membandingkan REKAP BA sementara dengan REKAP BA utama sel demi sel (hasil di Log eksekusi).
//  4. hapusRekapUji: memindahkan spreadsheet sementara ke Sampah.
// ---------------------------------------------------------------------
var RKG_DATA = 'DATA BA';
function rekapGudangUji() {
  ownerOnly_();
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('RKG_TMP_ID'), tmp = null, created = false;
  if (id) { try { tmp = SpreadsheetApp.openById(id); } catch (e) { tmp = null; } }
  if (!tmp) {
    tmp = SpreadsheetApp.create('TMP REKAP BA (uji) - boleh dihapus');
    created = true;
    props.setProperty('RKG_TMP_ID', tmp.getId());
    try { DriveApp.getFileById(tmp.getId()).moveTo(getBaFolder_()); } catch (e2) { /* biarkan di Drive Saya */ }
  }
  tmp.setSpreadsheetLocale('id_ID');
  try { tmp.setSpreadsheetTimeZone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()); } catch (e3) { /* biarkan */ }
  var main = SpreadsheetApp.getActiveSpreadsheet(), C = baLayout_(getBaSheet_());
  var lastL = baColLetter_(BA_COL.FIRSTDESIG - 1 + C.desig.length);
  var dt = tmp.getSheetByName(RKG_DATA) || tmp.insertSheet(RKG_DATA);
  dt.clear();
  var needCols = BA_COL.FIRSTDESIG - 1 + C.desig.length;                      // rumus REKAP merujuk kolom 'DATA BA' penuh, jadi kolomnya harus sudah ada sebelum rumus ditulis
  if (dt.getMaxColumns() < needCols) dt.insertColumnsAfter(dt.getMaxColumns(), needCols - dt.getMaxColumns());
  dt.getRange(1, 1).setFormula('=IMPORTRANGE("' + main.getId() + '";"\'' + BA_SHEET_NAME + '\'!A:' + lastL + '")');
  setupRekapBa_(tmp, RKG_DATA);
  var s1 = tmp.getSheetByName('Sheet1');
  if (s1 && tmp.getSheets().length > 2) tmp.deleteSheet(s1);
  SpreadsheetApp.flush();
  Logger.log('Spreadsheet uji ' + (created ? 'dibuat' : 'diperbarui') + ': ' + tmp.getUrl() + ' | rentang import A:' + lastL);
  return tmp.getUrl();
}

function rekapGudangBanding() {
  ownerOnly_();
  var id = PropertiesService.getScriptProperties().getProperty('RKG_TMP_ID');
  if (!id) throw new Error('Jalankan rekapGudangUji dulu.');
  var main = SpreadsheetApp.getActiveSpreadsheet(), src = main.getSheetByName(REKAP_SHEET_NAME);
  var tmp = SpreadsheetApp.openById(id).getSheetByName(REKAP_SHEET_NAME);
  var dt = SpreadsheetApp.openById(id).getSheetByName(RKG_DATA);
  Logger.log('DATA BA sementara: A1=' + String(dt.getRange(1, 1).getDisplayValue()).slice(0, 40) + ', baris terisi ' + dt.getLastRow() + ', kolom terisi ' + dt.getLastColumn());
  var nRows = REKAP_FIRST_ROW + REKAP_ROWS - 1, nCols = src.getLastColumn();
  var a = src.getRange(1, 1, nRows, nCols).getValues(), b = tmp.getRange(1, 1, nRows, nCols).getValues();
  var diff = 0, filled = 0, errs = 0, ex = [];
  for (var r = 0; r < nRows; r++) for (var c = 0; c < nCols; c++) {
    var x = a[r][c], y = b[r][c];
    if (x instanceof Date) x = x.getTime();
    if (y instanceof Date) y = y.getTime();
    if (x !== '') filled++;
    if (typeof y === 'string' && y.charAt(0) === '#') errs++;
    if (x !== y) { diff++; if (ex.length < 8) ex.push(src.getRange(r + 1, c + 1).getA1Notation() + ': utama=' + x + ' | uji=' + y); }
  }
  Logger.log('BANDING REKAP BA: ' + nRows + ' baris x ' + nCols + ' kolom, sel terisi di utama ' + filled + ', sel BEDA ' + diff + ', sel galat di uji ' + errs + (ex.length ? '. Contoh: ' + ex.join(' || ') : ''));
  return diff;
}

function hapusRekapUji() {
  ownerOnly_();
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('RKG_TMP_ID');
  if (!id) return 'tidak ada spreadsheet uji';
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* sudah hilang */ }
  props.deleteProperty('RKG_TMP_ID');
  Logger.log('Spreadsheet uji dipindahkan ke Sampah.');
  return 'dihapus';
}
// REKAP BA di spreadsheet Gudang BMI (BAG_SS_ID): sheet 'DATA BA' = satu IMPORTRANGE 'BA TRANSAKSI'!A:<Designator terakhir> dari spreadsheet utama,
// sheet 'REKAP BA' menghitung dari DATA BA. Aman diulang (mis. setelah menambah kolom Designator). Pertama kali: buka spreadsheet Gudang BMI,
// klik sel A1 di DATA BA lalu "Izinkan akses" (sekali saja). BA TRANSAKSI tetap di spreadsheet utama.
function setupRekapBaGudang_() {
  var g = bagSs_(), main = SpreadsheetApp.getActiveSpreadsheet(), C = baLayout_(getBaSheet_());
  var needCols = BA_COL.FIRSTDESIG - 1 + C.desig.length, lastL = baColLetter_(needCols);
  var dt = g.getSheetByName(RKG_DATA) || g.insertSheet(RKG_DATA);
  dt.clear();
  if (dt.getMaxColumns() < needCols) dt.insertColumnsAfter(dt.getMaxColumns(), needCols - dt.getMaxColumns());   // kolom harus ada sebelum rumus REKAP ditulis
  dt.getRange(1, 1).setFormula('=IMPORTRANGE("' + main.getId() + '";"\'' + BA_SHEET_NAME + '\'!A:' + lastL + '")');
  dt.setTabColor('#9E9E9E');
  setupRekapBa_(g, RKG_DATA);
  SpreadsheetApp.flush();
  Logger.log('REKAP BA di Gudang BMI diperbarui: ' + g.getUrl() + ' | rentang import A:' + lastL);
  return g.getUrl();
}
function setupRekapBaGudang() { ownerOnly_(); return setupRekapBaGudang_(); }

// Banding sel demi sel dua sheet REKAP BA: { diff, errs, filled, ex }
function rekapBandingSel_(src, tmp) {
  var nRows = REKAP_FIRST_ROW + REKAP_ROWS - 1, nCols = src.getLastColumn();
  var a = src.getRange(1, 1, nRows, nCols).getValues(), b = tmp.getRange(1, 1, nRows, nCols).getValues();
  var diff = 0, filled = 0, errs = 0, ex = [];
  for (var r = 0; r < nRows; r++) for (var c = 0; c < nCols; c++) {
    var x = a[r][c], y = b[r][c];
    if (x instanceof Date) x = x.getTime();
    if (y instanceof Date) y = y.getTime();
    if (x !== '') filled++;
    if (typeof y === 'string' && y.charAt(0) === '#') errs++;
    if (x !== y) { diff++; if (ex.length < 6) ex.push(src.getRange(r + 1, c + 1).getA1Notation() + ': utama=' + x + ' | gudang=' + y); }
  }
  return { diff: diff, errs: errs, filled: filled, ex: ex };
}

// Uji di salinan: menyalin DASHBOARD menjadi 'TMP MON', memasang pantauan baru (tanpa merujuk REKAP BA) di salinan itu dan menjalankan gerbang periksa.
function ujiMonitorRekap() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), old = ss.getSheetByName('TMP MON');
  if (old) ss.deleteSheet(old);
  var tmp = ss.getSheetByName('DASHBOARD').copyTo(ss).setName('TMP MON');
  var res = setupMonitor_(tmp, null, true), top = kurvaFindRow_(tmp, PRM_TITLE);
  var f = tmp.getRange(top + 6, 2).getFormula();
  Logger.log('UJI PANTAUAN: ' + JSON.stringify(res) + ' | rumus B: ' + f.slice(0, 120) + ' | memuat REKAP BA: ' + (f.indexOf(REKAP_SHEET_NAME) >= 0) + ' | nilai B/C/D: ' + tmp.getRange(top + 6, 2, 1, 3).getDisplayValues()[0].join(' / '));
  return res;
}
function hapusTmpMon() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), t = ss.getSheetByName('TMP MON');
  if (t) ss.deleteSheet(t);
  return { deleted: !!t };
}

// Langkah akhir pemindahan: memastikan REKAP BA di Gudang BMI sama persis dengan REKAP BA utama dan tidak ada rumus lain yang merujuk REKAP BA,
// lalu menghapus sheet REKAP BA dari spreadsheet utama dan memperbarui teks kotak Portal di DASHBOARD. Berhenti tanpa menghapus bila ada yang tidak cocok.
function pindahRekapBaSelesai() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), old = ss.getSheetByName(REKAP_SHEET_NAME);
  if (!old) return 'REKAP BA utama sudah tidak ada';
  var neu = bagSs_().getSheetByName(REKAP_SHEET_NAME);
  if (!neu) throw new Error('REKAP BA belum ada di Gudang BMI; jalankan setupRekapBaGudang dulu.');
  var refs = 0, key = "'" + REKAP_SHEET_NAME + "'!";
  ss.getSheets().forEach(function (sh) {
    if (sh.getName() === REKAP_SHEET_NAME) return;
    var lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (!lr || !lc) return;
    var fs = sh.getRange(1, 1, lr, lc).getFormulas();
    for (var r = 0; r < fs.length; r++) for (var c = 0; c < fs[r].length; c++) if (fs[r][c] && fs[r][c].indexOf(key) >= 0) refs++;
  });
  if (refs) throw new Error(refs + ' rumus di sheet lain masih merujuk REKAP BA; tidak dihapus.');
  var d = rekapBandingSel_(old, neu);
  if (d.diff || d.errs) throw new Error('REKAP BA Gudang berbeda (' + d.diff + ' sel beda, ' + d.errs + ' galat); tidak dihapus. ' + d.ex.join(' || '));
  ss.deleteSheet(old);
  var db = ss.getSheetByName('DASHBOARD'), fixed = 0;
  if (db) db.getRange(1, 5, 15, 1).getValues().forEach(function (row, i) {
    var v = String(row[0]);
    if (v.indexOf('rekapnya otomatis di REKAP BA') >= 0 && v.indexOf('Gudang BMI') < 0) { db.getRange(i + 1, 5).setValue(v.replace('rekapnya otomatis di REKAP BA', 'rekapnya otomatis di REKAP BA (spreadsheet Gudang BMI)')); fixed++; }
  });
  SpreadsheetApp.flush();
  Logger.log('REKAP BA utama dihapus; ' + d.filled + ' sel terisi cocok dengan Gudang BMI; teks kotak Portal diperbarui: ' + fixed);
  return 'selesai';
}

// ---------------------------------------------------------------------
// PANGKAS KAPASITAS DASHBOARD: DASHBOARD menyediakan jauh lebih banyak baris/kolom (getMaxRows/getMaxColumns) daripada yang
// terpakai (getLastRow/getLastColumn), sisa dari penyisipan/penghapusan blok lama. Sel kosong tambahan tetap dihitung dalam
// batas 10 juta sel Google Sheets, jadi memangkasnya meringankan spreadsheet tanpa mengubah tampilan. Fungsi ini HANYA
// menghapus baris/kolom yang benar-benar kosong (diperiksa isBlank() dulu; batal kalau ternyata tidak kosong atau ada
// rentang bernama yang menjeluk ke situ), dan menyisakan BUF_ROWS/BUF_COLS ekstra untuk pertumbuhan blok berikutnya.
// ujiPangkasDashboard membangun di salinan "TMP PANGKAS" dulu (DASHBOARD asli tidak disentuh); hapusTmpPangkas membersihkannya;
// pangkasDashboard menjalankan ke DASHBOARD asli setelah hasil uji diperiksa.
// ---------------------------------------------------------------------
var PANGKAS_BUF_ROWS = 40;
var PANGKAS_BUF_COLS = 10;

function pangkasDashboard_(sh) {
  var ss = sh.getParent();
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  var keepRows = lr + PANGKAS_BUF_ROWS, keepCols = lc + PANGKAS_BUF_COLS;
  var mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  var out = { before: mr + 'x' + mc, lastRowCol: lr + 'x' + lc, deletedRows: 0, deletedCols: 0 };
  // rentang bernama yang menjeluk ke sheet ini tidak boleh terpotong
  ss.getNamedRanges().forEach(function (nr) {
    var rg = nr.getRange();
    if (!rg || rg.getSheet().getSheetId() !== sh.getSheetId()) return;
    if (rg.getRow() + rg.getNumRows() - 1 > keepRows || rg.getColumn() + rg.getNumColumns() - 1 > keepCols) {
      throw new Error('Rentang bernama "' + nr.getName() + '" ada di luar batas aman (' + keepRows + 'x' + keepCols + '); tidak dipangkas.');
    }
  });
  if (mr > keepRows) {
    var nDel = mr - keepRows;
    if (!sh.getRange(keepRows + 1, 1, nDel, mc).isBlank()) throw new Error('Baris ' + (keepRows + 1) + '-' + mr + ' ternyata tidak kosong; tidak dipangkas.');
    sh.deleteRows(keepRows + 1, nDel);
    out.deletedRows = nDel;
  }
  if (mc > keepCols) {
    var nDelC = mc - keepCols;
    if (!sh.getRange(1, keepCols + 1, sh.getMaxRows(), nDelC).isBlank()) throw new Error('Kolom ' + (keepCols + 1) + '-' + mc + ' ternyata tidak kosong; tidak dipangkas.');
    sh.deleteColumns(keepCols + 1, nDelC);
    out.deletedCols = nDelC;
  }
  SpreadsheetApp.flush();
  out.after = sh.getMaxRows() + 'x' + sh.getMaxColumns();
  return out;
}

function ujiPangkasDashboard() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), old = ss.getSheetByName('TMP PANGKAS');
  if (old) ss.deleteSheet(old);
  var real = ss.getSheetByName('DASHBOARD');
  var chartsBefore = real.getCharts().length, cfBefore = real.getConditionalFormatRules().length;
  var tmp = real.copyTo(ss).setName('TMP PANGKAS');
  var res = pangkasDashboard_(tmp);
  res.chartsBefore = chartsBefore; res.chartsAfter = tmp.getCharts().length;
  res.cfBefore = cfBefore; res.cfAfter = tmp.getConditionalFormatRules().length;
  res.a1 = String(tmp.getRange('A1').getFormula() || tmp.getRange('A1').getDisplayValue()).slice(0, 60);
  res.a3 = String(tmp.getRange('A3').getDisplayValue()).slice(0, 80);
  Logger.log('UJI PANGKAS DASHBOARD: ' + JSON.stringify(res));
  return res;
}
function hapusTmpPangkas() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), t = ss.getSheetByName('TMP PANGKAS');
  if (t) ss.deleteSheet(t);
  return { deleted: !!t };
}
function pangkasDashboard() {
  ownerOnly_();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DASHBOARD');
  var chartsBefore = sh.getCharts().length;
  var res = pangkasDashboard_(sh);
  res.chartsBefore = chartsBefore; res.chartsAfter = sh.getCharts().length;
  if (res.chartsAfter !== res.chartsBefore) throw new Error('Jumlah grafik berubah (' + res.chartsBefore + ' -> ' + res.chartsAfter + '); periksa manual.');
  Logger.log('PANGKAS DASHBOARD selesai: ' + JSON.stringify(res));
  return res;
}
// Mengganti Kode Admin dan Kode RPM (kode region TIDAK diubah; tetap = nama region, keputusan pemilik). Kode baru diacak,
// dipastikan tidak sama dengan nama region manapun di DATA BASE, lalu disimpan sebagai hash di Script Properties.
// HANYA dijalankan sekali oleh pemilik; kode lama langsung berhenti berlaku begitu fungsi ini selesai.
function gantiKodeAksesUtama() {
  ownerOnly_();
  var CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // tanpa 0/O/1/I yang mirip
  function acak(n) { var s = ''; for (var i = 0; i < n; i++) s += CHARS.charAt(Math.floor(Math.random() * CHARS.length)); return s; }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), dbn = ss.getSheetByName('DATA BASE'), regs = {};
  dbn.getRange(5, 1, dbn.getLastRow() - 4, 1).getValues().forEach(function (x) { if (x[0]) regs[hashAccess_(String(x[0]))] = 1; });
  function buatKode(awalan) {
    var kode;
    do { kode = awalan + '-' + acak(4) + '-' + acak(4); } while (regs[hashAccess_(kode)]);   // pastikan tidak kebetulan sama dengan nama region
    return kode;
  }
  var newRpm = buatKode('RPM'), newAdm = buatKode('ADM');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ACCESS_HASH_RPM', hashAccess_(newRpm));
  props.setProperty('ACCESS_HASH', hashAccess_(newAdm));
  var okRpm = roleOf_(newRpm) === 'rpm', okAdm = roleOf_(newAdm) === 'admin';
  Logger.log('KODE RPM BARU: ' + newRpm + ' (verifikasi: ' + okRpm + ')');
  Logger.log('KODE ADMIN BARU: ' + newAdm + ' (verifikasi: ' + okAdm + ')');
  return { rpm: newRpm, admin: newAdm, okRpm: okRpm, okAdm: okAdm };
}
// ---------------------------------------------------------------------
// CADANGAN OTOMATIS: salinan penuh spreadsheet utama + Gudang BMI ke folder Drive pribadi "BMI-FTTH Backup", terpisah dari
// riwayat versi Sheets (yang kuotanya terbatas). Menyimpan CADANGAN_SIMPAN salinan terbaru per spreadsheet, yang lebih lama
// dipindah ke Sampah otomatis. `aktifkanCadanganMingguan` memasang pemicu terjadwal (Apps Script mungkin meminta izin baru
// saat pertama kali dijalankan dari editor - ikuti dialog izin bila muncul); `matikanCadanganMingguan` melepasnya.
// ---------------------------------------------------------------------
var CADANGAN_FOLDER = 'BMI-FTTH Backup';
var CADANGAN_SIMPAN = 8;   // jumlah salinan terbaru yang disimpan per spreadsheet, sisanya ke Sampah

function cadanganFolder_() {
  var it = DriveApp.getFoldersByName(CADANGAN_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CADANGAN_FOLDER);
}

function cadanganSatu_(folder, ssId, label) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH.mm');
  var src = DriveApp.getFileById(ssId);
  var copy = src.makeCopy(label + ' - ' + stamp, folder);
  // simpan hanya CADANGAN_SIMPAN salinan terbaru berlabel sama; sisanya ke Sampah
  var prefix = label + ' - ', files = folder.getFilesByName ? null : null;
  var all = [];
  var it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(prefix) === 0) all.push(f); }
  all.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = CADANGAN_SIMPAN; i < all.length; i++) { try { all[i].setTrashed(true); } catch (e) { /* abaikan */ } }
  return { name: copy.getName(), id: copy.getId(), disimpan: Math.min(all.length, CADANGAN_SIMPAN), dihapus: Math.max(0, all.length - CADANGAN_SIMPAN) };
}

// Dipanggil manual (pemilik) atau oleh pemicu terjadwal. Aman diulang kapan saja.
function cadanganDriveSekarang_() {
  var folder = cadanganFolder_(), out = {};
  out.utama = cadanganSatu_(folder, SpreadsheetApp.getActiveSpreadsheet().getId(), 'BACKUP FTTH Utama');
  var gid = PropertiesService.getScriptProperties().getProperty('BAG_SS_ID');
  if (gid) out.gudang = cadanganSatu_(folder, gid, 'BACKUP Gudang BMI');
  Logger.log('CADANGAN DRIVE: ' + JSON.stringify(out));
  return out;
}
function cadanganDriveSekarang() { ownerOnly_(); return cadanganDriveSekarang_(); }

// Pemicu mingguan (Senin dini hari); dipanggil oleh trigger, bukan langsung oleh pengguna.
function cadanganDriveOtomatis() { return cadanganDriveSekarang_(); }

function aktifkanCadanganMingguan() {
  ownerOnly_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cadanganDriveOtomatis') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cadanganDriveOtomatis').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  return 'Pemicu cadangan mingguan aktif (tiap Senin, sekitar jam 3 pagi).';
}
function matikanCadanganMingguan() {
  ownerOnly_();
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cadanganDriveOtomatis') { ScriptApp.deleteTrigger(t); n++; } });
  return 'Pemicu cadangan mingguan dihentikan (' + n + ' dihapus).';
}
function statusCadanganMingguan() {
  ownerOnly_();
  var aktif = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'cadanganDriveOtomatis'; });
  return { aktif: aktif };
}
// Cek nama site yang mirip (hanya baca): dua baris DATA BASE di region yang sama bisa dianggap "site berbeda" oleh sistem
// padahal cuma beda spasi/tanda baca/huruf besar-kecil (mis. "RT 02" vs "RT.02", atau spasi ganda) - site jadi tercatat
// dobel padahal maksudnya satu. Kunci longgar = huruf/angka saja, tanpa spasi/tanda baca, huruf kecil semua. Juga menandai
// baris Name+SOW yang benar-benar identik (duplikat langsung). Tidak mengubah apa pun; hasil di Log eksekusi.
function cekDuplikatSite() {
  ownerOnly_();
  var db = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DATA BASE');
  var lr = db.getLastRow();
  if (lr < 5) { Logger.log('DATA BASE kosong.'); return { mirip: [], duplikatPersis: [] }; }
  var vals = db.getRange(5, 1, lr - 4, 3).getValues();   // A Region, B Name, C SOW
  var longgar_ = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var byRegionKey = {}, exact = {};
  vals.forEach(function (r, i) {
    var region = String(r[0] || '').trim(), name = String(r[1] || '').trim(), sow = String(r[2] || '').trim();
    if (!name) return;
    var rk = normalizeText_(region) + '|' + longgar_(name);
    (byRegionKey[rk] = byRegionKey[rk] || []).push({ row: i + 5, name: name, sow: sow, region: region });
    var ek = normalizeText_(region) + '|' + normalizeText_(name) + '|' + normalizeText_(sow);
    (exact[ek] = exact[ek] || []).push(i + 5);
  });
  var mirip = [];
  Object.keys(byRegionKey).forEach(function (rk) {
    var grp = byRegionKey[rk];
    var namaBeda = {}; grp.forEach(function (g) { namaBeda[g.name] = 1; });
    if (Object.keys(namaBeda).length > 1) mirip.push({ region: grp[0].region, kandidat: grp.map(function (g) { return g.name + ' (SOW ' + g.sow + ', baris ' + g.row + ')'; }) });
  });
  var duplikatPersis = [];
  Object.keys(exact).forEach(function (ek) { if (exact[ek].length > 1) duplikatPersis.push({ kunci: ek, baris: exact[ek] }); });
  Logger.log('CEK DUPLIKAT SITE: ' + mirip.length + ' kelompok nama mirip, ' + duplikatPersis.length + ' Name+SOW identik persis. ' + JSON.stringify({ mirip: mirip, duplikatPersis: duplikatPersis }));
  return { mirip: mirip, duplikatPersis: duplikatPersis };
}
// Audit kode akses (hanya baca): mencari di seluruh DASHBOARD sel teks langsung (bukan rumus) yang jika di-hash cocok dengan
// ACCESS_HASH / ACCESS_HASH_RPM tersimpan (berarti kode akses tertulis polos di situ), dan memeriksa apakah kode RPM/Admin
// kebetulan sama dengan salah satu nama region di DATA BASE (celah: nama region bisa ditebak siapa saja).
function auditKodeAkses() {
  ownerOnly_();
  var props = PropertiesService.getScriptProperties();
  var adm = props.getProperty('ACCESS_HASH'), rpm = props.getProperty('ACCESS_HASH_RPM');
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = { platterFound: [], rpmMatchesRegion: null, admMatchesRegion: null, regions: [] };
  var db = ss.getSheetByName('DASHBOARD'), lr = db.getLastRow(), lc = db.getLastColumn();
  var vals = db.getRange(1, 1, lr, lc).getValues(), forms = db.getRange(1, 1, lr, lc).getFormulas();
  for (var r = 0; r < lr; r++) for (var c = 0; c < lc; c++) {
    var v = vals[r][c];
    if (typeof v !== 'string' || !v || forms[r][c]) continue;
    if (v.length > 24 || v.length < 3) continue;
    var h = hashAccess_(v);
    if (h === adm) out.platterFound.push({ cell: db.getRange(r + 1, c + 1).getA1Notation(), match: 'ADMIN' });
    if (h === rpm) out.platterFound.push({ cell: db.getRange(r + 1, c + 1).getA1Notation(), match: 'RPM' });
  }
  var dbn = ss.getSheetByName('DATA BASE'), regs = {};
  dbn.getRange(5, 1, dbn.getLastRow() - 4, 1).getValues().forEach(function (x) { if (x[0]) regs[String(x[0]).trim()] = 1; });
  Object.keys(regs).forEach(function (rg) {
    var h = hashAccess_(rg);
    if (h === rpm) out.rpmMatchesRegion = rg;
    if (h === adm) out.admMatchesRegion = rg;
    out.regions.push(rg);
  });
  Logger.log('AUDIT KODE AKSES: ' + JSON.stringify(out));
  return out;
}
// Audit (hanya baca): sheet mana yang rumusnya memuat teks tertentu (mis. nama sheet lain), rentang bernama yang menunjuk sheet itu,
// dan pengaturan berbagi file. Hasil di Log eksekusi. Ubah daftar CARI di bawah bila perlu.
function cariRujukan() {
  ownerOnly_();
  var CARI = ["REKAP BA", "BA TRANSAKSI"], ss = SpreadsheetApp.getActiveSpreadsheet();
  CARI.forEach(function (teks) {
    Logger.log('== Rumus yang memuat "' + teks + '" ==');
    ss.getSheets().forEach(function (sh) {
      var lr = sh.getLastRow(), lc = sh.getLastColumn();
      if (!lr || !lc) return;
      var fs = sh.getRange(1, 1, lr, lc).getFormulas(), n = 0, ex = [];
      for (var r = 0; r < fs.length; r++) for (var c = 0; c < fs[r].length; c++) {
        if (fs[r][c] && fs[r][c].indexOf(teks) >= 0) { n++; if (ex.length < 3) ex.push(sh.getRange(r + 1, c + 1).getA1Notation() + ': ' + fs[r][c].slice(0, 170)); }
      }
      if (n) Logger.log(sh.getName() + ': ' + n + ' rumus. Contoh: ' + ex.join(' || '));
    });
    ss.getNamedRanges().forEach(function (nr) {
      var rg = nr.getRange();
      if (rg && rg.getSheet().getName() === teks) Logger.log('Rentang bernama ke ' + teks + ': ' + nr.getName());
    });
  });
  function share(label, id) {
    try {
      var f = DriveApp.getFileById(id);
      Logger.log(label + ': akses=' + f.getSharingAccess() + ', izin=' + f.getSharingPermission() + ', editor=' + f.getEditors().length + ', pelihat=' + f.getViewers().length + ', pemilik=' + (f.getOwner() ? 'ada' : 'tidak terbaca'));
    } catch (e) { Logger.log(label + ': tidak bisa dibaca (' + e + ')'); }
  }
  share('Spreadsheet utama', ss.getId());
  var gid = PropertiesService.getScriptProperties().getProperty('BAG_SS_ID');
  if (gid) {
    share('Spreadsheet Gudang BMI', gid);
    try { var g = SpreadsheetApp.openById(gid); Logger.log('Gudang BMI sheet: ' + g.getSheets().map(function (s) { return s.getName() + ' ' + s.getMaxRows() + 'x' + s.getMaxColumns(); }).join(', ')); } catch (e2) { Logger.log('Gudang BMI tidak bisa dibuka: ' + e2); }
  } else Logger.log('BAG_SS_ID belum ada');
  return 'selesai';
}
// Pemeriksaan "berat" spreadsheet (hanya membaca, tidak mengubah apa pun). Hasil ada di Log eksekusi: per sheet ukuran sel, jumlah rumus,
// rumus mudah-menguap (TODAY/NOW/RAND), INDIRECT/OFFSET, rujukan seluruh kolom, grafik, aturan format bersyarat; plus ringkasan.
// Batas Google Sheets: 10 juta sel per spreadsheet (termasuk sel kosong dari baris/kolom yang tersedia).
function cekBeratSpreadsheet() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), t0 = Date.now(), tot = { cells: 0, formulas: 0, volatile: 0, indirect: 0, wholeCol: 0, charts: 0, cf: 0 };
  ss.getSheets().forEach(function (sh) {
    var t1 = Date.now(), mr = sh.getMaxRows(), mc = sh.getMaxColumns(), lr = sh.getLastRow(), lc = sh.getLastColumn();
    var f = 0, vol = 0, ind = 0, whole = 0, longest = 0;
    if (lr > 0 && lc > 0) {
      var fs = sh.getRange(1, 1, lr, lc).getFormulas();
      for (var r = 0; r < fs.length; r++) for (var c = 0; c < fs[r].length; c++) {
        var s = fs[r][c];
        if (!s) continue;
        f++;
        if (/\b(TODAY|NOW|RAND|RANDBETWEEN)\s*\(/i.test(s)) vol++;
        if (/\b(INDIRECT|OFFSET)\s*\(/i.test(s)) ind++;
        if (/\$?[A-Z]{1,3}\$?:\$?[A-Z]{1,3}(?![0-9A-Za-z])/.test(s)) whole++;
        if (s.length > longest) longest = s.length;
      }
    }
    var ch = sh.getCharts().length, cf = sh.getConditionalFormatRules().length;
    tot.cells += mr * mc; tot.formulas += f; tot.volatile += vol; tot.indirect += ind; tot.wholeCol += whole; tot.charts += ch; tot.cf += cf;
    Logger.log(sh.getName() + ': sel ' + (mr * mc) + ' (' + mr + 'x' + mc + '), terpakai ' + lr + 'x' + lc + ', rumus ' + f + ', TODAY/NOW/RAND ' + vol + ', INDIRECT/OFFSET ' + ind +
      ', seluruh-kolom ' + whole + ', rumus terpanjang ' + longest + ' huruf, grafik ' + ch + ', format bersyarat ' + cf + ' (' + (Date.now() - t1) + ' ms)');
  });
  Logger.log('TOTAL: sel ' + tot.cells + ' dari batas 10.000.000 (' + (tot.cells / 100000).toFixed(2) + '%), rumus ' + tot.formulas + ', TODAY/NOW/RAND ' + tot.volatile +
    ', INDIRECT/OFFSET ' + tot.indirect + ', seluruh-kolom ' + tot.wholeCol + ', grafik ' + tot.charts + ', format bersyarat ' + tot.cf +
    ', sheet ' + ss.getSheets().length + ', rentang bernama ' + ss.getNamedRanges().length + ', waktu periksa ' + (Date.now() - t0) + ' ms');
  return tot;
}
function setupParameter() { ownerOnly_(); return setupParameter_(); }
function setupRegion() { ownerOnly_(); return setupRegion_(); }
function setupLength() { ownerOnly_(); return setupLength_(); }
function setupAtp() { ownerOnly_(); return setupAtp_(); }
function setupPr() { ownerOnly_(); return setupPr_(); }

// ----- Fungsi publik menu RPM (hanya kode RPM) -----
function rpmInit(code) { requireRpm_(code); return rpmInit_(); }
function rpmCreate(code, data) {
  requireRpm_(code);
  var res = rpmCreate_(data);
  if (res && res.ok) logHistory_('Portal', logUser_(code), logRole_(code), 'BA Pekerjaan RPM', (data && data.site || '') + ' - ' + (res.idBa || ''));
  return res;
}
function rpmHistory(code) { requireRpm_(code); return rpmHistory_(); }
function rpmDownload(code, idBa) {
  requireRpm_(code);
  var res = rpmDownload_(idBa);
  logHistory_('Portal', logUser_(code), logRole_(code), 'Unduh PDF BA Pekerjaan RPM', String(idBa || ''));
  return res;
}
function rpmSaveSign(code, b64, mime) {
  requireRpm_(code);
  var res = rpmSaveSign_(b64, mime);
  logHistory_('Portal', logUser_(code), logRole_(code), 'Simpan Tanda Tangan RPM', '');
  return res;
}
function rpmSaveMandorSign(code, mandor, b64, mime) {
  requireRpm_(code);
  var res = rpmSaveMandorSign_(mandor, b64, mime);
  logHistory_('Portal', logUser_(code), logRole_(code), 'Simpan Tanda Tangan Mandor', String(mandor || ''));
  return res;
}
// ---------- FORM ATP (menu RPM) ----------
// Satu PDF berisi 2 halaman: Pengajuan Dana ATP + Persetujuan Biaya Entertain.
var ATP_SHEET_NAME = 'FORM ATP';
var ATP_FOLDER_NAME = 'FORM ATP RPM BMI';
var ATP_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
var ATP_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var ATP_DEF = { rekening: 'BCA 0600905317 (A.n BARCALONA HUSEN)', pengaju: 'Barcalona Husen', penyetuju: 'Jeffri Kusuma', rpm: 'Ramadhani' };

function atpTgl_(iso, label) {
  var p = String(iso || '').split('-');
  if (p.length !== 3 || p[0].length !== 4) throw new Error(label + ' belum diisi atau formatnya salah.');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (isNaN(d.getTime())) throw new Error(label + ' tidak valid.');
  return { iso: iso, date: d, hari: ATP_HARI[d.getDay()], tgl: p[2], bulan: ATP_BULAN[d.getMonth()], tahun: p[0] };
}
function atpHariTgl_(t) {
  return t.hari.toUpperCase() + ' / ' + t.tgl + ' / ' + t.bulan.toUpperCase() + ' / ' + t.tahun;
}
function atpRp_(n) {
  var s = String(Math.round(Number(n) || 0)), out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  return s + out;
}
function atpNorm_(data) {
  data = data || {};
  var aju = atpTgl_(data.tglAju, 'Tanggal pengajuan');
  var atp = atpTgl_(data.tglAtp, 'Tanggal ATP');
  var selisih = Math.round((atp.date - aju.date) / 86400000);
  if (selisih < 0) throw new Error('Tanggal pengajuan tidak boleh setelah tanggal ATP.');
  var cluster = baClean_(data.cluster);
  if (!cluster) throw new Error('Cluster / site belum diisi.');
  var b1 = Math.round(Number(data.nominal1) || 0);
  var b2 = Math.round(Number(data.nominal2) || 0);
  if (b1 < 0 || b2 < 0 || b1 + b2 <= 0) throw new Error('Nominal entertain belum diisi.');
  var warnings = [];
  if (selisih < 3) warnings.push('Pengajuan kurang dari H-3 sebelum tanggal ATP (aturan: wajib diajukan H-3).');
  return {
    aju: aju, atp: atp, cluster: cluster, warnings: warnings,
    regionRpm: baClean_(data.regionRpm) || 'KALIMANTAN',
    regionSite: baClean_(data.regionSite) || 'BANJARMASIN',
    b1: b1, b2: b2, total: b1 + b2,
    rekening: baClean_(data.rekening) || ATP_DEF.rekening,
    rpm: baClean_(data.rpm) || ATP_DEF.rpm,
    pengaju: baClean_(data.pengaju) || ATP_DEF.pengaju,
    penyetuju: baClean_(data.penyetuju) || ATP_DEF.penyetuju
  };
}
function atpCss_() {
  return '<style>' +
    '@page{size:A4;margin:12mm}' +
    'body{font-family:Calibri,Arial,sans-serif;font-size:11.5pt;color:#000;margin:0}' +
    '.pg{page-break-after:always}' +
    '.kop{width:100%;display:block;margin-bottom:8mm}' +
    'h1{font-size:13pt;text-align:center;text-decoration:underline;margin:8mm 0 6mm}' +
    '.ttl{font-size:12pt;font-weight:bold;text-align:center;margin:6mm 0 8mm}' +
    'p{line-height:1.5;text-align:justify;margin:0 0 5mm}' +
    'table.j{border-collapse:collapse;margin:3mm 0 6mm}' +
    'table.j td{padding:1mm 2mm;vertical-align:top}' +
    'table.sg{width:100%;margin-top:8mm}' +
    'table.sg td{width:50%;vertical-align:top;padding:1mm 0;text-align:center}' +
    '.nm{padding-top:16mm;text-decoration:underline}' +
    '.box{border:1px solid #000;width:45mm;padding:2mm 3mm;font-weight:bold}' +
    '.note{margin-top:8mm;font-weight:bold;line-height:1.5}' +
    '</style>';
}
function atpKop_() {
  return '<img class="kop" src="data:image/jpeg;base64,' + KOP_JPEG_B64 + '">';
}
function atpTtd_(d) {
  return '<table class="sg"><tr><td style="text-align:left">Dibuat di Banjarmasin,<br>' + d.aju.tgl + ' ' + d.aju.bulan + ' ' + d.aju.tahun + '</td><td></td></tr>' +
    '<tr><td>Diajukan Oleh,<div class="nm">' + d.pengaju + '</div></td>' +
    '<td>Disetujui Oleh,<div class="nm">' + d.penyetuju + '</div></td></tr></table>';
}
function atpPage1_(d) {
  return '<div class="pg">' + atpKop_() +
    '<div class="ttl">FORM PENGAJUAN DANA ATP REGION ' + d.regionRpm + '</div>' +
    '<p>Pada hari ini, ' + d.aju.hari + ' ' + d.aju.tgl + ' ' + d.aju.bulan + ' ' + d.aju.tahun + ', saya ' + d.rpm +
    ' selaku RPM / Pihak PT. BMI yang akan melakukan kegiatan ATP untuk Region ' + d.regionRpm +
    ' mengajukan dana ATP yang akan digunakan untuk entertain sebesar Rp ' + atpRp_(d.total) + ',-</p>' +
    '<h1>JADWAL ATP</h1>' +
    '<table class="j">' +
    '<tr><td><b>Region</b></td><td>: ' + d.regionSite + '</td></tr>' +
    '<tr><td><b>Cluster</b></td><td>: ' + d.cluster + '</td></tr>' +
    '<tr><td><b>Hari/ Tanggal</b></td><td>: ' + atpHariTgl_(d.atp) + '</td></tr>' +
    '<tr><td><b>No Rek</b></td><td>: ' + d.rekening + '</td></tr>' +
    '</table>' +
    '<p>Biaya tersebut akan digunakan sebaik mungkin dan sebagaimana mestinya. Dana Rp ' + atpRp_(d.total) +
    ',- akan dikembalikan ke kantor setelah diberikan evidence (nota/kwitansi, lampiran foto/dokumentasi dengan time stamp). ' +
    'Dana yang sudah terpakai akan dikirimkan ke ADMIN, dan dana yang sudah selesai dikembalikan untuk kebutuhan ATP ke rekening PT. Buana Menara Indonesia.</p>' +
    '<p>Demikian pengajuan ini saya buat dan saya pertanggungjawabkan. Terima kasih.</p>' +
    atpTtd_(d) + '</div>';
}
function atpPage2_(d) {
  return '<div class="pg">' + atpKop_() +
    '<div class="box">FORM_ ' + d.idAtp + '</div>' +
    '<h1>PERSETUJUAN BIAYA ENTERTAIN</h1>' +
    '<table class="j">' +
    '<tr><td>Nama</td><td>: ' + d.rpm + '</td></tr>' +
    '<tr><td>Tanggal ATP</td><td>: ' + atpHariTgl_(d.atp) + '</td></tr>' +
    '<tr><td>Tujuan Entertain</td><td>: ATP ' + d.cluster + '</td></tr>' +
    '<tr><td>Budget Entertain</td><td>: - ' + atpRp_(d.b1) + ' (Waspang, ATP, Redline)</td></tr>' +
    '<tr><td></td><td>: - ' + atpRp_(d.b2) + ' (Entertain)</td></tr>' +
    '</table>' +
    atpTtd_(d) +
    '<div class="note">*Note<br>1. Biaya entertain wajib diajukan H-3<br>2. Form wajib digunakan untuk budget &gt;Rp 300.000' +
    '<br>3. Jika biaya yang dikeluarkan melebihi budget entertain yang disetujui, maka sisanya akan ditanggung oleh karyawan</div>' +
    '</div>';
}
function atpHtmlDoc_(d) {
  var html = '<!doctype html><html><head><meta charset="utf-8">' + atpCss_() + '<style>html,body{background:#eee}.pv{background:#fff;max-width:560px;margin:8px auto;padding:20px 24px;box-sizing:border-box;font-size:10pt}</style></head><body><div class="pv">' + atpPage1_(d) + atpPage2_(d) + '</div></body></html>';
  return html;
}
function atpIdBaru_(atp) {
  var seq = atpSheet_().getLastRow();
  return 'ATP-' + atp.iso.split('-').join('') + '-' + ('000' + seq).slice(-3);
}
function atpTxt_(body, text, o) {
  o = o || {};
  var p = body.appendParagraph(text);
  p.setAlignment(o.align || DocumentApp.HorizontalAlignment.LEFT);
  p.setSpacingBefore(o.before || 0);
  p.setSpacingAfter(o.after == null ? 6 : o.after);
  var tx = p.editAsText();
  tx.setFontFamily(o.font || 'Calibri');
  tx.setFontSize(o.size || 11.5);
  tx.setBold(!!o.bold);
  tx.setUnderline(!!o.underline);
  tx.setForegroundColor(o.color || '#000000');
  return p;
}
function atpTabel_(body, rows, widths, font, labelBold) {
  var t = body.appendTable(rows);
  t.setBorderWidth(0);
  for (var c = 0; c < widths.length; c++) t.setColumnWidth(c, widths[c]);
  for (var r = 0; r < rows.length; r++) {
    for (var k = 0; k < rows[r].length; k++) {
      var tx = t.getRow(r).getCell(k).editAsText();
      tx.setFontFamily(font || 'Calibri');
      tx.setFontSize(11.5);
      tx.setUnderline(false);
      tx.setForegroundColor('#000000');
      tx.setBold(!!labelBold && k === 0);
      var pp = t.getRow(r).getCell(k).getChild(0).asParagraph();
      pp.setSpacingBefore(0);
      pp.setSpacingAfter(0);
      pp.setLineSpacing(1);
      t.getRow(r).getCell(k).setPaddingTop(0).setPaddingBottom(0);
    }
  }
  return t;
}
function atpKopDoc_(body) {
  var par = body.appendParagraph('');
  par.setSpacingAfter(0);
  rpmPlaceImage_(par, rpmImgBlob_(KOP_JPEG_B64, 'image/jpeg', 'kop_atp'), 495, 110);
}
function atpTtdDoc_(body, d, font) {
  atpTxt_(body, 'Dibuat di Banjarmasin, ' + d.aju.tgl + ' ' + d.aju.bulan + ' ' + d.aju.tahun, { font: font, before: 4, after: 6 });
  var t = atpTabel_(body, [['Diajukan Oleh,', 'Disetujui Oleh,'], ['', ''], [d.pengaju, d.penyetuju]], [247, 248], font, false);
  t.getRow(1).setMinimumHeight(50);
  for (var c = 0; c < 2; c++) t.getRow(2).getCell(c).editAsText().setUnderline(true);
  for (var r = 0; r < 3; r++) for (var c2 = 0; c2 < 2; c2++) t.getRow(r).getCell(c2).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  return t;
}
function atpIdDoc_(body, idAtp) {
  atpTxt_(body, 'ID: ' + idAtp, { align: DocumentApp.HorizontalAlignment.RIGHT, size: 8, color: '#999999', before: 10, after: 0 });
}
function atpDocHalaman1_(body, d, idAtp) {
  atpKopDoc_(body);
  atpTxt_(body, 'FORM PENGAJUAN DANA ATP REGION ' + d.regionRpm, { bold: true, align: DocumentApp.HorizontalAlignment.CENTER, size: 12, before: 8, after: 14 });
  atpTxt_(body, 'Pada hari ini, ' + d.aju.hari + ' ' + d.aju.tgl + ' ' + d.aju.bulan + ' ' + d.aju.tahun + ', saya ' + d.rpm + ' selaku RPM / Pihak PT. BMI yang akan melakukan kegiatan ATP untuk Region ' + d.regionRpm + ' mengajukan dana ATP yang akan digunakan untuk entertain sebesar Rp ' + atpRp_(d.total) + ',-', { align: DocumentApp.HorizontalAlignment.JUSTIFY, after: 6 });
  atpTxt_(body, 'JADWAL ATP', { bold: true, align: DocumentApp.HorizontalAlignment.CENTER, after: 6 });
  atpTabel_(body, [['Region', ': ' + d.regionSite], ['Cluster', ': ' + d.cluster], ['Hari/ Tanggal', ': ' + atpHariTgl_(d.atp)], ['No Rek', ': ' + d.rekening]], [110, 385], 'Calibri', true);
  atpTxt_(body, 'Biaya tersebut akan digunakan sebaik mungkin dan sebagaimana mestinya. Dana Rp ' + atpRp_(d.total) + ',- akan dikembalikan ke kantor setelah diberikan evidence (nota/kwitansi, lampiran foto/dokumentasi dengan time stamp). Dana yang sudah terpakai akan dikirimkan ke ADMIN, dan dana yang sudah selesai dikembalikan untuk kebutuhan ATP ke rekening PT. Buana Menara Indonesia.', { align: DocumentApp.HorizontalAlignment.JUSTIFY, before: 4, after: 12 });
  atpTxt_(body, 'Demikian pengajuan ini saya buat dan saya pertanggungjawabkan. Terima kasih.', { after: 12 });
  atpTtdDoc_(body, d, 'Calibri');
}
function atpDocHalaman2_(body, d, idAtp) {
  var TNR = 'Calibri';
  atpKopDoc_(body);
  atpKotakDoc_(body, 'FORM_ ' + idAtp);
  atpTxt_(body, 'PERSETUJUAN BIAYA ENTERTAIN', { bold: true, underline: true, align: DocumentApp.HorizontalAlignment.CENTER, size: 13, before: 6, after: 8, font: TNR });
  atpTabel_(body, [['Nama', ': ' + d.rpm], ['Tanggal ATP', ': ' + atpHariTgl_(d.atp)], ['Tujuan Entertain', ': ATP ' + d.cluster], ['Budget Entertain', ': - ' + atpRp_(d.b1) + ' (Waspang, ATP, Redline)'], ['', ': - ' + atpRp_(d.b2) + ' (Entertain)']], [150, 345], TNR, true);
  atpTtdDoc_(body, d, TNR);
  atpTxt_(body, '*Note', { bold: true, before: 8, after: 2, font: TNR });
  atpTxt_(body, '1. Biaya entertain wajib diajukan H-3', { bold: true, after: 0, font: TNR });
  atpTxt_(body, '2. Form wajib digunakan untuk budget >Rp 300.000', { bold: true, after: 0, font: TNR });
  atpTxt_(body, '3. Jika biaya yang dikeluarkan melebihi budget entertain yang disetujui, maka sisanya akan ditanggung oleh karyawan', { bold: true, after: 0, font: TNR });
}
function atpKotakDoc_(body, teks) {
  var t = body.appendTable([['', teks]]);
  t.setBorderWidth(0);
  t.setColumnWidth(0, 345);
  t.setColumnWidth(1, 150);
  var c = t.getRow(0).getCell(1);
  c.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(5).setPaddingRight(5);
  var pp = c.getChild(0).asParagraph();
  pp.setSpacingBefore(0);
  pp.setSpacingAfter(0);
  var tx = c.editAsText();
  tx.setFontFamily('Calibri');
  tx.setFontSize(11);
  tx.setBold(true);
  tx.setUnderline(false);
  tx.setForegroundColor('#000000');
  return t;
}
function atpKotakStyle_(docId, teks) {
  var doc = Docs.Documents.get(docId);
  var idx = null;
  doc.body.content.forEach(function (el) {
    if (idx !== null || !el.table) return;
    var txt = '';
    el.table.tableRows[0].tableCells[1].content[0].paragraph.elements.forEach(function (pe) { if (pe.textRun) txt += pe.textRun.content; });
    if (txt.indexOf(teks) === 0) idx = el.startIndex;
  });
  if (idx === null) return;
  var line = { width: { magnitude: 1, unit: 'PT' }, dashStyle: 'SOLID', color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } } };
  Docs.Documents.batchUpdate({ requests: [{ updateTableCellStyle: {
    tableCellStyle: { borderTop: line, borderBottom: line, borderLeft: line, borderRight: line },
    fields: 'borderTop,borderBottom,borderLeft,borderRight',
    tableRange: { tableCellLocation: { tableStartLocation: { index: idx }, rowIndex: 0, columnIndex: 1 }, rowSpan: 1, columnSpan: 1 }
  } }] }, docId);
}
function atpDoc_(d, idAtp) {
  var doc = DocumentApp.create('TMP_' + idAtp);
  var body = doc.getBody();
  body.clear();
  body.setPageWidth(595.28).setPageHeight(841.89).setMarginTop(24).setMarginBottom(28).setMarginLeft(50).setMarginRight(50);
  atpDocHalaman1_(body, d, idAtp);
  body.appendPageBreak();
  atpDocHalaman2_(body, d, idAtp);
  doc.saveAndClose();
  atpKotakStyle_(doc.getId(), 'FORM_ ' + idAtp);
  return doc.getId();
}
function atpPdf_(d, idAtp) {
  var docId = atpDoc_(d, idAtp);
  var pdf = DriveApp.getFileById(docId).getAs(MimeType.PDF);
  try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* abaikan */ }
  return pdf;
}
function atpSheet_() {
  var ss = rpmSs_();
  var sh = ss.getSheetByName(ATP_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ATP_SHEET_NAME);
    sh.appendRow(['ID', 'Dibuat (waktu)', 'Dibuat oleh', 'Tgl pengajuan', 'Tgl ATP', 'Region RPM', 'Region site', 'Cluster / site', 'Total dana', 'Budget Waspang/ATP/Redline', 'Budget Entertain', 'Rekening', 'File PDF']);
    sh.setFrozenRows(1);
  }
  return sh;
}
function atpFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ATP_FOLDER_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* buat ulang */ }
  }
  var it = DriveApp.getFoldersByName(ATP_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(ATP_FOLDER_NAME);
  props.setProperty('ATP_FOLDER_ID', folder.getId());
  return folder;
}
function atpPreview_(data) {
  var d = atpNorm_(data);
  d.idAtp = 'ATP-PRATINJAU';
  return { html: atpHtmlDoc_(d), warnings: d.warnings };
}
// Tulis Tanggal ATP ke kolom ATP Start dan RECTI Start di DATA BASE untuk site yang Name-nya cocok dengan field Cluster
// di FORM ATP. Bila ada beberapa baris SOW untuk nama yang sama, diutamakan baris SOW "Cluster". Tidak pernah membatalkan
// pembuatan FORM ATP/PDF - kegagalan di sini hanya menambah warning supaya pengaju tahu harus mengisi manual.
function atpSyncDataBase_(clusterName, isoDate) {
  try {
    var db = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DATA BASE');
    if (!db) return { ok: false, warning: 'Sheet DATA BASE tidak ditemukan; ATP Start/RECTI Start tidak terisi otomatis.' };
    var h = dokHdr_(db);
    var cName = dokFind_(h, /^Name$/i), cSow = dokFind_(h, /^SOW$/i), cAtpStart = dokFind_(h, /^ATP Start$/i), cRectiStart = dokFind_(h, /^RECTI Start$/i);
    if (!cName || !cAtpStart || !cRectiStart) return { ok: false, warning: 'Kolom Name/ATP Start/RECTI Start tidak ditemukan di DATA BASE; ATP Start/RECTI Start tidak terisi otomatis.' };
    var lastRow = db.getLastRow();
    if (lastRow < 5) return { ok: false, warning: 'DATA BASE belum ada data site; ATP Start/RECTI Start tidak terisi otomatis.' };
    var n = lastRow - 4;
    var names = db.getRange(5, cName, n, 1).getValues();
    var sows = cSow ? db.getRange(5, cSow, n, 1).getValues() : null;
    var want = normalizeText_(clusterName);
    var rows = [];
    for (var i = 0; i < n; i++) {
      if (normalizeText_(names[i][0]) === want) rows.push(i);
    }
    if (!rows.length) return { ok: false, warning: 'Site/Cluster "' + clusterName + '" tidak ditemukan di DATA BASE (kolom Name); ATP Start/RECTI Start tidak terisi otomatis, isi manual.' };
    if (rows.length > 1 && sows) {
      var clusterRows = rows.filter(function (i) { return normalizeText_(sows[i][0]) === 'cluster'; });
      if (clusterRows.length) rows = clusterRows;
    }
    var dm = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var tgl = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]) : null;
    if (!tgl) return { ok: false, warning: 'Tanggal ATP tidak valid; ATP Start/RECTI Start tidak terisi otomatis.' };
    rows.forEach(function (i) {
      var r = 5 + i;
      db.getRange(r, cAtpStart).setValue(tgl);
      db.getRange(r, cRectiStart).setValue(tgl);
    });
    SpreadsheetApp.flush();
    return { ok: true, rows: rows.length };
  } catch (e) {
    return { ok: false, warning: 'Gagal mengisi ATP Start/RECTI Start otomatis: ' + e };
  }
}
function atpCreate_(data, oleh) {
  var d = atpNorm_(data);
  d.idAtp = atpIdBaru_(d.atp);
  var blob = atpPdf_(d, d.idAtp);
  var name = 'FORM ATP ' + d.atp.iso + ' - ' + d.cluster + '.pdf';
  var file = atpFolder_().createFile(blob.setName(name));
  atpSheet_().appendRow([d.idAtp, new Date(), oleh || '', d.aju.iso, d.atp.iso, d.regionRpm, d.regionSite, d.cluster, d.total, d.b1, d.b2, d.rekening, file.getUrl()]);
  var sync = atpSyncDataBase_(d.cluster, d.atp.iso);
  if (!sync.ok && sync.warning) d.warnings.push(sync.warning);
  return { ok: true, url: file.getUrl(), downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(), warnings: d.warnings };
}
function atpPreview(code, data) { requireRpm_(code); return atpPreview_(data); }
function atpCreate(code, data) {
  requireRpm_(code);
  var oleh = logUser_(code);
  var res = atpCreate_(data, oleh);
  if (res && res.ok) logHistory_('Portal', oleh, logRole_(code), 'FORM ATP RPM', String((data && data.cluster) || ''));
  return res;
}

// =====================================================================
// RENTANG DATA BASE DI DASHBOARD (26 Sep 2026)
// Tabel bantu lama di DASHBOARD (ringkasan status per SOW, jumlah site per bulan, status OPNAME) membaca DATA BASE hanya sampai baris
// 118 atau 202, jadi site di bawah baris itu tidak ikut tergambar di grafik (angka grafik lebih kecil dari KPI). perbaikiRentangDashboard
// (hanya pemilik; aman diulang) menaikkan batas itu ke DASH_RANGE_END, lalu gerbang mencocokkan hasilnya dengan hitungan langsung dari
// DATA BASE dan memulihkan rumus bila ada yang tidak cocok. cekStruktur menandai rumus DASHBOARD yang masih berhenti terlalu awal.
// =====================================================================
var DASH_RANGE_END = 1002;      // sama dengan batas yang dipakai rumus KPI DASHBOARD
var DASH_STALE_RE = /('DATA BASE'!\$?[A-Z]{1,3}\$?[45]:\$?[A-Z]{1,3}\$?)(\d+)(?![0-9])/g;

function dashStaleFix_(x) {
  return x.replace(DASH_STALE_RE, function (m, a, n) { n = Number(n); return n > 5 && n < DB_LAST_ROW ? a + DASH_RANGE_END : m; });
}

// Daftar { r, c, o, n } rumus DASHBOARD yang membaca DATA BASE hanya sampai baris sebelum DB_LAST_ROW.
function dashStale_(sh) {
  var lr = sh.getLastRow(), lc = sh.getLastColumn(), f = sh.getRange(1, 1, lr, lc).getFormulas(), out = [];
  for (var i = 0; i < lr; i++) for (var j = 0; j < lc; j++) {
    var x = f[i][j]; if (!x || x.indexOf("'DATA BASE'!") < 0) continue;
    var y = dashStaleFix_(x); if (y !== x) out.push({ r: i + 1, c: j + 1, o: x, n: y });
  }
  return out;
}

function dashRangeFix_(sh, gate, dbName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), i, j;
  sh = sh || ss.getSheetByName('DASHBOARD'); dbName = dbName || 'DATA BASE';
  if (!sh) throw new Error('Sheet DASHBOARD tidak ditemukan.');
  var ch = dashStale_(sh);
  if (!ch.length) return { changed: 0 };
  var lr = sh.getLastRow(), lc = sh.getLastColumn(), dv0 = sh.getRange(1, 1, lr, lc).getDisplayValues();
  function nErr(dv) { var n = 0; for (var a = 0; a < dv.length; a++) for (var b = 0; b < dv[a].length; b++) if (/^#/.test(dv[a][b])) n++; return n; }
  var er0 = nErr(dv0), rMin = 1e9, rMax = 0;
  ch.forEach(function (e) { rMin = Math.min(rMin, e.r); rMax = Math.max(rMax, e.r); });
  try {
    ch.forEach(function (e) { sh.getRange(e.r, e.c).setFormula(e.n); });
    SpreadsheetApp.flush();
    var dv1 = sh.getRange(1, 1, lr, lc).getDisplayValues(), probs = [], info = {};
    if (nErr(dv1) !== er0) probs.push('jumlah sel galat ' + er0 + ' -> ' + nErr(dv1));
    // perubahan tampilan hanya boleh di blok tabel bantu (baris sel yang diubah dan turunannya)
    for (i = 0; i < lr; i++) for (j = 0; j < lc; j++) {
      if (dv0[i][j] === dv1[i][j]) continue;
      if (i === 2 && j === 0) continue;                                   // subjudul memuat jam pembaruan
      if (i + 1 < rMin - 1 || i + 1 > rMax + 1) probs.push('DASHBOARD!' + dokLetter_(j + 1) + (i + 1) + ' berubah di luar tabel bantu');
    }
    // hitungan langsung dari DATA BASE
    var db = ss.getSheetByName(dbName), H = dokHdr_(db);
    var cS = dokFind_(H, /^SOW$/i), cI = dokFind_(H, /^Implementation Status$/i), cH = dokFind_(H, /^HP RFS$/i), cM = dokFind_(H, /^Month$/i), cO = dokFind_(H, /^OPNAME$/i), cN = dokFind_(H, /^Name$/i);
    var dbv = db.getRange(5, 1, DASH_RANGE_END - 4, db.getLastColumn()).getValues();
    function num(r, c, n) { return sh.getRange(r, c, 1, n).getValues()[0]; }
    var hdr = -1, t;
    for (i = 0; i < lr; i++) if (String(dv1[i][0]) === 'SOW' && String(dv1[i][1]) === 'RFS') { hdr = i; break; }
    if (hdr < 0) probs.push('tabel ringkasan status per SOW tidak ditemukan');
    else {
      var st = [String(dv1[hdr][1]).trim().toUpperCase(), String(dv1[hdr][2]).trim().toUpperCase(), '', String(dv1[hdr][4]).trim().toUpperCase()];
      var sum = [0, 0, 0, 0, 0, 0], listed = {}, r = hdr + 1;
      for (; r < lr; r++) {
        var lab = String(dv1[r][0]).trim(); if (!lab || /^Grand Total$/i.test(lab)) break;
        var key = lab.toUpperCase(), c = [0, 0, 0, 0, 0, 0]; listed[key] = true;
        dbv.forEach(function (row) {
          if (String(row[cS - 1]).trim().toUpperCase() !== key) return;
          var s = String(row[cI - 1]).trim().toUpperCase();
          c[4]++; if (s === st[0]) c[0]++; else if (s === st[1]) c[1]++; else if (s === st[3]) c[3]++; else if (s === '') c[2]++;
          if (typeof row[cH - 1] === 'number') c[5] += row[cH - 1];
        });
        var got = num(r + 1, 2, 6), ok = true;
        for (t = 0; t < 6; t++) { if (Math.abs(Number(got[t]) - c[t]) > 1e-6) ok = false; sum[t] += c[t]; }
        if (!ok) probs.push('baris ' + (r + 1) + ' (' + lab + '): tabel ' + got.join('/') + ' vs DATA BASE ' + c.join('/'));
      }
      if (String(dv1[r] ? dv1[r][0] : '').trim().toUpperCase() !== 'GRAND TOTAL') probs.push('baris Grand Total tidak ditemukan');
      else {
        var gt = num(r + 1, 2, 6); for (t = 0; t < 6; t++) if (Math.abs(Number(gt[t]) - sum[t]) > 1e-6) probs.push('Grand Total kolom ' + dokLetter_(t + 2) + ' ' + gt[t] + ' vs ' + sum[t]);
        info.sites = sum[4]; info.rfs = sum[0]; info.hp = sum[5];
        // tabel Status (RFS, On Going, Belum Ada Status, Drop) mengikuti Grand Total
        var h2 = -1; for (i = 0; i < lr; i++) if (String(dv1[i][0]) === 'Status' && /Jumlah Site/i.test(String(dv1[i][1]))) { h2 = i; break; }
        if (h2 < 0) probs.push('tabel Status tidak ditemukan');
        else { var sv = sh.getRange(h2 + 2, 2, 4, 1).getValues(); for (t = 0; t < 4; t++) if (Number(sv[t][0]) !== sum[t]) probs.push('tabel Status baris ' + (h2 + 2 + t) + ' = ' + sv[t][0] + ' vs ' + sum[t]); }
      }
      var unl = 0; dbv.forEach(function (row) { if (String(row[cN - 1]).trim() !== '' && !listed[String(row[cS - 1]).trim().toUpperCase()]) unl++; });
      info.unlisted = unl;
    }
    // jumlah site per bulan (kolom Jumlah Site)
    var m0 = -1; for (i = 0; i < lr; i++) if (String(dv1[i][0]) === 'Januari') { m0 = i; break; }
    if (m0 < 0) probs.push('tabel bulan tidak ditemukan');
    else {
      var mc = []; for (t = 0; t < 12; t++) mc.push(0);
      var tz = ss.getSpreadsheetTimeZone();
      dbv.forEach(function (row) { var d = row[cM - 1]; if (d instanceof Date) mc[Number(Utilities.formatDate(d, tz, 'M')) - 1]++; });
      var mv = sh.getRange(m0 + 1, 8, 12, 1).getValues();
      for (t = 0; t < 12; t++) if (Number(mv[t][0]) !== mc[t]) probs.push('bulan ' + (t + 1) + ': tabel ' + mv[t][0] + ' vs DATA BASE ' + mc[t]);
      info.monthSites = mc.reduce(function (a, b) { return a + b; }, 0);
    }
    // status OPNAME
    var o0 = -1; for (i = 0; i < lr; i++) if (String(dv1[i][0]) === 'Status OPNAME') { o0 = i; break; }
    if (o0 < 0) probs.push('tabel status OPNAME tidak ditemukan');
    else {
      var ot = 0, of = 0; dbv.forEach(function (row) { var v = row[cO - 1]; if (v === true) ot++; else if (v === false) of++; });
      var ov = sh.getRange(o0 + 2, 2, 2, 1).getValues();
      if (Number(ov[0][0]) !== ot || Number(ov[1][0]) !== of) probs.push('status OPNAME tabel ' + ov[0][0] + '/' + ov[1][0] + ' vs DATA BASE ' + ot + '/' + of);
      info.opname = ot + '/' + of;
    }
    if (gate && probs.length) throw new Error('GERBANG GAGAL (' + probs.length + '): ' + probs.slice(0, 6).join(' || '));
    info.changed = ch.length; info.rows = rMin + '-' + rMax;
    return info;
  } catch (e) {
    var errs = [];
    ch.forEach(function (x) { try { sh.getRange(x.r, x.c).setFormula(x.o); } catch (e2) { errs.push(dokLetter_(x.c) + x.r); } });
    SpreadsheetApp.flush();
    if (errs.length) e.message += ' || GAGAL MENGEMBALIKAN: ' + errs.slice(0, 8).join(',');
    throw e;
  }
}
function perbaikiRentangDashboard() { ownerOnly_(); return dashRangeFix_(null, true); }

// Judul kolom A blok PENGATURAN (kolom A sempit) dibuat turun baris di dalam sel supaya terbaca penuh; hanya format, isi sel tidak berubah.
function rapikanLabelPengaturan_(sh) {
  sh = sh || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DASHBOARD');
  if (!sh) throw new Error('Sheet DASHBOARD tidak ditemukan.');
  var top = kurvaFindRow_(sh, PRM_TITLE); if (!top) return { top: 0, rows: 0, heights: [] };
  var n = 0, hs = [];
  for (var r = top + 1; r <= top + 7; r++) {
    var c = sh.getRange(r, 1);
    if (String(c.getDisplayValue()).trim() === '') continue;
    c.setWrap(true).setVerticalAlignment('middle');
    var wA = sh.getColumnWidth(1) - 8, lines = 1, cur = 0;      // perkiraan tinggi: autoResizeRows tidak mengubah baris ini
    String(c.getDisplayValue()).split(' ').forEach(function (word) { var len = (word.length + 1) * 6.6; if (cur && cur + len > wA) { lines++; cur = 0; } cur += len; });
    sh.setRowHeight(r, Math.max(21, lines * 13 + 8));
    n++; hs.push(sh.getRowHeight(r));
  }
  return { top: top, rows: n, heights: hs };
}
function rapikanLabelPengaturan() { ownerOnly_(); return rapikanLabelPengaturan_(); }

// =====================================================================
// BA GUDANG: membuat BA Pengambilan / Pengembalian Material otomatis (portal: Warehouse > BA Transaksi).
// Admin WH mengisi form (jenis, region, site, mandor, material + Qty); server memberi Nomor BA standar, membuat PDF
// (tata letak sama dengan template BA: kop, tabel 17 baris, kotak tanda tangan KOSONG), menyimpannya lewat saveBa_
// (baris di sheet BA TRANSAKSI + PDF di Drive, jadi REKAP BA/REKON ikut) dan mencatatnya di REGISTER.
//  - Nomor BA: BA/{OUT-CW|OUT-EL|IN}/{KODE REGION}/{yymm}/{urutan 3 digit}, urutan naik per jenis + region + bulan BA.
//  - Kategori (hanya untuk Ambil): Electric = FAT, FDT, JC; CW = semua material lain (+ "Material Lain" bebas). Pengembalian: semua.
//  - Pengaturan per region (kode, nama gudang, jabatan penandatangan) dan daftar Mandor ada di spreadsheet terpisah
//    "BA Gudang BMI - Pengaturan dan Register" (dibuat oleh setupBaGudang, id di Script Property BAG_SS_ID).
//  - Kode region hanya boleh membuat BA untuk regionnya; kode Admin dan RPM untuk semua region yang ada di PENGATURAN.
// =====================================================================
var BAG_SS_NAME = 'BA Gudang BMI - Pengaturan dan Register';
var BAG_SH_SET = 'PENGATURAN';
var BAG_SH_MAN = 'MANDOR';
var BAG_SH_REG = 'REGISTER';
var BAG_FIRST = 5;                                   // data mulai baris 5; baris 4 = judul kolom
var BAG_ROLES = ['Waspang', 'Regional Project Manager', 'Kepala Gudang', 'Admin Material Regional', 'Mandor/Subcont'];
var BAG_SET_HEAD = ['Region (sama dengan kolom Region DATA BASE)', 'Kode Region', 'Nama Gudang', 'Jabatan: Dibuat Oleh', 'Jabatan: Diperiksa Oleh', 'Jabatan: Disetujui', 'Jabatan: Dikeluarkan / Diterima Oleh', 'Jabatan: Diambil / Dikembalikan Oleh'];
var BAG_REGIONS = [['Banjarmasin', 'BJM', 'Gudang Banjarmasin'], ['Pontianak', 'PTK', 'Gudang Pontianak'], ['Pemalang', 'PML', 'Gudang Pemalang']];
var BAG_REG_HEAD = ['Nomor BA', 'Tanggal', 'Jam', 'Jenis', 'Kategori', 'Region', 'Kode', 'Site', 'SOW', 'Mandor', 'Gudang', 'Jumlah Item', 'ID BA',
  'Nama File PDF', 'Link PDF', 'File ID', 'Dibuat Pada', 'Dibuat Dengan Kode', 'Status', 'Catatan'];
var BAG_RC = { NOMOR: 1, TGL: 2, JAM: 3, JENIS: 4, KAT: 5, REGION: 6, KODE: 7, SITE: 8, SOW: 9, MANDOR: 10, GUDANG: 11, N: 12, IDBA: 13,
  FILE: 14, LINK: 15, FILEID: 16, DIBUAT: 17, OLEH: 18, STATUS: 19, CATATAN: 20 };
var BAG_ELECTRIC_RE = /^(FAT|FDT|JC)\b/i;
var BAG_PAGE_ROWS = 17;
var BAG_MAX_ITEMS = 34;
var BAG_TEST = null;                                 // hanya untuk uji: { ssId }

function bagSs_() {
  var id = BAG_TEST ? BAG_TEST.ssId : PropertiesService.getScriptProperties().getProperty('BAG_SS_ID');
  if (!id) throw new Error('Spreadsheet pengaturan BA Gudang belum dibuat. Pemilik: jalankan setupBaGudang dari editor Apps Script.');
  try { return SpreadsheetApp.openById(id); } catch (e) { throw new Error('Spreadsheet pengaturan BA Gudang tidak bisa dibuka. Pemilik: jalankan setupBaGudang lagi.'); }
}

function bagSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ada di spreadsheet BA Gudang. Pemilik: jalankan setupBaGudang lagi.');
  return sh;
}

// ---------- Pembuatan spreadsheet pengaturan + register (tema BMI: hitam + emas) ----------
function setupBaGudang_() {
  var props = PropertiesService.getScriptProperties();
  var ss = null, created = false;
  var id = BAG_TEST ? BAG_TEST.ssId : props.getProperty('BAG_SS_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(BAG_SS_NAME);
    created = true;
    if (BAG_TEST) BAG_TEST.ssId = ss.getId(); else props.setProperty('BAG_SS_ID', ss.getId());
    try { DriveApp.getFileById(ss.getId()).moveTo(getBaFolder_()); } catch (e2) { /* biarkan di Drive Saya */ }
  }
  ss.setSpreadsheetLocale('id_ID');
  try { ss.setSpreadsheetTimeZone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()); } catch (e3) { /* biarkan */ }

  var first = ss.getSheets()[0];
  var st = ss.getSheetByName(BAG_SH_SET) || (created && first && first.getName() === 'Sheet1' ? first.setName(BAG_SH_SET) : ss.insertSheet(BAG_SH_SET));
  var mn = ss.getSheetByName(BAG_SH_MAN) || ss.insertSheet(BAG_SH_MAN);
  var rg = ss.getSheetByName(BAG_SH_REG) || ss.insertSheet(BAG_SH_REG);
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (n !== BAG_SH_SET && n !== BAG_SH_MAN && n !== BAG_SH_REG) ss.deleteSheet(s);
  });
  bagStyleSet_(st);
  bagStyleMan_(mn);
  bagStyleReg_(rg);
  ss.setActiveSheet(st);
  SpreadsheetApp.flush();
  return { id: ss.getId(), url: ss.getUrl(), created: created };
}

function bagStyleSet_(sh) {
  var n = BAG_SET_HEAD.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'PENGATURAN - BA GUDANG', 'Satu baris per region: kode untuk Nomor BA, nama gudang, dan jabatan penandatangan yang dicetak di BA');
  sh.getRange(2, 2).setValue('Region baru: tambahkan satu baris (nama region sama persis dengan kolom Region di DATA BASE) dan isi Kode Region (3 huruf). Jabatan boleh diubah per region; nama orang tidak dicetak.');
  rpmHeader_(sh, BAG_SET_HEAD);
  var cur = sh.getLastRow() >= BAG_FIRST ? sh.getRange(BAG_FIRST, 1, 1, 1).getValue() : '';
  if (!baClean_(cur)) {
    var rows = BAG_REGIONS.map(function (r) { return [r[0], r[1], r[2]].concat(BAG_ROLES); });
    sh.getRange(BAG_FIRST, 1, rows.length, n).setValues(rows);
  }
  [230, 100, 190, 170, 190, 150, 220, 220].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var nr = Math.max(sh.getMaxRows() - 4, 1);
  sh.getRange(BAG_FIRST, 1, nr, n).setVerticalAlignment('middle').setBackground('#FFFDF7');
  sh.getRange(BAG_FIRST, 2, nr, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sh.setTabColor('#1A1A1A');
}

function bagStyleMan_(sh) {
  var n = 2;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'MANDOR - BA GUDANG', 'Daftar Mandor / Subcont per region untuk pilihan di form BA');
  sh.getRange(2, 2).setValue('Nama Mandor baru otomatis ditambahkan saat BA dibuat. Hapus barisnya bila mandor tidak dipakai lagi.');
  rpmHeader_(sh, ['Region', 'Nama Mandor / Subcont']);
  if (sh.getLastRow() < BAG_FIRST) {
    var seed = [], seen = {};
    try {
      var dbSites = baReadDbSites_(''), regionOf = {};
      dbSites.forEach(function (d) { regionOf[normalizeText_(d.name)] = d.region; });
      var ba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BA_SHEET_NAME);
      if (ba && ba.getLastRow() > 1) {
        ba.getRange(2, 1, ba.getLastRow() - 1, BA_COL.MANDOR).getValues().forEach(function (r) {
          var m = baClean_(r[BA_COL.MANDOR - 1]), rg = regionOf[normalizeText_(r[BA_COL.NAME - 1])];
          if (m && rg && !seen[regionKey_(rg) + '|' + normalizeText_(m)]) { seen[regionKey_(rg) + '|' + normalizeText_(m)] = 1; seed.push([rg, m]); }
        });
      }
    } catch (e) { /* tanpa isi awal */ }
    if (seed.length) sh.getRange(BAG_FIRST, 1, seed.length, 2).setValues(seed);
  }
  [200, 320].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  sh.getRange(BAG_FIRST, 1, Math.max(sh.getMaxRows() - 4, 1), n).setBackground('#FFFDF7').setVerticalAlignment('middle');
  sh.setTabColor('#1A1A1A');
}

function bagStyleReg_(sh) {
  var n = BAG_REG_HEAD.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'REGISTER BA GUDANG', 'Catatan semua BA Pengambilan / Pengembalian yang dibuat lewat portal (Warehouse > BA Transaksi)');
  sh.getRange(2, 2).setValue('Terisi otomatis dari portal. Nomor BA dipakai untuk urutan berikutnya, jadi jangan menghapus atau mengubah baris. Status PROSES yang tersangkut atau GAGAL berarti pembuatan terhenti; lihat kolom Catatan.');
  rpmHeader_(sh, BAG_REG_HEAD);
  [190, 100, 60, 100, 90, 110, 60, 340, 90, 160, 150, 70, 130, 260, 90, 60, 140, 150, 80, 320].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var rows = Math.max(sh.getMaxRows() - 4, 1);
  sh.getRange(BAG_FIRST, 1, rows, n).setVerticalAlignment('middle');
  sh.getRange(BAG_FIRST, BAG_RC.TGL, rows, 1).setNumberFormat('dd mmm yyyy').setHorizontalAlignment('center');
  sh.getRange(BAG_FIRST, BAG_RC.JAM, rows, 1).setNumberFormat('@').setHorizontalAlignment('center');
  sh.getRange(BAG_FIRST, BAG_RC.N, rows, 1).setHorizontalAlignment('center');
  sh.getRange(BAG_FIRST, BAG_RC.DIBUAT, rows, 1).setNumberFormat('dd mmm yyyy HH:mm');
  sh.hideColumns(BAG_RC.FILEID);
  sh.setTabColor('#C9972C');
}

// ---------- Pengaturan ----------
function bagSettings_() {
  var sh = bagSheet_(bagSs_(), BAG_SH_SET), last = sh.getLastRow();
  if (last < BAG_FIRST) return [];
  var out = [];
  sh.getRange(BAG_FIRST, 1, last - BAG_FIRST + 1, 8).getValues().forEach(function (r) {
    var region = baClean_(r[0]);
    if (!region) return;
    var roles = [];
    for (var k = 0; k < 5; k++) roles.push(baClean_(r[3 + k]) || BAG_ROLES[k]);
    out.push({ region: region, key: regionKey_(region), kode: baClean_(r[1]).toUpperCase().replace(/[^A-Z0-9]/g, ''), gudang: baClean_(r[2]), roles: roles });
  });
  return out;
}

// { kunciRegion: [nama, ...] }
function bagMandors_() {
  var sh = bagSheet_(bagSs_(), BAG_SH_MAN), last = sh.getLastRow(), out = {};
  if (last < BAG_FIRST) return out;
  sh.getRange(BAG_FIRST, 1, last - BAG_FIRST + 1, 2).getValues().forEach(function (r) {
    var rg = regionKey_(r[0]), m = baClean_(r[1]);
    if (!rg || !m) return;
    (out[rg] = out[rg] || []);
    if (out[rg].indexOf(m) < 0) out[rg].push(m);
  });
  Object.keys(out).forEach(function (k) { out[k].sort(); });
  return out;
}

// Data awal formulir. scope '' = semua region (kode Admin / RPM), selain itu hanya region itu.
function bagInit_(scope) {
  var all = bagSettings_(), sk = scope ? regionKey_(scope) : '';
  var regions = all.filter(function (s) { return !sk || s.key === sk; });
  var desig = baDesigNames_();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), now = new Date();
  var man = bagMandors_(), mandors = {};
  regions.forEach(function (s) { mandors[s.key] = man[s.key] || []; });
  var known = {};
  all.forEach(function (s) { known[s.key] = true; });
  var missing = [];
  baReadDbSites_(scope).forEach(function (d) { var k = regionKey_(d.region); if (k && !known[k] && missing.indexOf(d.region) < 0) missing.push(d.region); });
  return {
    regions: regions.map(function (s) { return { region: s.region, key: s.key, kode: s.kode, gudang: s.gudang, ready: !!s.kode }; }),
    electric: desig.filter(function (x) { return BAG_ELECTRIC_RE.test(x); }),
    cw: desig.filter(function (x) { return !BAG_ELECTRIC_RE.test(x); }),
    sites: baReadDbSites_(scope),
    mandors: mandors,
    missingRegions: missing,
    scope: scope || '',
    today: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    jam: Utilities.formatDate(now, tz, 'HH:mm'),
    maxItems: BAG_MAX_ITEMS
  };
}

// ---------- Pemeriksaan isian ----------
function bagTipe_(jenis, kat) { return jenis === 'Pengembalian' ? 'IN' : (kat === 'Electric' ? 'OUT-EL' : 'OUT-CW'); }

function bagValidate_(data, settings, scope) {
  data = data || {};
  var jenis = data.jenis === 'Pengembalian' ? 'Pengembalian' : (data.jenis === 'Ambil' ? 'Ambil' : '');
  if (!jenis) throw new Error('Pilih jenis BA: Ambil atau Pengembalian.');
  var kat = '';
  if (jenis === 'Ambil') {
    kat = data.kategori === 'Electric' ? 'Electric' : (data.kategori === 'CW' ? 'CW' : '');
    if (!kat) throw new Error('Pilih kategori material untuk BA Ambil: CW atau Electric.');
  }
  var rk = regionKey_(data.region), st = null;
  settings.forEach(function (s) { if (s.key === rk) st = s; });
  if (!st) throw new Error('Region "' + baClean_(data.region) + '" belum ada di PENGATURAN BA Gudang. Minta pemilik menambahkannya.');
  if (scope && regionKey_(scope) !== st.key) throw new Error('Kode akses ini hanya untuk region ' + scope + '.');
  if (!st.kode) throw new Error('Kode Region untuk ' + st.region + ' belum diisi di PENGATURAN BA Gudang.');
  var tanggal = baClean_(data.tanggal), jam = baClean_(data.jam);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error('Tanggal BA belum diisi.');
  var jm = jam.match(/^(\d{1,2}):(\d{2})$/);
  if (!jm || +jm[1] > 23 || +jm[2] > 59) throw new Error('Jam harus berformat JJ:MM, contoh 15:43.');
  jam = ('0' + jm[1]).slice(-2) + ':' + jm[2];
  // Satu Site bisa punya beberapa baris DATA BASE dengan SOW berbeda (mis. Cluster dan Subfeeder): SOW harus dipilih.
  var site = null, key = normalizeText_(data.site), cands = [], sowWant = baNormalizeSow_(data.sow);
  baReadDbSites_(st.region).forEach(function (d) { if (normalizeText_(d.name) === key) cands.push(d); });
  if (!cands.length) throw new Error('Site "' + baClean_(data.site) + '" tidak ada di DATA BASE untuk region ' + st.region + '. Pilih dari daftar.');
  var sowList = cands.map(function (d) { return baNormalizeSow_(d.sow) || d.sow; });
  if (sowWant) {
    cands.forEach(function (d) { if (!site && (baNormalizeSow_(d.sow) || d.sow) === sowWant) site = d; });
    if (!site) throw new Error('Site "' + cands[0].name + '" tidak punya SOW ' + sowWant + ' di DATA BASE. SOW yang ada: ' + sowList.join(', ') + '.');
  } else if (cands.length === 1) site = cands[0];
  else throw new Error('Pilih SOW untuk site ini (' + sowList.join(' atau ') + ').');
  var mandor = baClean_(data.mandor).slice(0, 80);
  if (!mandor) throw new Error('Nama Mandor / Subcont belum diisi.');
  var gudang = baClean_(data.gudang).slice(0, 80) || st.gudang;
  if (!gudang) throw new Error('Nama gudang belum diisi.');

  var desigNames = baDesigNames_(), items = [], seen = {};
  (data.items || []).forEach(function (it, i) {
    it = it || {};
    var desig = baClean_(it.desig), nama = baClean_(it.nama), ket = baClean_(it.ket).slice(0, 100), qty = baQty_(it.qty);
    if (!desig && !nama && qty === null && !ket) return;
    var no = 'Baris ' + (i + 1);
    if (desig) {
      if (desigNames.indexOf(desig) < 0) throw new Error(no + ': material "' + desig + '" tidak dikenal.');
      nama = desig;
    } else if (!nama) throw new Error(no + ': pilih material atau isi nama material lain.');
    if (qty === null || !(qty > 0)) throw new Error(no + ' (' + nama + '): Qty harus lebih dari 0.');
    var isEl = !!desig && BAG_ELECTRIC_RE.test(desig);
    if (kat === 'Electric' && !isEl) throw new Error(no + ' (' + nama + '): BA Electric hanya untuk FAT, FDT, dan JC.');
    if (kat === 'CW' && isEl) throw new Error(no + ' (' + nama + '): FAT, FDT, dan JC dibuatkan BA Electric tersendiri.');
    var k = normalizeText_(nama);
    if (seen[k]) throw new Error('Material "' + nama + '" muncul dua kali; gabungkan Qty-nya dalam satu baris.');
    seen[k] = 1;
    items.push({ nama: nama.slice(0, 80), qty: qty, ket: ket, desig: desig });
  });
  if (!items.length) throw new Error('Isi minimal satu material dengan Qty lebih dari 0.');
  if (items.length > BAG_MAX_ITEMS) throw new Error('Maksimal ' + BAG_MAX_ITEMS + ' baris material per BA. Bagi menjadi dua BA.');
  var tipe = bagTipe_(jenis, kat);
  return { jenis: jenis, kategori: kat, tipe: tipe, region: st.region, kode: st.kode, roles: st.roles, tanggal: tanggal, jam: jam,
    yymm: tanggal.slice(2, 4) + tanggal.slice(5, 7), site: site.name, sow: baNormalizeSow_(site.sow) || site.sow, mandor: mandor, gudang: gudang, items: items };
}

function bagNextNo_(reg, tipe, kode, yymm) {
  var prefix = 'BA/' + tipe + '/' + kode + '/' + yymm + '/', max = 0, last = reg.getLastRow();
  if (last >= BAG_FIRST) {
    reg.getRange(BAG_FIRST, BAG_RC.NOMOR, last - BAG_FIRST + 1, 1).getValues().forEach(function (r) {
      var s = String(r[0]);
      if (s.indexOf(prefix) === 0) { var n = parseInt(s.slice(prefix.length), 10); if (n > max) max = n; }
    });
  }
  return prefix + ('00' + (max + 1)).slice(-3);
}

function bagQtyStr_(q) { return String(Math.round(q * 100) / 100).replace('.', ','); }

// ---------- PDF (Google Docs -> PDF), tata letak mengikuti template BA ----------
function bagBuildDoc_(d, nomor) {
  var doc = DocumentApp.create('TMP_' + nomor.replace(/\//g, '-'));
  var body = doc.getBody();
  body.clear();
  body.setPageWidth(595.28).setPageHeight(841.89).setMarginTop(22).setMarginBottom(16).setMarginLeft(42).setMarginRight(42);
  var base = {};
  base[DocumentApp.Attribute.FONT_FAMILY] = 'Times New Roman';
  base[DocumentApp.Attribute.FONT_SIZE] = 10;
  base[DocumentApp.Attribute.FOREGROUND_COLOR] = '#000000';
  base[DocumentApp.Attribute.BOLD] = false;
  base[DocumentApp.Attribute.ITALIC] = false;
  base[DocumentApp.Attribute.UNDERLINE] = false;
  base[DocumentApp.Attribute.LINE_SPACING] = 1;
  body.setAttributes(base);
  var CENTER = DocumentApp.HorizontalAlignment.CENTER, RIGHT = DocumentApp.HorizontalAlignment.RIGHT, LEFT = DocumentApp.HorizontalAlignment.LEFT;
  var W = 511;                                       // lebar isi halaman (poin)

  function para(text, o) {
    o = o || {};
    var p = body.appendParagraph(text);
    p.setAlignment(o.align || LEFT).setBold(!!o.bold).setItalic(!!o.italic).setUnderline(false);
    p.setSpacingBefore(o.before || 0).setSpacingAfter(o.after == null ? 0 : o.after).setLineSpacing(1);
    if (o.indent != null) p.setIndentStart(o.indent);
    p.setFontFamily('Times New Roman').setFontSize(o.size || 10).setForegroundColor('#000000');
    return p;
  }
  function cellSet(cell, text, o) {
    o = o || {};
    cell.setPaddingTop(o.pt == null ? 1 : o.pt).setPaddingBottom(o.pb == null ? 1 : o.pb).setPaddingLeft(o.pl == null ? 3 : o.pl).setPaddingRight(3);
    cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    var p = cell.getChild(0).asParagraph();
    if (text != null && String(text) !== '') p.setText(String(text));      // setText('') ditolak Docs; sel kosong dibiarkan
    p.setAlignment(o.align || LEFT).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    p.setFontFamily('Times New Roman').setFontSize(o.size || 10).setBold(!!o.bold).setItalic(false).setUnderline(false).setForegroundColor('#000000');
    return p;
  }
  var NOTE = ['*Satuan setiap material disesuaikan dengan jenis itemnya (misalnya: qty equipment, husble / roll cable dll.).',
    '*Form ini merupakan bukti sah subkontraktor untuk pencatatan material dalam proses Rollout Project MyRepublic.',
    'Semua pihak yang terlibat wajib memastikan keakuratan data.'];
  function notes(before) { NOTE.forEach(function (t, i) { para(t, { italic: true, size: 8, indent: 44, before: i === 0 ? before : 0 }); }); }

  // Kop surat
  var p0 = body.getChild(0).asParagraph();
  p0.setSpacingAfter(3).setSpacingBefore(0);
  var kop = p0.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(KOP_JPEG_B64), 'image/jpeg', 'kop.jpg'));
  kop.setWidth(Math.round(W * 4 / 3)).setHeight(Math.round(W * 4 / 3 * 255 / 1500));
  notes(4);

  para(d.jenis === 'Pengembalian' ? 'FORM PENGEMBALIAN MATERIAL' : 'FORM PENGAMBILAN MATERIAL', { align: CENTER, bold: true, size: 12, before: 10, after: 1 });
  para('Nomor BA : ' + nomor, { align: CENTER, bold: true, size: 9, after: 2 });      // bukan No. BA: pembaca BA menganggap baris berawalan No sebagai awal tabel
  var pd = para('Date : ' + rpmDateId_(d.tanggal), { align: RIGHT, bold: true, size: 11, before: 2 });
  pd.editAsText().setUnderline(7, pd.getText().length - 1, true);
  var pt = para('Time : ' + d.jam, { align: RIGHT, bold: true, size: 11, before: 3 });
  pt.editAsText().setUnderline(7, pt.getText().length - 1, true);
  para('*(Harus diisi lengkap)', { align: RIGHT, italic: true, size: 8, after: 4 });

  // Isian kepala
  var hd = body.appendTable([['Mandor / Subcont Name', ': ' + d.mandor], ['Gudang', ': ' + d.gudang], ['Jenis Pekerjaan', ': ' + d.sow], ['Site', ': ' + d.site]]);
  hd.setBorderWidth(0);
  hd.setColumnWidth(0, 150).setColumnWidth(1, 361);
  for (var r = 0; r < 4; r++) {
    cellSet(hd.getCell(r, 0), hd.getCell(r, 0).getText(), { bold: true, size: 11, pl: 0 });
    var pv = cellSet(hd.getCell(r, 1), hd.getCell(r, 1).getText(), { bold: true, size: 11 });
    pv.editAsText().setUnderline(2, pv.getText().length - 1, true);
  }
  para('', { size: 4 });

  // Tabel material
  var rowsN = Math.max(BAG_PAGE_ROWS, d.items.length);
  var data = [['No', 'Nama Material', d.jenis === 'Pengembalian' ? 'Kembali (Qty)' : 'Ambil (Qty)', 'Keterangan']];
  for (var i = 0; i < rowsN; i++) {
    var it = d.items[i];
    data.push([String(i + 1), it ? it.nama : '', it ? bagQtyStr_(it.qty) : '', it ? it.ket : '']);
  }
  var mt = body.appendTable(data);
  mt.setBorderWidth(0.5).setBorderColor('#000000');
  [34, 240, 92, 145].forEach(function (w, c) { mt.setColumnWidth(c, w); });
  for (var rr = 0; rr < data.length; rr++) {
    mt.getRow(rr).setMinimumHeight(rr === 0 ? 15 : 14);
    for (var cc = 0; cc < 4; cc++) {
      cellSet(mt.getCell(rr, cc), data[rr][cc], { align: (rr === 0 || cc === 0 || cc === 2) ? CENTER : LEFT, bold: rr === 0, size: 10 });
    }
  }
  para('', { size: 6 });

  // Tanda tangan (kotak dibiarkan kosong)
  var second = d.jenis === 'Pengembalian' ? ['Diterima Oleh', 'Dikembalikan Oleh'] : ['Dikeluarkan Oleh', 'Diambil Oleh'];
  var sg = body.appendTable([['Dibuat Oleh', 'Diperiksa Oleh', 'Disetujui'].concat(second), ['', '', '', '', ''], d.roles.slice(0, 5)]);
  sg.setBorderWidth(0.5).setBorderColor('#000000');
  for (var c2 = 0; c2 < 5; c2++) {
    sg.setColumnWidth(c2, 102);
    cellSet(sg.getCell(0, c2), sg.getCell(0, c2).getText(), { align: CENTER, size: 10 });
    cellSet(sg.getCell(1, c2), '', { align: CENTER });
    cellSet(sg.getCell(2, c2), sg.getCell(2, c2).getText(), { align: CENTER, size: 10 });
  }
  sg.getRow(1).setMinimumHeight(66);
  notes(6);
  doc.saveAndClose();
  return doc.getId();
}

// ---------- Membuat BA ----------
function bagMarkFail_(reg, rowNo, msg) {
  try {
    reg.getRange(rowNo, BAG_RC.STATUS).setValue('GAGAL');
    reg.getRange(rowNo, BAG_RC.CATATAN).setValue(String(msg).slice(0, 300));
  } catch (e) { /* abaikan */ }
}

function bagCreate_(data, scope, oleh) {
  var settings = bagSettings_();
  var d = bagValidate_(data, settings, scope);
  // Tolak BA ganda sebelum nomor dipakai dan PDF dibuat (hemat waktu, tanpa baris GAGAL)
  var baSh = getBaSheet_(), dupTz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var dupId = baFindDup_(baSh, baLayout_(baSh), dupTz, d.site, baNormalizeSow_(d.sow), d.jenis, d.jam, d.tanggal, d.tipe, baItemsSig_(d.mandor, d.items));
  if (dupId) throw new Error('BA yang persis sama (site, SOW, tanggal, jam, jenis, kategori, mandor, dan isi material) sudah ada dengan ID ' + dupId + '. Ubah jam atau isinya bila ini BA yang berbeda.');
  var ss = bagSs_(), reg = bagSheet_(ss, BAG_SH_REG);
  var dm = d.tanggal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var serial = (Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - Date.UTC(1899, 11, 30)) / 86400000;
  var nomor, rowNo;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    nomor = bagNextNo_(reg, d.tipe, d.kode, d.yymm);
    rowNo = Math.max(reg.getLastRow(), BAG_FIRST - 1) + 1;
    if (rowNo > reg.getMaxRows()) reg.insertRowsAfter(reg.getMaxRows(), 50);
    var row = [nomor, serial, d.jam, d.jenis, d.kategori || '-', d.region, d.kode, d.site, d.sow, d.mandor, d.gudang, d.items.length, '', '', '', '', new Date(), oleh || '', 'PROSES', ''];
    reg.getRange(rowNo, 1, 1, BAG_REG_HEAD.length).setValues([row]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  try {
    var docId = bagBuildDoc_(d, nomor);
    var pdf = DriveApp.getFileById(docId).getAs(MimeType.PDF);
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e0) { /* abaikan */ }
    var fileName = nomor.replace(/\//g, '-') + '.pdf';
    var b64 = Utilities.base64Encode(pdf.getBytes());
    var res = saveBa_(b64, fileName, { jenis: d.jenis, tanggal: d.tanggal, jam: d.jam, name: d.site, sow: d.sow, mandor: d.mandor, gudang: d.gudang, items: d.items, nomor: nomor });
    if (res && res.duplicate) throw new Error('BA yang persis sama (site, SOW, tanggal, jam, jenis, kategori, mandor, dan isi material) sudah ada dengan ID ' + res.idBa + '. Ubah jam atau isinya bila ini BA yang berbeda.');
    reg.getRange(rowNo, BAG_RC.IDBA).setValue(res.idBa);
    reg.getRange(rowNo, BAG_RC.FILE).setValue(fileName);
    reg.getRange(rowNo, BAG_RC.LINK).setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Buka PDF').setLinkUrl(res.fileUrl).build());
    reg.getRange(rowNo, BAG_RC.FILEID).setValue(res.fileId || '');
    reg.getRange(rowNo, BAG_RC.STATUS).setValue('OK');
    // mandor baru masuk ke daftar
    var man = bagMandors_(), list = man[regionKey_(d.region)] || [];
    if (list.indexOf(d.mandor) < 0) {
      var ms = bagSheet_(ss, BAG_SH_MAN), r0 = BAG_FIRST;
      while (baClean_(ms.getRange(r0, 2).getValue())) r0++;
      ms.getRange(r0, 1, 1, 2).setValues([[d.region, d.mandor]]);
    }
    SpreadsheetApp.flush();
    return { ok: true, nomor: nomor, idBa: res.idBa, fileName: fileName, fileUrl: res.fileUrl, fileId: res.fileId || '', pdf: b64, rows: d.items.length, region: d.region, site: d.site, sow: d.sow, jenis: d.jenis, kategori: d.kategori };
  } catch (e) {
    bagMarkFail_(reg, rowNo, e && e.message ? e.message : e);
    throw e;
  }
}

function bagHistory_(scope) {
  var reg = bagSheet_(bagSs_(), BAG_SH_REG), last = reg.getLastRow();
  if (last < BAG_FIRST) return [];
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), sk = scope ? regionKey_(scope) : '', out = [];
  reg.getRange(BAG_FIRST, 1, last - BAG_FIRST + 1, BAG_REG_HEAD.length).getValues().forEach(function (r) {
    if (r[BAG_RC.STATUS - 1] !== 'OK' || !r[BAG_RC.IDBA - 1]) return;
    if (sk && regionKey_(r[BAG_RC.REGION - 1]) !== sk) return;
    var d = r[BAG_RC.TGL - 1];
    out.push({ nomor: r[BAG_RC.NOMOR - 1], tanggal: d instanceof Date ? Utilities.formatDate(d, tz, 'dd/MM/yyyy') : String(d), jam: r[BAG_RC.JAM - 1],
      jenis: r[BAG_RC.JENIS - 1], kategori: r[BAG_RC.KAT - 1], region: r[BAG_RC.REGION - 1], site: r[BAG_RC.SITE - 1], sow: r[BAG_RC.SOW - 1], mandor: r[BAG_RC.MANDOR - 1],
      items: r[BAG_RC.N - 1], idBa: r[BAG_RC.IDBA - 1] });
  });
  return out.reverse(); // semua BA; portal membaginya per halaman
}

// Kolom "Nomor BA" di ujung kanan BA TRANSAKSI (rumus REKAP BA tidak bergeser). Aman diulang.
function setupNomorBa_() {
  var sh = getBaSheet_(), C = baLayout_(sh);
  if (C.NOMOR) return { added: false, col: C.NOMOR };
  var c = sh.getLastColumn() + 1;
  if (sh.getMaxColumns() < c) sh.insertColumnsAfter(sh.getMaxColumns(), c - sh.getMaxColumns());
  sh.getRange(1, c - 1).copyTo(sh.getRange(1, c), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(1, c).setValue('Nomor BA');
  sh.setColumnWidth(c, 190);
  SpreadsheetApp.flush();
  return { added: true, col: c };
}

// ----- Fungsi publik untuk portal (semua memeriksa kode akses dulu) -----
function getBaGudangInit(code) { requireAccess_(code); return bagInit_(scopeOf_(code)); }
function createBaGudang(code, data) {
  requireAccess_(code);
  var scope = scopeOf_(code);
  regionCheckSite_(scope, data && data.site);
  var res = bagCreate_(data, scope, roleOf_(code) === 'rpm' ? 'RPM' : (scope ? 'Region ' + scope : 'Admin'));
  logHistory_('Portal', logUser_(code), logRole_(code), 'BA Gudang (' + (res.jenis || '') + ')', (res.site || '') + ' - ' + (res.nomor || ''));
  return res;
}
function getBaGudangHistory(code) { requireAccess_(code); return bagHistory_(scopeOf_(code)); }

// ----- Fungsi pemilik -----
function setupBaGudang() { ownerOnly_(); return setupBaGudang_(); }
function setupNomorBa() { ownerOnly_(); return setupNomorBa_(); }

// Cek konsistensi data (hanya baca): (1) site SOW Cluster di DATA BASE yang kolom Month-nya kosong (Month dipakai
// sebagai sumbu waktu Baseline/Forecast Kurva S, jadi kosong berarti site itu tidak ikut terhitung); (2) centang
// kolom OPNAME di DATA BASE dibandingkan isi sebenarnya di sheet OPNAME (Name+SOW) - kolom itu centang manual,
// bukan rumus, jadi bisa saja tercentang padahal sheet OPNAME masih kosong, atau sudah ada isi tapi lupa dicentang.
function cekKonsistensiData() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var db = ss.getSheetByName('DATA BASE');
  var lr = db.getLastRow();
  if (lr < 5) { Logger.log('DATA BASE kosong.'); return { bulanKosong: [], opnameTakSesuai: [] }; }

  var lc = db.getLastColumn();
  var headerBlock = db.getRange(1, 1, 4, lc).getValues();
  function cariKolom_(re) {
    for (var r = 0; r < headerBlock.length; r++) {
      for (var c = 0; c < lc; c++) {
        if (re.test(normalizeText_(headerBlock[r][c]))) return c + 1;
      }
    }
    return 0;
  }
  var regionCol = cariKolom_(/^region$/), nameCol = cariKolom_(/^name$/), sowCol = cariKolom_(/^sow$/),
    monthCol = cariKolom_(/^month$/), opnameCol = cariKolom_(/^opname$/);
  if (!nameCol || !sowCol || !monthCol || !opnameCol) {
    throw new Error('Header DATA BASE tidak lengkap: Name=' + nameCol + ' SOW=' + sowCol + ' Month=' + monthCol + ' OPNAME=' + opnameCol);
  }

  var vals = db.getRange(5, 1, lr - 4, lc).getValues();

  // 1) Site SOW Cluster dengan Month kosong.
  var bulanKosong = [];
  vals.forEach(function (r, i) {
    var name = String(r[nameCol - 1] || '').trim(), sow = String(r[sowCol - 1] || '').trim();
    if (!name) return;
    if (normalizeText_(sow) === 'cluster' && !r[monthCol - 1]) {
      bulanKosong.push({ row: i + 5, region: r[regionCol - 1], name: name });
    }
  });

  // 2) Cocokkan centang OPNAME (DATA BASE) dengan isi baris OPNAME sebenarnya (Name+SOW), pakai cara baca header
  //    dinamis yang sama dengan boqLocate_ (header dicari di kolom Name, data mulai 2 baris setelah header).
  var opnameTakSesuai = [];
  var opSheet = ss.getSheetByName('OPNAME');
  if (opSheet) {
    var cfg = SHEET_CONFIG.OPNAME;
    var opLastCol = opSheet.getLastColumn(), opLastRow = opSheet.getLastRow();
    var opAll = opSheet.getRange(1, 1, opLastRow, opLastCol).getValues();
    var opNameIdx = cfg.nameCol - 1, opHeaderRow = -1;
    for (var r2 = 0; r2 < opAll.length; r2++) {
      var h2 = normalizeText_(opAll[r2][opNameIdx]);
      if (h2 === 'name' || h2 === 'site name') { opHeaderRow = r2; break; }
    }
    if (opHeaderRow === -1) throw new Error('Header "Name" tidak ditemukan di sheet OPNAME.');
    var opHeaders = opAll[opHeaderRow];
    var opSowIdx = cfg.sowCol - 1;
    for (var cs2 = 0; cs2 < opHeaders.length; cs2++) {
      if (/^(type\s*)?sow$/.test(normalizeText_(opHeaders[cs2]))) { opSowIdx = cs2; break; }
    }
    var opFirstDesig = Math.max(cfg.firstDesigCol, opSowIdx + 2);
    var opDataStart = opHeaderRow + 2;

    var opIndex = {};
    for (var rr = opDataStart; rr < opAll.length; rr++) {
      var opName = normalizeText_(opAll[rr][opNameIdx]), opSow = normalizeText_(opAll[rr][opSowIdx]);
      if (!opName) continue;
      var isi = false;
      for (var cc = opFirstDesig - 1; cc < opHeaders.length; cc++) {
        var v = opAll[rr][cc];
        if (typeof v === 'number' && v !== 0) { isi = true; break; }
      }
      opIndex[opName + '|' + opSow] = isi;
    }

    // SOW FWA sengaja dilewati: site FWA tidak memakai material fiber (FAT/FDT/Cable/Pole/dll di DESIGNATOR_MAP),
    // jadi kolom Designator-nya di OPNAME memang selalu kosong walau site-nya benar-benar sudah selesai - bukan
    // tanda kesalahan. Sudah dicek langsung ke sheet OPNAME (baris FWA sungguh kosong di semua kolom D:AD) supaya
    // tidak melaporkan 45 "temuan" yang sebenarnya salah alarm.
    vals.forEach(function (r, i) {
      var name = String(r[nameCol - 1] || '').trim(), sow = String(r[sowCol - 1] || '').trim();
      if (!name || normalizeText_(sow) === 'fwa') return;
      var key = normalizeText_(name) + '|' + normalizeText_(sow);
      var centang = r[opnameCol - 1] === true;
      var adaIsi = opIndex.hasOwnProperty(key) ? opIndex[key] : false;
      if (centang && !adaIsi) {
        opnameTakSesuai.push({ row: i + 5, region: r[regionCol - 1], name: name, sow: sow, masalah: 'Dicentang OPNAME tapi sheet OPNAME masih kosong' });
      } else if (!centang && adaIsi) {
        opnameTakSesuai.push({ row: i + 5, region: r[regionCol - 1], name: name, sow: sow, masalah: 'Sheet OPNAME sudah ada isi tapi belum dicentang' });
      }
    });
  }

  Logger.log('CEK KONSISTENSI DATA: ' + bulanKosong.length + ' site Cluster tanpa Month, ' + opnameTakSesuai.length + ' site centang OPNAME tidak sesuai isi. ' +
    JSON.stringify({ bulanKosong: bulanKosong, opnameTakSesuai: opnameTakSesuai }));
  return { bulanKosong: bulanKosong, opnameTakSesuai: opnameTakSesuai };
}

// Pelajari rumus REKON & CLOSING OPNAME (hanya baca isi sheet aslinya, tidak mengubah apa pun di sana).
// Hasilnya ditulis ke sheet sementara 'TMP FORMULAS' supaya bisa dibaca sekali lewat, lalu dihapus dengan hapusTmpFormulas().
function pelajariRekonClosing() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = ss.getSheetByName('TMP FORMULAS');
  if (out) ss.deleteSheet(out);
  out = ss.insertSheet('TMP FORMULAS');
  out.getRange(1, 1, 1, 4).setValues([['Sheet', 'Cell', 'Formula', 'Value']]);
  var rows = [];
  function dump(sheetName, maxRow, maxCol) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) { rows.push([sheetName, '', '(sheet tidak ditemukan)', '']); return; }
    var lr = Math.min(sh.getLastRow(), maxRow), lc = Math.min(sh.getLastColumn(), maxCol);
    if (lr < 1 || lc < 1) return;
    var forms = sh.getRange(1, 1, lr, lc).getFormulas();
    var vals = sh.getRange(1, 1, lr, lc).getValues();
    for (var r = 0; r < lr; r++) {
      for (var c = 0; c < lc; c++) {
        if (forms[r][c]) rows.push([sheetName, sh.getRange(r + 1, c + 1).getA1Notation(), "'" + forms[r][c], "'" + String(vals[r][c])]);
      }
    }
  }
  dump('CLOSING OPNAME', 45, 60);
  dump('REKON', 45, 60);
  if (rows.length) out.getRange(2, 1, rows.length, 4).setValues(rows);
  Logger.log('PELAJARI REKON/CLOSING: ' + rows.length + ' sel berisi rumus ditulis ke sheet TMP FORMULAS.');
  return rows.length;
}

function hapusTmpFormulas() {
  ownerOnly_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('TMP FORMULAS');
  if (sh) ss.deleteSheet(sh);
  Logger.log('TMP FORMULAS dihapus.');
}

// =====================================================================
// KRITIK DAN SARAN - masukan dari siapa pun yang memakai portal (semua peran), tersimpan di spreadsheet
// RPM (bukan spreadsheet utama) supaya hanya RPM/pemilik yang membacanya.
// =====================================================================
var SARAN_SH = 'KRITIK DAN SARAN';
var SARAN_HEAD = ['Tanggal', 'Jam', 'Peran', 'Nama (opsional)', 'Pesan', 'Status'];

function rpmStyleSaran_(sh) {
  var n = SARAN_HEAD.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'KRITIK DAN SARAN', 'Masukan dari pengguna portal (semua peran) - hanya tersimpan di sini, tidak masuk ke spreadsheet utama.');
  sh.getRange(2, 2).setValue('Terisi otomatis dari portal. Kolom Status boleh diubah manual (mis. Baru / Dibaca / Selesai) untuk menandai tindak lanjut.');
  rpmHeader_(sh, SARAN_HEAD);
  [95, 65, 120, 150, 480, 110].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var rows = Math.max(sh.getMaxRows() - 4, 1);
  sh.getRange(5, 1, rows, n).setVerticalAlignment('middle').setWrap(true);
  sh.getRange(5, 1, rows, 1).setNumberFormat('dd mmm yyyy').setHorizontalAlignment('center');
  sh.getRange(5, 2, rows, 1).setNumberFormat('@').setHorizontalAlignment('center');
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A5<>"";ISEVEN(ROW()))').setBackground('#FBF1D6')
      .setRanges([sh.getRange(5, 1, rows, n)]).build()
  ]);
  sh.setTabColor('#8A6A1B');
}

// Idempoten dan aman diulang: hanya menambah/menata sheet KRITIK DAN SARAN, tidak menyentuh 3 sheet RPM lainnya
// (BA PEKERJAAN, REKAP PROGRES, PENGATURAN) sama sekali.
function setupSaran_() {
  var ss = rpmSs_();
  var sh = ss.getSheetByName(SARAN_SH) || ss.insertSheet(SARAN_SH);
  rpmStyleSaran_(sh);
  SpreadsheetApp.flush();
  return { ok: true, url: ss.getUrl() };
}
function setupSaran() { ownerOnly_(); return setupSaran_(); }

// Zona waktu HP/PC pengirim: p.tzOff = menit di depan UTC (dari halaman). Tanpa tzOff (halaman lama): fallbackTz.
// -> {id: 'GMT+08:00', label: 'WITA'} untuk Utilities.formatDate dan teks yang dicatat.
var TZ_LABELS_ = { '420': 'WIB', '480': 'WITA', '540': 'WIT' };
function senderTz_(p, fallbackTz) {
  var off = p && p.tzOff !== undefined && p.tzOff !== null && p.tzOff !== '' ? Number(p.tzOff) : NaN;
  if (!(isFinite(off) && Math.abs(off) <= 840 && off % 15 === 0)) {
    var z = Utilities.formatDate(new Date(), fallbackTz || Session.getScriptTimeZone(), 'Z');   // mis. +0800
    off = (z.charAt(0) === '-' ? -1 : 1) * (Number(z.substr(1, 2)) * 60 + Number(z.substr(3, 2)));
  }
  var a = Math.abs(off), sign = off < 0 ? '-' : '+';
  var hm = ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + (a % 60)).slice(-2);
  return { id: 'GMT' + sign + hm, label: TZ_LABELS_[String(off)] || 'UTC' + sign + hm };
}

// Dipanggil portal (semua peran boleh, kode akses tetap wajib): simpan satu masukan kritik/saran ke spreadsheet RPM.
function kirimSaran(code, data) {
  requireAccess_(code);
  data = data || {};
  var pesan = String(data.pesan || '').trim();
  if (!pesan) throw new Error('Pesan tidak boleh kosong.');
  pesan = pesan.slice(0, 2000);
  var nama = String(data.nama || '').trim().slice(0, 80);
  var peran = roleOf_(code) === 'rpm' ? 'RPM' : (scopeOf_(code) ? 'Region ' + scopeOf_(code) : 'Admin');

  var ss = rpmSs_();
  var sh = ss.getSheetByName(SARAN_SH);
  if (!sh) { sh = ss.insertSheet(SARAN_SH); rpmStyleSaran_(sh); }
  var tz = senderTz_(data, ss.getSpreadsheetTimeZone()), now = new Date();
  var row = Math.max(sh.getLastRow() + 1, 5);
  sh.getRange(row, 1, 1, 6).setValues([[now, Utilities.formatDate(now, tz.id, 'HH:mm') + ' ' + tz.label, peran, nama, pesan, 'Baru']]);
  sh.getRange(row, 1).setNumberFormat('dd mmm yyyy');
  sh.getRange(row, 1, 1, 6).setVerticalAlignment('middle').setWrap(true);
  SpreadsheetApp.flush();
  // Masukan boleh tanpa nama: log hanya memakai nama yang diketik, tanpa isi pesan (isi ada di tab KRITIK DAN SARAN).
  logHistory_('Portal', nama || '(tanpa nama)', peran, 'Kirim Kritik & Saran', '');
  return { ok: true };
}


function getLogHistory(code) { requireRpm_(code); return { rows: getLogHistory_(), pemicu: ensureLogEditTrigger_() }; }

// =====================================================================
// LOG HISTORY: menu read-only (RPM) yang menampilkan siapa yang terakhir mengupdate data,
// lewat Portal (Submit BOQ/BA, BA Gudang, BA Pekerjaan RPM, Administration) atau langsung
// di Spreadsheet (edit manual sheet DATA BASE, ditangkap pemicu onEdit). Sheet LOG HISTORY
// dibuat otomatis di spreadsheet utama (bukan spreadsheet RPM, supaya onEdit tidak perlu
// membuka spreadsheet lain - simple trigger tidak diizinkan melakukan itu).
// Setelah lebih dari LOG_RESET_ROWS baris, isi log dimulai lagi dari nol (logResetIfFull_).
// =====================================================================
var LOG_SH = 'LOG HISTORY';
var LOG_HEAD = ['Waktu', 'Sumber', 'User', 'Peran', 'Aksi', 'Detail'];
var LOG_RESET_ROWS = 550;

function rpmStyleLog_(sh) {
  var n = LOG_HEAD.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  rpmBanner_(sh, n, 'LOG HISTORY', 'Riwayat aktivitas: siapa yang terakhir mengupdate data lewat Portal atau langsung di Spreadsheet.');
  sh.getRange(2, 2).setValue('Terisi otomatis. Gateway = login/logout. Portal / Portal Waspang = aksi lewat web app. Spreadsheet = edit manual di semua tab spreadsheet FTTH, Waspang, RPM BMI dan Gudang BMI.');
  rpmHeader_(sh, LOG_HEAD);
  [140, 90, 160, 90, 180, 420].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var rows = Math.max(sh.getMaxRows() - 4, 1);
  sh.getRange(5, 1, rows, n).setVerticalAlignment('middle').setWrap(true);
  sh.getRange(5, 1, rows, 1).setNumberFormat('dd mmm yyyy HH:mm');
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A5<>"";ISEVEN(ROW()))').setBackground('#FBF1D6')
      .setRanges([sh.getRange(5, 1, rows, n)]).build()
  ]);
  sh.setTabColor('#3D4F66');
}

function setupLogHistory_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SH) || ss.insertSheet(LOG_SH);
  rpmStyleLog_(sh);
  SpreadsheetApp.flush();
  return { ok: true };
}
function setupLogHistory() { ownerOnly_(); return setupLogHistory_(); }

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

// Dipanggil dari aksi Portal dan dari onEdit (Spreadsheet). Tidak boleh membuat aksi utama gagal,
// jadi kegagalan di sini dibiarkan saja (try/catch).
function logHistory_(sumber, user, peran, aksi, detail) {
  try {
    var ss = logSs_();
    var sh = ss.getSheetByName(LOG_SH);
    if (!sh) { sh = ss.insertSheet(LOG_SH); rpmStyleLog_(sh); }
    var vals = [new Date(), sumber, user || '', peran || '', aksi || '', String(detail || '').slice(0, 500)];
    // appendRow: aman bila Portal Waspang atau pemicu edit menulis di saat yang sama (tidak saling menimpa baris).
    if (sh.getLastRow() >= 4) sh.appendRow(vals); else sh.getRange(5, 1, 1, 6).setValues([vals]);
    var row = sh.getLastRow(), w = Math.min(10, row - 4);
    // Format 10 baris terakhir saja (baris lain bisa ditulis bersamaan oleh pemicu edit/portal lain).
    sh.getRange(row - w + 1, 1, w, 1).setNumberFormat('dd mmm yyyy HH:mm');
    sh.getRange(row - w + 1, 1, w, 6).setVerticalAlignment('middle').setWrap(true);
    logResetIfFull_(sh, row);
  } catch (e) { /* jangan sampai gagal mencatat log menghentikan aksi utama */ }
}

function logUser_(code) {
  var u = userByCode_(code);
  return u ? (u.nama || u.username) : '';
}
function logRole_(code) {
  var u = userByCode_(code);
  return u ? u.role : '';
}

// Email akun Google yang mengedit langsung di Spreadsheet. Kosong bila tidak terbaca.
function editorEmail_() {
  try { return Session.getActiveUser().getEmail() || '(tidak diketahui)'; } catch (e) { return '(tidak diketahui)'; }
}

// Edit satu sel: dicatat judul kolom + nilai lama -> baru. Edit banyak sel sekaligus (tempel/isi massal): dicatat ringkas.
function logEditDataBase_(e, rg, who) {
  who = who || editorEmail_();
  if (rg.getNumRows() > 1 || rg.getNumColumns() > 1) {
    logHistory_('Spreadsheet', who, '', 'Edit DATA BASE (' + rg.getNumRows() + 'x' + rg.getNumColumns() + ' sel)', rg.getA1Notation());
    return;
  }
  var sh = rg.getSheet();
  var row = rg.getRow();
  var siteName = row >= 5 ? baClean_(sh.getRange(row, 2).getValue()) : '';
  var header = sh.getRange(3, rg.getColumn()).getDisplayValue() || sh.getRange(2, rg.getColumn()).getDisplayValue() || ('kolom ' + dokLetter_(rg.getColumn()));
  var oldVal = e.oldValue !== undefined ? e.oldValue : '';
  var newVal = e.value !== undefined ? e.value : rg.getDisplayValue();
  logHistory_('Spreadsheet', who, '', 'Edit DATA BASE' + (siteName ? ' - ' + siteName : ''), header + ': "' + oldVal + '" -> "' + newVal + '"');
}

// Spreadsheet utama (tempat tab LOG HISTORY). Pemicu edit untuk spreadsheet lain berjalan dengan spreadsheet aktif = spreadsheet
// itu, jadi log selalu dibuka lewat ID. Spreadsheet Waspang milik Portal Waspang (project Apps Script terpisah).
var FTTH_SS_ID_ = '1KblZFDIcG6Jbbo6gy2Mh0vpgEzsgfUhMcwg5A5qtSME';
var WASPANG_SS_ID_ = '1ZlSlITeC9zi-m894gQYUUn4YMfP6_8B_Jtep5a33OjA';
function logSs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss && ss.getId() === FTTH_SS_ID_ ? ss : SpreadsheetApp.openById(FTTH_SS_ID_);
}

// Semua spreadsheet proyek yang edit manualnya dicatat: FTTH (semua tab kecuali LOG HISTORY), Waspang, RPM BMI, Gudang BMI.
function logEditTargets_() {
  var p = PropertiesService.getScriptProperties(), list = [{ id: FTTH_SS_ID_, name: 'FTTH' }, { id: WASPANG_SS_ID_, name: 'Waspang' }];
  if (p.getProperty('RPM_SS_ID')) list.push({ id: p.getProperty('RPM_SS_ID'), name: 'RPM BMI' });
  if (p.getProperty('BAG_SS_ID')) list.push({ id: p.getProperty('BAG_SS_ID'), name: 'Gudang BMI' });
  return list;
}

// Edit manual satu sel: tab, baris (nama site/item bila ada), judul kolom, nilai lama -> baru. Edit banyak sel sekaligus: ringkas.
// label = nama spreadsheet selain FTTH (kosong untuk FTTH). Isi kolom password/token tidak pernah ditulis ke log.
function logSheetEdit_(e, who, label) {
  var rg = e.range, sh = rg.getSheet(), tab = sh.getName();
  if (!label && tab === LOG_SH) return;
  if (!label && tab === 'DATA BASE') return logEditDataBase_(e, rg, who);
  var src = label ? tab + ' (' + label + ')' : tab;
  if (rg.getNumRows() > 1 || rg.getNumColumns() > 1) {
    logHistory_('Spreadsheet', who, '', 'Edit ' + src + ' (' + rg.getNumRows() + 'x' + rg.getNumColumns() + ' sel)', rg.getA1Notation());
    return;
  }
  var ctx = editContext_(sh, rg.getRow(), rg.getColumn());
  var oldVal = e.oldValue !== undefined ? String(e.oldValue) : '';
  var newVal = e.value !== undefined ? String(e.value) : rg.getDisplayValue();
  if (/pass|sandi|token|secret|api.?key/i.test(ctx.header)) { oldVal = oldVal ? '***' : ''; newVal = newVal ? '***' : ''; }
  logHistory_('Spreadsheet', who, '', 'Edit ' + src + (ctx.item ? ' - ' + ctx.item : ''),
    rg.getA1Notation() + (ctx.header ? ' ' + ctx.header : '') + ': "' + oldVal + '" -> "' + newVal + '"');
}

// Judul kolom dan nama baris untuk sel (r, c). Sel pilihan di atas tabel (mis. REKON "Name | <site>", "SOW | <sow>"):
// judul = label di sel kirinya. Selain itu baris judul = baris (1-6) yang memuat kolom Name/Site/Cluster Name/Username
// (atau Designator); bila tidak ada, baris 3, 4, 1, 2, 5, 6 (pola tab di spreadsheet ini). Nama baris = isi kolom tersebut.
function editContext_(sh, r, c) {
  if (r <= 6 && c > 1) {
    var left = String(sh.getRange(r, c - 1).getDisplayValue()).trim();
    if (/^(name|nama|sow|site|site name|cluster name|region|gudang)$/i.test(left)) return { header: left, item: '' };
  }
  var nr = Math.min(6, r - 1), nc = Math.min(Math.max(sh.getLastColumn(), c), 60);
  var top = nr > 0 ? sh.getRange(1, 1, nr, nc).getDisplayValues() : [];
  var cell = function (rr, cc) { return String((top[rr - 1] || [])[cc - 1] || '').trim(); };
  var nameRow = 0, nameCol = 0;
  [/^(name|site|site name|cluster name|nama site|username)$/i, /^designator$/i].some(function (re) {
    for (var hr = 1; hr <= nr; hr++) {
      for (var cc = 1; cc <= nc; cc++) if (re.test(cell(hr, cc))) { nameRow = hr; nameCol = cc; return true; }
    }
    return false;
  });
  var header = nameRow ? cell(nameRow, c) : '';
  if (!header) [3, 4, 1, 2, 5, 6].some(function (h) { if (h <= nr) header = cell(h, c); return !!header; });
  var item = nameCol && nameCol !== c ? String(sh.getRange(r, nameCol).getDisplayValue()).trim() : '';
  return { header: (header || 'kolom ' + c).slice(0, 60), item: item.slice(0, 120) };
}

// LOG HISTORY diproteksi (hanya pemilik yang boleh menulis), sedangkan onEdit biasa berjalan sebagai akun yang mengedit,
// sehingga edit dari akun Google lain gagal dicatat. Karena itu tiap spreadsheet proyek diberi pemicu "Saat diedit" (installable)
// yang berjalan sebagai pemilik. Pemicu dibuat otomatis saat RPM membuka Log History di portal (web app berjalan sebagai pemilik).
// Selama pemicu spreadsheet FTTH aktif (Script Property LOG_EDIT_TRIGGER = 1), onEdit biasa tidak ikut mencatat supaya tidak dobel.
function logEditByTrigger_() {
  try { return PropertiesService.getScriptProperties().getProperty('LOG_EDIT_TRIGGER') === '1'; } catch (e) { return false; }
}

// Dipanggil oleh pemicu edit yang dipasang, bukan langsung oleh pengguna. Email akun lain sering disembunyikan Google
// (akun Gmail berbeda), maka tampil (tidak diketahui).
function logSheetEdit(e) {
  try {
    if (!e || !e.triggerUid || !e.range || typeof e.range.getSheet !== 'function' || !e.source) return;
    var id = e.source.getId(), label = '';
    if (id !== FTTH_SS_ID_) {
      logEditTargets_().some(function (t) { if (t.id === id) label = t.name; return !!label; });
      label = label || e.source.getName();
    }
    try {
      var tabName = e.range.getSheet().getName();
      if (label === 'RPM BMI' && tabName === USERS_SHEET_NAME_) usersReset_();   // status/password langsung berlaku
      if (!label && tabName === 'DASHBOARD') CacheService.getScriptCache().remove(SCURVE_BASE_KEY_);
    } catch (x) { /* abaikan */ }
    var who = '';
    try { who = e.user ? e.user.getEmail() : ''; } catch (x) { /* abaikan */ }
    logSheetEdit_(e, who || driveLastEditor_(id) || '(tidak diketahui)', label);
  } catch (err) { /* jangan mengganggu pengetikan */ }
}

// Google tidak memberi email akun Gmail lain ke skrip. Gantinya: nama akun Google "terakhir diubah oleh" dari Google Drive.
// Data Drive sering tertinggal puluhan detik, dan tulisan LOG HISTORY dari portal (akun pemilik skrip) ikut tercatat sebagai
// perubahan terakhir. Karena itu: Drive dicek beberapa kali sampai menunjukkan perubahan pada/setelah edit ini oleh akun lain.
// Bila tertutup oleh tulisan pemilik skrip, dipakai pengedit terakhir yang dikenali di spreadsheet ini dalam 15 menit
// terakhir, diberi tanda "(perkiraan)". Hasil disimpan sebentar (1 menit) supaya ketikan beruntun
// tidak memanggil Drive dan menunggu di setiap sel.
function driveLastEditor_(ssId) {
  var cache = CacheService.getScriptCache(), key = 'lastEd_' + ssId, knownKey = 'knownEd_' + ssId;
  var t0 = Date.now() - 30000;   // waktu edit (pemicu kadang baru berjalan beberapa detik setelahnya)
  try {
    var hit = cache.get(key);
    if (hit) return hit;
    var waits = [0, 5000, 10000];
    for (var i = 0; i < waits.length; i++) {
      if (waits[i]) Utilities.sleep(waits[i]);
      var f = Drive.Files.get(ssId, { fields: 'modifiedTime,lastModifyingUser(displayName,emailAddress,me)' });
      var u = (f && f.lastModifyingUser) || {}, mt = new Date(f.modifiedTime).getTime();
      if (mt < t0) continue;                      // Drive belum memuat edit ini
      if (u.me) break;                            // tertutup tulisan portal/skrip setelah edit ini
      if (u.displayName) {
        var name = String(u.displayName) + (u.emailAddress ? ' (' + u.emailAddress + ')' : '');
        cache.put(key, name, 60);
        cache.put(knownKey, name, 900);
        return name;
      }
    }
    var known = cache.get(knownKey);
    if (known) { cache.put(key, known + ' (perkiraan)', 60); return known + ' (perkiraan)'; }
  } catch (e) { /* tetap (tidak diketahui) */ }
  return '';
}
// Nama pemicu versi 203 (hanya DATA BASE); tetap ada supaya pemicu yang sudah terpasang ikut mencatat semua tab.
function logDataBaseEdit(e) { logSheetEdit(e); }

// Pasang pemicu edit untuk tiap spreadsheet proyek yang belum punya. Hanya bila akun yang menjalankan boleh menulis tab
// LOG HISTORY. Aman diulang. Hasilnya ditampilkan di halaman Log History.
function ensureLogEditTrigger_() {
  var out = [];
  try {
    var sh = logSs_().getSheetByName(LOG_SH);
    var prot = sh ? sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).concat(sh.getProtections(SpreadsheetApp.ProtectionType.RANGE)) : null;
    if (!prot || !prot.every(function (p) { return p.canEdit(); })) {
      return [{ nama: 'Semua', ok: false, pesan: 'akun web app tidak boleh menulis tab LOG HISTORY' }];
    }
    var trig = ScriptApp.getProjectTriggers();
    logEditTargets_().forEach(function (t) {
      try {
        var ada = trig.some(function (x) {
          return (x.getHandlerFunction() === 'logSheetEdit' || x.getHandlerFunction() === 'logDataBaseEdit') && x.getTriggerSourceId() === t.id;
        });
        if (!ada) ScriptApp.newTrigger('logSheetEdit').forSpreadsheet(t.id).onEdit().create();
        out.push({ nama: t.name, ok: true });
      } catch (err) { out.push({ nama: t.name, ok: false, pesan: String(err && err.message || err) }); }
    });
    var props = PropertiesService.getScriptProperties();
    if (out[0] && out[0].ok && props.getProperty('LOG_EDIT_TRIGGER') !== '1') props.setProperty('LOG_EDIT_TRIGGER', '1');
  } catch (err) { out.push({ nama: 'Pemicu', ok: false, pesan: String(err && err.message || err) }); }
  return out;
}

function getLogHistory_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SH);
  if (!sh || sh.getLastRow() < 5) return [];
  var tz = ss.getSpreadsheetTimeZone();
  var vals = sh.getRange(5, 1, sh.getLastRow() - 4, 6).getValues();
  var out = [];
  vals.forEach(function (r) {
    if (!r[0]) return;
    var w = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'dd/MM/yyyy HH:mm') : String(r[0]);
    out.push({ waktu: w, ms: r[0] instanceof Date ? r[0].getTime() : 0, sumber: r[1], user: r[2], peran: r[3], aksi: r[4], detail: r[5] });
  });
  return out.slice(-200).reverse();
}
// =====================================================================
// CHECKPOINT PROYEK (portal, 28 Sep 2026) -- ringkasan status tiap site dari data yang SUDAH ADA
// di DATA BASE (Permit Status, SNDK/APD/PRA-ABD/ABD, Implementation Status, OPNAME, BA CLOSING).
// Read-only: tidak menulis apa pun ke spreadsheet, tidak ada kolom/sheet baru. ATP dan RECTI
// hanya info tambahan di detail (banyak site datanya kosong karena memang tidak semua site
// melalui tahap ini, jadi tidak dihitung sebagai 'Belum').
// =====================================================================
function checkpointStageStatus_(kind, value) {
  var v = baClean_(value);
  if (kind === 'bool') return value === true ? 'done' : 'pending';
  if (kind === 'permit') {
    if (!v) return 'pending';
    return v === 'Approved' ? 'done' : 'progress';
  }
  if (kind === 'impl') {
    if (!v) return 'pending';
    if (v.indexOf('RFS') > -1) return 'done';
    if (v.indexOf('On Going') > -1) return 'progress';
    if (v.indexOf('Drop') > -1) return 'drop';
    return 'pending';
  }
  return 'pending';
}
function checkpointDrawingStatus_(sndk, apd, pra, abd) {
  var vals = [sndk, apd, pra, abd].map(baClean_);
  var n = vals.filter(function (x) { return x === 'Done'; }).length;
  if (n === 4) return 'done';
  if (n === 0) return 'pending';
  return 'progress';
}
function checkpointOverall_(stages) {
  if (stages.instalasi === 'drop') return 'drop';
  var vals = [stages.permit, stages.drawing, stages.instalasi, stages.atp, stages.recti, stages.opname, stages.baClosing];
  if (vals.every(function (v) { return v === 'done'; })) return 'done';
  if (vals.some(function (v) { return v === 'done' || v === 'progress'; })) return 'progress';
  return 'pending';
}
function checkpointRangeStatus_(status, start, end) {
  if (end) return 'done';
  if (start) return 'progress';
  if (baClean_(status)) return 'progress';
  return 'pending';
}
function checkpointDateStr_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd MMM yyyy');
  }
  return baClean_(v);
}
function checkpointMonth_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'MMMM yyyy');
  }
  return baClean_(v);
}
// Jumlah baris DATA BASE (mulai baris 5) sampai baris terakhir yang kolom cols-nya (nomor kolom, 1 = A) berisi.
// Rumus per-baris membuat getLastRow() selalu ~1000, padahal site yang terisi jauh lebih sedikit; Beranda cukup membaca yang terisi.
function dbFilledCount_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 5) return 0;
  var n = 0;
  cols.forEach(function (c) {
    var v = sh.getRange(5, c, last - 4, 1).getValues();
    for (var i = v.length - 1; i >= n; i--) if (String(v[i][0]).trim()) { n = i + 1; break; }
  });
  return n;
}
function getCheckpointData_(scope) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DATA BASE');
  if (!sh || sh.getLastRow() < 5) return [];
  var n = dbFilledCount_(sh, [1, 2]);
  if (!n) return [];
  var vals = sh.getRange(5, 1, n, 32).getValues(); // A..AF
  var rk = scope ? regionKey_(scope) : '';
  var lastEdit = {};
  var logSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SH);
  if (logSh && logSh.getLastRow() >= 5) {
    logSh.getRange(5, 1, logSh.getLastRow() - 4, 5).getValues().forEach(function (lr) {
      var aksi = String(lr[4] || '');
      if (aksi.indexOf('Edit DATA BASE - ') !== 0) return;
      var nm = baClean_(aksi.substring('Edit DATA BASE - '.length));
      var t = lr[0] instanceof Date ? lr[0].getTime() : 0;
      if (nm && t > (lastEdit[nm] || 0)) lastEdit[nm] = t;
    });
  }
  var out = [];
  vals.forEach(function (r) {
    var name = baClean_(r[1]);
    if (!name) return;
    if (rk && regionKey_(r[0]) !== rk) return;
    var stages = {
      permit: checkpointStageStatus_('permit', r[5]),
      drawing: checkpointDrawingStatus_(r[15], r[17], r[18], r[19]),
      instalasi: checkpointStageStatus_('impl', r[21]),
      atp: checkpointRangeStatus_(r[24], r[25], r[26]),
      recti: checkpointRangeStatus_(r[27], r[28], r[29]),
      opname: checkpointStageStatus_('bool', r[30]),
      baClosing: checkpointStageStatus_('bool', r[31])
    };
    out.push({
      region: baClean_(r[0]),
      name: name,
      sow: baClean_(r[2]),
      month: checkpointMonth_(r[3]),
      updatedAt: lastEdit[name] || 0,
      stages: stages,
      overall: checkpointOverall_(stages),
      detail: {
        permitStatus: baClean_(r[5]),
        statusDokumen: baClean_(r[14]),
        sndk: baClean_(r[15]), apd: baClean_(r[17]), praAbd: baClean_(r[18]), abd: baClean_(r[19]),
        implementationStatus: baClean_(r[21]),
        atpStatus: baClean_(r[24]), atpStart: checkpointDateStr_(r[25]), atpEnd: checkpointDateStr_(r[26]),
        rectiStatus: baClean_(r[27]), rectiStart: checkpointDateStr_(r[28]), rectiEnd: checkpointDateStr_(r[29])
      }
    });
  });
  return out;
}
function getCheckpointData(code) { requireAccess_(code); return getCheckpointData_(scopeOf_(code)); }

/* Kurva S per region untuk Beranda (semua peran, sesuai area akun). Sumber: DATA BASE, SOW Cluster, HP RFS per bulan. */
function getSCurveData(code) {
  try {
    return buildSCurveData_(code);
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

// Nilai "Baseline HP per bulan" di DASHBOARD disimpan 10 menit ('0' = tidak ada, pakai 1000); dihapus saat DASHBOARD diedit.
var SCURVE_BASE_KEY_ = 'scurveBaseline_v1';
function buildSCurveData_(code) {
  requireAccess_(code);
  var rkScope = regionKey_(scopeOf_(code));   // akses region: hanya region itu (kosong = semua region)
  var tz = Session.getScriptTimeZone();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var db = ss.getSheetByName('DATA BASE');
  if (!db) throw new Error('Sheet DATA BASE tidak ditemukan.');
  var lastRow = db.getLastRow();
  var lastCol = db.getLastColumn();
  var res = { months: [], labels: [], current: -1, targetPerRegion: 1000, targetFromSheet: false, regions: [], updated: '' };
  if (lastRow < 5) return res;

  var head = db.getRange(1, 1, 4, lastCol).getValues();
  var col = {};
  for (var r = 0; r < head.length; r++) {
    for (var c = 0; c < lastCol; c++) {
      var h = String(head[r][c]).trim().toLowerCase();
      if (h === 'region' && col.region === undefined) col.region = c;
      if (h === 'sow' && col.sow === undefined) col.sow = c;
      if ((h === 'month' || h === 'bulan') && col.month === undefined) col.month = c;
      if (h === 'hp rfs' && col.hp === undefined) col.hp = c;
      if (h === 'name' && col.name === undefined) col.name = c;
      if (h === 'permit status' && col.permit === undefined) col.permit = c;
      if (h === 'implementation status' && col.impl === undefined) col.impl = c;
      if (h === 'ba closing' && col.ba === undefined) col.ba = c;
    }
  }
  if (col.region === undefined || col.sow === undefined || col.month === undefined || col.hp === undefined) {
    throw new Error('Kolom Region, SOW, Month, atau HP RFS tidak ditemukan di DATA BASE.');
  }

  var nRows = dbFilledCount_(db, [col.region + 1].concat(col.name !== undefined ? [col.name + 1] : []));
  if (!nRows) return res;
  var rows = db.getRange(5, 1, nRows, lastCol).getValues();
  var regions = [];
  var hpByRegion = {};
  var startKey = '';
  for (var i = 0; i < rows.length; i++) {
    var region = String(rows[i][col.region]).trim();
    if (!region) continue;
    if (rkScope && regionKey_(region) !== rkScope) continue;
    if (!hpByRegion.hasOwnProperty(region)) {
      hpByRegion[region] = {};
      regions.push(region);
    }
    if (String(rows[i][col.sow]).trim().toLowerCase() !== 'cluster') continue;
    var m = rows[i][col.month];
    if (!(m instanceof Date)) continue;
    var key = Utilities.formatDate(m, tz, 'yyyy-MM');
    if (!startKey || key < startKey) startKey = key;
    hpByRegion[region][key] = (hpByRegion[region][key] || 0) + (Number(rows[i][col.hp]) || 0);
  }
  if (!startKey) return res;

  var sy = Number(startKey.slice(0, 4));
  var sm = Number(startKey.slice(5, 7));
  var namaBulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var nowKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  for (var k = 0; k < 12; k++) {
    var d = new Date(sy, sm - 1 + k, 1);
    var mk = Utilities.formatDate(d, tz, 'yyyy-MM');
    res.months.push(mk);
    res.labels.push(namaBulan[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
    if (mk <= nowKey) res.current = k;
  }

  // Baseline per region per bulan diambil dari sel "Baseline HP per bulan" di DASHBOARD (default 1000)
  var cache = CacheService.getScriptCache(), base = null;
  try { base = cache.get(SCURVE_BASE_KEY_); } catch (e) { base = null; }
  var dash = base ? null : ss.getSheetByName('DASHBOARD');
  if (base && Number(base) > 0) { res.targetPerRegion = Number(base); res.targetFromSheet = true; }
  if (dash) {
    var dv = dash.getDataRange().getValues();
    for (var a = 0; a < dv.length && !res.targetFromSheet; a++) {
      for (var b = 0; b < dv[a].length - 1; b++) {
        if (String(dv[a][b]).trim().toLowerCase().indexOf('baseline hp per bulan') === 0 && Number(dv[a][b + 1]) > 0) {
          res.targetPerRegion = Number(dv[a][b + 1]);
          res.targetFromSheet = true;
          break;
        }
      }
    }
    try { cache.put(SCURVE_BASE_KEY_, res.targetFromSheet ? String(res.targetPerRegion) : '0', 600); } catch (e) { /* tanpa cache */ }
  }

  for (var g = 0; g < regions.length; g++) {
    var cum = [];
    var acc = 0;
    for (var j = 0; j < 12; j++) {
      if (j <= res.current) {
        acc += hpByRegion[regions[g]][res.months[j]] || 0;
        cum.push(acc);
      } else {
        cum.push(null);
      }
    }
    res.regions.push({ name: regions[g], cum: cum });
  }
  // Persentase per region untuk label di atas batang (Permit Approved, RFS, BA Closing dibagi total site)
  if (col.name !== undefined && col.permit !== undefined && col.impl !== undefined && col.ba !== undefined) {
    var pctRaw = {};
    for (var q = 0; q < rows.length; q++) {
      var rg = String(rows[q][col.region]).trim();
      if (!rg || !String(rows[q][col.name]).trim()) continue;
      if (rkScope && regionKey_(rg) !== rkScope) continue;
      if (!pctRaw.hasOwnProperty(rg)) pctRaw[rg] = { total: 0, permit: 0, inst: 0, ba: 0 };
      pctRaw[rg].total++;
      if (String(rows[q][col.permit]).trim().toLowerCase() === 'approved') pctRaw[rg].permit++;
      if (String(rows[q][col.impl]).trim().toLowerCase() === 'rfs') pctRaw[rg].inst++;
      if (rows[q][col.ba] === true || String(rows[q][col.ba]).trim().toLowerCase() === 'true') pctRaw[rg].ba++;
    }
    res.areaPct = {};
    Object.keys(pctRaw).forEach(function (rg) {
      var x = pctRaw[rg];
      res.areaPct[rg] = {
        total: x.total,
        permitPct: Math.round(x.permit / x.total * 100),
        instPct: Math.round(x.inst / x.total * 100),
        baPct: Math.round(x.ba / x.total * 100)
      };
    });
  }
  // Daftar site untuk pop-up "Perlu Perhatian": permit belum Approved dan instalasi On Going
  if (col.name !== undefined && col.permit !== undefined && col.impl !== undefined) {
    res.alertSites = { permit: [], inst: [] };
    for (var z = 0; z < rows.length; z++) {
      var nmz = String(rows[z][col.name]).trim();
      if (!nmz) continue;
      if (rkScope && regionKey_(String(rows[z][col.region]).trim()) !== rkScope) continue;
      var pz = String(rows[z][col.permit]).trim();
      var iz = String(rows[z][col.impl]).trim();
      var rgz = String(rows[z][col.region]).trim();
      var sowz = String(rows[z][col.sow]).trim();
      if (pz.toLowerCase() !== 'approved') res.alertSites.permit.push({ name: nmz, region: rgz, sow: sowz, status: pz || 'Belum ada status permit' });
      if (iz && iz.toLowerCase() !== 'rfs' && iz.toLowerCase() !== 'drop' && iz.toLowerCase().indexOf('belum') < 0) res.alertSites.inst.push({ name: nmz, region: rgz, sow: sowz, status: iz });
    }
  }
  res.updated = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
  res.updatedMs = Date.now();   // halaman menampilkannya dengan jam perangkat pengguna
  return res;
}
// =====================================================================
// BUAT BOQ: volume yang diisi di portal -> file BOQ .xlsx dari template per SOW (kebalikan Submit BOQ).
// Template = BOQ plan satu SOW (sheet Summary, BoQ, dan BoM), disimpan sebagai Google Sheet "TEMPLATE BOQ - <SOW>"
// di folder Drive BOQ_TPL_FOLDER_NAME. Volume diisi ke sheet BoM (rute kabel per Line, FAT, tiang, strand, dst.),
// sheet BoQ mengikuti rumusnya. Semua sheet tetap ada di file hasil. Rumus BoM disamakan saat template dipasang (boqGenBomStd_).
// =====================================================================
var BOQ_GEN_SOWS = ['Cluster', 'Subfeeder', 'Mainfeeder', 'Hubfeeder', 'Uplink', 'FWA'];
var BOQ_TPL_FOLDER_NAME = 'Template BOQ Portal BMI v3';   // v3: template berbasis BoM, rumus ditulis dengan lokal en_US (folder lama tidak dipakai lagi)
var BOQ_OUT_FOLDER_NAME = 'BOQ Dibuat Portal BMI';
var BOQ_TPL_PREFIX = 'TEMPLATE BOQ - ';
var BOQ_GEN_REF_ = /^=\s*\$?[DE]\$?\d+\s*$/i;   // Qty yang hanya menyalin sel lain di baris BoQ (mis. Material = Service baris bawah)

function boqFolder_(prop, name) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(prop);
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* buat ulang */ }
  }
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty(prop, folder.getId());
  return folder;
}
function boqTplFolder_() { return boqFolder_('BOQ_TPL3_FOLDER_ID', BOQ_TPL_FOLDER_NAME); }
function boqOutFolder_() { return boqFolder_('BOQ_OUT_FOLDER_ID', BOQ_OUT_FOLDER_NAME); }

function boqGenSow_(sow) {
  var k = normalizeText_(sow).replace(/\s+/g, '');
  for (var i = 0; i < BOQ_GEN_SOWS.length; i++) if (BOQ_GEN_SOWS[i].toLowerCase() === k) return BOQ_GEN_SOWS[i];
  throw new Error('SOW "' + String(sow || '') + '" tidak dikenal.');
}

// Template terbaru per SOW: { Cluster: File, ... } (hanya Google Sheet bernama persis "TEMPLATE BOQ - <SOW>").
function boqTplFiles_() {
  var out = {}, it = boqTplFolder_().getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var nm = normalizeText_(f.getName());
    BOQ_GEN_SOWS.forEach(function (s) {
      if (nm !== normalizeText_(BOQ_TPL_PREFIX + s)) return;
      if (!out[s] || f.getLastUpdated() > out[s].getLastUpdated()) out[s] = f;
    });
  }
  return out;
}

// Baca sheet BoQ: posisi isian kepala (OLT, Cluster, Net Type, HP, AS PLAN/AS BUILT) dan sel Qty yang bisa diisi:
//  - 'bom'   : rumus dari sheet BoM (volume desain site asal template)
//  - 'rumus' : rumus lain (mis. RT/RW Permit), dipertahankan bila angkanya tidak diubah
//  - 'angka' : angka tetap (1 untuk item ls dipakai sebagai isian awal, angka lain dianggap milik site asal)
//  - 'kosong': Qty kosong tapi baris punya rumus harga, jadi masih bisa diisi
// Template awal per SOW dari file proyek Apps Script BoqTemplateAwal<SOW>.html berisi JSON { name, data(base64 xlsx) }.
// File itu hanya ada di proyek Apps Script (tidak di repo publik karena berisi BOQ proyek). Dipakai sekali saat SOW belum punya template.
// Satu tanda per SOW (bukan kunci skrip) supaya SOW lain tidak ikut menunggu; permintaan kedua untuk SOW yang sama
// mendapat pesan "sedang disiapkan" dan halaman mencoba lagi sendiri.
function boqTplSeed_(sow) {
  var seed;
  try { seed = JSON.parse(HtmlService.createHtmlOutputFromFile('BoqTemplateAwal' + sow).getContent()); } catch (e) { return null; }
  if (!seed || !seed.data) return null;
  var cache = CacheService.getScriptCache(), key = 'boqseed3_' + sow;
  if (cache.get(key)) throw new Error('Template BOQ ' + sow + ' sedang disiapkan (pemakaian pertama). Tunggu sebentar.');
  cache.put(key, '1', 300);
  try {
    var have = boqTplFiles_()[sow];
    if (have) return have;
    return DriveApp.getFileById(boqGenSetTemplate_(sow, seed.data, seed.name).id);   // langsung dari id: daftar folder Drive bisa terlambat
  } finally { cache.remove(key); }
}
// Daftar template per SOW disimpan 10 menit di cache supaya ganti SOW tidak membaca folder Drive tiap kali.
function boqTplList_() {
  var cache = CacheService.getScriptCache(), hit = null;
  try { hit = JSON.parse(cache.get('boqtpl3_list') || 'null'); } catch (e) { hit = null; }
  if (hit) return hit;
  var out = {}, files = boqTplFiles_();
  Object.keys(files).forEach(function (s) { out[s] = boqTplMeta_(files[s]); });
  try { cache.put('boqtpl3_list', JSON.stringify(out), 600); } catch (e) { /* tanpa cache */ }
  return out;
}
function boqTplMeta_(f) { return { id: f.getId(), name: f.getName(), desc: f.getDescription() || '', upd: f.getLastUpdated().getTime() }; }
function boqTplListReset_() { try { CacheService.getScriptCache().remove('boqtpl3_list'); } catch (e) { /* abaikan */ } }
function boqTplFile_(sow) {
  var m = boqTplList_()[sow];
  if (m) { try { var f = DriveApp.getFileById(m.id); if (!f.isTrashed()) return f; } catch (e) { /* template dihapus */ } boqTplListReset_(); }
  return boqTplFiles_()[sow] || boqTplSeed_(sow);
}

function boqGenParse_(sh) {
  var n = sh.getLastRow();
  var rng = sh.getRange(1, 1, n, 17);
  var f = rng.getFormulas(), v = rng.getValues();
  var hdr = -1, r, c;
  for (r = 0; r < Math.min(15, n); r++) if (/^description/i.test(String(v[r][1]).trim())) { hdr = r; break; }
  if (hdr < 0) throw new Error('Judul kolom "Description/Item" tidak ditemukan di sheet ' + sh.getName() + '.');
  var head = { status: [] };
  for (r = 0; r < hdr; r++) {
    var lab = normalizeText_(v[r][13]);
    var key = /^olt/.test(lab) ? 'olt' : /^cluster/.test(lab) ? 'cluster' : /^net/.test(lab) ? 'net' : lab === 'hp' ? 'hp' : '';
    if (key && !head[key]) head[key] = { r: r + 1, c: 15, val: f[r][14] ? '' : String(v[r][14]).trim() };
    for (c = 0; c < 17; c++) {
      if (!f[r][c] && /^\s*as\s*(plan|built)\s*$/i.test(String(v[r][c]))) head.status.push({ r: r + 1, c: c + 1, upper: String(v[r][c]) === String(v[r][c]).toUpperCase() });
    }
  }
  var items = [], sec = '';
  function remark(r) { return String(v[r][15]).trim().toLowerCase(); }
  function add(r, c, kind, labelRow, twin) {
    var label = String(v[labelRow][1]).trim() || String(v[r][1]).trim();
    var def = '';
    if (kind === 'rumus' && typeof v[r][c] === 'number') def = v[r][c];
    if (kind === 'angka' && v[r][c] === 1) def = 1;
    var it = { k: 'DE'.charAt(c - 3) + (r + 1), r: r + 1, c: c + 1, src: labelRow + 1, label: label, unit: String(v[r][2]).trim(), sec: sec, def: def, kind: kind };
    if (twin) it.twin = { r: twin.r + 1, c: twin.c + 1 };   // Qty Material baris atas ikut diisi angka yang sama
    items.push(it);
  }
  for (r = hdr + 1; r < n; r++) {
    var b = String(v[r][1]).trim(), unit = String(v[r][2]).trim();
    if (!unit) { if (b) sec = b; continue; }
    var got = 0;
    for (c = 3; c <= 4; c++) {
      var fo = f[r][c], val = v[r][c];
      // Baris Service yang Qty Material di atasnya menyalin sel ini: tampilkan nama materialnya
      var lr = (c === 4 && r > 0 && new RegExp('^=\\s*\\$?E\\$?' + (r + 1) + '\\s*$', 'i').test(f[r - 1][3])) ? r - 1 : r;
      if (fo) { if (BOQ_GEN_REF_.test(fo)) continue; add(r, c, /bom/i.test(fo) ? 'bom' : 'rumus', lr); got++; }
      else if (typeof val === 'number') { add(r, c, 'angka', lr); got++; }
    }
    if (got === 2) { items[items.length - 2].label += ' (Material)'; items[items.length - 1].label += ' (Jasa)'; }
    if (got || BOQ_GEN_REF_.test(f[r][3]) || BOQ_GEN_REF_.test(f[r][4])) continue;
    if (!f[r][7] && !f[r][8]) continue;   // tanpa rumus harga: baris tidak dipakai di template ini
    var nx = r + 1;
    // Pasangan Material + Instal yang Qty-nya sama-sama kosong: satu isian untuk keduanya
    if (remark(r) !== 'service' && nx < n && remark(nx) === 'service' && String(v[nx][2]).trim() &&
        !f[nx][3] && !f[nx][4] && v[nx][3] === '' && v[nx][4] === '' && (f[nx][7] || f[nx][8])) {
      add(nx, 4, 'kosong', r, { r: r, c: 3 });
      r = nx;
      continue;
    }
    add(r, remark(r) === 'service' ? 4 : 3, 'kosong', r);
  }
  return { hdr: hdr + 1, head: head, items: items };
}

// ---- Sheet BoM: semua isian BOQ masuk ke sini, sheet BoQ mengikuti rumusnya (seperti BOQ plan yang dibuat manual). ----
function boqGenBomSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) if (/^bom/i.test(sheets[i].getName().trim())) return sheets[i];
  return null;
}
function boqColN_(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
function boqColA_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
function boqA1_(r, c) { return boqColA_(c) + r; }
// Rujukan sel dalam rumus: [{sheet, r1, c1, r2, c2}]; sheet '' = sheet yang sama.
function boqRefs_(fo) {
  var out = [], re = /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?(?<![\w.$])\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])/g, m;
  var s = String(fo || '').replace(/"[^"]*"/g, '""');
  while ((m = re.exec(s))) {
    var r1 = +m[4], c1 = boqColN_(m[3]), r2 = m[6] ? +m[6] : r1, c2 = m[5] ? boqColN_(m[5]) : c1;
    out.push({ sheet: m[1] ? m[1].replace(/''/g, "'") : (m[2] || ''), r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) });
  }
  return out;
}

// Baca sheet BoM sekali: teks, rumus, dan kelompok baris per blok (blok kiri mulai kolom A; blok "BoM - Main/Hub/Sub Feeder" di kanan).
function boqGenBomRead_(bom) {
  var rg = bom.getDataRange(), v = rg.getValues(), f = rg.getFormulas(), nr = v.length, nc = nr ? v[0].length : 0;
  var starts = [1];
  for (var c = 2; c <= nc; c++) if (/^bom\b/i.test(String(v[0][c - 1]).trim())) starts.push(c);
  var blocks = starts.map(function (g, i) {
    var end = i + 1 < starts.length ? starts[i + 1] - 1 : nc, lines = [];
    for (var c = g + 3; c <= end; c++) if (/^(line\s*[a-z]|fdt\s*\d+)$/i.test(String(v[0][c - 1]).trim())) lines.push({ c: c, name: String(v[0][c - 1]).trim() });
    var grp = [], cur = '';
    for (var r = 1; r <= nr; r++) {
      var t = String(v[r - 1][g - 1]).trim();
      if (r > 1 && t && !f[r - 1][g - 1]) cur = t;
      grp.push(cur);
    }
    return { g: g, end: end, lab: g + 1, qty: g + 2, unit: g + 3, lines: lines, grp: grp };
  });
  return { sh: bom, name: bom.getName(), v: v, f: f, nr: nr, nc: nc, blocks: blocks };
}
function boqGenTxt_(b, r, c) { return String(b.v[r - 1][c - 1] || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
// Baris-baris satu kelompok (teks kolom kelompok), mulai kemunculan pertama.
function boqGenGrp_(b, blk, re) {
  var out = [], on = false;
  for (var r = 2; r <= b.nr; r++) {
    var g = String(blk.grp[r - 1]).toLowerCase(), first = String(b.v[r - 1][blk.g - 1]).trim() && !b.f[r - 1][blk.g - 1];
    if (on && first) break;
    if (!on && first && re.test(g)) on = true;
    if (on) out.push(r);
  }
  return out;
}
function boqGenRow_(b, blk, rows, re) {
  for (var i = 0; i < rows.length; i++) if (re.test(boqGenTxt_(b, rows[i], blk.lab))) return rows[i];
  return 0;
}
function boqGenRowAll_(b, blk, re) {
  for (var r = 2; r <= b.nr; r++) if (re.test(boqGenTxt_(b, r, blk.lab))) return r;
  return 0;
}

// Samakan rumus BoM dengan BOQ plan standar (dipakai saat template dipasang). Isian desain dikosongkan.
//  Cluster: kabel = (rute + slack FAT/FDT x 20 m) x 1,05; Label Cable = 10% jumlah tiang (dibulatkan ke atas);
//           Label FDT/FAT = jumlah FDT/FAT; Testcomm FDT-FAT dan splicing = jumlah FAT; Survey = kabel + strand; PM = Survey.
//  Feeder : kabel = (rute + coil x 20 m) x 1,05, coil = rute/400 + 1; Label Cable = panjang kabel / 46,5 m (rata-rata 64 BOQ).
//  Semua SOW: aksesoris (holder, plate belt, suspension, buldog grip, pole clamp, dead end) diisi sendiri lewat Item BoM;
//           Bahan Pondasi tiang = jumlah tiang baru.
// Rumus ditulis dengan pemisah koma dan titik desimal, jadi spreadsheet harus berlokal en_US (lihat boqGenSetTemplate_).
var BOQ_ACC_KEYS_ = [/cable loop holder/, /plate belt/, /suspension clamp/, /bul+dog grip/, /pole clamp single/, /clamps? dead end|clamp buaya/, /pondasi/];
var BOQ_ACC_INPUT_ = /cable loop holder|plate belt|suspension clamp|bul+dog grip|pole clamp single|clamps? dead end|clamp buaya/;
function boqGenBomStd_(ss, boqSh) {
  var bom = boqGenBomSheet_(ss);
  if (!bom) return 0;
  var b = boqGenBomRead_(bom), set = {}, n = 0;
  function put(r, c, fo) { if (r && c) set[r + ':' + c] = { r: r, c: c, f: fo }; }
  function accInput(blk, cols) {   // fo '' = sel dikosongkan jadi isian
    boqGenGrp_(b, blk, /^accessoris/).forEach(function (r) {
      if (BOQ_ACC_INPUT_.test(boqGenTxt_(b, r, blk.lab))) cols.forEach(function (c) { put(r, c, ''); });
    });
  }
  b.blocks.forEach(function (blk) {
    var X = function (r, c) { return boqA1_(r, c); };
    var fat = boqGenGrp_(b, blk, /^total fat\b/);
    if (fat.length) {   // blok Cluster
      var cols = blk.lines.length ? blk.lines.map(function (l) { return l.c; }) : [blk.qty];
      var rute = boqGenGrp_(b, blk, /^total rute\b/).filter(function (r) { return /\d+c/.test(boqGenTxt_(b, r, blk.lab)); });
      var kab = boqGenGrp_(b, blk, /^total panjang kabel\b/);
      var sFdt = boqGenGrp_(b, blk, /^total slack di fdt/), sFat = boqGenGrp_(b, blk, /^total slack di fat/);
      var fdt = boqGenGrp_(b, blk, /^total fdt\b/), pole = boqGenGrp_(b, blk, /^pole\b/);
      var lab = boqGenGrp_(b, blk, /^label$/), acc = boqGenGrp_(b, blk, /^accessoris/), spl = boqGenGrp_(b, blk, /^splicing/);
      var newPole = pole.filter(function (r) { return boqGenTxt_(b, r, blk.lab) && !/^existing/.test(boqGenTxt_(b, r, blk.lab)); });
      var strand = boqGenRowAll_(b, blk, /rute strand wire/), strandTol = boqGenRowAll_(b, blk, /panjang strand wire/);
      var totKab = boqGenGrp_(b, blk, /^total panjang cable/)[0];
      var fat18 = boqGenRowAll_(b, blk, /^fat 1:8/), mod = boqGenRowAll_(b, blk, /^modular 1:8/);
      var pond = boqGenRow_(b, blk, acc, /pondasi/);
      var tFat = boqGenGrp_(b, blk, /testcom fat/)[0], surv = boqGenGrp_(b, blk, /^survey/)[0], pm = boqGenGrp_(b, blk, /^project management/)[0];
      var gal = boqGenGrp_(b, blk, /^pekerjaan galian/), tol = boqGenGrp_(b, blk, /^toleransi/), sock = boqGenGrp_(b, blk, /^socket hdpe/);
      var h32 = boqGenRow_(b, blk, gal, /hdpe 32/), h40 = boqGenRow_(b, blk, gal, /hdpe 40/);
      var t32 = boqGenRow_(b, blk, tol, /hdpe 32/), t40 = boqGenRow_(b, blk, tol, /hdpe 40/);
      var k32 = boqGenRow_(b, blk, sock, /32/), k40 = boqGenRow_(b, blk, sock, /40/);
      var tamb = boqGenGrp_(b, blk, /^tambang/)[0], tee = boqGenGrp_(b, blk, /^large ra/);
      cols.forEach(function (c) {
        var L = function (r) { return X(r, c); }, sum = function (rs) { return rs.length ? 'SUM(' + L(rs[0]) + ':' + L(rs[rs.length - 1]) + ')' : '0'; };
        if (rute.length === kab.length && sFdt.length === 4 && sFat.length === 4) kab.forEach(function (r, i) {
          var k = i % 4;
          put(r, c, '=IF(' + L(rute[i]) + '=0,0,ROUNDUP((' + L(rute[i]) + '+(' + L(sFat[k]) + '+' + L(sFdt[k]) + ')*20)*1.05,0))');
        });
        if (totKab && kab.length) put(totKab, c, '=' + sum(kab));
        if (strandTol && strand) put(strandTol, c, '=ROUNDUP(' + L(strand) + '*1.05,0)');
        if (fat18) put(fat18, c, '=' + sum(fat));
        if (mod && fat18) put(mod, c, '=ROUNDUP(' + L(fat18) + '/8,0)');
        fat.forEach(function (r, i) {
          if (sFdt[i]) put(sFdt[i], c, '=IF(' + L(r) + '>=1,1,0)');
          if (sFat[i]) put(sFat[i], c, '=' + L(r));
        });
        var lc = boqGenRow_(b, blk, lab, /^label cable/), lf = boqGenRow_(b, blk, lab, /^label fdt/), la = boqGenRow_(b, blk, lab, /^label fat/), lp = boqGenRow_(b, blk, lab, /^label pole/);
        if (lc && pole.length) put(lc, c, blk.lines.length > 1 ? '=' + sum(pole) + '*10%' : '=ROUNDUP(' + sum(pole) + '*10%,0)');
        if (lf && fdt.length) put(lf, c, '=' + sum(fdt));
        if (la) put(la, c, '=' + sum(fat));
        if (lp && newPole.length) put(lp, c, '=' + sum(newPole));
        if (pond && newPole.length) put(pond, c, '=' + sum(newPole));
        var sFatR = boqGenRow_(b, blk, spl, /^at fat/), sFdtR = boqGenRow_(b, blk, spl, /^at fdt/);
        if (sFatR) put(sFatR, c, '=' + sum(fat));
        if (sFdtR && sFatR) put(sFdtR, c, '=' + L(sFatR));
        if (tFat) put(tFat, c, '=' + sum(fat));
        if (surv && totKab) put(surv, c, '=' + L(totKab) + (strandTol ? '+' + L(strandTol) : ''));
        if (pm && surv) put(pm, c, '=' + L(surv));
        if (t32 && h32) put(t32, c, '=ROUNDUP(' + L(h32) + '*1.1,0)');
        if (t40 && h40) put(t40, c, '=ROUNDUP(' + L(h40) + '*1.1,0)');
        if (k32 && t32) put(k32, c, '=ROUNDUP(' + L(t32) + '/200,0)');
        if (k40 && t40) put(k40, c, '=ROUNDUP(' + L(t40) + '/200,0)');
        if (tamb && t40) put(tamb, c, '=' + L(t40));
        if (tee.length > 1) put(tee[1], c, '=' + L(tee[0]));
      });
      accInput(blk, cols);
      if (blk.lines.length > 1) {   // kolom Qty = jumlah Line A..C
        var c1 = blk.lines[0].c, c2 = blk.lines[blk.lines.length - 1].c;
        var lcr = boqGenRow_(b, blk, boqGenGrp_(b, blk, /^label$/), /^label cable/);
        for (var r = 2; r <= b.nr; r++) if (String(b.v[r - 1][blk.unit - 1]).trim() && b.f[r - 1][blk.qty - 1]) put(r, blk.qty, '=SUM(' + X(r, c1) + ':' + X(r, c2) + ')');
        if (lcr) put(lcr, blk.qty, '=ROUNDUP(SUM(' + X(lcr, c1) + ':' + X(lcr, c2) + '),0)');   // Label Cable dibulatkan dari total semua Line
      }
    }
    var route = boqGenGrp_(b, blk, /^total route/);
    if (route.length) {   // blok Feeder
      var q = blk.qty, cab = boqGenGrp_(b, blk, /^total panjang kabel/), coil = boqGenGrp_(b, blk, /^total coil/);
      var poleF = boqGenGrp_(b, blk, /^pole\b/), newF = poleF.filter(function (r) { return /^new/.test(boqGenTxt_(b, r, blk.lab)); });
      var labF = boqGenGrp_(b, blk, /^label$/);
      if (cab.length === route.length && coil.length === route.length) route.forEach(function (r, i) {
        put(coil[i], q, '=IF(' + X(r, q) + '=0,0,ROUNDUP((' + X(r, q) + '/400)+1,0))');
        put(cab[i], q, '=ROUNDUP((' + X(r, q) + '+' + X(coil[i], q) + '*20)*1.05,0)');
      });
      var lcF = boqGenRow_(b, blk, labF, /^label cable/), lpF = boqGenRow_(b, blk, labF, /^la(b|bl)e?l pole|^lable pole/);
      if (lcF && cab.length) {
        put(lcF, q, '=ROUNDUP(SUM(' + X(cab[0], q) + ':' + X(cab[cab.length - 1], q) + ')/46.5,0)');
        // Rumus lain yang dulu memakai Label Cable sebagai jumlah tiang (mis. suspension FWA) dialihkan ke jumlah tiang
        var lcA = new RegExp('\\$?' + boqColA_(q) + '\\$?' + lcF + '(?!\\d)', 'g');
        for (var r1 = 2; r1 <= b.nr; r1++) {
          var fo1 = b.f[r1 - 1][q - 1];
          if (r1 !== lcF && fo1 && poleF.length && lcA.test(fo1)) put(r1, q, fo1.replace(lcA, 'SUM(' + X(poleF[0], q) + ':' + X(poleF[poleF.length - 1], q) + ')'));
          lcA.lastIndex = 0;
        }
      }
      if (lpF && newF.length) put(lpF, q, '=SUM(' + X(newF[0], q) + ':' + X(newF[newF.length - 1], q) + ')');
      for (var r2 = 2; r2 <= b.nr; r2++) {
        var t = boqGenTxt_(b, r2, blk.lab);
        if (/pondasi/.test(t) && newF.length) put(r2, q, '=SUM(' + X(newF[0], q) + ':' + X(newF[newF.length - 1], q) + ')');
        if (/^socket hdpe 40/.test(t)) {
          var tr = boqGenRowAll_(b, blk, /^toleransi panjang sub duct/);
          if (tr) put(r2, q, '=IF(' + X(tr, q) + '=0,0,ROUNDUP(' + X(tr, q) + '/200,0))');
        }
      }
      accInput(blk, [q]);
    }
  });
  // Judul blok yang rusak (#REF!) diarahkan ke nama cluster di sheet BoQ
  for (var c = 1; c <= b.nc; c++) if (/#REF!/i.test(b.f[0][c - 1]) && boqSh) put(1, c, "='" + boqSh.getName() + "'!O3");
  Object.keys(set).forEach(function (k) {
    var s = set[k];
    if (!s.f) { bom.getRange(s.r, s.c).setValue(''); b.v[s.r - 1][s.c - 1] = ''; n++; }
    else if (b.f[s.r - 1][s.c - 1] !== s.f) { bom.getRange(s.r, s.c).setFormula(s.f); n++; }
    b.f[s.r - 1][s.c - 1] = s.f;
  });
  // Angka desain site asal dikosongkan: angka tetap dan rumus angka saja (mis. =94+95+105)
  for (var r3 = 2; r3 <= b.nr; r3++) for (var c3 = 1; c3 <= b.nc; c3++) {
    var fo = b.f[r3 - 1][c3 - 1], val = b.v[r3 - 1][c3 - 1];
    if (fo ? !/^=[\d\s+\-*\/().,%]+$/.test(fo) : typeof val !== 'number') continue;
    bom.getRange(r3, c3).setValue('');
    b.f[r3 - 1][c3 - 1] = ''; b.v[r3 - 1][c3 - 1] = ''; n++;
  }
  return n;
}

// Isian BoM = sel tanpa rumus yang (lewat rumus) dipakai sheet BoQ. Satu baris BoM = satu pilihan; kolom Line A/B/C jadi pilihan Line.
function boqGenInputs_(ss, boqSh) {
  var bom = boqGenBomSheet_(ss);
  if (!bom) return { bom: '', opts: [] };
  var b = boqGenBomRead_(bom), name = b.name.toLowerCase(), seen = {}, queue = [];
  function visit(r1, c1, r2, c2) {
    for (var r = r1; r <= Math.min(r2, b.nr); r++) for (var c = c1; c <= Math.min(c2, b.nc); c++) {
      var k = r + ':' + c;
      if (seen[k]) continue;
      seen[k] = 1; queue.push([r, c]);
    }
  }
  var qf = boqSh.getDataRange().getFormulas();
  qf.forEach(function (row) {
    row.forEach(function (fo) {
      if (fo) boqRefs_(fo).forEach(function (x) { if (x.sheet.toLowerCase() === name) visit(x.r1, x.c1, x.r2, x.c2); });
    });
  });
  var inputs = [];
  while (queue.length) {
    var rc = queue.shift(), fo = b.f[rc[0] - 1][rc[1] - 1];
    if (!fo) { inputs.push(rc); continue; }
    boqRefs_(fo).forEach(function (x) { if (!x.sheet) visit(x.r1, x.c1, x.r2, x.c2); });
  }
  var byKey = {}, opts = [];
  inputs.sort(function (a, z) { return a[0] - z[0] || a[1] - z[1]; }).forEach(function (rc) {
    var r = rc[0], c = rc[1], blk = b.blocks[0];
    b.blocks.forEach(function (x) { if (x.g <= c) blk = x; });
    if (c <= blk.unit && c !== blk.qty) return;   // kolom judul/satuan, bukan isian
    var line = null;
    blk.lines.forEach(function (l) { if (l.c === c) line = l; });
    if (blk.lines.length && !line && c !== blk.qty) return;
    var lab = String(b.v[r - 1][blk.lab - 1] || '').replace(/\s+/g, ' ').trim(), grp = String(blk.grp[r - 1] || '').replace(/\s+/g, ' ').trim();
    var useLines = blk.lines.length > 1 && !!line;
    if (useLines && /^line\s*[b-z]\b/i.test(lab)) return;   // Line B-D sudah diwakili kolom Line
    if (useLines) lab = lab.replace(/^line\s*a\b\s*(-\s*)?/i, '');
    var label = !lab ? grp : (grp && /^(\d+c\/|line\b|fdt\s*:|fat\s*:|hh\b|riser|at f)/i.test(lab) ? grp + ' - ' + lab : lab);
    if (!label) return;
    var key = 'R' + r + 'B' + blk.g;
    if (!byKey[key]) {
      byKey[key] = { k: key, label: label.replace(/\s*:\s*$/, ''), unit: String(b.v[r - 1][blk.unit - 1] || '').trim(), cells: [] };
      opts.push(byKey[key]);
    }
    byKey[key].cells.push({ r: r, c: c, line: useLines ? line.name : '' });
  });
  opts.forEach(function (o) { if (o.cells.length > 1 || o.cells[0].line) o.lines = o.cells.map(function (x) { return x.line; }); });
  return { bom: b.name, opts: opts };
}

// Rapikan sheet BoQ template: kolom volume tanpa warna, rumus harga #REF! diganti rumus baku,
// Survey & Design feeder = kabel + strand wire (aturan sama dengan Cluster),
// Qty aksesoris / Survey yang masih angka tetap site asal dihubungkan ke baris BoM yang sama.
function boqGenBoqStd_(ss, sh) {
  var p = boqGenParse_(sh), last = sh.getLastRow(), n = last - p.hdr;
  if (n > 0) {
    var rg = sh.getRange(p.hdr + 1, 1, n, 11), v = rg.getValues(), f = rg.getFormulas();
    var bgR = sh.getRange(p.hdr + 1, 4, n, 2), bg = bgR.getBackgrounds(), ch = false;
    for (var i = 0; i < n; i++) {
      if (!String(v[i][2]).trim()) continue;
      for (var j = 0; j < 2; j++) if (bg[i][j] && bg[i][j] !== '#ffffff') { bg[i][j] = null; ch = true; }
      var rr = p.hdr + 1 + i, std = ['=D' + rr + '*F' + rr, '=E' + rr + '*G' + rr, '', '=D' + rr + '+E' + rr];
      for (var k = 0; k < 4; k++) if (std[k] && f[i][7 + k].indexOf('#REF!') > -1) sh.getRange(rr, 8 + k).setFormula(std[k]);
    }
    if (ch) bgR.setBackgrounds(bg);
    // Biaya per HP: HP boleh kosong, jadi pembagian dengan sel HP dibungkus IFERROR (tidak tampil #DIV/0!)
    var hp = p.head.hp, fa = sh.getRange(p.hdr + 1, 1, n, 17).getFormulas();
    if (hp) for (var y0 = 0; y0 < n; y0++) for (var x0 = 0; x0 < 17; x0++) {
      var fo0 = fa[y0][x0];
      if (!fo0 || /^=IFERROR\(/i.test(fo0)) continue;
      if (boqRefs_(fo0).some(function (x) { return !x.sheet && x.r1 <= hp.r && hp.r <= x.r2 && x.c1 <= hp.c && hp.c <= x.c2; }))
        sh.getRange(p.hdr + 1 + y0, x0 + 1).setFormula('=IFERROR(' + fo0.slice(1) + ',0)');
    }
    var bom = boqGenBomSheet_(ss);
    if (bom) {
      var b = boqGenBomRead_(bom), ref = '', jc = {}, bn = b.name.toLowerCase(), useN = {};
      // Blok BoM yang paling banyak dipakai sheet BoQ (SF/FWA memakai blok kanan "BoM - Main/Hub/Sub Feeder")
      f.forEach(function (row) {
        row.forEach(function (fo) {
          if (fo) boqRefs_(fo).forEach(function (x) {
            if (x.sheet.toLowerCase() !== bn) return;
            var g = b.blocks[0].g;
            b.blocks.forEach(function (k) { if (k.g <= x.c1) g = k.g; });
            useN[g] = (useN[g] || 0) + 1;
          });
        });
      });
      var main = b.blocks[0];
      b.blocks.forEach(function (k) { if ((useN[k.g] || 0) > (useN[main.g] || 0)) main = k; });
      var mq = function (r) { return "'" + b.name + "'!" + boqA1_(r, main.qty); }, accM = {};
      boqGenGrp_(b, main, /^accessoris/).forEach(function (r) {
        var t = boqGenTxt_(b, r, main.lab);
        BOQ_ACC_KEYS_.forEach(function (re, i) { if (!accM[i] && re.test(t)) accM[i] = r; });
      });
      var cabM = boqGenGrp_(b, main, /^total panjang kabel/);
      b.blocks.forEach(function (blk) {
        for (var r = 2; r <= b.nr; r++) {   // baris "JOIN CLOSURE 48" di BoM Cluster -> Qty joint closure in-line di BoQ
          var m = /^join\s*closure\s*(\d+)/.exec(String(blk.grp[r - 1]).toLowerCase());
          if (m && !jc[m[1]] && String(b.v[r - 1][blk.g - 1]).trim()) jc[m[1]] = "'" + b.name + "'!" + boqA1_(r, blk.qty);
        }
        if (!boqGenGrp_(b, blk, /^total route/).length) return;
        var sw = boqGenGrp_(b, blk, /^strand wire/)[0];
        if (sw) ref = "'" + b.name + "'!" + boqA1_(sw, blk.qty);
      });
      for (var y = 0; y < n; y++) {
        var mj = /joint closure type in-line (\d+) core/.exec(String(v[y][1]).toLowerCase()), ry = p.hdr + 1 + y;
        if (!mj || !jc[mj[1]] || f[y][3] || typeof v[y][3] !== 'number') continue;
        sh.getRange(ry, 4).setFormula('=' + jc[mj[1]]);
        if (!f[y][4] && typeof v[y][4] === 'number') sh.getRange(ry, 5).setFormula('=D' + ry);
      }
      for (var a = 0; a < n; a++) {
        var da = String(v[a][1]).toLowerCase(), ra = p.hdr + 1 + a;
        if (f[a][3] || typeof v[a][3] !== 'number') continue;
        BOQ_ACC_KEYS_.forEach(function (re, i) {
          if (!accM[i] || !re.test(da)) return;
          sh.getRange(ra, 4).setFormula('=' + mq(accM[i]));
          if (!f[a][4] && (v[a][4] === '' || typeof v[a][4] === 'number')) sh.getRange(ra, 5).setFormula('=D' + ra);
          f[a][3] = '=' + mq(accM[i]);
        });
      }
      for (var z = 0; z < n; z++) {
        var r = p.hdr + 1 + z, d = String(v[z][1]).toLowerCase();
        if (/^survey\s*&\s*design/.test(d) && !f[z][4] && typeof v[z][4] === 'number' && cabM.length) {
          f[z][4] = '=SUM(' + mq(cabM[0]) + ':' + boqA1_(cabM[cabM.length - 1], main.qty) + ')';
          sh.getRange(r, 5).setFormula(f[z][4]);
        }
        if (!ref) continue;
        if (/^survey\s*&\s*design/.test(d) && f[z][4] && f[z][4].indexOf(ref) < 0 && /bom/i.test(f[z][4])) sh.getRange(r, 5).setFormula(f[z][4] + '+' + ref);
        if (/strand wire\/sling messenger/.test(d) && !f[z][3] && v[z][3] === '') {
          sh.getRange(r, 4).setFormula('=' + ref);
          if (!f[z][4] && v[z][4] === '') sh.getRange(r, 5).setFormula('=D' + r);
        }
      }
    }
  }
}

function boqGenInit_(sow) {
  sow = boqGenSow_(sow);
  var list = boqTplList_(), tpl = list[sow];
  if (!tpl) { var sf = boqTplSeed_(sow); if (sf) { boqTplListReset_(); tpl = list[sow] = boqTplMeta_(sf); } }
  var sows = BOQ_GEN_SOWS.map(function (s) { return { sow: s, ada: !!list[s] }; });
  if (!tpl) return { sow: sow, sows: sows, template: null, inputs: [], head: {} };
  var cache = CacheService.getScriptCache(), key = 'boqgen3_' + tpl.id + '_' + tpl.upd, p = null;
  try { var hit = cache.get(key); if (hit) p = JSON.parse(hit); } catch (e) { /* baca ulang */ }
  if (!p) {
    var ss = SpreadsheetApp.openById(tpl.id), sh = findBoqSheet_(ss);
    if (!sh) throw new Error('Template ' + tpl.name + ' tidak punya sheet yang namanya diawali "BoQ".');
    var parsed = boqGenParse_(sh), inp = boqGenInputs_(ss, sh);
    p = {
      sheet: sh.getName(), bom: inp.bom,
      inputs: inp.opts.map(function (o) { return { k: o.k, label: o.label, unit: o.unit, lines: o.lines || null }; }),
      head: { olt: parsed.head.olt ? parsed.head.olt.val : '', net: parsed.head.net ? parsed.head.net.val : '' }
    };
    try { cache.put(key, JSON.stringify(p), 21600); } catch (e) { /* tanpa cache */ }
  }
  return {
    sow: sow, sows: sows, sheet: p.sheet, bom: p.bom, inputs: p.inputs, head: p.head,
    template: { name: tpl.name, asal: tpl.desc, updatedMs: tpl.upd }
  };
}

function boqGenNum_(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim().replace(/\s/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 1.250,5
  else s = s.replace(',', '.');
  var n = Number(s);
  if (!isFinite(n) || n < 0) throw new Error('Volume "' + x + '" bukan angka yang benar.');
  return n;
}

function boqGenFileName_(site, sow, status) {
  var nm = 'BOQ ' + (/built/i.test(status) ? 'AS BUILT' : 'AS PLAN') + ' - ' + (sow === 'Cluster' ? '' : sow.toUpperCase() + ' ') + site;
  return nm.replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) + '.xlsx';
}

function boqGenBuild_(sow, data, userName) {
  var site = baClean_(data.site);
  if (!site) throw new Error('Site belum diisi.');
  var tpl = boqTplFile_(sow);
  if (!tpl) throw new Error('Template BOQ ' + sow + ' belum ada. Minta RPM mengunggahnya di menu Buat BOQ.');
  var status = /built/i.test(String(data.status || '')) ? 'AS BUILT' : 'AS PLAN';
  var rows = boqGenRows_(data.items);
  if (!rows.length) throw new Error('Isi volume minimal satu item BoM.');

  var copy = tpl.makeCopy('TEMP_BUAT_BOQ_' + new Date().getTime());
  try {
    var ss = SpreadsheetApp.openById(copy.getId());
    var sh = findBoqSheet_(ss), bom = boqGenBomSheet_(ss);
    if (!bom) throw new Error('Template ' + tpl.getName() + ' tidak punya sheet BoM.');
    var p = boqGenParse_(sh), filled = boqGenPutBom_(bom, boqGenInputs_(ss, sh), rows, sow);
    // Baris item BoQ yang Qty-nya kosong diisi 0, supaya semua item di file bervolume.
    var nr = sh.getLastRow() - p.hdr, blk = sh.getRange(p.hdr + 1, 1, nr, 16), bv = blk.getValues(), bf = blk.getFormulas();
    for (var z = 0; z < nr; z++) {
      if (!String(bv[z][2]).trim() || !String(bv[z][1]).trim() || bf[z][3] || bf[z][4] || bv[z][3] !== '' || bv[z][4] !== '') continue;
      sh.getRange(p.hdr + 1 + z, String(bv[z][15]).trim().toLowerCase() === 'service' ? 5 : 4).setValue(0);
    }
    var hd = p.head;
    if (hd.cluster) sh.getRange(hd.cluster.r, hd.cluster.c).setValue(site);
    if (hd.olt) sh.getRange(hd.olt.r, hd.olt.c).setValue(String(data.olt || '').trim());
    if (hd.net) sh.getRange(hd.net.r, hd.net.c).setValue(String(data.net || '').trim());
    if (hd.hp) { var hp = boqGenNum_(data.hp); sh.getRange(hd.hp.r, hd.hp.c).setValue(hp === null ? '' : hp); }
    hd.status.forEach(function (s) { sh.getRange(s.r, s.c).setValue(s.upper ? status : (status === 'AS BUILT' ? 'As Built' : 'As Plan')); });
    SpreadsheetApp.flush();

    var resp = UrlFetchApp.fetch('https:\/\/docs.google.com/spreadsheets/d/' + copy.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) throw new Error('Gagal membuat file .xlsx (kode ' + resp.getResponseCode() + '). Coba lagi.');
    var name = boqGenFileName_(site, sow, status);
    var blob = resp.getBlob().setName(name).setContentType(MimeType.MICROSOFT_EXCEL);
    var out = boqOutFolder_().createFile(blob);
    out.setDescription(JSON.stringify({ site: site, sow: sow, status: status, user: userName || '', template: tpl.getDescription() || '' }));
    return { id: out.getId(), name: name, mime: MimeType.MICROSOFT_EXCEL, data: Utilities.base64Encode(blob.getBytes()), filled: filled };
  } finally {
    try { copy.setTrashed(true); } catch (e) { /* abaikan gagal hapus salinan sementara */ }
  }
}

// Tulis volume ke sel isian BoM ({k, line, q} per baris); isian yang tidak diisi dikosongkan (angka site asal template tidak ikut),
// sheet BoQ mengikuti rumusnya. Hasil: jumlah sel BoM yang terisi.
function boqGenPutBom_(bom, inp, rows, sow) {
  var byK = {}, put = {}, filled = 0;
  inp.opts.forEach(function (o) { byK[o.k] = o; });
  rows.forEach(function (x) {
    var o = byK[x.k];
    if (!o) throw new Error('Item BoM yang dipilih tidak ada di template ' + sow + ' (muat ulang halaman).');
    var cell = o.cells[0];
    if (o.lines) {
      cell = o.cells.filter(function (c) { return c.line === x.line; })[0];
      if (!cell) throw new Error('Pilih Line untuk "' + o.label + '".');
    }
    var key = cell.r + ':' + cell.c;
    put[key] = { r: cell.r, c: cell.c, q: (put[key] ? put[key].q : 0) + x.q };
  });
  inp.opts.forEach(function (o) {
    o.cells.forEach(function (c) {
      var w = put[c.r + ':' + c.c];
      bom.getRange(c.r, c.c).setValue(w ? w.q : '');
      if (w && w.q) filled++;
    });
  });
  return filled;
}
function boqGenRows_(items) {
  var rows = [];
  (items || []).forEach(function (it) {
    var q = boqGenNum_(it && it.qty);
    if (q === null || !it.k) return;
    rows.push({ k: String(it.k), line: String(it.line || ''), q: q });
  });
  return rows;
}

function boqGenMeta_(desc) {
  try { return JSON.parse(desc || '{}') || {}; } catch (e) { return {}; }
}

function boqGenHistory_(scope) {
  var keys = scope ? baScopeKeys_(scope) : null, out = [];
  var res = Drive.Files.list({
    q: "'" + boqOutFolder_().getId() + "' in parents and trashed = false",
    orderBy: 'createdTime desc', pageSize: 200, fields: 'files(id,name,description,createdTime)'
  });
  (res.files || []).forEach(function (f) {
    var m = boqGenMeta_(f.description);
    if (keys && !keys[normalizeText_(m.site)]) return;
    out.push({ id: f.id, name: f.name, site: m.site || '', sow: m.sow || '', status: m.status || '', user: m.user || '', ms: new Date(f.createdTime).getTime() });
  });
  return out.slice(0, 100);
}

// File hasil Buat BOQ yang boleh dibuka pengguna ini (ada di folder hasil, site masuk wilayahnya).
function boqGenOwnFile_(id, scope) {
  var f = DriveApp.getFileById(String(id || '')), folderId = boqOutFolder_().getId(), mine = false;
  var ps = f.getParents();
  while (ps.hasNext()) if (ps.next().getId() === folderId) mine = true;
  if (!mine || f.isTrashed()) throw new Error('File BOQ tidak ditemukan.');
  if (scope && !baScopeKeys_(scope)[normalizeText_(boqGenMeta_(f.getDescription()).site)]) throw new Error('File BOQ tidak ditemukan.');
  return f;
}
function boqGenDownload_(id, scope) {
  var f = boqGenOwnFile_(id, scope);
  var blob = f.getBlob();
  return { name: f.getName(), mime: MimeType.MICROSOFT_EXCEL, data: Utilities.base64Encode(blob.getBytes()) };
}

// RPM mengganti template satu SOW: xlsx -> Google Sheet di folder template; template lama masuk sampah Drive (bisa dipulihkan).
function boqGenSetTemplate_(sow, base64Data, fileName) {
  if (!base64Data) throw new Error('File template kosong.');
  if (!/\.xlsx$/i.test(String(fileName || ''))) throw new Error('Template harus file Excel .xlsx.');
  var folder = boqTplFolder_();
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), MimeType.MICROSOFT_EXCEL, fileName);
  var g = Drive.Files.create({ name: BOQ_TPL_PREFIX + sow, mimeType: MimeType.GOOGLE_SHEETS, parents: [folder.getId()], description: 'Asal: ' + fileName }, blob);
  var sh, inp;
  try {
    var ss = SpreadsheetApp.openById(g.id);
    // Hasil konversi ikut lokal akun (id_ID: desimal koma, pemisah ;) sehingga rumus baku (1.05, IF(..,1,0)) jadi #ERROR!.
    ss.setSpreadsheetLocale('en_US');
    sh = findBoqSheet_(ss);
    if (!sh) throw new Error('Tidak ditemukan sheet yang namanya diawali "BoQ" di file ini.');
    if (!boqGenBomSheet_(ss)) throw new Error('Tidak ditemukan sheet BoM (mis. "BoM AE") di file ini.');
    boqGenBomStd_(ss, sh);
    boqGenBoqStd_(ss, sh);
    SpreadsheetApp.flush();
    inp = boqGenInputs_(ss, sh);
    if (!inp.opts.length) throw new Error('Sheet BoQ tidak memakai isian dari sheet ' + inp.bom + '.');
  } catch (e) {
    try { Drive.Files.remove(g.id); } catch (x) { /* abaikan */ }
    throw e;
  }
  var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getId() !== g.id && !f.isTrashed() && normalizeText_(f.getName()) === normalizeText_(BOQ_TPL_PREFIX + sow)) f.setTrashed(true);
  }
  boqTplListReset_();
  return { sow: sow, sheet: sh.getName(), items: inp.opts.length, id: g.id };
}

// =====================================================================
// BOQ ABD (As Built Drawing) Cluster/Subfeeder, format MyRepublic 8 sheet: PO, Form Project Opname, ABD BoQ RO ODN,
// BoQ Roll Out ODN, Summary Cost, Summary-Reconsile, kode material, BoM AE.
// Isian: kepala PO + volume As Plan di sheet PO (dari BOQ plan yang dipilih) + volume As Built di Form Project Opname
// (isian BoM As Built dihitung dengan rumus BoQ plan). Sheet lain mengikuti rumus template.
// Template "TEMPLATE BOQ ABD - <SOW>" di folder template yang sama; awalnya dari file proyek BoqTemplateAbd<SOW>.html
// (JSON { name, data }), hanya ada di proyek Apps Script karena berisi harga dan BOQ proyek.
// =====================================================================
var BOQ_ABD_SOWS = ['Cluster', 'Subfeeder'];
var BOQ_ABD_PREFIX = 'TEMPLATE BOQ ABD - ';
var BOQ_VENDOR = 'PT BUANA MENARA INDONESIA';

function boqAbdSow_(sow) {
  sow = boqGenSow_(sow);
  if (BOQ_ABD_SOWS.indexOf(sow) < 0) throw new Error('BOQ ABD format MyRepublic hanya untuk Cluster dan Subfeeder. SOW ' + sow + ' memakai status AS BUILT biasa.');
  return sow;
}
function boqAbdSheets_(ss) {
  var o = {};
  ss.getSheets().forEach(function (s) {
    var n = s.getName().trim().toLowerCase();
    if (n === 'po') o.po = s;
    else if (/^form project opname/.test(n)) o.opn = s;
    else if (/^abd boq/.test(n)) o.abd = s;
  });
  return o;
}
// Kunci nama item: huruf kecil, spasi rapat, ejaan yang beda antar versi template disamakan.
function boqAbdKey_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/in-line/g, 'inline').replace(/pedestal ground mounted/g, 'pedestal mounted');
}
// Baris item: { 'kunci#n': { r, name } } untuk baris yang punya nama (kolom nameCol) dan satuan (kolom sesudahnya).
// #n = kemunculan ke-n, untuk nama kembar (mis. ODF 576 ports muncul dua kali).
function boqAbdRows_(v, nameCol, from) {
  var out = {}, seen = {};
  for (var r = from || 0; r < v.length; r++) {
    var nm = String(v[r][nameCol - 1] || '').trim(), unit = String(v[r][nameCol] || '').trim();
    if (!nm || !unit || unit.length > 12 || /^description/i.test(nm)) continue;
    var k = boqAbdKey_(nm);
    seen[k] = (seen[k] || 0) + 1;
    out[k + '#' + seen[k]] = { r: r + 1, name: nm };
  }
  return out;
}
// Baris judul kolom ("Description/Item") pada kolom nama; -1 bila tidak ada.
function boqAbdHdr_(v, nameCol) {
  for (var r = 0; r < Math.min(20, v.length); r++) if (/^description/i.test(String(v[r][nameCol - 1]).trim())) return r;
  return -1;
}
// Sel kepala sheet PO: label di satu kolom, isinya di kolom kanannya (AS BUILD = No PO, OLT Name, Cluster, Net Type, HP).
function boqAbdHead_(v, hdr) {
  var head = {};
  for (var r = 0; r < hdr; r++) for (var c = 0; c + 1 < v[r].length; c++) {
    var lab = String(v[r][c]).trim().toLowerCase();
    var key = /^as\s*buil/.test(lab) ? 'po' : /^olt/.test(lab) ? 'olt' : /^cluster/.test(lab) ? 'cluster' : /^net/.test(lab) ? 'net' : lab === 'hp' ? 'hp' : '';
    if (key && !head[key]) head[key] = { r: r + 1, c: c + 2 };
  }
  return head;
}

// Rapikan template ABD saat dipasang: rumus yang merujuk file lain / #REF! diperbaiki, nama vendor dan PIC site asal diganti,
// kepala PO, volume As Plan (PO) dan As Built (Opname) dikosongkan. Hasil: jumlah item di sheet PO.
function boqAbdClean_(ss) {
  var t = boqAbdSheets_(ss);
  if (!t.po || !t.opn || !t.abd) throw new Error('File ini bukan BOQ ABD format MyRepublic (perlu sheet PO, Form Project Opname, dan ABD BoQ RO ODN).');
  var vendor = '';
  t.opn.getRange(1, 1, 12, 6).getValues().forEach(function (row) {
    row.forEach(function (x) { var m = /^\s*vendor\s*:\s*(.+)$/i.exec(String(x)); if (m && !vendor) vendor = m[1].trim(); });
  });
  var word = (vendor.replace(/^pt\.?\s*/i, '').split(/\s+/)[0] || '').toLowerCase();
  ss.getSheets().forEach(function (sh) {
    var rg = sh.getDataRange(), v = rg.getValues(), f = rg.getFormulas();
    for (var r = 0; r < v.length; r++) for (var c = 0; c < v[r].length; c++) {
      var fo = f[r][c], x = v[r][c], nv;
      if (fo) {
        if (!/#REF!|\[\d+\]/.test(fo)) continue;
        // Kode material dari file "Master Sheet Price Input" di laptop pembuat template: ambil dari kolom No Material sheet PO.
        if (/^=\s*VLOOKUP\(\s*\$?B\$?\d+\s*,/i.test(fo) && sh !== t.po) sh.getRange(r + 1, c + 1).setFormula('=IFERROR(VLOOKUP(B' + (r + 1) + ',PO!$B:$N,13,FALSE),"")');
        else sh.getRange(r + 1, c + 1).setValue('');
        continue;
      }
      if (typeof x !== 'string' || !x.trim()) continue;
      var s = x.trim();
      if (/^pt\.?\s/i.test(s) && ((word.length > 2 && s.toLowerCase().indexOf(word) > -1) || /\bzte\b/i.test(s))) nv = BOQ_VENDOR;
      else if (/^vendor\s*:/i.test(s)) nv = x.replace(/:.*$/, ': ' + BOQ_VENDOR);
      else if (/^(pic\b[^:]*|name|id|date(\s+opname)?)\s*:\s*\S/i.test(s)) nv = x.replace(/:.*$/, ': ');
      else continue;
      if (nv !== x) sh.getRange(r + 1, c + 1).setValue(nv);
    }
  });
  function clear(sh, nameCol, qc) {
    var rg = sh.getDataRange(), v = rg.getValues(), f = rg.getFormulas(), hdr = boqAbdHdr_(v, nameCol);
    if (hdr < 0) throw new Error('Judul kolom "Description/Item" tidak ditemukan di sheet ' + sh.getName() + '.');
    var rows = boqAbdRows_(v, nameCol, hdr + 1);
    Object.keys(rows).forEach(function (k) {
      var r = rows[k].r - 1;
      [qc, qc + 1].forEach(function (c) { if (!f[r][c - 1] && v[r][c - 1] !== '') sh.getRange(r + 1, c).setValue(''); });
    });
    return { v: v, hdr: hdr, n: Object.keys(rows).length };
  }
  var po = clear(t.po, 2, 4), head = boqAbdHead_(po.v, po.hdr);
  ['po', 'olt', 'cluster', 'hp'].forEach(function (k) { if (head[k]) t.po.getRange(head[k].r, head[k].c).setValue(''); });
  clear(t.opn, 3, 7);
  if (!po.n) throw new Error('Sheet PO tidak berisi daftar item.');
  // Sheet ABD: baris yang hanya mengambil satu kolom dari Opname (mis. FO 48 cores: Qty Material kosong) dilengkapi,
  // Material = kolom As Built Material Opname, Service = kolom As Built Service.
  var av = t.abd.getDataRange().getFormulas(), re = /^=\s*VLOOKUP\(\s*\$?B\$?(\d+)\s*,\s*('[^']*opname[^']*'![^,]+),\s*(\d+)\s*,\s*(0|FALSE)\s*\)\s*$/i;
  for (var r = 0; r < av.length; r++) {
    var md = re.exec(av[r][3] || ''), me = re.exec(av[r][4] || ''), m = md || me;
    if (!m || +m[1] !== r + 1 || (md && me) || (md ? av[r][4] : av[r][3])) continue;
    var col = +m[3] + (md ? 1 : -1);
    t.abd.getRange(r + 1, md ? 5 : 4).setFormula('=VLOOKUP(B' + (r + 1) + ',' + m[2] + ',' + col + ',0)');
  }
  boqAbdStd_(ss, t);
  // Rumus yang error karena isian kosong (mis. Cost per Home Pass dibagi HP) jadi 0.
  SpreadsheetApp.flush();
  [t.po, t.abd, t.opn].forEach(function (sh) {
    var rg = sh.getDataRange(), v = rg.getValues(), f = rg.getFormulas();
    for (var r = 0; r < v.length; r++) for (var c = 0; c < v[r].length; c++) {
      if (f[r][c] && /^#(DIV\/0!|VALUE!|N\/A|NUM!)/.test(String(v[r][c])) && !/^=\s*IFERROR\(/i.test(f[r][c])) sh.getRange(r + 1, c + 1).setFormula('=IFERROR(' + f[r][c].replace(/^=\s*/, '') + ',0)');
    }
  });
  return po.n;
}

// Tulis blok sel (rumus "=..." atau nilai) sekaligus; rumus yang ada dibaca dulu supaya sel lain tidak berubah.
function boqAbdBlock_(sh, r0, c0, nr, nc, fn) {
  var rg = sh.getRange(r0, c0, nr, nc), v = rg.getValues(), f = rg.getFormulas(), ch = false;
  var cur = v.map(function (row, i) { return row.map(function (x, j) { return f[i][j] || x; }); });
  for (var i = 0; i < nr; i++) {
    var put = fn(r0 + i, cur[i]);
    if (!put) continue;
    Object.keys(put).forEach(function (c) { var j = +c - c0; if (cur[i][j] !== put[c]) { cur[i][j] = put[c]; ch = true; } });
  }
  if (ch) rg.setValues(cur);
}
// Samakan rumus antar sheet ABD (template dari klien hanya menyambung item yang dipakai site asalnya):
//  ABD BoQ RO ODN : harga = harga PO.   Form Project Opname: deviasi = As Built - As Plan.
//  BoQ Roll Out ODN: As Plan = PO, As Build = ABD, deviasi, harga = PO, total harga; subtotal lengkap L-Q.
//  Summary Cost   : tiap kategori dari subtotal BoQ Roll Out ODN yang sama (As Plan L+M, As Build N+O, Deviasi P+Q).
function boqAbdStd_(ss, t) {
  function rowsOf(sh, nameCol) { var v = sh.getDataRange().getValues(); return { v: v, rows: boqAbdRows_(v, nameCol, boqAbdHdr_(v, nameCol) + 1) }; }
  var po = rowsOf(t.po, 2), ab = rowsOf(t.abd, 2), op = rowsOf(t.opn, 3), q = "'" + t.abd.getName().replace(/'/g, "''") + "'!";
  function pr(k) { return po.rows[k] ? po.rows[k].r : 0; }
  var abByR = {}, opByR = {};
  Object.keys(ab.rows).forEach(function (k) { if (pr(k)) abByR[ab.rows[k].r] = pr(k); });
  boqAbdBlock_(t.abd, 1, 6, ab.v.length, 2, function (r) { var p = abByR[r]; return p ? { 6: '=PO!F' + p, 7: '=PO!G' + p } : null; });
  Object.keys(op.rows).forEach(function (k) { opByR[op.rows[k].r] = 1; });
  boqAbdBlock_(t.opn, 1, 9, op.v.length, 2, function (r, cur) {
    if (!opByR[r]) return null;
    var o = {};
    if (!/^=/.test(String(cur[0]))) o[9] = '=G' + r + '-E' + r;
    if (!/^=/.test(String(cur[1]))) o[10] = '=H' + r + '-F' + r;
    return o;
  });
  var ro = null;
  ss.getSheets().forEach(function (s) { if (/^boq roll out/i.test(s.getName().trim())) ro = s; });
  if (!ro) return;
  var rv = ro.getDataRange().getValues(), rhdr = boqAbdHdr_(rv, 2), rr = boqAbdRows_(rv, 2, rhdr + 1), map = {};
  Object.keys(rr).forEach(function (k) { if (pr(k) && ab.rows[k]) map[rr[k].r] = { p: pr(k), a: ab.rows[k].r }; });
  var rf = ro.getDataRange().getFormulas(), subs = [];
  boqAbdBlock_(ro, 1, 4, rv.length, 14, function (r, cur) {
    var m = map[r];
    if (m) return { 4: '=PO!D' + m.p, 5: '=PO!E' + m.p, 6: '=' + q + 'D' + m.a, 7: '=' + q + 'E' + m.a, 8: '=F' + r + '-D' + r, 9: '=G' + r + '-E' + r,
      10: '=PO!F' + m.p, 11: '=PO!G' + m.p, 12: '=D' + r + '*J' + r, 13: '=E' + r + '*K' + r, 14: '=F' + r + '*J' + r, 15: '=G' + r + '*K' + r,
      16: '=IF(H' + r + '>0,H' + r + '*J' + r + ',0)', 17: '=IF(I' + r + '>0,I' + r + '*K' + r + ',0)' };
    var lab = String(rv[r - 1][0]).trim();
    if (!/^sub\b/i.test(lab)) return null;
    var rng = null;
    for (var j = 8; j < 14; j++) { var mm = /^=\s*SUM\(\s*[A-Z]+(\d+)(?::[A-Z]+(\d+))?\s*\)$/i.exec(String(cur[j])); if (mm) { rng = [mm[1], mm[2] || mm[1]]; break; } }
    if (!rng) return null;
    subs.push({ r: r, lab: lab.toLowerCase() });
    var o = {};
    'LMNOPQ'.split('').forEach(function (L, i) { o[12 + i] = '=SUM(' + L + rng[0] + ':' + L + rng[1] + ')'; });
    return o;
  });
  var sc = null;
  ss.getSheets().forEach(function (s) { if (/^summary cost/i.test(s.getName().trim())) sc = s; });
  if (!sc || !subs.length) return;
  var sv = sc.getRange(1, 1, Math.min(40, sc.getLastRow()), 12).getValues(), sh = -1, pc = [];
  for (var r = 0; r < sv.length && sh < 0; r++) if (/^description/i.test(String(sv[r][1]).trim())) sh = r;
  if (sh < 0) return;
  sv[sh].forEach(function (x, j) { if (/^price$/i.test(String(x).trim())) pc.push(j + 1); });
  if (pc.length < 3) return;
  var cats = [[/pengamanan|persiapan/, /preparation|persiapan/], [/^odn\b/, /\bodn\b/], [/\bosp\b/, /\bosp\b/], [/udara/, /udara/], [/aktivasi/, /aktivasi/],
    [/optical/, /optical/], [/documentation/, /documentation/], [/^others/, /project management/], [/warehouse/, /warehouse/]];
  var rq = "'" + ro.getName().replace(/'/g, "''") + "'!";
  for (r = sh + 1; r < sv.length; r++) {
    var lab2 = String(sv[r][1]).trim().toLowerCase();
    if (!lab2 || /^total/.test(lab2)) { if (/^total/.test(lab2)) break; continue; }
    var cat = cats.filter(function (c) { return c[0].test(lab2); })[0];
    var sub = cat && subs.filter(function (x) { return cat[1].test(x.lab); })[0];
    if (!sub) continue;
    var R = sub.r;
    sc.getRange(r + 1, pc[0]).setFormula('=' + rq + 'L' + R + '+' + rq + 'M' + R);
    sc.getRange(r + 1, pc[1]).setFormula('=' + rq + 'N' + R + '+' + rq + 'O' + R);
    sc.getRange(r + 1, pc[2]).setFormula('=' + rq + 'P' + R + '+' + rq + 'Q' + R);
  }
}

// Volume per item satu sheet BoQ (plan) yang sudah terhitung: { items: { kunci: { name, d, e } }, head: { site, olt, net, hp } }.
// err = sel Qty berisi error (mis. #ERROR! di BOQ plan lama), tetap = Qty angka tanpa rumus (isian manual di BoQ).
function boqAbdQty_(sh) {
  var p = boqGenParse_(sh), n = sh.getLastRow(), rg = sh.getRange(1, 1, n, 17), v = rg.getValues(), f = rg.getFormulas(), out = {}, nErr = 0;
  var rows = boqAbdRows_(v, 2, p.hdr);
  function bad(x) { return typeof x === 'string' && /^#/.test(x.trim()); }
  Object.keys(rows).forEach(function (k) {
    var r = rows[k].r - 1, err = bad(v[r][3]) || bad(v[r][4]);
    if (err) nErr++;
    out[k] = { name: rows[k].name, d: Number(v[r][3]) || 0, e: Number(v[r][4]) || 0, err: err,
      tetap: (!f[r][3] && typeof v[r][3] === 'number' && v[r][3] > 0) || (!f[r][4] && typeof v[r][4] === 'number' && v[r][4] > 0) };
  });
  function hv(h) { return h ? v[h.r - 1][h.c - 1] : ''; }
  return { items: out, nErr: nErr, head: { site: String(hv(p.head.cluster)).trim(), olt: String(hv(p.head.olt)).trim(), net: String(hv(p.head.net)).trim(), hp: hv(p.head.hp) } };
}

// Isi salinan template ABD: kepala PO, As Plan ke PO kolom D/E, As Built ke Form Project Opname kolom G/H, PIC dan tanggal opname.
// Sel yang berumus (mis. Qty Instal = Qty material) tidak ditimpa. Hasil: nama item bervolume yang tidak punya baris di template.
function boqAbdFill_(ss, d, plan, built) {
  var t = boqAbdSheets_(ss), miss = { plan: [], built: [] };
  function put(sh, nameCol, qc, src, list) {
    var rg = sh.getDataRange(), v = rg.getValues(), f = rg.getFormulas(), hdr = boqAbdHdr_(v, nameCol);
    var rows = boqAbdRows_(v, nameCol, hdr + 1), n = 0, keys = Object.keys(rows);
    // Nama yang dipendekkan di salah satu versi (mis. "..., KMZ, BOQ" vs "..., KMZ, BOQ & Documentation"): awalan sama, minimal 25 huruf, satu-satunya.
    function near(k) {
      var base = k.replace(/#\d+$/, ''), hit = keys.filter(function (x) {
        var b = x.replace(/#\d+$/, ''), a = b.length < base.length ? b : base, z = a === b ? base : b;
        return a.length >= 25 && z.indexOf(a) === 0 && !src[x];
      });
      return hit.length === 1 ? rows[hit[0]] : null;
    }
    Object.keys(src).forEach(function (k) {
      var q = src[k], row = rows[k] || near(k);
      if (!q.d && !q.e) return;
      if (!row) { list.push(q.name); return; }
      [q.d, q.e].forEach(function (x, j) {
        if (f[row.r - 1][qc + j - 1] || !x) return;
        sh.getRange(row.r, qc + j).setValue(x);
        n++;
      });
    });
    return { v: v, hdr: hdr, n: n };
  }
  var po = put(t.po, 2, 4, plan, miss.plan), head = boqAbdHead_(po.v, po.hdr);
  var no = String(d.po || '').trim(), hp = boqGenNum_(d.hp);
  var hv = { po: /^\d{1,15}$/.test(no) ? Number(no) : no, olt: d.olt || '', cluster: d.site || '', net: d.net || '', hp: hp === null ? '' : hp };
  Object.keys(hv).forEach(function (k) { if (head[k]) t.po.getRange(head[k].r, head[k].c).setValue(hv[k]); });
  var opn = put(t.opn, 3, 7, built, miss.built);
  var tgl = String(d.tgl || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var lines = { picv: String(d.picVendor || '').trim(), picc: String(d.picCust || '').trim(), tgl: tgl ? tgl[3] + '/' + tgl[2] + '/' + tgl[1] : '' };
  for (var r = 0; r < Math.min(12, opn.v.length); r++) for (var c = 0; c < opn.v[r].length; c++) {
    var s = String(opn.v[r][c]), key = /^\s*pic\s*vendor/i.test(s) ? 'picv' : /^\s*pic\s*my\s*rep/i.test(s) ? 'picc' : /^\s*date\s*opname/i.test(s) ? 'tgl' : '';
    if (key && /:/.test(s)) t.opn.getRange(r + 1, c + 1).setValue(s.replace(/:.*$/, ': ' + lines[key]));
  }
  miss.nPlan = po.n; miss.nBuilt = opn.n;
  return miss;
}

function boqAbdTplFile_(sow) {
  var it = boqTplFolder_().getFilesByName(BOQ_ABD_PREFIX + sow), best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS && (!best || f.getLastUpdated() > best.getLastUpdated())) best = f;
  }
  if (best) return best;
  var seed;
  try { seed = JSON.parse(HtmlService.createHtmlOutputFromFile('BoqTemplateAbd' + sow).getContent()); } catch (e) { return null; }
  if (!seed || !seed.data) return null;
  var cache = CacheService.getScriptCache(), key = 'boqabdseed_' + sow;
  if (cache.get(key)) throw new Error('Template BOQ ABD ' + sow + ' sedang disiapkan (pemakaian pertama). Tunggu sebentar.');
  cache.put(key, '1', 300);
  try { return DriveApp.getFileById(boqAbdSetTemplate_(sow, seed.data, seed.name).id); } finally { cache.remove(key); }
}

// RPM mengganti template ABD satu SOW (xlsx ABD format MyRepublic); template lama masuk sampah Drive.
function boqAbdSetTemplate_(sow, base64Data, fileName) {
  if (!base64Data) throw new Error('File template kosong.');
  if (!/\.xlsx$/i.test(String(fileName || ''))) throw new Error('Template harus file Excel .xlsx.');
  var folder = boqTplFolder_(), name = BOQ_ABD_PREFIX + sow, n;
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), MimeType.MICROSOFT_EXCEL, fileName);
  var g = Drive.Files.create({ name: name, mimeType: MimeType.GOOGLE_SHEETS, parents: [folder.getId()], description: 'Asal: ' + fileName }, blob);
  try {
    var ss = SpreadsheetApp.openById(g.id);
    ss.setSpreadsheetLocale('en_US');   // rumus yang ditulis memakai koma dan nama fungsi Inggris
    n = boqAbdClean_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    try { Drive.Files.remove(g.id); } catch (x) { /* abaikan */ }
    throw e;
  }
  var it = folder.getFilesByName(name);
  while (it.hasNext()) { var f = it.next(); if (f.getId() !== g.id && !f.isTrashed()) f.setTrashed(true); }
  return { sow: sow, sheet: 'PO', items: n, id: g.id };
}

function boqAbdInit_(sow) {
  sow = boqAbdSow_(sow);
  var f = boqAbdTplFile_(sow);
  return { sow: sow, template: f ? { name: f.getName(), asal: f.getDescription() || '', updatedMs: f.getLastUpdated().getTime() } : null };
}

// BOQ plan sumber As Plan: file dari daftar BOQ yang Dibuat ({ id }) atau file .xlsx yang diunggah ({ data, name }),
// dibuka sebagai Google Sheet sementara (hapus dengan setTrashed setelah dipakai).
function boqAbdPlanOpen_(src, scope) {
  src = src || {};
  var folder = boqTplFolder_(), tmp = 'TEMP_ABD_PLAN_' + new Date().getTime(), g, name;
  if (src.id) {
    var f = boqGenOwnFile_(src.id, scope);
    if (boqGenMeta_(f.getDescription()).status === 'ABD') throw new Error('Pilih BOQ plan, bukan BOQ ABD.');
    name = f.getName();
    g = Drive.Files.copy({ name: tmp, mimeType: MimeType.GOOGLE_SHEETS, parents: [folder.getId()] }, f.getId());
  } else if (src.data) {
    name = String(src.name || 'BOQ plan.xlsx');
    if (!/\.xlsx$/i.test(name)) throw new Error('BOQ plan harus file Excel .xlsx.');
    g = Drive.Files.create({ name: tmp, mimeType: MimeType.GOOGLE_SHEETS, parents: [folder.getId()] }, Utilities.newBlob(Utilities.base64Decode(src.data), MimeType.MICROSOFT_EXCEL, name));
  } else throw new Error('Pilih BOQ As Plan dulu.');
  var ss = SpreadsheetApp.openById(g.id), sh = findBoqSheet_(ss);
  if (!sh) { try { DriveApp.getFileById(g.id).setTrashed(true); } catch (e) { /* abaikan */ } throw new Error('File ' + name + ' tidak punya sheet yang namanya diawali "BoQ".'); }
  ss.setSpreadsheetLocale('en_US');
  return { ss: ss, sh: sh, id: g.id, name: name };
}
function boqAbdTrash_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* abaikan gagal hapus salinan sementara */ } }

// Isian BoM template plan yang juga ada (baris dan nama sama) di BOQ plan ini.
function boqAbdSameBom_(sow, ss, sh) {
  var labels = {}, init = boqGenInit_(sow);
  (init.inputs || []).forEach(function (x) { labels[x.k] = x.label; });
  var inp = boqGenInputs_(ss, sh), ok = {};
  inp.opts.forEach(function (o) { if (labels[o.k] === o.label) ok[o.k] = o; });
  return { inp: inp, ok: ok, n: (init.inputs || []).length };
}

// Isian BoM BOQ plan yang barisnya sama dengan template sekarang: [{ k, line, q }].
function boqAbdPlanBom_(o, same) {
  var bom = boqGenBomSheet_(o.ss), bv = bom ? bom.getDataRange().getValues() : [], rows = [];
  Object.keys(same.ok).forEach(function (k) {
    same.ok[k].cells.forEach(function (c) {
      var x = bv[c.r - 1] ? Number(bv[c.r - 1][c.c - 1]) : 0;
      if (x) rows.push({ k: k, line: c.line || '', q: x });
    });
  });
  return rows;
}
// Untuk halaman: kepala dan isian BoM BOQ plan yang dipilih, supaya isian As Built tinggal diubah yang berbeda.
function boqAbdPlanInfo_(sow, src, scope) {
  sow = boqAbdSow_(sow);
  var o = boqAbdPlanOpen_(src, scope);
  try {
    var q = boqAbdQty_(o.sh), rows = boqAbdPlanBom_(o, boqAbdSameBom_(sow, o.ss, o.sh)).map(function (x) { return { k: x.k, line: x.line, qty: x.q }; });
    var fixed = 0, err = q.nErr;
    if (err) {
      var calc = boqAbdCalc_(sow);
      try { fixed = boqAbdPlanFix_(sow, o, q, calc); } finally { boqAbdTrash_(calc.id); }
    }
    var list = [];
    Object.keys(q.items).forEach(function (k) { var x = q.items[k]; if (x.d || x.e) list.push({ name: x.name, d: x.d, e: x.e }); });
    return { name: o.name, head: q.head, bom: rows, items: list.length, list: list, err: err, fixed: fixed };
  } finally { boqAbdTrash_(o.id); }
}

function boqAbdFileName_(site, sow) {
  return ('ABD BoQ ' + (sow === 'Cluster' ? 'Dist ' : 'SF ') + site).replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) + '.xlsx';
}

// Salinan sementara template BOQ plan SOW ini untuk menghitung volume item dari isian BoM.
function boqAbdCalc_(sow) {
  var tpl = boqTplFile_(sow);
  if (!tpl) throw new Error('Template BOQ ' + sow + ' belum ada.');
  var c = tpl.makeCopy('TEMP_ABD_HITUNG_' + new Date().getTime()), ss = SpreadsheetApp.openById(c.getId()), sh = findBoqSheet_(ss);
  return { id: c.getId(), sh: sh, bom: boqGenBomSheet_(ss), inp: boqGenInputs_(ss, sh) };
}
// Item As Plan yang error di file plan (BOQ plan lama, #ERROR!) dihitung ulang dari isian BoM plan itu. Hasil: jumlah item yang diperbaiki.
function boqAbdPlanFix_(sow, o, pq, calc) {
  if (!pq.nErr) return 0;
  var pr = boqAbdPlanBom_(o, boqAbdSameBom_(sow, o.ss, o.sh)), n = 0;
  if (!pr.length) return 0;
  boqGenPutBom_(calc.bom, calc.inp, pr, sow);
  SpreadsheetApp.flush();
  var q = boqAbdQty_(calc.sh).items;
  Object.keys(pq.items).forEach(function (k) {
    var x = pq.items[k];
    if (x.err && q[k]) { x.d = q[k].d; x.e = q[k].e; x.err = false; n++; }
  });
  return n;
}

function boqAbdBuild_(sow, data, userName, scope) {
  sow = boqAbdSow_(sow);
  var site = baClean_(data.site);
  if (!site) throw new Error('Site belum diisi.');
  if (!String(data.po || '').trim()) throw new Error('No PO belum diisi.');
  var rows = boqGenRows_(data.items);
  if (!rows.length) throw new Error('Isi volume As Built minimal satu item BoM.');
  var abd = boqAbdTplFile_(sow);
  if (!abd) throw new Error('Template BOQ ABD ' + sow + ' belum ada. Minta RPM mengunggahnya di menu Buat BOQ.');
  var o = boqAbdPlanOpen_(data.plan, scope), tmp = [o.id];
  try {
    // Volume dihitung dengan rumus template BOQ plan SOW ini (bukan rumus di file plan: BOQ plan lama bisa berisi #ERROR!).
    //  As Plan : angka di file plan; yang error dihitung ulang dari isian BoM plan itu.
    //  As Built: isian BoM As Built; item yang di file plan berupa angka tetap (izin, K3, dll.) ikut angka plan bila rumus tidak mengisinya.
    var pq = boqAbdQty_(o.sh), plan = pq.items, calc = boqAbdCalc_(sow);
    tmp.push(calc.id);
    var fixed = boqAbdPlanFix_(sow, o, pq, calc);
    var filled = boqGenPutBom_(calc.bom, calc.inp, rows, sow);
    SpreadsheetApp.flush();
    var built = boqAbdQty_(calc.sh).items;
    Object.keys(plan).forEach(function (k) {
      var x = plan[k], b = built[k];
      if (!x.tetap || (b && (b.d || b.e))) return;
      built[k] = { name: x.name, d: x.d, e: x.e };
    });

    var copy = abd.makeCopy('TEMP_BUAT_ABD_' + new Date().getTime());
    tmp.push(copy.getId());
    var ss = SpreadsheetApp.openById(copy.getId());
    var miss = boqAbdFill_(ss, { po: data.po, olt: String(data.olt || '').trim(), site: site, net: String(data.net || '').trim(), hp: data.hp, picVendor: data.picVendor, picCust: data.picCust, tgl: data.tgl }, plan, built);
    SpreadsheetApp.flush();
    var resp = UrlFetchApp.fetch('https:\/\/docs.google.com/spreadsheets/d/' + copy.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) throw new Error('Gagal membuat file .xlsx (kode ' + resp.getResponseCode() + '). Coba lagi.');
    var name = boqAbdFileName_(site, sow);
    var blob = resp.getBlob().setName(name).setContentType(MimeType.MICROSOFT_EXCEL);
    var out = boqOutFolder_().createFile(blob);
    out.setDescription(JSON.stringify({ site: site, sow: sow, status: 'ABD', user: userName || '', template: abd.getDescription() || '', plan: o.name, po: String(data.po).trim() }));
    return { id: out.getId(), name: name, mime: MimeType.MICROSOFT_EXCEL, data: Utilities.base64Encode(blob.getBytes()), filled: filled,
      plan: miss.nPlan, built: miss.nBuilt, missPlan: miss.plan, missBuilt: miss.built, planErr: pq.nErr, planFixed: fixed };
  } finally {
    tmp.forEach(boqAbdTrash_);
  }
}

function getBoqGenInit(code, sow) { requireAccess_(code); return boqGenInit_(sow); }
function buatBoq(code, data) {
  requireAccess_(code);
  data = data || {};
  var sow = boqGenSow_(data.sow);
  regionCheckSite_(scopeOf_(code), data.site);
  var res = boqGenBuild_(sow, data, logUser_(code));
  logHistory_('Portal', logUser_(code), logRole_(code), 'Buat BOQ', baClean_(data.site) + ' (' + sow + ') -> ' + res.name);
  return res;
}
function getBoqGenHistory(code) { requireAccess_(code); return boqGenHistory_(scopeOf_(code)); }
function downloadBoqGen(code, id) { requireAccess_(code); return boqGenDownload_(id, scopeOf_(code)); }
function setBoqTemplate(code, sow, base64Data, fileName, jenis) {
  requireRpm_(code);
  var abd = jenis === 'ABD';
  sow = abd ? boqAbdSow_(sow) : boqGenSow_(sow);
  var res = abd ? boqAbdSetTemplate_(sow, base64Data, fileName) : boqGenSetTemplate_(sow, base64Data, fileName);
  logHistory_('Portal', logUser_(code), logRole_(code), abd ? 'Ganti Template BOQ ABD' : 'Ganti Template BOQ', sow + ' <- ' + fileName);
  return res;
}
function getBoqAbdInit(code, sow) { requireAccess_(code); return boqAbdInit_(sow); }
function getBoqAbdPlan(code, sow, src) { requireAccess_(code); return boqAbdPlanInfo_(sow, src, scopeOf_(code)); }
function buatBoqAbd(code, data) {
  requireAccess_(code);
  data = data || {};
  var sow = boqAbdSow_(data.sow);
  regionCheckSite_(scopeOf_(code), data.site);
  var res = boqAbdBuild_(sow, data, logUser_(code), scopeOf_(code));
  logHistory_('Portal', logUser_(code), logRole_(code), 'Buat BOQ ABD', baClean_(data.site) + ' (' + sow + ') -> ' + res.name);
  return res;
}
