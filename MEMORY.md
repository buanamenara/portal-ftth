# MEMORY · IRIS / Portal BMI

Memori proyek yang dibaca oleh AI atau developer berikutnya. Aturan menulisnya ada di `AGENTS.md`.
Bagian bertanda *(otomatis)* diisi workflow deploy. Bagian lain diperbarui oleh siapa pun yang mengubah sistem,
di commit yang sama dengan perubahannya. Repo ini publik: tanpa rahasia, nomor HP, atau data pribadi.

## Versi live *(otomatis)*
<!-- LIVE:START -->
| Project | Versi live | Waktu (WITA) | Commit | Keterangan |
|---|---|---|---|---|
| waspang | @131 | 2026-11-14 12:36 | cc28d18 | Merge pull request #114 from buanamenara/iris-ingat-kirim |
| ftth | @264 | 2026-11-14 14:56 | f4be9c2 | Warehouse: Waspang & Admin bisa ganti region di BA Transaksi & Submit BA |
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
- **Stiker robot iRIS (14 Nov):** 15 stiker robot (Iris Yunani) sudah di folder Drive `IRIS Stiker`: perkenalan, halo, siap, mantap,
  terimakasih, semangat, ingat, hatihati, gaspol, laporanmasuk, izincek, siapkomandan, otw, ngopi, wkwk. terimakasih, semangat,
  laporanmasuk dari gambar 550 px (link Canva dari pemilik); sisanya dari pratinjau 200 px yang diperbesar (bisa diganti bila pemilik
  mengirim link 550 px). Stiker emblem lama sudah di Sampah.
- **Stiker otomatis (live Waspang @129; stiker 12:00/19:00 di PR iris-stiker-siang):** `BOT_STIKER_ATURAN_` + `botStikerJadwal_` / `botStikerLapor_` /
  `botStikerSapa_`.
  Di PR yang sama: jadwal `SIANG` 12:00 dan `MALAM` 19:00 (tag tim yang belum lapor).
  Juga `iris sapa <nama> [| pesan]` (admin): IRIS menyapa anggota (mis. Mahmudi yang menyapa sebelum gateway baru terpasang).
- **Tombol Restart di panel IRIS Gateway (PR iris-gateway-restart):** ikon ↻ di samping Stop + "Restart gateway" di menu ⋯.
  `/api/restart` → `restart()` di `wa-gateway/gateway.mjs` keluar dengan kode 1, pelari (`bin\jalankan.bat` / `start.bat`)
  menyalakannya lagi ± 5-10 dtk dengan file terbaru di `app\`. Panel menampilkan "Memulai ulang..." lalu kembali sendiri.
  File `app\` di laptop gateway sudah diganti versi PR ini (14 Nov 12:24); tombol muncul setelah satu kali Tutup program + buka lagi.
- **Pet iRIS di desktop laptop gateway (PR iris-pet):** `wa-gateway/pet/pet.ps1` (PowerShell + WPF, tanpa instal apa pun).
  Wujud chibi iRIS (permintaan pemilik 14 Nov, contoh: pet robot chibi) digambar vektor XAML: helm putih-emas, daun emas, visor
  bermata biru, sayap pelangi. `pet.ps1` dibuat oleh `pet/buat-pet.py` dari `pet/pet.tpl.ps1` (jangan edit `pet.ps1` langsung).
  Pose: diam, lambai (klik), ketik di laptop (ditanya), sorak (menjawab), kaki goyang (digeser). Nyala/mati dari menu ⋯ panel
  (`/api/pet`, `st.pet` di `data/state.json`, bawaan menyala `true`). Gateway membuka pet (`petJalan`) saat mulai / dinyalakan; pet membaca
  `GET /api/pet` (hanya 127.0.0.1) tiap 0,8 dtk dan menutup diri bila dimatikan atau gateway tidak menjawab 45 dtk. Klik kanan pet:
  ukuran / Sembunyikan (`/api/pet-mati`). Galat pet ditulis ke `app\pet\pet.log`.
  Perbaikan bug PowerShell case-insensitive (14 Nov): parameter `$warna` di `Wajah()` menimpa tabel `$WARNA` sehingga `ConvertFromString` gagal saat mulai; diganti `$w` di `pet.tpl.ps1` + `pet.ps1`. Perlu disalin ke `app\pet\pet.ps1` di laptop gateway.
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
- **Pilihan Region di Warehouse – BA Transaksi & Submit BA Transaksi (`portal-ftth-gas/`):** semua peran (Waspang, Admin, RPM) boleh
  membuat dan mengunggah BA Transaksi lintas region (`getBaGudangInit`, `createBaGudang`, `getBaGudangHistory`, `getBaSiteNames`,
  `extractBa`, `extractBaText`, `saveBa`, `getBaHistory`, `downloadBaPdf` memakai scope `''`); kolom Area pada akun di sheet `USERS`
  hanya dijadikan pilihan awal (`defaultRegion`) di dropdown Region BA Transaksi.
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
  Kirim manual (admin): `sore kirim [siang|malam]` = teks jadwalnya ke grup utama + grup region, plus stiker (`botSoreKirim_`);
  `sore [siang|malam]` = pratinjau.
- **Stiker otomatis:** setelah Today's Plan (Sen/Sab gaspol, Sel/Kam semangat, Rab/Jum hatihati, Minggu tidak), rekap mingguan/bulanan
  (mantap), 12:00 dan 19:00 (ingat; pesannya sendiri hanya terkirim bila ada yang belum lapor), 17:30 (ingat bila ada yang belum lapor; terimakasih bila semua sudah), Daily Report pertama per grup per hari (laporanmasuk,
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
- **Pet iRIS:** hanya hiasan di laptop gateway, tidak menjawab pertanyaan (pilihan pemilik 14 Nov). Bawaan aktif (`st.pet = true`). Wajah ikut status
  (senang = tersambung, kuning = menyambung, X merah = terputus, tidur = Stop). Bergerak hanya saat IRIS ditanya / disebut
  di grup (`petEvent('dengar')`, `jawab`, `diam` di `onMessage`); klik = bereaksi, klik dua kali = berputar, bisa digeser.
  Tabel geometri/warna di `pet.tpl.ps1` dinamai `$TABEL_MATA`, `$TABEL_MULUT`, `$TABEL_WARNA`, `$TABEL_MOOD`, `$MATA_PENUH` agar tidak tertimpa variabel `$script:mata`, `$script:mood`, atau parameter `$mata`/`$mulut` karena PowerShell bersifat *case-insensitive*.
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
- 2026-11-14 14:56 · **ftth @264** · f4be9c2 · Warehouse: Waspang & Admin bisa ganti region di BA Transaksi & Submit BA · GitHub Actions
- 2026-11-14 12:36 · **waspang @131** · cc28d18 · Merge pull request #114 from buanamenara/iris-ingat-kirim · GitHub Actions
- 2026-11-14 12:18 · **waspang @130** · ad96dca · Merge pull request #112 from buanamenara/iris-stiker-siang · GitHub Actions
- 2026-11-14 11:41 · **waspang @129** · b0c8214 · Merge pull request #111 from buanamenara/iris-stiker-jadwal · GitHub Actions
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
