// Panel IRIS Gateway: server lokal kecil + status untuk tampilan (panel.html).
// Hanya mendengar di 127.0.0.1 (laptop gateway sendiri) kecuali config "panelLan": true. Tombol (POST) wajib
// membawa header X-IRIS supaya halaman lain di browser tidak bisa memicunya.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DAY = () => new Date().toLocaleDateString('sv-SE');   // yyyy-mm-dd zona waktu laptop

const st = {
  startedAt: Date.now(), wa: 'connecting', me: '', qr: '', qrSvg: '', pairCode: '', waSince: 0,
  lastPoll: 0, lastPollOk: 0, lastPollErr: '', pending: 0,
  day: DAY(), sent: 0, fail: 0, cmd: 0, restarts: 0, lastResume: 0,
  beats: {},   // menit (epoch/60000) -> 1 hidup, 0 mati; 24 jam terakhir
  events: []   // { t, k: ok|err|bot|re, x }
};
let file = '', opts = {};

function save() { try { fs.writeFileSync(file, JSON.stringify({ day: st.day, sent: st.sent, fail: st.fail, cmd: st.cmd, restarts: st.restarts, beats: st.beats, events: st.events })); } catch (e) {} }
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
  pulled(n) { st.lastPoll = st.lastPollOk = Date.now(); st.lastPollErr = ''; st.pending = n; },
  pullFailed(msg) { st.lastPoll = Date.now(); st.lastPollErr = String(msg).slice(0, 120); },
  count(k) { rollDay(); st[k]++; if ((k === 'sent' || k === 'fail') && st.pending > 0) st.pending--; save(); },
  event(k, x) { st.events.unshift({ t: Date.now(), k, x: String(x).slice(0, 80) }); st.events.length = Math.min(st.events.length, 40); save(); },
  resumed(gap) { st.lastResume = Date.now(); st.restarts++; panel.event('re', 'Bangun dari sleep (' + Math.round(gap / 60000) + ' mnt)'); }
};

function snapshot() {
  rollDay();
  const now = Date.now(), m0 = Math.floor(now / 60000), bars = [];
  // 48 batang x 30 menit = 24 jam; batang merah bila ada menit mati, abu-abu bila tidak ada data (laptop mati)
  for (let b = 47; b >= 0; b--) {
    let up = 0, down = 0;
    for (let m = m0 - b * 30 - 29; m <= m0 - b * 30; m++) { const v = st.beats[m]; if (v === 1) up++; else if (v === 0) down++; }
    bars.push(down ? 0 : up ? 1 : -1);
  }
  const vals = Object.values(st.beats), up = vals.filter(v => v === 1).length;
  return {
    wa: st.wa, me: st.me, qrSvg: st.qrSvg, pairCode: st.pairCode, waSince: st.waSince,
    configured: opts.configured, config: opts.config,
    lastPoll: st.lastPoll, lastPollOk: st.lastPollOk, lastPollErr: st.lastPollErr, pending: st.pending, pollMs: opts.pollMs,
    sent: st.sent, fail: st.fail, cmd: st.cmd, restarts: st.restarts, lastResume: st.lastResume,
    uptime: vals.length ? Math.round(up / vals.length * 1000) / 10 : null, bars,
    events: st.events.slice(0, 8), now, host: os.hostname(), startedAt: st.startedAt
  };
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

export function startPanel(o) {
  opts = o; file = path.join(o.dataDir, 'state.json');
  try { const old = JSON.parse(fs.readFileSync(file, 'utf8')); Object.assign(st, old); } catch (e) {}
  rollDay();
  // Denyut tiap menit: hidup = WhatsApp tersambung dan antrean berhasil diambil < 2 menit terakhir.
  setInterval(() => {
    const now = Date.now(), m = Math.floor(now / 60000);
    st.beats[m] = (o.isReady() && now - st.lastPollOk < 120000) ? 1 : 0;
    for (const k of Object.keys(st.beats)) if (k < m - 1440) delete st.beats[k];
    save();
  }, 60000);
  const STATIC = { '/': ['panel.html', 'text/html; charset=utf-8'], '/emblem.png': ['assets/iris_emblem.png', 'image/png'], '/mata.png': ['assets/iris_mata.png', 'image/png'] };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && STATIC[url.pathname]) return send(res, 200, fs.readFileSync(path.join(DIR, STATIC[url.pathname][0])), STATIC[url.pathname][1]);
      if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, snapshot());
      if (req.method !== 'POST' || req.headers['x-iris'] !== '1') return send(res, 404, { ok: false });
      let body = ''; for await (const c of req) { body += c; if (body.length > 10000) throw new Error('terlalu besar'); }
      const data = body ? JSON.parse(body) : {};
      if (url.pathname === '/api/test') await o.test();
      else if (url.pathname === '/api/reconnect') o.reconnect();
      else if (url.pathname === '/api/relink') await o.relink();
      else if (url.pathname === '/api/setup') {
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(data.url || o.config.url || ''))) throw new Error('URL Apps Script tidak valid.');
        if (!o.config.hasSecret && String(data.secret || '').length < 16) throw new Error('Kata sandi minimal 16 karakter.');
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
