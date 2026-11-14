# MEMORY · IRIS / Portal BMI

Memori proyek yang dibaca oleh AI atau developer berikutnya. Aturan menulisnya ada di `AGENTS.md`.
Bagian bertanda *(otomatis)* diisi workflow deploy. Bagian lain diperbarui oleh siapa pun yang mengubah sistem,
di commit yang sama dengan perubahannya. Repo ini publik: tanpa rahasia, nomor HP, atau data pribadi.

## Versi live *(otomatis)*
<!-- LIVE:START -->
| Project | Versi live | Waktu (WITA) | Commit | Keterangan |
|---|---|---|---|---|
| waspang | @128 | 2026-11-14 11:08 | c5b6b3c | Merge pull request #110 from buanamenara/iris-sapa |
| ftth | @263 | 2026-11-14 05:24 | 2ae7154 | Merge pull request #105 from buanamenara/panduan-baru |
| gateway | @22 | 2026-11-05 22:46 | - | Tampilan sesuai mockup (tahap 3 lanjutan) |
<!-- LIVE:END -->

URL web app tetap: `https://script.google.com/macros/s/<deploymentId>/exec`. Deployment ID ada di
`.github/workflows/deploy-apps-script.yml`. Waspang punya health check `?api=json`.

## Status & pekerjaan menunggu
*Terakhir diperbarui 2026-11-14 10:25 WITA.*
- **`main` = yang live (13 Nov 18:01):** PR #96, #97, #98 sudah di-merge. Kode Waspang di `main` sama dengan Waspang @121 (md5 `Kode.gs` 81bb798e). Deploy dari `main` aman.
- **IRIS Gateway (laptop baru):** belum dipasang. Paket portable terbaru (menu polling) ada di
  Drive `IRIS - Asisten Proyek BMI/IRIS-Gateway-Build/IRIS-Gateway-Portable.zip`. Selama gateway lama masih jalan,
  `!menu` dibalas daftar teks (fallback), bukan polling. Menu polling belum diuji di grup WhatsApp asli.
- **Data hilang 07/11:** 4 Daily Report + 3 log foto (MF Beruntung, Lawahan, FWA Tapin, FWA HST) hilang karena
  spreadsheet Waspang dikembalikan ke versi lama (antara 7 dan 8 Nov). Belum dipulihkan. Sumbernya: Riwayat versi
  spreadsheet atau teks laporan di grup WA. Pemulihan otomatis baru mencatat laporan sejak @119.
- **Portal FTTH:** sebelum deploy pertama lewat workflow, cocokkan `portal-ftth-gas/Kode.gs` dengan HEAD Apps Script
  (`Kode.js`). Keduanya beda: HEAD punya `CADANGAN_SIMPAN = 1`.
- **Grup region Pontianak (PR grup-region, belum di-deploy):** kode siap (Apps Script + gateway). Setelah deploy: buat grup WA,
  masukkan nomor IRIS, lalu admin ketik `grup pontianak <nama grup persis>`. Butuh gateway versi baru (paket portable perlu
  dibangun ulang dari `wa-gateway/`); gateway lama tetap mengirim semuanya ke grup utama.
- **Panduan portal baru (13 Nov):** `Panduan_Portal_FTTH.pdf` di repo (GitHub Pages, tombol "Unduh PDF Panduan") diganti
  panduan tim 31 halaman (portal, tampilan HP, 6 alur kerja, spreadsheet). Teks kartu panduan di kedua `Form.html`
  (judul, 31 halaman, ~3 MB, `?v=20261113`) baru tampil setelah deploy FTTH dan Waspang berikutnya. Versi lengkap
  (RPM, FORM ATP, Administration, Log History) hanya di Drive, jangan dipasang di repo publik. Panduan Bot IRIS belum diperbarui.
- **Tanya IRIS `!iris <pertanyaan>` (alias `!tanya`; live sejak Waspang @125):** `botTanya_` / `botAiData_` / `botAiSite_` /
  `botAiPanggil_` / `botAiCmd_` di `portal-waspang/Kode.gs`. Memakai Groq API (gratis, model bawaan `openai/gpt-oss-120b`).
  Sudah terbukti jalan di WhatsApp (14 Nov 10:33, `iris on` aktif). Panduan API untuk pemilik ada di Drive (bukan di repo).
- **Stiker + sapaan (live Waspang @128):** `app/gateway.mjs` di laptop gateway (`C:\\Users\\p\\IRIS-Gateway`) diganti versi `main` 14 Nov 11:36
  (sebelumnya versi 470de70; panel.* sudah sama). Berlaku setelah program gateway ditutup dan dibuka lagi.
