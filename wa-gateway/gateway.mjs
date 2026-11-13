// Gateway WhatsApp Portal Waspang untuk laptop yang menyala 24 jam.
// Laptop menautkan nomor WA laporan sebagai "perangkat tertaut" (seperti WhatsApp Web), lalu setiap beberapa detik
// mengambil antrean laporan dari Apps Script Waspang (WA_PULL), mengirimnya ke grup, dan melapor balik (WA_DONE).
// Laptop yang menghubungi Apps Script, bukan sebaliknya: tidak perlu IP publik, port terbuka, atau tunnel.
// Bot perintah pendek: pesan di grup yang diawali "!" dan chat pribadi ke nomor ini diteruskan ke Apps Script (WA_CMD);
// Apps Script yang memutuskan perlu dijawab atau tidak (nomor pemilik di Script Property WA_OWNER), laptop mengirim jawabannya.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { readXlsx } from './xlsx-mini.mjs';
import { startPanel, panel } from './panel.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Data (config.json, auth, state.json) di folder terpisah supaya program bisa diganti tanpa menyentuh tautan WA.
// Paket portable: IRIS_DATA = ..\data. Cara lama (config.json di folder program) tetap jalan.
const DATA = process.env.IRIS_DATA ? path.resolve(process.env.IRIS_DATA)
  : (fs.existsSync(path.join(DIR, 'config.json')) ? DIR : path.join(DIR, '..', 'data'));
fs.mkdirSync(DATA, { recursive: true });
const CFG_FILE = path.join(DATA, 'config.json');
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) {}
const POLL_MS = Math.max(5, Number(CFG.pollSeconds) || 15) * 1000;
const log = (...a) => { console.log(new Date().toLocaleString('id-ID'), '-', ...a); };
const FAKE = process.env.IRIS_FAKE_WA === '1';   // uji tampilan tanpa WhatsApp (tidak mengirim apa pun)

let sock = null, ready = false, groupJid = null;
const configured = !!(CFG.url && CFG.secret && CFG.group);

