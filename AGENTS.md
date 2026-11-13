# Panduan untuk AI dan developer: IRIS · Portal BMI

File ini untuk siapa saja yang melanjutkan pengembangan: Claude, Codex, Gemini, Cursor, Copilot, atau manusia.
**Baca dulu `MEMORY.md`.** Isinya keadaan terakhir: versi yang live, apa yang baru berubah, pekerjaan yang menunggu,
dan keputusan yang sudah diambil.

## Aturan wajib: memori selalu ikut diperbarui
1. Setiap perubahan kode atau perilaku sistem **ikut memperbarui `MEMORY.md` di commit yang sama**:
   bagian "Status & pekerjaan menunggu" dan, bila ada keputusan baru, bagian "Keputusan & aturan".
   Tulis singkat dan faktual (apa, kenapa, di file mana), tanpa rahasia.
2. Bagian "Versi live" dan "Riwayat deploy" di `MEMORY.md` **diisi otomatis** oleh workflow deploy
   (`.github/workflows/deploy-apps-script.yml` → `scripts/update-memory.mjs`). Jangan diedit manual, kecuali untuk
   membetulkan data yang salah.
3. Deploy yang tidak lewat workflow (clasp di laptop, editor Apps Script) wajib dicatat manual dengan format yang sama:
   `node scripts/update-memory.mjs --project waspang --version 121 --commit <sha> --subject "..." --by "<nama>"`.
4. Repo ini **publik**. Jangan menulis kata sandi, kode akses, token, nomor HP, email pribadi, atau isi `config.json` /
   folder `auth` gateway ke file mana pun di repo, termasuk `MEMORY.md`.

## Apa ini
Sistem kerja proyek FTTH PT Buana Menara Indonesia (BMI):
- **Portal FTTH** (`portal-ftth-gas/`): Google Apps Script web app. BOQ, BA gudang, opname, rekon, FORM ATP, dashboard.
- **Portal Waspang + bot IRIS** (`portal-waspang/`): Apps Script web app untuk Daily Report dan dokumentasi foto lapangan,
  sekaligus otak bot WhatsApp **IRIS · Asisten Proyek BMI** (perintah `!bantu`, `!menu`, rekap, stok, revisi, jadwal
  otomatis, backup, pemulihan otomatis).
- **Gateway portal** (`gateway/`): Apps Script kecil untuk login + menu, dibuka di PWA (`index.html`, GitHub Pages).
- **IRIS Gateway WhatsApp** (`wa-gateway/`): program Node.js + Baileys yang jalan 24 jam di laptop. Mengambil antrean pesan
  dari Apps Script Waspang (`WA_PULL`/`WA_DONE`) dan meneruskan perintah grup ke Apps Script (`WA_CMD`). Ada panel lokal
  (`panel.mjs`, `panel.html`) dan paket portable (`wa-gateway/portable/`).
- **Android** (`android/`): pembungkus aplikasi.

Data tinggal di Google Sheets dan Google Drive milik akun pemilik. ID spreadsheet ada di objek `CONFIG` di atas
`portal-waspang/Kode.gs` dan `portal-ftth-gas/Kode.gs`.

## Nama file: repo vs Apps Script
| Repo | Project Apps Script | Nama file di Apps Script |
|---|---|---|
| `portal-waspang/Kode.gs`, `Form.html` | Waspang | `Code.js`, `Form.html` |
| `portal-ftth-gas/Kode.gs`, `Form.html` | FTTH | `Kode.js`, `Form.html` (+ template BOQ, `KopSurat.js`, hanya ada di Apps Script) |
| `gateway/Kode.gs`, `Form.html` | Gateway | `Kode.js`, `Form.html` |

`appsscript.json` tidak disimpan di repo. Workflow deploy mengambilnya dari Apps Script dan tidak mengubahnya.

## Cara deploy
**Utama, tanpa laptop:** push commit yang mau dipasang ke branch deploy:
```
git push -f origin <commit>:refs/heads/deploy-waspang     # atau deploy-ftth / deploy-gateway
```
Workflow `Deploy Apps Script`: `clasp pull` isi project → timpa hanya kode + `Form.html` dari repo → `clasp push -f`
→ `clasp deploy` ke deployment web app yang sama (URL tetap) → cek HTTP 200 → perbarui `MEMORY.md` di `main`.
Kunci clasp ada di secret repo `CLASPRC_JSON`. Status run: tab Actions, atau
`gh api repos/buanamenara/portal-ftth/actions/runs?per_page=1`.

**Cadangan, dari laptop pemilik:** `clasp push -f` lalu `clasp deploy -i <deploymentId> -d "..."` di folder clasp
(lihat `MEMORY.md` → Lokasi). Setelah itu catat deploy dengan `scripts/update-memory.mjs`.

Trigger waktu (jadwal 07:00, 17:30, cek tiap jam, backup) menjalankan kode **HEAD** (hasil push). Web app dan balasan bot
menjalankan **versi deploy**. Jadi push saja sudah mengubah perilaku jadwal.

## Cara menguji
Belum ada test runner. Pola yang dipakai: muat `Kode.gs` di Node `vm` dengan stub `SpreadsheetApp`, `PropertiesService`,
`Utilities.formatDate` (+8 jam WITA), lalu panggil fungsinya (contoh: `waCmd_({chat:'group', text:'!menu', canPoll:true})`).
Cek sintaks: `node -e "new Function(require('fs').readFileSync('portal-waspang/Kode.gs','utf8'))"` dan
`node --check wa-gateway/gateway.mjs`.

## Konvensi kode
- Apps Script: gaya ES5 (`var`, `function`), komentar dan teks UI berbahasa Indonesia.
- Kolom sheet dicari dari judul baris 1 (`sheetHeader_`, `normHeader_`, `rowByHeader_`), jangan pakai nomor kolom tetap.
- Teks WhatsApp lewat `waText_`. Kotak kode pakai `waKode_()` (menulis `` \` ``), karena `waText_` membuang backtick biasa.
  Daftar pakai `- `, petunjuk pakai `> `. Balasan bot diberi awalan `✦ `.
- Perintah bot didaftarkan di `waCmd_` (switch), `botHelp_` (daftar `!bantu`), dan `BOT_PANDUAN_*` (PDF `!panduan`).
  Naikkan `BOT_PANDUAN_VERSI_` bila isi panduan berubah. Menu polling: `BOT_MENU_` dan `BOT_MENU_ADMIN_` (maks 12 pilihan).
- Perintah admin dicek dengan `waOwner_(p.from)` (Script Property `WA_OWNER`).
- Hapus Daily Report hanya lewat perintah `revisi <site>` → `revisi hapus`. Hapus langsung di sheet akan dipulihkan
  lagi oleh pemulihan otomatis (jurnal `JURNAL WASPANG` di spreadsheet LOG ARSIP).

## Alur kerja Git
Satu fitur = satu branch + PR ke `main`. Pemilik repo yang me-merge. PR boleh bertumpuk (dibangun di atas PR lain);
sebutkan di deskripsi PR.
