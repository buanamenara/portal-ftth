// Gateway WhatsApp Portal Waspang untuk laptop yang menyala 24 jam.
// Laptop menautkan nomor WA laporan sebagai "perangkat tertaut" (seperti WhatsApp Web), lalu setiap beberapa detik
// mengambil antrean laporan dari Apps Script Waspang (WA_PULL), mengirimnya ke grup, dan melapor balik (WA_DONE).
// Laptop yang menghubungi Apps Script, bukan sebaliknya: tidak perlu IP publik, port terbuka, atau tunnel.
// Bot perintah pendek: pesan di grup yang diawali "!" dan chat pribadi ke nomor ini diteruskan ke Apps Script (WA_CMD);
// Apps Script yang memutuskan perlu dijawab atau tidak (nomor pemilik di Script Property WA_OWNER), laptop mengirim jawabannya.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers, downloadMediaMessage, decryptPollVote, jidNormalizedUser } from '@whiskeysockets/baileys';
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

let sock = null, ready = false, groupJid = null, activeSince = Date.now();
const configured = !!(CFG.url && CFG.secret && CFG.group);
const paused = () => panel.state().paused;   // tombol Stop di panel: WhatsApp diputus, antrean tidak diambil (bertahan walau restart)
// config.json dibaca ulang tiap kali, supaya isian lain (mis. panelPass yang dihapus manual) tidak tertimpa.
const readCfg = () => { try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) { return {}; } };
const writeCfg = (c) => fs.writeFileSync(CFG_FILE, JSON.stringify(c, null, 2));