- **Stiker robot iRIS (14 Nov):** 15 desain baru dari Canva (robot berkarakter Iris Yunani, pose sesuai kata). File asli 2048 px harus
  diunduh pemilik dari Canva (unduhan Canva diblokir dari sesi cloud), lalu diubah ke webp 512 dan disimpan di folder `IRIS Stiker`
  dengan nama: perkenalan, halo, siap, mantap, terimakasih, semangat, ingat, hatihati, gaspol, laporanmasuk, izincek, siapkomandan,
  otw, ngopi, wkwk. Sementara folder masih berisi 6 stiker emblem lama.
- **Stiker otomatis (PR iris-stiker-jadwal, belum di-merge/deploy):** `BOT_STIKER_ATURAN_` + `botStikerJadwal_` / `botStikerLapor_` /
  `botStikerSapa_`.
  Di PR yang sama: jadwal `SIANG` 12:00 dan `MALAM` 19:00 (tag tim yang belum lapor).
- **Usulan perintah bot (belum dikerjakan):** `!belum`, `!foto <site>`, `!izin <site>`, `!atp <site>`, `!rfs`,
  `!mandor`, `!selisih`, `!log`.

## Keputusan & aturan
- **Deploy:** lewat GitHub Actions (push ke `deploy-waspang` / `deploy-ftth` / `deploy-gateway`). Clasp di laptop
  pemilik hanya cadangan. Web app `executeAs USER_DEPLOYING` memakai akun pemilik, jadi deploy harus memakai kunci clasp
  akun itu (secret `CLASPRC_JSON`). Deploy dan merge hanya dengan persetujuan pemilik.
- **Pemulihan otomatis (Waspang @119):** setiap Daily Report dan log foto disalin ke tab `JURNAL WASPANG` di spreadsheet
  LOG ARSIP. Tiap jam (`cekGatewayBot` → `botPulih_`) baris yang hilang ditulis lagi dan admin diberi DM.
  Lebih dari 30 baris sekaligus tidak dipulihkan otomatis (tunggu perintah `pulihkan`). Hapus yang disengaja lewat
  `revisi hapus` ditandai `hapus` di jurnal.
- **Menu polling (Waspang @120 + gateway baru):** tombol ala Telegram tidak tersedia untuk WhatsApp biasa (Baileys),
  jadi dipakai polling WhatsApp. Gateway menyimpan kunci polling di `data/menu-polling.json`, mendekripsi suara
  (`decryptPollVote`, mencoba pasangan JID nomor/LID), lalu mengirim `pilih <label>` ke Apps Script.
- **Grup WA per region:** Script Property `BOT_GRUP_REGION` = `{"Pontianak": "<nama grup>"}` (perintah admin `grup`).
  Kosong = satu grup seperti dulu. Bila diisi: antrean diberi field `grup` (laporan, foto, cek Daily Report, BA, revisi) menurut
  Region site di DATA BASE; jadwal `perGrup` (PAGI, SORE, MINGGU, BULAN, MANGKRAK) dibuat per grup dengan `BOT_GRUP_CTX_`.
  Grup utama = region `BOT_REGION` (bawaan Banjarmasin) + site tanpa region. Perintah dari grup region tersaring ke region itu
  (`botRowLolos_` / `botDailyRows_`), kecuali menyebut kota/region atau `semua`. Tim 17:30 per grup: `BOT_TIM_GRUP` (manual)
  atau dari site yang paling sering dilaporkan 45 hari. PIC Today's Plan region: `BOT_PIC_<REGION>`. Permit/implementasi
  hanya untuk grup utama. Gateway: `regionJid()` cari grup dari nama; tidak ketemu = kirim ke grup utama dengan catatan.
- **Pilihan Region di Portal Waspang (Form.html):** dropdown Region (dari kolom Region DATA BASE) di atas pencarian cluster
  di Daily Report, BOQ Plan, dan Dokumentasi; menyaring daftar site, disimpan per perangkat (`localStorage` `waspang_region_v1`),
  sama untuk ketiga menu. Site tanpa Region hanya muncul di "Semua region". Format teks Daily Report tidak diubah.
  Laporan Dokumentasi (caption WA, `buildWaspangPhotoCaption_` + Form.html) menambah baris `🌏 *Region*` bila Region site diketahui.
