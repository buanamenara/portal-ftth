# Aplikasi Android Portal FTTH

Pembungkus Android (WebView layar penuh) untuk https://buanamenara.github.io/portal-ftth/.
Isi portal tetap dimuat dari internet, jadi perubahan di Apps Script langsung terlihat tanpa membuat APK baru.

Yang ditangani aplikasi:
- Unggah file dan foto (galeri, file manager, atau kamera untuk Android 10+).
- Unduhan PDF/Excel dari portal disimpan di `Download/Portal FTTH` lewat `window.BMIApp.saveBase64` (dipakai `appSave()` di `portal-ftth-gas/Form.html`).
- Tautan WhatsApp, Google Sheets/Drive dan situs lain dibuka di aplikasinya masing-masing.
- Tombol Kembali mundur di dalam portal; tanpa internet muncul halaman "Coba lagi".

Paket: `id.co.buanamenara.portalftth`, minSdk 24 (Android 7), targetSdk 34.

## Membangun ulang

Butuh JDK 17+ dan Python 3 di Linux. Keystore penanda tangan TIDAK disimpan di repo ini (repo publik);
salinannya ada di file proyek. APK versi baru harus ditandatangani dengan keystore yang sama, kalau tidak HP menolak pembaruan.

```
./build.sh /path/portal-ftth.jks /path/password.txt
```

Naikkan `android:versionCode` dan `android:versionName` di `AndroidManifest.xml` setiap rilis.
