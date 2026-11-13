# MEMORY · IRIS / Portal BMI

Memori proyek yang dibaca oleh AI atau developer berikutnya. Aturan menulisnya ada di `AGENTS.md`.
Bagian bertanda *(otomatis)* diisi workflow deploy. Bagian lain diperbarui oleh siapa pun yang mengubah sistem,
di commit yang sama dengan perubahannya. Repo ini publik: tanpa rahasia, nomor HP, atau data pribadi.

## Versi live *(otomatis)*
<!-- LIVE:START -->
| Project | Versi live | Waktu (WITA) | Commit | Keterangan |
|---|---|---|---|---|
| waspang | @122 | 2026-11-13 21:21 | 462e158 | Grup WA per region (Pontianak): laporan, jadwal, dan perintah per grup |
| ftth | @262 | 2026-11-13 21:02 | e4ac434 | Merge pull request #99 from buanamenara/memori-merge |
| gateway | @22 | 2026-11-05 22:46 | - | Tampilan sesuai mockup (tahap 3 lanjutan) |
<!-- LIVE:END -->

URL web app tetap: `https://script.google.com/macros/s/<deploymentId>/exec`. Deployment ID ada di
`.github/workflows/deploy-apps-script.yml`. Waspang punya health check `?api=json`.

## Status & pekerjaan menunggu
*Terakhir diperbarui 2026-11-13 18:02 WITA.*
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
- **Backup Drive:** hanya backup terbaru yang disimpan. Perintah `backup bersih` membuang yang lama.
- **Rekap:** `rekap`, `mingguan [ini|lalu]`, `bulanan [bulan|ini]` terbuka untuk semua anggota, bisa disaring SOW dan kota
  (kolom KOTA di DATA BASE), plus ringkasan `sow` / `kota` / `kota sow`. Kalau hari ini belum ada laporan, `rekap`
  menampilkan hari laporan terakhir.
- **Format WA:** kotak kode `waKode_()`, daftar `- `, kutipan `> `, awalan balasan `✦ `. Logo IRIS resmi: emblem
  lingkaran emas milik pemilik (`IRIS_Asisten_Proyek_BMI_Emblem.png`).
- **IRIS Gateway jalan di balik layar:** jadwal login dan jaga tidak membuka panel; panel hanya dari shortcut Desktop
  (`IRIS Gateway.vbs /panel`). Instalasi lama: ganti `IRIS Gateway.vbs` + `bin\pasang.ps1`, lalu jalankan `Pasang Otomatis.bat` lagi.
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
