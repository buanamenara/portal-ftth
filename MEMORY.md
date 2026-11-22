# MEMORY · IRIS / Portal BMI

Memori proyek yang dibaca oleh AI atau developer berikutnya. Aturan menulisnya ada di `AGENTS.md`.
Bagian bertanda *(otomatis)* diisi workflow deploy. Bagian lain diperbarui oleh siapa pun yang mengubah sistem,
di commit yang sama dengan perubahannya. Repo ini publik: tanpa rahasia, nomor HP, atau data pribadi.

## Versi live *(otomatis)*
<!-- LIVE:START -->
| Project | Versi live | Waktu (WITA) | Commit | Keterangan |
|---|---|---|---|---|
| waspang | @159 | 2026-11-22 09:24 | 4bbaea8 | fix(waspang,ftth): harden edge cases in Kurva S, sharedPlanMem, botJadwal, and logging |
| ftth | @274 | 2026-11-22 09:10 | 648cc9b | fix(waspang,ftth): resolve 13 stability, cache, bot security, and sync bugs |
| gateway | @26 | 2026-11-18 10:05 | 9156bdc | Merge pull request #126 from buanamenara/gateway-login-segar |
<!-- LIVE:END -->

URL web app tetap: `https://script.google.com/macros/s/<deploymentId>/exec`. Deployment ID ada di
`.github/workflows/deploy-apps-script.yml`. Waspang punya health check `?api=json`.

## Status & pekerjaan menunggu
*Terakhir diperbarui 2026-11-22 09:24 WITA.*
- **Perbaikan stabilitas, cache, keamanan bot, & sinkronisasi Waspang + FTTH (`/boost`):**
  1. **Portal FTTH (`portal-ftth-gas/Form.html`, `ftth.html`, `Kode.gs`):** mencegah race condition Kurva S saat login SSO tanpa sesi lama & kebocoran SWR lintas akun saat ganti akun tanpa logout (`check()`/`load()` menunggu `!entering && ACCESS`, cek `reqAccess === ACCESS` termasuk reset `loading = false` saat `pre.then` batal, `requireLogin()` menghapus `ftthSwr_*`); `logHistory_()` kini hanya mereset cache `ftthDbVer_v1` untuk aksi yang mengubah `DATA BASE`/`DASHBOARD` (`Edit DATA BASE`, `Edit DASHBOARD`, `FORM ATP`), bukan `Buka Portal FTTH` (`ssoLogin`) atau aksi non-DB lainnya.
  2. **Bot IRIS & Tagihan Mandor (`portal-waspang/Kode.gs`):** sapaan pribadi `WA_OWNER` (`ok`, `pagi`, `sore`, `<sapaan> ok`, `iris <sapaan>`) kini diarahkan ke `botSapa_` (`cmd='sapa'`); `botTagihanHapusBa_()` & `botBersihkanSungaiKupangBa100_()` memperbaiki parsing `wantProg` & prefix `^bap-`, mewajibkan konfirmasi untuk >1 baris, dan menyesuaikan `BOT_BAP_LAST`; `botFieldProgressMap_()` memakai `clusterTotals_()` (ikut menandai `hasReport` bila `ct.found`, membuang bacaan `LOG FOTO WASPANG` yang tidak terpakai); `botBaPekerjaanRows_()` & `botTagihanMandor_()` memisah `Civil` vs `Electrical`, menyatukan kunci `byMandor` case-insensitive, memakai `segmen2` & fallback `sowFromId_(s.lokasi)` SPK Supabase, memperbaiki filter `tagihan semua` & `!s.ba_dibuat`, serta menghapus typo `100%._`; `!bantu`, `!menu`, dan `!menu admin` di grup oleh `WA_OWNER` tidak lagi membocorkan menu admin; `waCmdBaca_()` & `logWaspang_()` tidak mencatat perintah baca/sapaan/typo dan nomor telepon pada `wh` (sementara `tagihan hapus` dan mutasi/kirim `iris stiker` tetap dicatat); `botJadwal_()` melewati jadwal `ownerOnly` sebelum lock/`BOT_SENT_*` bila `botOwnerJid_()` kosong; perbaikan `waKode_()` di `botMandorKeyCmd_()` & `botRevisi_()`.
  3. **Portal Waspang (`portal-waspang/Form.html`, `waspang.html`):** `refreshDatabaseSites` `sig()` menyertakan `region` agar dropdown Region muncul saat pemuatan awal tanpa `localStorage`; `getClusterItems()` memprioritaskan `sharedPlanMem` agar tidak tertutup `localStorage` lama saat kuota penuh/diblokir; `saveBoqSubmitTable` & `applyParsedBoqToSystem` memperbarui `sharedPlanMem`, membungkus `localStorage.setItem` dengan `try/catch`, menunggu respons CORS `SYNC_BOQ_EXCEL`, serta memanggil `loadBoqForSelectedCluster(true)`; `executeDailyReportSend` memakai `d.syncedText || text` di `showWaShare`, dan `onClusterSearch` / `onRegionPilih` memicu `change` meski hasil filter kosong (`sel.value === ''`).
