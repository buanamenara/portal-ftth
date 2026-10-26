# Gateway WhatsApp Portal Waspang (laptop 24 jam)

Program ini menggantikan Fonnte tanpa biaya. Laptop yang menyala 24 jam menautkan nomor WA laporan sebagai
**perangkat tertaut** (seperti WhatsApp Web). Program lalu mengambil laporan Daily Report dan foto/PDF Dokumentasi
dari Portal Waspang setiap 15 detik dan mengirimnya ke grup **REPORT BMI**. Foto dan PDF terkirim langsung, bukan
sebagai link.

Laptop yang menghubungi portal, jadi tidak perlu IP publik, port terbuka, atau pengaturan router. Bila laptop mati
atau internet putus, laporan menunggu di portal dan terkirim begitu laptop menyala lagi (paling lama 3 hari).
Laporan dan foto tetap tersimpan di sheet dan Drive seperti biasa.

## Pasang sekali di laptop (Windows)

1. Pasang **Node.js versi LTS** dari https://nodejs.org (Next sampai selesai).
2. Salin folder `wa-gateway` ke laptop, misalnya ke `C:\wa-gateway`.
3. Buka folder itu, ketik `cmd` di kolom alamat Explorer lalu Enter. Di jendela hitam ketik:
   ```
   npm install
   ```
4. Salin `config.example.json` menjadi `config.json`, lalu isi:
   - `secret`: kata sandi acak buatan sendiri, minimal 16 huruf dan angka campur. Jangan dibagikan dan jangan pakai contoh dari mana pun.
   - `group`: nama grup persis seperti di WhatsApp (`REPORT BMI`).
   - `pairPhone`: kosongkan untuk menautkan dengan scan QR, atau isi nomor WA laporan (`62812xxxx`) untuk
     menautkan dengan kode 8 huruf.
5. Di Apps Script **Portal Waspang** > Project Settings (ikon roda gigi) > Script Properties, tambahkan
   `WA_PC_SECRET` dengan isi yang sama persis dengan `secret` tadi. Jangan isi `WA_MODE` dulu.
6. Klik dua kali `start.bat`. Di HP nomor laporan buka WhatsApp > **Perangkat tertaut** > **Tautkan perangkat**,
   lalu scan QR di jendela hitam (atau pilih "Tautkan dengan nomor telepon" dan ketik kodenya).
   Bila muncul `Tersambung ke WhatsApp`, tautan berhasil. Fonnte boleh tetap tertaut selama masa uji.

## Pindah dari Fonnte ke laptop

1. Script Properties Waspang: tambahkan `WA_MODE` = `pc`.
2. Di editor Apps Script pilih fungsi `waTest` > Run. Dalam 15 detik pesan uji harus masuk ke grup REPORT BMI.
3. Bila berhasil, paket Fonnte boleh dihentikan. Untuk kembali ke Fonnte cukup hapus `WA_MODE`.

`waPcStatus` (Run di editor) menunjukkan kapan laptop terakhir mengambil antrean dan berapa laporan yang menunggu.

## Bot perintah pendek (tanpa AI)

Program yang sama juga menjawab perintah pendek. Tidak ada biaya tambahan dan tidak memakai AI.

- **Di grup REPORT BMI** perintah diawali `!`, supaya obrolan biasa tidak dijawab:
  `!stok`, `!stok cable`, `!progres jati baru rt 04`, `!rekap`, `!rekap kemarin`, `!rekap 24/10`, `!site jati`, `!bantu`.
- **Chat pribadi ke nomor laporan** hanya dilayani untuk nomor di Script Property `WA_OWNER`, dan boleh tanpa `!`.
  Selain perintah di atas ada perintah pribadi: `catat <teks>` (masuk tab CATATAN BOT di spreadsheet Waspang),
  `catatan [kata]`, `ingatkan 14:30 <teks>`, `ingatkan besok 08:00 <teks>`, `ingatkan 30m <teks>`, `ingatkan 2j <teks>`,
  dan `pengingat`. Jam pengingat memakai WITA.