- **Tanya IRIS (AI):** perintah bernama `iris`, bukan `ai` (permintaan pemilik). Admin: `iris` = status, `iris on|off|kuota <n>|model <id>`
  = pengaturan (`BOT_AI_PENGATURAN_`); teks lain setelah `iris` = pertanyaan. IRIS = asisten serba bisa (pilihan pemilik 14 Nov): soal proyek dijawab
  dari data (maks 12 baris), soal umum (istilah, draf pesan, terjemahan, hitungan) dari pengetahuan AI tanpa internet (maks ~30 baris).
  AI tidak menghitung angka proyek. Karakter IRIS (`BOT_IRIS_KARAKTER_`): nama dari Iris, utusan pembawa pesan dalam mitologi
  Yunani + iris mata yang mengamati; sigap, teliti, jujur soal data, ramah, memakai "saya". Dipakai di prompt AI dan perkenalan. Judul jawaban `!iris` = `*iRIS*` (huruf i kecil, permintaan pemilik).
  `iris perkenalan` (juga perkenalkan / kenalan / kenalkan, + diri; khusus admin, `BOT_IRIS_KENALAN_`): di grup langsung tampil; di chat pribadi pratinjau, `iris perkenalan kirim` = ke grup utama + grup region. IRIS mengambil data dari fungsi perintah yang ada (progres, rekap, mingguan, bulanan,
  stok, BA, potongan) sesuai kata di pertanyaan, membuang nomor HP, lalu AI hanya merangkai jawaban. Bawaan mati (`BOT_AI`),
  kuota `BOT_AI_KUOTA` (bawaan 500/hari; batas gratis Groq sekitar 1.000/hari dan 30/menit; hitungan di `BOT_AI_HARI`, gagal tidak dihitung). Meta AI di WhatsApp tidak dipakai
  karena tidak ada API untuk bot; anggota tetap bisa tag @Meta AI untuk pertanyaan umum.
- **Jatah AI menipis:** `botAiCadangan_` = 50 terakhir (kuota kecil: separuh kuota) disimpan untuk pertanyaan proyek (ada data).
  Saat sisa mencapai cadangan, jawaban AI diberi peringatan sekali per hari (`BOT_AI_HARI.w`); pertanyaan umum dijawab tanpa AI
  (`botAiTanpaAi_`: minta maaf + daftar perintah). Jatah habis: pertanyaan proyek dijawab dengan data mentah dari perintah IRIS.
  Sapaan memakai teks tetap begitu masuk cadangan.
- **Sapaan:** gateway meneruskan pesan grup yang memuat kata `iris` (kata utuh) atau men-tag nomor IRIS (`sebut: true`). Apps Script
  menjawab maks sekali per pengirim tiap `BOT_SAPA_JEDA_` (120 dtk, CacheService). Tanya IRIS aktif = AI (1-3 kalimat, memakai kuota),
  mati = teks tetap. Selalu ditutup petunjuk `!menu` (+ `!iris` bila AI aktif).
- **Stiker:** disimpan di Drive (bukan di repo), nama file = nama stiker. Folder dicari dari nama `IRIS Stiker` atau Script Property
  `BOT_STIKER_FOLDER`. Stiker baru cukup ditambah ke folder itu (webp 512x512, < 100 KB), tanpa ubah kode.
- **Pengingat Daily Report:** 12:00 (`SIANG`) dan 19:00 (`MALAM`) hanya dikirim bila ada tim yang belum lapor, men-tag yang belum
  (`botSore_(now, 'siang'|'malam')`); 17:30 (`SORE`) tetap seperti dulu. Tim = `BOT_TIM` / per grup `botTimGrup_`.
- **Stiker otomatis:** setelah Today's Plan (Sen/Sab gaspol, Sel/Kam semangat, Rab/Jum hatihati, Minggu tidak), rekap mingguan/bulanan
  (mantap), 17:30 (ingat bila ada yang belum lapor; terimakasih bila semua sudah), Daily Report pertama per grup per hari (laporanmasuk,
  `BOT_STIKER_LAPOR_<GRUP>`), perkenalan (perkenalan, cadangan halo), sapaan (kata di pesan). Stiker yang filenya tidak ada dilewati.
  `BOT_STIKER_OTO = off` mematikan; admin `iris stiker jadwal`, `iris stiker otomatis on|off`. Kunci antrean stiker diberi angka acak
  supaya tidak bertabrakan.
- **Backup Drive:** hanya backup terbaru yang disimpan. Perintah `backup bersih` membuang yang lama.
- **Rekap:** `rekap`, `mingguan [ini|lalu]`, `bulanan [bulan|ini]` terbuka untuk semua anggota, bisa disaring SOW dan kota
  (kolom KOTA di DATA BASE), plus ringkasan `sow` / `kota` / `kota sow`. Kalau hari ini belum ada laporan, `rekap`
  menampilkan hari laporan terakhir.