- **Pengingat Aktif Tagihan Mandor & BA Pekerjaan RPM + Panggilan "Bos" untuk `WA_OWNER` (`portal-waspang/Kode.gs`):**
  - iRIS selalu memanggil `WA_OWNER` dengan sebutan **"Bos"** pada sapaan (`botSapa_`), tanya jawab AI (`botTanya_` / `botAiPanggil_`), menu bantuan, serta seluruh pengingat/notifikasi tagihan & BA Pekerjaan (`botTagihanMandor_`, `botCekTagihanSaatDaily_`, `botBaPekerjaanBaru_`).
  - Jadwal otomatis `TAGIHAN` setiap **Senin & Kamis pukul 07:15 WITA** ke chat pribadi pemilik (`botOwnerJid_()`) + perintah chat pribadi `tagihan [mandor/site/kota]` (alias `bapekerjaan`, `tagihanmandor`) & integrasi `!iris` khusus di chat pribadi pemilik (ditempatkan setelah konteks site/progres/stok agar tidak menggeser kuota konteks perintah lain, 100% read-only tanpa mengubah sheet/data).
  - Menyilangkan sheet `BA PEKERJAAN` (`RPM BMI - BA Pekerjaan`), `DATA BASE` (`RFS`/`On Going`), `BA TRANSAKSI` (mandor pengambil material), dan progres `DAILY REPORT EMR` vs `MASTER BOQ CLUSTER`: menampilkan ringkas **khusus status BA Pekerjaan** — (1) site RFS / progres `>=95%` yang BA Pekerjaan-nya belum `100%` atau belum dibuat, (2) site `On Going` progres `>=50%` yang belum dibuatkan BA Pekerjaan tahap 50%, dan (3) BA Pekerjaan yang masih menggantung `<100%` per Mandor. Site yang BA Pekerjaan-nya sudah `100%` tidak lagi dimasukkan ke pengingat (kecuali `tagihan semua`); mendukung notifikasi real-time ke pribadi pemilik saat progres mencapai tahap 50%/100% (`botCekTagihanSaatDaily_`) maupun saat ada BA Pekerjaan baru terbit (`botBaPekerjaanBaru_`), perintah `tagihan hapus <site/id_ba> [progres%]`, serta pembersihan baris 100% Sungai Kupang di `BA PEKERJAAN`.
  - Mendukung sinkronisasi langsung dengan Supabase `Database-mandor` (`v_spk`, `spk.ba_dibuat`, `v_kasbon_mandor`) lewat Script Property `MANDOR_SUPABASE_KEY` (diisi via perintah pribadi `mandorkey <service_role_key>`, tanpa pernah diekspos di Gateway atau ke Waspang/Admin; bila dipanggil atau ditanyakan lewat `!iris` di luar `WA_OWNER`, iRIS diam / tidak menjawab sama sekali).
