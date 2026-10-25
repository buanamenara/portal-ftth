// Pembaca Excel (.xlsx) kecil tanpa paket tambahan, khusus untuk file stok WH yang dikirim ke grup (!stokwh).
// Hanya mengambil nilai sel yang tersimpan (hasil rumus), tidak menghitung ulang rumus.
// Baris yang dikirim ke Apps Script dibatasi pada baris yang ada teksnya (judul kolom, "Area", "Stock Gudang", ...),
// karena sheet WH bisa berisi > 1 juta baris kosong ber-format.
import zlib from 'node:zlib';

// Isi file di dalam zip -> { 'xl/workbook.xml': Buffer, ... } (hanya nama yang diminta lewat want()).
function unzip(buf, want) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Bukan file .xlsx yang valid.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out[name] = method === 0 ? data : zlib.inflateRawSync(data);
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? m));
const attr = (s, n) => { const m = s.match(new RegExp('\\b' + n + '="([^"]*)"')); return m ? unxml(m[1]) : ''; };
const texts = s => [...s.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');
const colNum = ref => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// -> [{ name, rows: [[nomorBaris, [nilai, ...]], ...] }] untuk sheet yang tampil (sheet tersembunyi dilewati).
export function readXlsx(buf, { maxCols = 40, maxRows = 1500, keep = null } = {}) {
  const files = unzip(buf, n => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const wb = String(files['xl/workbook.xml'] || ''), rels = String(files['xl/_rels/workbook.xml.rels'] || '');
  const shared = [...String(files['xl/sharedStrings.xml'] || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) target[attr(m[0], 'Id')] = attr(m[0], 'Target').replace(/^\/?(xl\/)?/, 'xl/');
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    if (/hidden/i.test(attr(m[0], 'state'))) continue;
    const xml = files[target[attr(m[0], 'r:id')]];
    if (!xml) continue;
    const s = xml.toString('utf8'), rows = [];
    for (const r of s.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      if (!r[2] || rows.length >= maxRows) continue;
      const vals = [];
      let hasText = false;
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if (!c[2]) continue;
        const col = colNum(attr(c[1], 'r'));
        if (col < 0 || col >= maxCols) continue;
        const t = attr(c[1], 't'), v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val;
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = texts(c[2]);
        else if (t === 'str' || t === 'e') val = v === undefined ? '' : unxml(v);
        else if (t === 'b') val = v === '1';
        else val = v === undefined || v === '' ? '' : Number(v);
        if (val === '' || val === null) continue;
        if (typeof val === 'string') { val = val.slice(0, 100); hasText = true; }
        vals[col] = val;
      }
      if (!hasText || (keep && !keep(vals))) continue;
      for (let i = 0; i < vals.length; i++) if (vals[i] === undefined) vals[i] = '';
      rows.push([Number(attr(r[1], 'r')) || 0, vals]);
    }
    sheets.push({ name: attr(m[0], 'name'), rows });
  }
  return sheets;
}