- Pesan dari nomor lain di chat pribadi diabaikan, tidak dibalas.

Cara menyalakan:
1. Script Properties Waspang: tambahkan `WA_OWNER` = nomor WA pribadimu dengan format `62812xxxx` (beberapa nomor
   dipisah koma).
2. Ganti `gateway.mjs` di laptop dengan versi terbaru, lalu tutup jendela hitam dan jalankan `start.bat` lagi.
   Tautan WhatsApp tidak perlu diulang.
3. Dari HP pribadimu kirim `bantu` ke nomor laporan, dan kirim `!bantu` di grup.

Pengingat dikirim saat laptop mengambil antrean, jadi bisa terlambat sampai 15 detik, atau lebih lama bila laptop mati.

## Supaya tetap menyala 24 jam

- Pengaturan daya laptop: **Sleep = Never**, dan saat layar ditutup = **Do nothing**. Sambungkan charger terus.
- Jalan otomatis saat laptop menyala: tekan `Win + R`, ketik `shell:startup`, Enter, lalu taruh **shortcut**
  `start.bat` di folder yang terbuka. Atur juga Windows supaya masuk otomatis tanpa kata sandi bila perlu.
- Jendela hitam `Gateway WhatsApp Portal Waspang` harus tetap terbuka (boleh diperkecil). Bila program berhenti,
  `start.bat` menjalankannya lagi sendiri.
- HP nomor laporan perlu tersambung internet setidaknya sekali dalam 14 hari, kalau tidak WhatsApp melepas semua
  perangkat tertaut.
- Bila jendela menulis "Perangkat dikeluarkan dari WhatsApp", hapus folder `auth` lalu jalankan `start.bat` dan
  tautkan ulang.

## Catatan

- Program ini memakai jalur tidak resmi (seperti Fonnte), jadi tetap ada risiko nomor diblokir WhatsApp. Pakai nomor
  khusus laporan, bukan nomor pribadi.
- Folder `auth` berisi kunci tautan WhatsApp dan `config.json` berisi kata sandi: jangan dibagikan atau diunggah.

## Jadwal otomatis grup (07:00 dan 17:30 WITA)

- **07:00 Today's Plan**: PIC, region, daftar permit (kalau ada), dan Implementasi = site dan aktivitas dari Daily Report hari kerja terakhir.
- **17:30 Pengingat laporan harian**: anggota tim yang belum mengirim Daily Report hari ini di-tag, yang sudah disebut namanya.
- Jadwal dicek setiap kali laptop mengambil antrean, jadi laptop harus menyala. Kalau laptop mati sampai 10:00 (pagi) atau 19:30 (sore), jadwal hari itu dilewati.
- Perintah pribadi (hanya WA_OWNER):
  - `permit` diikuti daftar cluster, satu per baris. Dipakai di Today's Plan berikutnya. `permit hapus` untuk membatalkan.
  - `tim Nazar 0812...` untuk menyimpan nomor yang di-tag. Nama harus sama dengan PIC di Daily Report.
  - `pagi` / `sore` untuk melihat contoh pesan sekarang.
- Script Properties opsional: `BOT_JADWAL=off` (matikan jadwal), `BOT_PIC`, `BOT_REGION`.
- Fitur tag dan daftar permit yang panjang butuh `gateway.mjs` versi terbaru di laptop.

## Fitur tambahan bot (stok menipis, rekap mingguan, cek Daily Report, BA Ambil, alarm)