- **`main` = yang live (19 Nov 18:46):** Waspang @150 (14f0d48, #129), FTTH @273 (d2781f7), Gateway @26 (9156bdc). Cadangan Drive terbaru
  (Waspang v146, FTTH v273, Gateway v25) sama persis dengan commit live-nya waktu itu (dicek 18 Nov; beda hanya akhir baris CRLF).
  Tidak ada PR kode terbuka.
- **Perbaikan Total Daily Report 18 Nov (live, dikonfirmasi pemilik):**
  1. **Waspang @147 (#124):** sejak @140 (14 Nov 22:53) `clusterRows_` di-memo per eksekusi (`wsDailyRowsMemo_`), sehingga Total sesudah
     Daily Report = Total sebelum (Today tidak bertambah) di teks WA, balasan portal, dan cache `cl_tot`. `appendDailyRow_` kini mengosongkan memo;
     revisi Daily Report membuang memo + `invalidateClusterCache_`. Laporan WA 15-17 Nov sudah dibetulkan manual oleh tim.
  2. **Waspang @148 (#125):** Total dobel di `clusterTotals_`: (a) saldo awal dari `Teks Laporan` hanya dari teks sebelum `TEKS_SINKRON_SEJAK_`
     (14 Nov 21:48 WITA, `teksDariServer_`), karena teks sesudahnya ditulis server dari Total hitungan sendiri dan mengunci angka yang pernah salah;
     (b) teks lama "Line B" tanpa nomor FDT dibandingkan dengan jumlah semua `_fdtN` (`lineFamilyAmount`); (c) `recordDailyReport_`: item Selesai
     tanpa angka + Today tidak dijumlah, Teks Laporan baris baru diselaraskan ke Total akhir dari sheet; (d) `botPulih_` membuang cache Total
     cluster yang dipulihkan. Hasil: Lawahan FDT 48 2→1, FAT Line A/B 18/22→9/11; Sungai Kupang Cable 24C Line B FDT1 6768→1312,
     Cable 48C Line A FDT1 13427→1659. Data di sheet tidak diubah.
  3. **Gateway @26 (#126):** `loginUser` membaca sheet USERS langsung (`findUser_(username, true)`), bukan cache `gwUsers_v1` 5 menit, jadi
     password baru dan akun nonaktif langsung berlaku. Fungsi lain tetap memakai cache.
  Verifikasi 18 Nov: cek web app HTTP 200 (Waspang: semua spreadsheet terhubung); hitungan ulang 30 cluster/SOW dengan salinan sheet + MASTER BOQ asli;
  simulasi laporan baru 4 cluster (Total = sebelum + Today); `waspang.html` di Playwright layar HP tanpa error; jurnal LOG ARSIP cocok
  (112 baris Daily Report, 254 log foto). Masalah Total 0 di iPhone (akun Nazar, 14 Nov) dinyatakan selesai oleh pemilik 18 Nov.
- **Revisi Daily Report dipermudah (#129, live Waspang @150 sejak 19 Nov 18:46):** keluhan tim 19 Nov: laporan FWA HST EMR-24498→32739
  terkirim dobel (19/11 14:24 & 14:25 WITA, tanggal 25/10, Cable 24C 2040 dua kali → Total 4080 / Plan 2040), tim mencoba `!revisi fwa 32789 4/2040`,
  `1050=2040`, `!revisi cable 24c 1050=2040`, `!revisi cable 24c`, semua ditolak bot. Perubahan di `portal-waspang/Kode.gs`, persetujuan admin tetap wajib
  (pilihan pemilik):
  1. `botRevisiCari_(arg, g, maxK)`: nama site cukup sebagian (mis. `lawahan`, nomor EMR `24498 32739`), kata SOW memilih SOW (`BOT_REVISI_SOW_`,
     `botRevisiCocok_`), kata dari belakang dibuang sampai site ketemu dan sisanya = perubahan, jadi pilih + ubah bisa satu pesan
     (`!revisi 24498 32739 hapus dobel`, `!revisi lawahan 31/10 cable 24c=150`). Nomor EMR salah satu angka → saran site mirip. Banyak site/SOW cocok →
     daftar pilihan dengan nama pendek (`botRevisiPendek_`).
  2. `botRevisiUbah_` (ganti blok parsing lama di `botRevisi_`): `150` (laporan satu item / item yang baru ditanyakan), `1=150`, `cable 24c=150`,
     `cable 24c 150`, `2040 jadi 1050` / `1050=2040` / `2040 1050` (angka yang sama dengan isi laporan = angka lama), `cable 24c` tanpa angka → bot bertanya
     (`sel.fokus`). Kalau sisa pesan gagal dibaca, nama site dicoba lebih pendek (mis. "3" yang ikut cocok dengan "SAMPAI 03").
  3. Dobel: `botRevisiDobel_` (site, SOW, tanggal laporan, dan angka Today sama). Daftar revisi menandai dan menyarankan `!revisi hapus dobel`;
     `botCekDaily_` menambah temuan dobel dan petunjuk `!revisi <nama pendek> hapus dobel` (dulu nama site lengkap). Usulan hapus menggantikan usulan
     lain untuk laporan yang sama. Balasan ke tim kini menampilkan perubahan yang diteruskan ke admin.
  Teks `!bantu`, menu `✏️ Revisi Daily Report`, dan panduan PDF (`BOT_PANDUAN_VERSI_` 2026-11-19-1) ikut diperbarui. Laporan dobel HST 24498→32739
  belum dihapus (menunggu tim/admin lewat `!revisi 24498 32739 hapus dobel` + `revisi ya`).
- **Data lama yang perlu dicek pemilik (tidak diubah, bukan bug kode):** FWA Tanah Laut EMR-04185→33426 baris 96-98 (13/11 22:33-22:35,
  Cable 24C 3000 tiga kali) kemungkinan kiriman dobel; Asman Cable 24C 12083/5814; Rumpiang Cluster Digging 85/5 dan Cable 48C 4804/527
  (Plan Cluster sama dengan Subfeeder; baris 43 & 44 30/10 hampir sama); Lawahan Pole 7/4 10/1; Plan BOQ belum ada untuk FWA Tanah Laut
  33426→04185 dan 30726→33478. Lawahan & Sungai Kupang lainnya dinyatakan sesuai oleh pemilik.
- **Fix UX Mobile & iPhone Daily Report Waspang (`portal-waspang/Form.html`, live sejak @144-@146, selesai):**
  - Batasi tinggi tabel progres (`44vh`) dan `#dailyPreviewBox` (`220px`) di mobile agar halaman laporan tidak terlalu panjang.
  - `openDailyConfirmModal` & `showWaShare` memanggil `scrollIntoView({ block: 'center' })` pada kartu modal agar user iPhone tidak perlu scroll ke atas untuk menekan tombol konfirmasi.
  - `executeDailyReportSend` men-trim `scriptUrl` dan mem-parse `res.text()` dengan pesan error yang jelas alih-alih error WebKit *"The string did not match the expected pattern"*.
  - `dailyDate` otomatis diisi tanggal hari ini saat portal dibuka (tetap bisa diubah), dan `dailyStartImpl` diingat per cluster/SOW di `localStorage` (`waspang_start_impl_v1`).
  - `handleDailySubmit` kini selalu memaksa `refreshSharedTotals(cluster, true)` dari server sebelum membuka konfirmasi & membentuk teks WA agar angka Total di pesan WA selalu sinkron dengan spreadsheet.
- **Arsitektur GitHub Pages Langsung (Gateway, Portal FTTH & Portal Waspang):**
  - `gateway/Kode.gs` & `portal-ftth-gas/Kode.gs`: menambahkan endpoint `doPost(e)` JSON RPC dengan `RPC_ALLOWLIST_` eksplisit (menerima `POST text/plain` `{ fn, args }`).
  - `gateway/Form.html` -> `gateway.html`, `portal-ftth-gas/Form.html` -> `ftth.html`, `portal-waspang/Form.html` -> `waspang.html`, dan `index.html`: seluruh portal berjalan langsung dari GitHub Pages (`buanamenara.github.io/portal-ftth/`), bebas `<iframe>` lintas-domain, bebas banner Google Apps Script, bebas error Google Drive di semua HP, dan memuat HTML cepat dari CDN GitHub Pages.
- **Fix Refresh Daily Report Waspang (`portal-waspang/Form.html`):** setelah kirim Daily Report berhasil, `dailyTodayActivity` ikut di-reset, `sharedTotalsMem` ikut diperbarui di `saveCurrentProgressAsCumulative()`, dan `renderDailyPreview()` langsung dipanggil ulang setelah kolom `Today` dikosongkan.
- **Performa & Cache Portal FTTH + Gateway:**
  - `portal-ftth-gas/Kode.gs`: cache epoch `ftthDbVer_` (`CacheService`, TTL 5 mnt) untuk `baReadDbSites_`, `getCheckpointData_`, dan `buildSCurveData_`; `bagHistory_` di-cache (`ftthBagHistVer_`, TTL 5 mnt, reset saat `createBaGudang`); `getLogHistory_` hanya membaca maks 200 baris terakhir dari bawah; `bagInit_` bebas duplikasi baca; `logHistory_` hanya me-reset cache DB bila aksi bukan `BA Gudang/Unduh/Login/Logout/Lihat`; `boqGenPutBom_` menulis sel BoM secara batch (`RangeList.clearContent` + contiguous `setValues`).
  - `portal-ftth-gas/Form.html`: Stale-While-Revalidate (`swrGet_`/`swrSet_` via `sessionStorage` per kode akses, TTL 30 mnt) untuk `getCheckpointData` dan `getSCurveData` agar Beranda & Kurva S tampil instan saat dibuka/refresh sambil menyegarkan di latar.
  - `gateway/Kode.gs`: `findUser_` meng-cache peta `USERS` di `CacheService` (`gwUsers_v1`, TTL 5 mnt) dengan fallback refresh otomatis bila username baru belum ada di cache. Sejak @26 login tidak memakai cache ini.
- **Performa Refresh Data & Cache (Waspang @140–@141):** Optimasi kecepatan pemuatan/refresh cluster data (`GET_CLUSTER`).
  Menerapkan CacheService multi-tier (BOQ Plan 10 menit, Totals 5 menit, Legacy totals 6 jam), bounded-range scan
  dan 1-column pre-scan di `clusterRows_`, serta auto-invalidation saat ada daily report, koreksi RPM, atau sinkronisasi BOQ.
  Di client (`Form.html`), menerapkan strategi Stale-While-Revalidate sehingga tabel tampil seketika (0 ms) dari cache lokal
  dan diperbarui secara mulus di latar belakang. Lihat `PERFORMANCE.md`.
- **IRIS Gateway (selesai):** Sudah dipasang/beres; paket portable terbaru (menu polling) ada di Drive `IRIS - Asisten Proyek BMI/IRIS-Gateway-Build/IRIS-Gateway-Portable.zip`.
- **Data hilang 07/11 (selesai / ditutup):** Dinyatakan selesai per konfirmasi pemilik 15 Nov. Pemulihan otomatis mencatat laporan sejak @119.
- **Grup region Pontianak:** live sejak Waspang @122 (Apps Script) + gateway baru di laptop. Admin set grup dengan `grup pontianak <nama grup persis>`
  (cek dengan `grup`). Akun area Pontianak (14 Nov): Hosnan (koordinator), Ruslan, Jamal, Welly, Albert (admin), Rio (waspang).
- **Paket tim Pontianak (14 Nov):** di Drive `IRIS - Asisten Proyek BMI/`: `AKUN PORTAL BMI - AREA PONTIANAK.pdf` (tanpa password) dan
  `PAKET PORTAL BMI - AREA PONTIANAK.zip` (akun, panduan portal 28 hlm, panduan bot 7 hlm, APK, link portal + Spreadsheet Database).
  Jangan dimasukkan ke repo (berisi username). Rancangan wujud pet: `CHIBI iRIS - RANCANGAN PET.png` di folder yang sama.
- **Panduan portal baru (13 Nov):** `Panduan_Portal_FTTH.pdf` di repo (GitHub Pages, tombol "Unduh PDF Panduan") diganti
  panduan tim 31 halaman (portal, tampilan HP, 6 alur kerja, spreadsheet). Teks kartu panduan di kedua `Form.html`
  (judul, 31 halaman, ~3 MB, `?v=20261113`) sudah live (FTTH @263 / Waspang @124), sejak @266/@133 bersama tombol APK. Versi lengkap
  (RPM, FORM ATP, Administration, Log History) hanya di Drive, jangan dipasang di repo publik. Panduan Bot IRIS sudah diperbarui/selesai.
- **Tanya IRIS `!iris <pertanyaan>` (alias `!tanya`; live sejak Waspang @125):** `botTanya_` / `botAiData_` / `botAiSite_` /
  `botAiPanggil_` / `botAiCmd_` di `portal-waspang/Kode.gs`. Memakai Groq API (gratis, model bawaan `openai/gpt-oss-120b`).
  Sudah terbukti jalan di WhatsApp (14 Nov 10:33, `iris on` aktif). Panduan API untuk pemilik ada di Drive (bukan di repo).
- **Stiker + sapaan (live Waspang @128):** `app/gateway.mjs` di laptop gateway (`C:\\Users\\p\\IRIS-Gateway`) diganti versi `main` 14 Nov 11:36
  (sebelumnya versi 470de70; panel.* sudah sama). Berlaku setelah program gateway ditutup dan dibuka lagi.
- **Stiker robot iRIS (selesai, 14–15 Nov):** 15 stiker robot (Iris Yunani) sudah lengkap di folder Drive `IRIS Stiker`: perkenalan, halo, siap, mantap,
  terimakasih, semangat, ingat, hatihati, gaspol, laporanmasuk, izincek, siapkomandan, otw, ngopi, wkwk. Stiker emblem lama sudah di Sampah.
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
  Perbaikan bug PowerShell case-insensitive (14 Nov): parameter `$warna` di `Wajah()` menimpa tabel `$WARNA` sehingga `ConvertFromString` gagal saat mulai; diganti `$w` di `pet.tpl.ps1` + `pet.ps1`.
  File `app\` di laptop gateway (`gateway.mjs`, `panel.mjs`, `panel.html`, `pet\pet.ps1`) sama dengan `main` ee65014 (dicek 14 Nov 15:46, dipasang 15:44).
  `app\pet\iris.png` di laptop sisa versi lama, tidak dipakai.
- **Tombol APK di kartu Panduan (PR panduan-apk):** `PortalFTTH.apk` (v1.0, dari pemilik) di akar repo, disajikan GitHub Pages
  (`https://buanamenara.github.io/portal-ftth/PortalFTTH.apk`). Kartu Panduan di kedua `Form.html` punya tombol "Unduh Aplikasi Android (APK)"
  (`#guideApk`) di bawah "Unduh PDF Panduan"; disembunyikan bila dibuka dari aplikasi Android (`window.BMIApp`). APK baru: ganti file ini
  dan naikkan `?v=` di tautan.
- **Pencarian site/mandor di Portal FTTH (PR cari-site):** semua `<input list>` (site Submit BOQ, Buat BOQ, BA, Warehouse, RPM, FORM ATP,
  mandor) memakai kotak cari sendiri (`.cari-box`, skrip di akhir `portal-ftth-gas/Form.html`): cocok bila semua kata ada di mana saja
  (nomor site, nama, kota; tanda baca diabaikan), nama panjang tidak terpotong, kata yang cocok ditandai. Isi tetap dari datalist
  (diisi kode lain). BA Transaksi: bila site ada di region lain, petunjuk menyebut region itu.
- **Pencarian daftar (PR cari-semua):** kotak cari riwayat/daftar di Portal FTTH (Project Dashboard, riwayat BOQ, BA, Warehouse, RPM,
  Administration, Log History) memakai `cocokCari(teks, q)` (skrip pertama `portal-ftth-gas/Form.html`): semua kata harus ada, urutan
  bebas, tanda baca diabaikan, "jatibaru" = "jati baru". Tabel Database SOW di Portal Waspang sama; cari cluster Waspang sudah begitu.
- **Total Daily Report dari server (PR #123 + perbaikan lanjutan 14 Nov; diperbaiki lagi 18 Nov, lihat atas):** keluhan 14 Nov: banyak laporan Daily Report menampilkan Total 0.
  1. Di `portal-waspang/Form.html`: `fetchClusterData` batas 25 dtk + coba 3 kali; `sharedTotalsStatus` + kotak `#dailyTotalsWarn`; penyimpanan
     memori (`sharedPlanMem`, `sharedDoneMem`, `sharedTotalsMem`) sebagai cadangan bila `localStorage` diblokir/penuh di iframe iPhone Safari / WebView;
     pencocokan site saat impor BOQ Excel (`findSiteInWorkbook`) menyertakan petunjuk SOW dari nama file agar BOQ Subfeeder/FWA tidak menimpa Cluster.
  2. Di `portal-waspang/Kode.gs`: `clusterTotals_` ikut memulihkan saldo awal yang tercatat di `Teks Laporan` / `Ringkasan Pencapaian` lama
     (serta tab lama `PROGRES TOTAL` / `LOG DAILY REPORT` bila ada) dan item bertanda `Selesai` di `MASTER BOQ CLUSTER` yang belum punya angka
     di kolom material `DAILY REPORT EMR` (selama belum pernah dikoreksi RPM); `addOpeningBalance_` bekerja per item yang belum pernah tercatat;
     `sendDailyReportEMR_` menjalankan `recordDailyReport_` lebih dulu dan menyelaraskan angka `<Today>/<Total>/<Plan>` sebelum dikirim ke WhatsApp.
- **Perintah bot cek baru (#128, live Waspang @149 sejak 19 Nov 14:36):** `!belum`, `!foto [site]`, `!izin [site] [sow] [kota]`, `!atp [site]`,
  `!rfs [sow] [kota]`, `!mandor [nama]`, `!selisih <site>` (semua anggota) dan `log [jumlah] [kata]` (admin), di `portal-waspang/Kode.gs`
  (`botBelum_`, `botFoto_`, `botIzin_`, `botAtp_`, `botRfs_`, `botMandor_`, `botSelisih_`, `botLog_`). Hanya membaca data: DATA BASE (`botDb_`, judul
  dua baris, sub judul didahulukan), LOG FOTO WASPANG, BA TRANSAKSI (`botBaRows_`, tanggal `botTglBa_` dipakai juga oleh `botBa_`), LOG HISTORY.
  Pencarian nama site per bagian nama (`botKataCocok_` / `botPilihNama_`: angka utuh, kata berurutan didahulukan). Saringan `botPisahFilter_`:
  kata SOW selalu saringan; semua kata kota/region = mode daftar, ada kata lain = mode satu site. Daftar ikut grup region (`botSiteLolos_`).
  `!belum` tidak men-tag. `!selisih` = BA bersih (Ambil - Pengembalian) vs terpasang (`clusterTotals_`) vs Plan, plus gabungan semua SOW.
  Terdaftar di `bantu` (bagian STATUS SITE), panduan PDF (`BOT_PANDUAN_VERSI_` 2026-11-18-1), menu polling (`📝 Siapa belum lapor`,
  admin `📜 Log aktivitas portal`; kedua menu kini 12 pilihan = batas).

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
- **Role koordinator (14 Nov, permintaan pemilik):** role ke-4 di sheet USERS = Admin + Waspang untuk satu region (kolom Area).
  Gateway `ROLE_PORTALS.koordinator = ['ftth', 'waspang']`; Portal FTTH memberi menu admin (seperti waspang: link Portal Waspang +
  Spreadsheet), Portal Waspang menampilkan menu Database. Bisa dipilih di Administration (tambah/ubah user). Pertama dipakai: Hosnan (Pontianak).
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
- **BA baru ke grup WA:** `botBaBaru_` (Waspang, dari WA_PULL) mengecek BA TRANSAKSI paling sering tiap `BOT_BA_CEK_DTK_` = 30 dtk
  (dulu 300 dtk, BA bisa menunggu sampai 5 menit). Perkiraan sampai grup: ± 30-60 dtk setelah BA dibuat.
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
- **Pet iRIS:** hanya hiasan di laptop gateway, tidak menjawab pertanyaan (pilihan pemilik 14 Nov). Bawaan aktif (`st.pet = true`), dijaga tetap hidup oleh `gateway.mjs` selama `st.pet` menyala (`petSeen`), dan dijalankan dengan `spawn(..., { stdio: 'ignore', windowsHide: true })` tanpa `detached: true` (karena `DETACHED_PROCESS` di Windows membuat `powershell.exe` langsung keluar). Wajah ikut status
  (senang = tersambung, kuning = menyambung, X merah = terputus, tidur = Stop). Bergerak (membuka laptop `dengar` lalu bersorak `jawab`) setiap kali IRIS memproses perintah/pertanyaan/menu (di grup maupun chat pribadi) serta saat mengirim antrean laporan (`poll()`). Mata dan kilau mata mengikuti arah kursor mouse saat kursor mendekat (`$kursor`); klik = bereaksi, klik dua kali = berputar (`Putaran` berporos di tengah badan `64,78` agar tidak terpotong batas jendela), saat diangkat/digeser badan terangkat dengan ekspresi kaget (`Angkat`) lalu jatuh memantul (`Jatuh` dengan `BounceEase`) saat dilepas.
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
- 2026-11-22 09:24 · **waspang @159** · 4bbaea8 · fix(waspang,ftth): harden edge cases in Kurva S, sharedPlanMem, botJadwal, and logging · GitHub Actions
- 2026-11-22 09:10 · **ftth @274** · 648cc9b · fix(waspang,ftth): resolve 13 stability, cache, bot security, and sync bugs · GitHub Actions
- 2026-11-22 09:09 · **waspang @158** · 648cc9b · fix(waspang,ftth): resolve 13 stability, cache, bot security, and sync bugs · GitHub Actions
- 2026-11-20 10:34 · **waspang @157** · 91c45e6 · feat(waspang): address WA_OWNER as Bos across iRIS greetings, AI, and reminders · GitHub Actions
- 2026-11-19 21:13 · **waspang @156** · 8288ee7 · fix(waspang): simplify mandor billing output to BA Pekerjaan status only · GitHub Actions
- 2026-11-19 21:05 · **waspang @155** · 0c81054 · feat(waspang): real-time owner alerts on Waspang 50%/100% milestones and new BA Pekerjaan · GitHub Actions
- 2026-11-19 20:58 · **waspang @154** · 2b2bbd9 · fix(waspang): exclude 100% BA from billing reminder and delete Sungai Kupang 100% BA row · GitHub Actions
- 2026-11-19 20:51 · **waspang @153** · 9bb06d9 · fix(waspang): silence iRIS completely for non-owner mandor billing queries · GitHub Actions
- 2026-11-19 20:47 · **waspang @152** · e09736f · fix(waspang): keep botAiData site/stok priority before owner billing context · GitHub Actions
- 2026-11-19 20:42 · **waspang @151** · 3597b00 · feat(waspang): proactive mandor billing and BA Pekerjaan reminders for owner · GitHub Actions
- 2026-11-19 18:46 · **waspang @150** · 14f0d48 · Merge pull request #129 from buanamenara/revisi-mudah · GitHub Actions
- 2026-11-19 14:36 · **waspang @149** · be2d66e · Merge pull request #128 from buanamenara/bot-perintah-cek · GitHub Actions
- 2026-11-18 10:05 · **gateway @26** · 9156bdc · Merge pull request #126 from buanamenara/gateway-login-segar · GitHub Actions
- 2026-11-18 09:57 · **waspang @148** · cafa3a5 · Merge pull request #125 from buanamenara/total-teks-umpan · GitHub Actions
- 2026-11-18 08:58 · **waspang @147** · bde20a0 · Merge pull request #124 from buanamenara/total-hari-ini · GitHub Actions
- 2026-11-16 19:45 · **waspang @146** · 013bd38 · fix(waspang): always force-refresh shared totals before generating WA report text · GitHub Actions
- 2026-11-16 19:34 · **waspang @145** · 748927c · feat(waspang): default report date to today and remember start implementation per cluster · GitHub Actions
- 2026-11-16 19:17 · **waspang @144** · e295e36 · fix(waspang): compact mobile report layout, center confirm modal, and guard JSON parse · GitHub Actions
- 2026-11-16 17:38 · **ftth @273** · d2781f7 · feat(gateway,ftth): host UI directly on GitHub Pages with Apps Script JSON RPC · GitHub Actions
- 2026-11-16 17:37 · **gateway @25** · d2781f7 · feat(gateway,ftth): host UI directly on GitHub Pages with Apps Script JSON RPC · GitHub Actions
- 2026-11-16 14:59 · **waspang @142** · b444f0d · fix(waspang): refresh daily preview and reset activity after report send · GitHub Actions
- 2026-11-15 02:03 · **ftth @272** · 4d4da5a · perf(ftth): add client SWR cache for checkpoint and scurve · GitHub Actions
- 2026-11-15 01:57 · **ftth @271** · 1a78a37 · perf(ftth): batch clear and column writes in boqGenPutBom_ · GitHub Actions
- 2026-11-15 01:39 · **gateway @24** · d014a6f · perf(ftth,gateway): cache bagHistory, slice getLogHistory read, and cache gateway users · GitHub Actions
- 2026-11-15 01:38 · **ftth @270** · d014a6f · perf(ftth,gateway): cache bagHistory, slice getLogHistory read, and cache gateway users · GitHub Actions
- 2026-11-15 01:35 · **ftth @269** · 7ac7282 · perf(ftth): cache db sites, checkpoint, and scurve with auto-invalidation · GitHub Actions
- 2026-11-14 22:56 · **waspang @141** · 542e7f4 · perf(waspang): cache empty boq plan results to guarantee cache hit on any cluster · GitHub Actions
- 2026-11-14 22:54 · **waspang @140** · 46bc4c7 · perf(waspang): optimize cluster totals refresh with multi-tier cache and bounded scan · GitHub Actions
- 2026-11-14 22:05 · **waspang @139** · 228abd9 · fix(waspang): subtract split line amounts from unsplit base openBal · GitHub Actions
- 2026-11-14 21:54 · **waspang @138** · d73f8aa · fix(waspang): sum line/FDT keys sharing material col in curAmountFor/salAmountFor · GitHub Actions
- 2026-11-14 21:48 · **waspang @137** · d54ff9c · Waspang: pulihkan Total 0 dari Teks Laporan/Selesai & cadangan memori tanpa localStorage · GitHub Actions
- 2026-11-14 20:41 · **waspang @136** · 2a5b94b · Merge pull request #123 from buanamenara/total-server-ulang · GitHub Actions
- 2026-11-14 19:51 · **waspang @135** · 9fe0398 · Merge pull request #121 from buanamenara/cari-semua · GitHub Actions
- 2026-11-14 19:51 · **ftth @268** · 9fe0398 · Merge pull request #121 from buanamenara/cari-semua · GitHub Actions
- 2026-11-14 19:27 · **waspang @134** · 7bc6306 · Merge pull request #120 from buanamenara/ba-wa-cepat · GitHub Actions
- 2026-11-14 19:22 · **ftth @267** · f13cb0f · Merge pull request #119 from buanamenara/cari-site · GitHub Actions
- 2026-11-14 19:11 · **waspang @133** · 42ac158 · Merge pull request #118 from buanamenara/panduan-apk · GitHub Actions
- 2026-11-14 19:10 · **ftth @266** · 42ac158 · Merge pull request #118 from buanamenara/panduan-apk · GitHub Actions
- 2026-11-14 18:47 · **waspang @132** · 732cdca · Merge pull request #117 from buanamenara/koordinator · GitHub Actions
- 2026-11-14 18:46 · **ftth @265** · 732cdca · Merge pull request #117 from buanamenara/koordinator · GitHub Actions
- 2026-11-14 18:45 · **gateway @23** · 732cdca · Merge pull request #117 from buanamenara/koordinator · GitHub Actions
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
