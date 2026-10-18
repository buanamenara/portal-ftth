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
