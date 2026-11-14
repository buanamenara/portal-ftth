// Panel IRIS Gateway: server lokal kecil + status untuk tampilan (panel.html).
// Hanya mendengar di 127.0.0.1 (laptop gateway sendiri) kecuali config "panelLan": true.
// Semua data dan tombol butuh login kata sandi admin (disimpan sebagai hash scrypt di config.json "panelPass").
// Tombol (POST) juga wajib membawa header X-IRIS supaya halaman lain di browser tidak bisa memicunya.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DAY = () => new Date().toLocaleDateString('sv-SE');   // yyyy-mm-dd zona waktu laptop
const SESI_MS = 12 * 3600 * 1000, COOKIE = 'iris_s';

const st = {
  startedAt: Date.now(), wa: 'connecting', me: '', qr: '', qrSvg: '', pairCode: '', waSince: 0,
  lastPoll: 0, lastPollOk: 0, lastPollErr: '', pending: 0, paused: false,
  day: DAY(), sent: 0, fail: 0, cmd: 0, restarts: 0, lastResume: 0,
  beats: {},   // menit (epoch/60000) -> 1 hidup, 0 mati; 24 jam terakhir (menit saat dihentikan tidak dicatat)
  events: [],  // { t, k: ok|err|bot|re, x }
  sess: {},    // sha256(token) -> kedaluwarsa
  pet: false,  // pet iRIS di desktop laptop gateway (nyala/mati dari menu panel)
  petEv: [], petSeq: 0   // kejadian untuk pet: { id, k: dengar|jawab|diam } (tidak disimpan)
};
let file = '', opts = {};

function save() {
  try { fs.writeFileSync(file, JSON.stringify({ day: st.day, sent: st.sent, fail: st.fail, cmd: st.cmd, restarts: st.restarts, paused: st.paused, beats: st.beats, events: st.events, sess: st.sess, pet: st.pet })); } catch (e) {}
}
function rollDay() { if (st.day !== DAY()) { st.day = DAY(); st.sent = st.fail = st.cmd = 0; } }

export const panel = {
  state: () => st,
  wa(state, extra = {}) {
    if (state !== st.wa) st.waSince = Date.now();
    st.wa = state;
    if (state !== 'qr') { st.qr = ''; st.qrSvg = ''; st.pairCode = ''; }
    if (extra.me) st.me = extra.me;
    if (extra.pairCode) st.pairCode = extra.pairCode;
    if (extra.qr && extra.qr !== st.qr) {
      st.qr = extra.qr;
      QRCode.toString(extra.qr, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } })
        .then(svg => { if (st.qr === extra.qr) st.qrSvg = svg; }).catch(() => {});
    }
  },
  setPaused(v) { st.paused = !!v; save(); },
  pulled(n) { st.lastPoll = st.lastPollOk = Date.now(); st.lastPollErr = ''; st.pending = n; },
  pullFailed(msg) { st.lastPoll = Date.now(); st.lastPollErr = String(msg).slice(0, 120); },
  count(k) { rollDay(); st[k]++; if ((k === 'sent' || k === 'fail') && st.pending > 0) st.pending--; save(); },
  event(k, x) { st.events.unshift({ t: Date.now(), k, x: String(x).slice(0, 80) }); st.events.length = Math.min(st.events.length, 40); save(); },
  setPet(v) { st.pet = !!v; save(); },
  petOn() { return st.pet; },
  petEvent(k) { st.petEv.push({ id: ++st.petSeq, k, t: Date.now() }); if (st.petEv.length > 10) st.petEv.shift(); },
  resumed(gap) { st.lastResume = Date.now(); st.restarts++; panel.event('re', 'Bangun dari sleep (' + Math.round(gap / 60000) + ' mnt)'); }
};

