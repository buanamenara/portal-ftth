#!/usr/bin/env node
// Mencatat deploy ke MEMORY.md: baris project di tabel "Versi live" diganti, satu baris ditambahkan di atas
// "Riwayat deploy" (maks 80 baris; yang lebih lama dipindah ke docs/MEMORY_ARSIP.md).
// Dipakai workflow deploy, dan manual untuk deploy di luar workflow:
//   node scripts/update-memory.mjs --project waspang --version 122 --commit abc1234 --subject "..." --by "clasp laptop"
import fs from 'node:fs';
import path from 'node:path';

const arg = {};
for (let i = 2; i < process.argv.length; i += 2) arg[process.argv[i].replace(/^--/, '')] = process.argv[i + 1] || '';
const file = arg.file || 'MEMORY.md';
const project = String(arg.project || '').toLowerCase();
const version = String(arg.version || '').replace(/^@/, '');
if (!/^(waspang|ftth|gateway)$/.test(project) || !/^\d+$/.test(version)) {
  console.error('Pakai: --project waspang|ftth|gateway --version <angka> [--commit sha] [--subject teks] [--by siapa] [--file MEMORY.md]');
  process.exit(2);
}
const clean = (s, n) => String(s || '').replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || '-';
const commit = clean(arg.commit, 12).slice(0, 7);
const subject = clean(arg.subject, 140);
const by = clean(arg.by || 'manual', 40);
const wita = new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);   // WITA = UTC+8

let md = fs.readFileSync(file, 'utf8');
const block = (name) => {
  const a = md.indexOf('<!-- ' + name + ':START -->'), b = md.indexOf('<!-- ' + name + ':END -->');
  if (a < 0 || b < a) throw new Error('Penanda ' + name + ' tidak ada di ' + file);
  return { a: a + ('<!-- ' + name + ':START -->').length, b };
};

// 1) Tabel versi live
let L = block('LIVE');
let rows = md.slice(L.a, L.b).split('\n');
const row = `| ${project} | @${version} | ${wita} | ${commit} | ${subject} |`;
const at = rows.findIndex(r => r.startsWith(`| ${project} |`));
if (at >= 0) rows[at] = row; else rows.splice(rows.length - 1, 0, row);
md = md.slice(0, L.a) + rows.join('\n') + md.slice(L.b);

// 2) Riwayat deploy
const G = block('LOG');
let log = md.slice(G.a, G.b).split('\n').filter(l => l.startsWith('- '));
log.unshift(`- ${wita} · **${project} @${version}** · ${commit} · ${subject} · ${by}`);
if (log.length > 80) {
  const arsip = path.join(path.dirname(file), 'docs', 'MEMORY_ARSIP.md');
  fs.mkdirSync(path.dirname(arsip), { recursive: true });
  const lama = fs.existsSync(arsip) ? fs.readFileSync(arsip, 'utf8') : '# Arsip riwayat deploy\n\n';
  fs.writeFileSync(arsip, lama.trimEnd() + '\n' + log.slice(80).join('\n') + '\n');
  log = log.slice(0, 80);
}
md = md.slice(0, G.a) + '\n' + log.join('\n') + '\n' + md.slice(G.b);
fs.writeFileSync(file, md);
console.log('MEMORY.md diperbarui:', row);