- **07:00 stok menipis**: dikirim ke chat pribadi pemilik (nomor pertama di WA_OWNER), hanya kalau ada material di bawah batas. Atur batasnya dengan `batas cable 24c 3000`, hapus dengan `batas hapus fat`, kembalikan ke bawaan dengan `batas awal`. Gudang yang dicek diatur di Script Property `BOT_STOK_GUDANG` (bawaan banjarmasin).
- **Senin 07:00 rekap mingguan** ke grup: volume per site Senin–Minggu pekan lalu, progres terhadap Plan, dan total pemakaian. Untuk melihat contohnya, ketik `mingguan`.
- **Cek Daily Report**: setiap laporan yang masuk dicek, misalnya tanggal lebih awal dari Start Implementation, tanggal di masa depan atau lebih dari 3 hari lalu, atau Total melebihi Plan. Temuannya dikirim ke grup, dan PIC di-tag kalau nomornya ada di daftar `tim`.
- **BA Ambil dan BA Masuk** (Pembelian / Transfer) baru di Portal FTTH (BA TRANSAKSI) diteruskan ke grup, dicek setiap 5 menit. Baris penyesuaian stok opname (ID berisi `-OPN-`) tidak diteruskan.
- **Alarm gateway mati**: email ke Script Property `BOT_ALARM_EMAIL` kalau laptop tidak mengambil antrean selama lebih dari 15 menit, dan email lagi saat gateway jalan kembali. Pasang sekali dari editor Apps Script: jalankan `pasangAlarmGateway`, lalu setujui izinnya.

## Excel stok WH lewat grup (!stokwh)

1. Tim WH mengirim file Excel stok (.xlsx) ke grup dengan caption `!stokwh`. Kalau beberapa file dikirim sekaligus, cukup file pertama yang diberi caption; file .xlsx berikutnya dari orang yang sama dalam 3 menit ikut dibaca. Nama gudang diambil dari baris **Area** di file. Kalau baris itu tidak ada, tulis nama gudangnya di caption, mis. `!stokwh batola`.
2. Laptop membaca baris **Stock Gudang** (juga "Stock Gudang (Fisik)") dan judul kolom materialnya, lalu Apps Script membandingkannya dengan SALDO GUDANG. Grup hanya mendapat konfirmasi bahwa file sudah diterima.
3. Pemilik (nomor pertama di WA_OWNER) mendapat chat pribadi berisi selisih per material. Material yang berubah lebih dari 30% diberi tanda ⚠️. Kolom yang tidak ada di portal, seperti HDPE 32/28 atau Helical, ikut disebut tapi dilewati.
4. Balas `setuju` untuk mencatatnya. Bot menulis satu baris "Masuk - Pembelian" (Tim WH, ID `MSK-yyMMdd-OPN-BJM`) per gudang di BA TRANSAKSI, dan SALDO GUDANG langsung ikut berubah. Balas `batal` untuk membuang usulan. Usulan yang tidak dijawab hangus setelah 12 jam, saat file baru masuk.

Membatalkan setelah `setuju` dilakukan dengan menghapus baris itu di BA TRANSAKSI. Fitur ini butuh `gateway.mjs` dan `xlsx-mini.mjs` versi baru di laptop, tanpa paket npm tambahan.

## Pengingat, rekap bulanan dan backup