async function connect() {
  if (paused()) { ready = false; panel.wa('paused'); return; }
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
      if (paused()) { log('Gateway dihentikan dari panel.'); panel.wa('paused'); return; }
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      if (code === DisconnectReason.connectionReplaced) {
        // Nomor ini dipakai gateway lain (mis. laptop lama masih menyala dengan folder auth yang sama).
        log('Sambungan diambil alih gateway lain dengan tautan yang sama. Dicoba lagi 60 detik lagi.');
        panel.event('err', 'Dipakai gateway lain (tutup gateway lama)');
        panel.wa('connecting');
        setTimeout(connect, 60000);
        return;
      }
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

// ---- Menu IRIS (polling WhatsApp) ----
// Polling yang dikirim gateway disimpan (kunci rahasia + daftar pilihan) supaya pilihan anggota bisa dibaca.
// Suara polling terenkripsi: kuncinya messageSecret polling + JID pembuat & pemilih (bisa nomor atau LID), jadi dicoba semua pasangan.
const POLL_FILE = path.join(DATA, 'menu-polling.json');
let polls = {};
try { polls = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8')); } catch (e) {}
const votesSeen = new Set();
function savePolls() {
  const ids = Object.keys(polls).sort((a, b) => polls[b].t - polls[a].t);
  for (const id of ids.slice(60)) delete polls[id];   // simpan 60 polling terakhir
  try { fs.writeFileSync(POLL_FILE, JSON.stringify(polls)); } catch (e) {}
}
async function sendMenuPoll(chat, p) {
  const sent = await sock.sendMessage(chat, { poll: { name: String(p.name).slice(0, 255), values: p.values.slice(0, 12), selectableCount: 1 } });
  const secret = sent && sent.message && sent.message.messageContextInfo && sent.message.messageContextInfo.messageSecret;
  if (!secret) throw new Error('kunci polling tidak ada');
  polls[sent.key.id] = { s: Buffer.from(secret).toString('base64'), o: p.values.slice(0, 12), c: chat, t: Date.now() };
  savePolls();
}
const sha256 = (t) => crypto.createHash('sha256').update(Buffer.from(t)).digest('hex');
function readVote(upd, rec, voterJids) {
  const me = sock.user || {}, creators = [me.id, me.lid].filter(Boolean).map(j => jidNormalizedUser(j));
  const voters = [...new Set(voterJids.filter(Boolean).map(j => jidNormalizedUser(j)))];
  const pollEncKey = Buffer.from(rec.s, 'base64');
  for (const pollCreatorJid of creators) for (const voterJid of voters) {
    try {
      const v = decryptPollVote(upd.vote, { pollEncKey, pollCreatorJid, pollMsgId: upd.pollCreationMessageKey.id, voterJid });
      const pilih = (v.selectedOptions || []).map(b => Buffer.from(b).toString('hex'));
      return rec.o.filter(o => pilih.includes(sha256(o)));
    } catch (e) {}
  }
  return null;
}
async function onVote(m, upd) {
  const k = m.key || {}, chat = k.remoteJid || '', isGroup = /@g\.us$/.test(chat);
  const rec = upd.pollCreationMessageKey && polls[upd.pollCreationMessageKey.id];
  if (!rec || !upd.vote || votesSeen.has(k.id)) return;
  votesSeen.add(k.id); if (votesSeen.size > 500) votesSeen.clear();
  if (isGroup && chat !== await targetJid()) return;
  const pilih = readVote(upd, rec, isGroup ? [k.participant, k.participantAlt] : [chat, k.remoteJidAlt]);
  if (pilih === null) { log('Suara polling tidak bisa dibaca:', k.id); return; }
  if (!pilih.length) return;   // pilihan dibatalkan
  const from = isGroup ? await phoneOf(k.participant, k.participantAlt) : await phoneOf(chat, k.remoteJidAlt);
  const res = await api({ action: 'WA_CMD', chat: isGroup ? 'group' : 'dm', from, fromName: m.pushName || '', jid: chat, text: (isGroup ? '!' : '') + 'pilih ' + pilih[0], canPoll: true });
  if (res.poll) await sendMenuPoll(chat, res.poll);
  if (!res.reply) return;
  const siapa = m.pushName || from || 'Anggota';
  await sock.sendMessage(chat, { text: '↪️ _' + siapa + ': ' + pilih[0] + '_\n\n' + res.reply });
  log('Menu dijawab:', pilih[0], isGroup ? '(grup)' : '(pribadi ' + from + ')');
  panel.count('cmd'); panel.event('bot', 'Menu: ' + pilih[0].slice(0, 34));
}

let cmdQueue = Promise.resolve();
const stokwhSender = {};
async function onMessage(m) {
  const k = m.key || {}, chat = k.remoteJid || '';
  if (k.fromMe || !m.message || chat === 'status@broadcast' || /@newsletter$|@broadcast$/.test(chat)) return;
  // Pesan lama yang ikut terunduh saat menyambung ulang tidak dijawab.
  if (Date.now() / 1000 - Number(m.messageTimestamp || 0) > 120) return;
  const msg = m.message.ephemeralMessage ? m.message.ephemeralMessage.message : m.message;
  if (msg.pollUpdateMessage) return onVote(m, msg.pollUpdateMessage);
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
  const { reply, poll: menu } = await api({ action: 'WA_CMD', chat: isGroup ? 'group' : 'dm', from, fromName: m.pushName || '', jid: chat, text, excel, canPoll: true });
  if (menu) {
    await sendMenuPoll(chat, menu);
    log('Menu polling dikirim', isGroup ? '(grup)' : '(pribadi ' + from + ')');
    panel.count('cmd'); panel.event('bot', 'Menu polling');
  }
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
  if (busy || !ready || paused()) return;
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
  stop: () => {
    if (paused()) return;
    panel.setPaused(true); ready = false; panel.event('err', 'Gateway dihentikan (Stop)'); log('Stop dari panel.');
    if (FAKE || !sock) { panel.wa('paused'); return; }
    try { sock.end(new Error('stop')); } catch (e) { panel.wa('paused'); }
  },
  start: () => {
    if (!paused()) return;
    panel.setPaused(false); activeSince = Date.now(); panel.event('ok', 'Gateway dijalankan lagi'); log('Jalankan dari panel.');
    if (configured) connect().catch(e => log('Gagal menyambung:', e.message));
  },
  quit: () => {
    // Tutup program: pelari berhenti (kode 4) dan jadwal "jaga" tidak menyalakannya lagi sampai dibuka dari shortcut.
    try { fs.writeFileSync(path.join(DATA, 'tutup.flag'), new Date().toISOString()); } catch (e) {}
    panel.event('err', 'Program ditutup dari panel'); log('Program ditutup dari panel.');
    setTimeout(() => process.exit(4), 300);
  },
  passGet: () => readCfg().panelPass || null,
  passSet: (rec) => { const c = readCfg(); c.panelPass = rec; writeCfg(c); },
  saveSetup: (c) => {
    const cur = readCfg();
    const next = Object.assign({}, cur, { url: c.url || cur.url, group: c.group || cur.group, pollSeconds: cur.pollSeconds || 15 });
    if (c.secret) next.secret = c.secret;
    writeCfg(next);
    setTimeout(() => process.exit(1), 300);   // pelari (jalankan.bat) menyalakan ulang dengan config baru
  }
});
try { fs.rmSync(path.join(DATA, 'tutup.flag'), { force: true }); } catch (e) {}

if (!configured) {
  log('config belum lengkap (url, secret, group). Isi lewat panel IRIS Gateway atau', CFG_FILE);
  panel.wa('noconfig');
} else {
  await connect();
  setInterval(poll, POLL_MS);
  log(paused() ? 'Gateway dalam keadaan Stop (jalankan lagi dari panel).' : 'Gateway berjalan. Cek antrean tiap ' + POLL_MS / 1000 + ' detik.');
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
    if (configured && !FAKE && !paused()) { try { sock && sock.end(new Error('bangun dari sleep')); } catch (e) {} }
    downSince = 0; return;
  }
  if (!configured || FAKE || paused()) { downSince = 0; return; }
  const st = panel.state();
  if (!ready && st.wa !== 'qr') { downSince = downSince || now; if (now - downSince > 5 * 60000) { log('WhatsApp 5 menit tidak tersambung, program dimulai ulang.'); process.exit(1); } }
  else downSince = 0;
  if (ready && now - Math.max(st.lastPollOk || 0, st.startedAt, activeSince) > 10 * 60000) { log('Antrean 10 menit gagal diambil, program dimulai ulang.'); process.exit(1); }
}, 5000);
process.on('unhandledRejection', e => log('Error:', e && e.message ? e.message : e));