- **Format WA:** kotak kode `waKode_()`, daftar `- `, kutipan `> `, awalan balasan `✦ `. Logo IRIS resmi: emblem
  lingkaran emas milik pemilik (`IRIS_Asisten_Proyek_BMI_Emblem.png`).
- **IRIS Gateway jalan di balik layar:** jadwal login dan jaga tidak membuka panel; panel hanya dari shortcut Desktop
  (`IRIS Gateway.vbs /panel`). Instalasi lama: ganti `IRIS Gateway.vbs` + `bin\pasang.ps1`, lalu jalankan `Pasang Otomatis.bat` lagi.
- **Panel IRIS Gateway: LED per region:** baris ● Banjarmasin / ● Pontianak (nama region saja; nama grup di tooltip).
  Hijau = WhatsApp tersambung dan grup ditemukan; merah = terputus, Stop, atau grup tidak ditemukan. Gateway mengecek grup
  tiap 60 dtk (`checkGroups()`); nama region grup utama dari `WA_PULL.grupUtama` (`botGrupNama_('')`).
- **Gateway WA** jalan di laptop terpisah, bukan di laptop kerja pemilik. Folder `auth` dan `config.json` tidak pernah
  dibagikan atau diunggah.

## Lokasi
- **Kode:** repo ini (`buanamenara/portal-ftth`).
- **File kerja pemilik:** Google Drive `My Drive/IRIS - Asisten Proyek BMI/`. Isinya cadangan kode per versi
  (`Waspang_Backup_vNNN_*`, `FTTH_Backup_vNNN_*`), folder clasp `Deploy_Animasi_2026-11-05/cek_head/<project>`,
  mockup, panduan PDF, dan `IRIS-Gateway-Build`.
- **Data:** spreadsheet FTTH, Waspang, LOG ARSIP, dan folder foto `DOKUMENTASI FTTH` di Drive akun pemilik
  (ID di `CONFIG` dalam `Kode.gs`).

## Riwayat deploy *(otomatis, terbaru di atas)*
<!-- LOG:START -->
- 2026-11-14 11:08 · **waspang @128** · c5b6b3c · Merge pull request #110 from buanamenara/iris-sapa · GitHub Actions
- 2026-11-14 10:41 · **waspang @127** · 629d071 · Merge pull request #108 from buanamenara/iris-judul · GitHub Actions
- 2026-11-14 10:31 · **waspang @126** · d1d2aee · Merge pull request #107 from buanamenara/iris-teks-rapi · GitHub Actions
- 2026-11-14 10:14 · **waspang @125** · 9436e11 · Merge pull request #106 from buanamenara/iris-ai-tanya · GitHub Actions
- 2026-11-14 05:25 · **waspang @124** · 2ae7154 · Merge pull request #105 from buanamenara/panduan-baru · GitHub Actions
- 2026-11-14 05:24 · **ftth @263** · 2ae7154 · Merge pull request #105 from buanamenara/panduan-baru · GitHub Actions
- 2026-11-13 22:15 · **waspang @123** · 470de70 · Panel IRIS Gateway: LED per region (hijau tersambung, merah mati) · GitHub Actions
- 2026-11-13 21:21 · **waspang @122** · 462e158 · Grup WA per region (Pontianak): laporan, jadwal, dan perintah per grup · GitHub Actions
- 2026-11-13 21:02 · **ftth @262** · e4ac434 · Merge pull request #99 from buanamenara/memori-merge · GitHub Actions
- 2026-11-13 17:50 · **waspang @121** · e46b17e · Uji deploy lewat GitHub Actions (isi sama dengan @120) · GitHub Actions
- 2026-11-13 17:23 · **waspang @120** · c7b8cf2 · Menu IRIS lewat polling WhatsApp (`!menu`, `menu admin`) · clasp laptop
- 2026-11-13 17:07 · **waspang @119** · bfb9ecb · Pemulihan otomatis Daily Report & log foto (jurnal) · clasp laptop
- 2026-11-13 16:54 · **waspang @118** · 75e50ba · Teks status "✅ Tidak ada error hari ini" · clasp laptop
- 2026-11-13 · **waspang @117** · - · Ikon bot ✦ · clasp laptop
- 2026-11-13 · **waspang @116** · - · Rekap per kota & SOW, rekap hari terakhir · clasp laptop
- 2026-11-13 · **waspang @115** · - · Format bot tahap 3 (PR #93) · clasp laptop
- 2026-11-13 13:14 · **ftth @261** · - · FORM ATP unduh langsung + animasi (PR #90) · editor Apps Script
- 2026-11-05 22:46 · **gateway @22** · - · Tampilan sesuai mockup · clasp laptop
<!-- LOG:END -->