- **07:05 site tanpa laporan** (grup): site yang laporan terakhirnya 3-30 hari lalu dan belum RFS / Drop di DATA BASE (kolom Implementation Status). PIC terakhir di-tag kalau ada di daftar `tim`. Satu site hanya diingatkan sekali per masa diam, daftar lengkapnya tiap Senin. Cek kapan saja dengan `mangkrak`.
- **07:05 melebihi Plan BOQ** (chat pribadi pemilik): item yang Total Daily Report-nya baru melewati Plan di MASTER BOQ. Saat pertama jalan, item yang sudah lewat dianggap sudah diketahui. Daftar lengkapnya tiap Senin, atau ketik `boq`.
- **Stok menipis** kini ikut menampilkan perkiraan habis (stok dibagi rata-rata BA Ambil 4 minggu).
- **Tim WH** (grup, 08:00): Senin diminta mengirim Excel stok (`!stokwh`), tanggal 28 diingatkan persiapan stok opname, tanggal 1 ditagih file opname. Daftarkan nomor tim gudang dengan `wh <nama> <nomor>` supaya di-tag.
- **Tanggal 1, 07:00 rekap bulanan** ke grup (isinya sama dengan rekap mingguan, untuk bulan lalu). Contohnya: `bulanan`.
- **Minggu 22:00 backup** spreadsheet Portal FTTH dan Waspang ke folder Drive "Backup Portal BMI (otomatis)" milik akun yang menjalankan Apps Script. 4 backup terbaru disimpan, yang lebih lama dipindah ke Sampah. Backup jalan dari trigger `cekGatewayBot`, jadi tetap jalan walau laptop mati, asal `pasangAlarmGateway` sudah dijalankan. Backup manual: `backup`.
- `bantu` / `bantuan` menampilkan semua perintah dan jadwal otomatis.

- `sore kirim` (chat pribadi pemilik): pengingat Daily Report langsung dikirim ke grup saat itu juga, dengan tag anggota tim yang belum lapor, di luar jadwal 17:30.
- **Potongan kabel**: kalau Excel `!stokwh` berisi sheet POTONGAN (kolom "POTONGAN KABEL 24 C" / "UTUH KABEL 24 C"), jumlah haspel utuh dan potongan per kabel disimpan (hanya info, tidak mengubah saldo). `stok kabel` menampilkan ringkasannya, `potongan 24c` menampilkan daftar panjang tiap potongan. Butuh `xlsx-mini.mjs` versi 26 Okt di laptop gateway (baris berisi angka saja ikut dibaca).
- `ba <site> [sow]` (grup dan pribadi): daftar BA Ambil dan Pengembalian satu site dari BA TRANSAKSI, urut tanggal, per SOW, ditambah total bersih per material (Ambil dikurangi Pengembalian). Contoh: `!ba penggalaman`, `!ba jati baru rt 04 subfeeder`. Kalau beberapa site cocok, bot minta nama yang lebih jelas.
- `panduan`: bot mengirim PDF panduan perintah untuk tim (tanpa perintah admin) ke chat yang meminta. `panduan lengkap` (hanya nomor WA_OWNER): PDF berisi semua perintah termasuk admin dan jadwal ke admin, selalu dikirim ke chat pribadi admin walau diketik di grup. PDF dibuat otomatis oleh Apps Script dan disimpan di Drive akun yang menjalankan script; dibuat ulang kalau versi panduan di kode berubah. Untuk memakai PDF sendiri, isi Script Property `BOT_PANDUAN_FILE` dengan ID file PDF di Drive (harus bisa dibuka akun script).
- **Excel WH basi** (chat pribadi pemilik, 07:10): kalau 7 hari tidak ada Excel `!stokwh` yang terbaca, pemilik diingatkan, lalu diulang tiap 3 hari sampai file baru masuk. Hitungan dimulai saat versi ini dipasang.
- **BOQ melebihi Plan** (chat pribadi pemilik) hanya tiap **Senin 07:05**, daftar lengkap. Balas `<nama site> ok` (mis. `penggalaman ok`) supaya site itu tidak dilaporkan lagi, `boq ok` = daftar site yang sudah di-OK, `boq ok hapus <site>` = batalkan. `boq` kapan saja = daftar sekarang tanpa site yang sudah di-OK.
- `status` / `status gateway` (pemilik): kapan laptop terakhir mengambil antrean, jumlah pesan yang menunggu / gagal dan pengingat terjadwal, jadwal hari ini (✅ sudah, ⏳ belum, ❌ terlewat), alarm email + trigger `cekGatewayBot`, Excel WH dan backup terakhir. Kalau bot tidak menjawab sama sekali, gateway mati (email alarm yang memberi tahu).
