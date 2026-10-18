// Gateway WhatsApp Portal Waspang untuk laptop yang menyala 24 jam.
// Laptop menautkan nomor WA laporan sebagai "perangkat tertaut" (seperti WhatsApp Web), lalu setiap beberapa detik
// mengambil antrean laporan dari Apps Script Waspang (WA_PULL), mengirimnya ke grup, dan melapor balik (WA_DONE).
// Laptop yang menghubungi Apps Script, bukan sebaliknya: tidak perlu IP publik, port terbuka, atau tunnel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const POLL_MS = Math.max(5, Number(CFG.pollSeconds) || 15) * 1000;
const log = (...a) => console.log(new Date().toLocaleString('id-ID'), '-', ...a);

if (!CFG.url || !CFG.secret || !CFG.group) {
  console.error('config.json belum lengkap: isi url, secret dan group (lihat BACA.md).');
  process.exit(1);
}

let sock = null, ready = false, groupJid = null;

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(DIR, 'auth'));
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: Browsers.windows('Portal Waspang') });
  sock.ev.on('creds.update', saveCreds);
  let pairingAsked = false;
  sock.ev.on('connection.update', async (u) => {
    if (u.qr) {
      if (CFG.pairPhone && !pairingAsked) {
        // Tautkan dengan nomor: di HP buka WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon.
        pairingAsked = true;
        try { log('KODE TAUTAN:', await sock.requestPairingCode(String(CFG.pairPhone).replace(/\D/g, ''))); }
        catch (e) { log('Kode tautan gagal, pakai QR di bawah:', e.message); }
      }
      if (!CFG.pairPhone) {
        log('Scan QR ini dari HP: WhatsApp > Perangkat tertaut > Tautkan perangkat');
        qrcode.generate(u.qr, { small: true });
      }
    }
    if (u.connection === 'open') {
      ready = true;
      groupJid = null;
      log('Tersambung ke WhatsApp sebagai', sock.user && sock.user.id);
    }
    if (u.connection === 'close') {
      ready = false;
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log('Perangkat dikeluarkan dari WhatsApp. Hapus folder "auth" lalu jalankan lagi untuk menautkan ulang.');
        process.exit(2);
      }
      log('Sambungan WhatsApp putus (' + code + '), menyambung ulang...');
      setTimeout(connect, 5000);
    }
  });
}

// Nama grup -> JID, dicari dari grup yang diikuti nomor ini.
async function targetJid() {
  if (groupJid) return groupJid;
  const want = String(CFG.group).trim();
  if (/@g\.us$/.test(want)) return (groupJid = want);
  const groups = await sock.groupFetchAllParticipating();
  const hit = Object.values(groups).find(g => String(g.subject || '').trim().toLowerCase() === want.toLowerCase());
  if (!hit) throw new Error('Grup "' + want + '" tidak ditemukan di nomor ini.');
  log('Grup tujuan:', hit.subject, hit.id);
  return (groupJid = hit.id);
}

async function api(body) {
  const res = await fetch(CFG.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ secret: CFG.secret }, body))
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('Jawaban Apps Script bukan JSON: ' + text.slice(0, 120)); }
  if (json.status !== 'success') throw new Error(json.message || 'Apps Script menolak permintaan.');
  return json;
}

// Satu laporan: teks saja, atau file (foto/PDF) dengan keterangan pada file pertama.
async function sendJob(job) {
  const jid = await targetJid();
  const files = job.files || [];
  if (!files.length) {
    await sock.sendMessage(jid, { text: job.text || '' });
    return;
  }
  for (let i = 0; i < files.length; i++) {
    const f = await api({ action: 'WA_FILE', key: job.key, id: files[i].id });
    const buf = Buffer.from(f.base64, 'base64');
    const caption = i === 0 ? (job.text || '') : '';
    if (/^image\//.test(f.mime)) await sock.sendMessage(jid, { image: buf, caption });
    else await sock.sendMessage(jid, { document: buf, mimetype: f.mime, fileName: f.name, caption });
  }
}

let busy = false;
async function poll() {
  if (busy || !ready) return;
  busy = true;
  try {
    const { jobs } = await api({ action: 'WA_PULL' });
    for (const job of jobs || []) {
      try {
        await sendJob(job);
        await api({ action: 'WA_DONE', key: job.key, ok: true });
        log('Terkirim:', job.key, (job.files || []).length ? (job.files.length + ' file') : 'teks');
      } catch (e) {
        log('Gagal kirim', job.key + ':', e.message);
        await api({ action: 'WA_DONE', key: job.key, ok: false, error: e.message }).catch(() => {});
        if (/tidak ditemukan/.test(e.message)) groupJid = null;
      }
    }
  } catch (e) {
    log('Antrean belum bisa diambil:', e.message);
  } finally {
    busy = false;
  }
}

await connect();
setInterval(poll, POLL_MS);
log('Gateway berjalan. Cek antrean tiap', POLL_MS / 1000, 'detik. Biarkan jendela ini terbuka.');