function snapshot() {
  rollDay();
  const now = Date.now(), m0 = Math.floor(now / 60000), bars = [];
  // 48 batang x 30 menit = 24 jam; batang merah bila ada menit mati, abu-abu bila tidak ada data (laptop mati / dihentikan)
  for (let b = 47; b >= 0; b--) {
    let up = 0, down = 0;
    for (let m = m0 - b * 30 - 29; m <= m0 - b * 30; m++) { const v = st.beats[m]; if (v === 1) up++; else if (v === 0) down++; }
    bars.push(down ? 0 : up ? 1 : -1);
  }
  const vals = Object.values(st.beats), up = vals.filter(v => v === 1).length;
  return {
    wa: st.wa, me: st.me, qrSvg: st.qrSvg, pairCode: st.pairCode, waSince: st.waSince, paused: st.paused,
    configured: opts.configured, config: opts.config,
    lastPoll: st.lastPoll, lastPollOk: st.lastPollOk, lastPollErr: st.lastPollErr, pending: st.pending, pollMs: opts.pollMs,
    sent: st.sent, fail: st.fail, cmd: st.cmd, restarts: st.restarts, lastResume: st.lastResume,
    uptime: vals.length ? Math.round(up / vals.length * 1000) / 10 : null, bars,
    events: st.events.slice(0, 8), now, host: os.hostname(), startedAt: st.startedAt,
    groups: opts.groups ? opts.groups() : [],
    pet: st.pet, petBisa: !!opts.petBisa
  };
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' }, extra));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// ---- kata sandi admin ----
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPass(pw) { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') }; }
function checkPass(pw, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const a = crypto.scryptSync(String(pw), rec.salt, 32), b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function validNew(pw) { pw = String(pw || ''); if (pw.length < 8) throw new Error('Kata sandi minimal 8 karakter.'); if (pw.length > 200) throw new Error('Kata sandi terlalu panjang.'); return pw; }
function tokenOf(req) { const m = /(?:^|;\s*)iris_s=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m ? m[1] : ''; }
function loggedIn(req) {
  const t = tokenOf(req); if (!t) return false;
  const k = sha(t), exp = st.sess[k];
  if (!exp || exp < Date.now()) { if (exp) { delete st.sess[k]; save(); } return false; }
  if (!opts.passGet()) return false;   // panelPass dihapus dari config.json = semua sesi gugur
  if (exp - Date.now() < SESI_MS - 600000) { st.sess[k] = Date.now() + SESI_MS; save(); }   // diperpanjang selama dipakai
  return true;
}
function newSession() {
  const now = Date.now(); for (const [k, v] of Object.entries(st.sess)) if (v < now) delete st.sess[k];
  const t = crypto.randomBytes(32).toString('hex'); st.sess[sha(t)] = now + SESI_MS; save();
  return { 'Set-Cookie': COOKIE + '=' + t + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESI_MS / 1000 };
}
const gagal = { n: 0, until: 0 };
function guardLogin() { if (Date.now() < gagal.until) throw new Error('Terlalu banyak salah. Coba lagi ' + Math.ceil((gagal.until - Date.now()) / 1000) + ' detik lagi.'); }
function wrong() { gagal.n++; if (gagal.n >= 5) { gagal.until = Date.now() + 60000 * Math.min(10, gagal.n - 4); } throw new Error('Kata sandi salah.'); }

export function startPanel(o) {
  opts = o; file = path.join(o.dataDir, 'state.json');
  try { const old = JSON.parse(fs.readFileSync(file, 'utf8')); Object.assign(st, old); st.sess = st.sess || {}; } catch (e) {}
  st.petEv = []; st.petSeq = 0;
  rollDay();
  // Denyut tiap menit: hidup = WhatsApp tersambung dan antrean berhasil diambil < 2 menit terakhir.
  setInterval(() => {
    const now = Date.now(), m = Math.floor(now / 60000);
    if (!st.paused) st.beats[m] = (o.isReady() && now - st.lastPollOk < 120000) ? 1 : 0;
    for (const k of Object.keys(st.beats)) if (k < m - 1440) delete st.beats[k];
    save();
  }, 60000);
  const STATIC = { '/': ['panel.html', 'text/html; charset=utf-8'], '/emblem.png': ['assets/iris_emblem.png', 'image/png'], '/mata.png': ['assets/iris_mata.png', 'image/png'] };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x'), p = url.pathname;
      if (req.method === 'GET' && STATIC[p]) return send(res, 200, fs.readFileSync(path.join(DIR, STATIC[p][0])), STATIC[p][1]);
      if (req.method === 'GET' && p === '/api/auth') return send(res, 200, { hasPass: !!o.passGet(), in: loggedIn(req) });
      // Pet iRIS (pet/pet.ps1) hanya dari laptop ini: membaca suasana + kejadian, atau minta dirinya dimatikan.
      const lokal = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
      if (p === '/api/pet' && req.method === 'GET') {
        if (!lokal) return send(res, 404, { ok: false });
        const mood = st.paused ? 'tidur' : st.wa === 'open' ? 'senang' : (st.wa === 'connecting' || st.wa === 'qr') ? 'tunggu' : 'putus';
        return send(res, 200, { ok: true, on: st.pet, mood, ev: st.petEv, seq: st.petSeq });
      }
      if (p === '/api/pet-mati' && req.method === 'POST' && lokal && req.headers['x-iris'] === '1') { o.pet(false); return send(res, 200, { ok: true }); }
      if (req.method === 'GET' && p === '/api/status') return loggedIn(req) ? send(res, 200, snapshot()) : send(res, 401, { ok: false, login: true });
      if (req.method !== 'POST' || req.headers['x-iris'] !== '1') return send(res, 404, { ok: false });
      let body = ''; for await (const c of req) { body += c; if (body.length > 10000) throw new Error('terlalu besar'); }
      const data = body ? JSON.parse(body) : {};
      // tanpa login: buat kata sandi pertama kali, masuk
      if (p === '/api/sandi-baru') {
        if (o.passGet()) throw new Error('Kata sandi sudah dibuat. Silakan masuk.');
        o.passSet(hashPass(validNew(data.password)));
        panel.event('re', 'Kata sandi admin dibuat');
        return send(res, 200, { ok: true }, undefined, newSession());
      }
      if (p === '/api/masuk') {
        guardLogin();
        if (!checkPass(data.password, o.passGet())) wrong();
        gagal.n = 0; gagal.until = 0;
        return send(res, 200, { ok: true }, undefined, newSession());
      }
      if (!loggedIn(req)) return send(res, 401, { ok: false, login: true, error: 'Silakan masuk dulu.' });
      if (p === '/api/keluar') { delete st.sess[sha(tokenOf(req))]; save(); return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
      if (p === '/api/ganti-sandi') {
        if (!checkPass(data.lama, o.passGet())) throw new Error('Kata sandi lama salah.');
        o.passSet(hashPass(validNew(data.baru)));
        st.sess = {}; panel.event('re', 'Kata sandi admin diganti');
        return send(res, 200, { ok: true }, undefined, newSession());
      }
      if (p === '/api/test') await o.test();
      else if (p === '/api/reconnect') o.reconnect();
      else if (p === '/api/relink') await o.relink();
      else if (p === '/api/stop') o.stop();
      else if (p === '/api/start') o.start();
      else if (p === '/api/restart') o.restart();
      else if (p === '/api/pet') o.pet(!!data.on);
      else if (p === '/api/tutup') o.quit();
      else if (p === '/api/setup') {
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(data.url || o.config.url || ''))) throw new Error('URL Apps Script tidak valid.');
        if (!o.config.hasSecret && String(data.secret || '').length < 16) throw new Error('Kata sandi WA_PC_SECRET minimal 16 karakter.');
        o.saveSetup({ url: String(data.url || '').trim(), secret: String(data.secret || '').trim(), group: String(data.group || '').trim() });
      } else return send(res, 404, { ok: false });
      send(res, 200, { ok: true });
    } catch (e) { send(res, 400, { ok: false, error: e.message }); }
  });
  return new Promise((resolve) => {
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') { console.log('IRIS Gateway sudah berjalan (port ' + o.port + ' dipakai). Program ini berhenti.'); process.exit(3); }
      console.log('Panel tidak bisa dibuka:', e.message); resolve();
    });
    server.listen(o.port, o.lan ? '0.0.0.0' : '127.0.0.1', () => { console.log('Panel IRIS Gateway: http://127.0.0.1:' + o.port); resolve(); });
  });
}