async function connect() {
  if (FAKE) { ready = true; panel.wa('open', { me: '62800000000 (uji)' }); return; }
  panel.wa('connecting');
  const { state, saveCreds } = await useMultiFileAuthState(path.join(DATA, 'auth'));
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: Browsers.windows('Portal Waspang') });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) cmdQueue = cmdQueue.then(() => onMessage(m)).catch(e => log('Perintah gagal:', e.message));
  });
  let pairingAsked = false;
  sock.ev.on('connection.update', async (u) => {
    if (u.qr) {
      if (CFG.pairPhone && !pairingAsked) {
        // Tautkan dengan nomor: di HP buka WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon.
        pairingAsked = true;
        try { const kode = await sock.requestPairingCode(String(CFG.pairPhone).replace(/\D/g, '')); log('KODE TAUTAN:', kode); panel.wa('qr', { pairCode: kode }); }
        catch (e) { log('Kode tautan gagal, pakai QR di bawah:', e.message); }
      }
      if (!CFG.pairPhone) {
        log('Scan QR ini dari HP: WhatsApp > Perangkat tertaut > Tautkan perangkat');
        if (process.stdout.isTTY) qrcode.generate(u.qr, { small: true });   // di jendela hitam saja; tanpa jendela, QR ada di panel
        panel.wa('qr', { qr: u.qr });
      }
    }
    if (u.connection === 'open') {
      ready = true;
      groupJid = null;
      log('Tersambung ke WhatsApp sebagai', sock.user && sock.user.id);
      panel.wa('open', { me: sock.user && String(sock.user.id).split(':')[0].split('@')[0] });
      panel.event('ok', 'WhatsApp tersambung');
    }
    if (u.connection === 'close') {
      ready = false;
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // Dilepas dari HP / ditautkan ulang dari panel: tautan lama dibuang, QR baru tampil di panel.
        log('Perangkat dikeluarkan dari WhatsApp. Menyiapkan QR untuk menautkan ulang...');
        panel.event('err', 'Dilepas dari WhatsApp, tautkan ulang');
        fs.rmSync(path.join(DATA, 'auth'), { recursive: true, force: true });
        setTimeout(connect, 2000);
        return;
      }
      log('Sambungan WhatsApp putus (' + code + '), menyambung ulang...');
      panel.wa('connecting');
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

// Nomor pengirim (628...) dari JID; akun yang tampil sebagai @lid dicari nomornya lewat peta LID Baileys.
async function phoneOf(jid, alt) {
  for (const j of [alt, jid]) if (j && /@s\.whatsapp\.net$/.test(j)) return j.split('@')[0].split(':')[0];
  try {
    const pn = jid && /@lid$/.test(jid) && await sock.signalRepository.lidMapping.getPNForLID(jid);
    if (pn) return String(pn).split('@')[0].split(':')[0];
  } catch (e) {}
  return '';
}

let cmdQueue = Promise.resolve();
const stokwhSender = {};
async function onMessage(m) {
  const k = m.key || {}, chat = k.remoteJid || '';
  if (k.fromMe || !m.message || chat === 'status@broadcast' || /@newsletter$|@broadcast$/.test(chat)) return;
  // Pesan lama yang ikut terunduh saat menyambung ulang tidak dijawab.
  if (Date.now() / 1000 - Number(m.messageTimestamp || 0) > 120) return;
  const msg = m.message.ephemeralMessage ? m.message.ephemeralMessage.message : m.message;
  const doc = msg.documentMessage || (msg.documentWithCaptionMessage && msg.documentWithCaptionMessage.message.documentMessage);
  let text = String(msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || (doc && doc.caption) || '').trim();
  const isGroup = /@g\.us$/.test(chat);
  const sender = isGroup ? k.participant || '' : chat;
  // Excel stok WH: file .xlsx dengan caption "!stokwh". File .xlsx berikutnya dari pengirim yang sama dalam 3 menit
  // (kirim beberapa file sekaligus, hanya file pertama yang ber-caption) ikut dibaca.
  const isXlsx = doc && (/\.xlsx$/i.test(doc.fileName || '') || /spreadsheetml/.test(doc.mimetype || ''));
  if (isXlsx && /^[!\/]?stokwh\b/i.test(text)) stokwhSender[chat + sender] = Date.now();
  else if (isXlsx && Date.now() - (stokwhSender[chat + sender] || 0) < 180000) text = '!stokwh';
  if (doc && !(isXlsx && /^[!\/]?stokwh\b/i.test(text))) return;
  if (!text || text.length > (isGroup ? 300 : 4000)) return;   // chat pribadi boleh panjang (daftar permit)
  if (isGroup) {
    if (!/^[!\/]/.test(text) || chat !== await targetJid()) return;
  }
  let excel;
  if (doc) {
    if (Number(doc.fileLength || 0) > 30 * 1024 * 1024) { await sock.sendMessage(chat, { text: 'File terlalu besar (maks 30 MB).' }, { quoted: m }); return; }
    try {
      const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
      excel = { name: String(doc.fileName || 'file.xlsx').slice(0, 80), sheets: readXlsx(buf) };
    } catch (e) {
      log('Excel gagal dibaca:', e.message);
      await sock.sendMessage(chat, { text: 'File Excel gagal dibaca: ' + e.message }, { quoted: m });
      return;
    }
  }
  const from = isGroup ? await phoneOf(k.participant, k.participantAlt) : await phoneOf(chat, k.remoteJidAlt);
  const { reply } = await api({ action: 'WA_CMD', chat: isGroup ? 'group' : 'dm', from, fromName: m.pushName || '', jid: chat, text, excel });
  if (!reply) return;
  await sock.sendMessage(chat, { text: reply }, { quoted: m });
  log('Perintah dijawab:', text.split(/\s+/)[0], isGroup ? '(grup)' : '(pribadi ' + from + ')');
  panel.count('cmd'); panel.event('bot', text.split(/\s+/).slice(0, 3).join(' ').slice(0, 40));
}

// Tag anggota grup: Apps Script menulis "@628..." di teks dan nomornya di mentions. Grup yang memakai LID butuh
// JID @lid, jadi nomor dicari LID-nya lewat peta Baileys; bila tidak ketemu dipakai JID nomor biasa.
async function withMentions(text, nums) {
  const mentions = [];
  for (const n of nums || []) {
    let jid = n + '@s.whatsapp.net';
    try {
      const lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
      if (lid) {
        jid = String(lid).split(':')[0].replace(/@.*$/, '') + '@lid';
        text = text.split('@' + n).join('@' + jid.split('@')[0]);
      }
    } catch (e) {}
    mentions.push(jid);
  }
  return mentions.length ? { text, mentions } : { text };
}

// Satu laporan: teks saja, atau file (foto/PDF) dengan keterangan pada file pertama.
async function sendJob(job) {
  if (FAKE) return;
  const jid = job.to || await targetJid();   // job.to = pengingat bot ke chat pribadi
  const files = job.files || [];
  if (!files.length) {
    await sock.sendMessage(jid, await withMentions(job.text || '', job.mentions));
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
    panel.pulled((jobs || []).length);
    for (const job of jobs || []) {
      try {
        await sendJob(job);
        await api({ action: 'WA_DONE', key: job.key, ok: true });
        log('Terkirim:', job.key, (job.files || []).length ? (job.files.length + ' file') : 'teks');
        panel.count('sent'); panel.event('ok', jobLabel(job));
      } catch (e) {
        log('Gagal kirim', job.key + ':', e.message);
        panel.count('fail'); panel.event('err', 'Gagal: ' + e.message.slice(0, 60));
        await api({ action: 'WA_DONE', key: job.key, ok: false, error: e.message }).catch(() => {});
        if (/tidak ditemukan/.test(e.message)) groupJid = null;
      }
    }
  } catch (e) {
    log('Antrean belum bisa diambil:', e.message);
    panel.pullFailed(e.message);
  } finally {
    busy = false;
  }
}

// Ringkasan isi laporan untuk log panel: baris pertama teks, tanpa tanda format WhatsApp.
function jobLabel(job) {
  const n = (job.files || []).length;
  const first = String(job.text || '').split('\n').map(x => x.replace(/[*_~`>]/g, '').trim()).filter(Boolean)[0] || 'Laporan';
  return (n ? n + ' file · ' : '') + first.slice(0, 48);
}

// Panel (tampilan) + tombol. Server hanya di 127.0.0.1, kecuali config "panelLan": true.
await startPanel({
  dataDir: DATA, port: Number(CFG.panelPort) || 8737, lan: CFG.panelLan === true, configured, pollMs: POLL_MS,
  config: { url: CFG.url || '', group: CFG.group || '', hasSecret: !!CFG.secret },
  isReady: () => ready,
  test: async () => {
    if (!ready) throw new Error('WhatsApp belum tersambung.');
    if (!FAKE) await sock.sendMessage(await targetJid(), { text: '✅ Tes IRIS Gateway · ' + new Date().toLocaleString('id-ID') });
    panel.event('ok', 'Pesan tes terkirim');
  },
  reconnect: () => { panel.event('re', 'Sambung ulang manual'); try { sock && sock.end(new Error('sambung ulang')); } catch (e) { setTimeout(connect, 1000); } },
  relink: async () => { panel.event('re', 'Tautkan ulang'); try { await sock.logout(); } catch (e) { fs.rmSync(path.join(DATA, 'auth'), { recursive: true, force: true }); process.exit(1); } },
  saveSetup: (c) => {
    const next = Object.assign({}, CFG, { url: c.url || CFG.url, group: c.group || CFG.group, pollSeconds: CFG.pollSeconds || 15 });
    if (c.secret) next.secret = c.secret;
    fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2));
    setTimeout(() => process.exit(1), 300);   // pelari (jalankan.bat) menyalakan ulang dengan config baru
  }
});

if (!configured) {
  log('config belum lengkap (url, secret, group). Isi lewat panel IRIS Gateway atau', CFG_FILE);
  panel.wa('noconfig');
} else {
  await connect();
  setInterval(poll, POLL_MS);
  log('Gateway berjalan. Cek antrean tiap', POLL_MS / 1000, 'detik.');
}

// Pengawas: jam loncat > 60 dtk = laptop baru bangun dari sleep -> sambung ulang segera (soket lama biasanya mati diam-diam).
// WhatsApp tidak tersambung > 5 menit (bukan sedang menunggu scan) atau antrean gagal > 10 menit -> keluar,
// pelari menyalakan ulang program dari awal.
let lastTick = Date.now(), downSince = 0;
setInterval(() => {
  const now = Date.now(), gap = now - lastTick; lastTick = now;
  if (gap > 60000) {
    log('Laptop bangun dari sleep (' + Math.round(gap / 1000) + ' dtk). Menyambung ulang WhatsApp...');
    panel.resumed(gap);
    if (configured && !FAKE) { try { sock && sock.end(new Error('bangun dari sleep')); } catch (e) {} }
    downSince = 0; return;
  }
  if (!configured || FAKE) return;
  const st = panel.state();
  if (!ready && st.wa !== 'qr') { downSince = downSince || now; if (now - downSince > 5 * 60000) { log('WhatsApp 5 menit tidak tersambung, program dimulai ulang.'); process.exit(1); } }
  else downSince = 0;
  if (ready && now - (st.lastPollOk || st.startedAt) > 10 * 60000) { log('Antrean 10 menit gagal diambil, program dimulai ulang.'); process.exit(1); }
}, 5000);
process.on('unhandledRejection', e => log('Error:', e && e.message ? e.message : e));
