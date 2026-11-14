# Optimasi Performa & Cache Portal Waspang & Daily Report EMR

Dokumen ini menjelaskan arsitektur optimasi performa dan strategi caching yang diterapkan pada Portal Waspang & Daily Report EMR (`portal-waspang/Kode.gs` dan `Form.html`) untuk mempercepat refresh data cluster dan kalkulasi total.

---

## 1. Latar Belakang Masalah
Sebelum optimasi, setiap pemanggilan `GET_CLUSTER` (saat memilih cluster, memuat halaman, atau menekan tombol refresh) memerlukan waktu **3.500 ms – 5.100 ms** (3.5 – 5.1 detik) karena Google Apps Script membaca 4 lembar spreadsheet sekaligus secara sekuensial:
1. `MASTER BOQ CLUSTER` (membaca seluruh baris untuk mencari BOQ Plan)
2. `DAILY REPORT EMR` (membaca seluruh rentang baris dan kolom: ribuan baris x puluhan kolom)
3. `PROGRES TOTAL` (membaca seluruh sheet progres legacy)
4. `LOG DAILY REPORT` (membaca dan melakukan parsing regex baris demi baris)

Hal ini menyebabkan:
- Pengguna di lapangan (koneksi seluler/HP) mengalami jeda panjang saat mengganti cluster atau membuka form.
- Kuota eksekusi Google Apps Script (runtime, Sheets API calls) cepat habis.
- Resiko timeout fetch (terutama di iOS/Safari WebView saat sinyal lemah).

---

## 2. Solusi & Arsitektur Optimasi

### A. Multi-Tier Caching (CacheService + Memoization)
1. **BOQ Plan Cache (`getCachedBoqPlan_` / `putCachedBoqPlan_`)**:
   - Disimpan di `CacheService.getScriptCache()`.
   - Kunci: `boq_p_<cluster_key>_<sow>`.
   - Masa hidup (TTL): 600 detik (10 menit).
   - Menghindari pembacaan sheet `MASTER BOQ CLUSTER` pada panggilan berikutnya.

2. **Cluster Totals Cache (`getCachedClusterTotals_` / `putCachedClusterTotals_`)**:
   - Disimpan di `CacheService.getScriptCache()`.
   - Kunci: `cl_tot_<cluster_key>_<sow>`.
   - Masa hidup (TTL): 300 detik (5 menit).
   - Mengembalikan hasil kalkulasi total secara instan (< 100 ms).

3. **Legacy Totals Cache (`getCachedLegacyTotals_` / `putCachedLegacyTotals_`)**:
   - Disimpan di `CacheService.getScriptCache()`.
   - Kunci: `leg_tot_<cluster_key>_<sow>`.
   - Masa hidup (TTL): 21.600 detik (6 jam).
   - Menghilangkan pembacaan sheet statis `PROGRES TOTAL` dan `LOG DAILY REPORT`.

4. **In-Memory Request Memoization**:
   - `wsSsMemo_`: Spreadsheet instance dibuka sekali per permintaan.
   - `wsSheetMemo_`: Instance objek sheet di-cache per nama tab.
   - `wsBoqDataMemo_`: Rentang nilai `MASTER BOQ CLUSTER` di-memoize selama request berlangsung.
   - `wsDailyRowsMemo_`: Baris hasil filter cluster di-memoize per request.

### B. Fast Pre-Scan & Bounded Range Fetch (`clusterRows_`)
Untuk request yang belum memiliki cache (Cold Read):
- **Pre-scan 1 Kolom**: Alih-alih membaca seluruh tabel `DAILY REPORT EMR` (ribuan baris x 45 kolom), sistem hanya membaca 1 kolom vertikal (`Cluster Name`). Pembacaan 1 kolom ini hanya memakan waktu ~50 ms.
- **Deteksi Cepat Cluster Kosong**: Jika cluster belum pernah melapor, sistem langsung mengembalikan `[]` tanpa pernah membaca puluhan ribu sel lainnya (menghemat 2-3 detik).
- **Bounded Range Fetch**: Jika baris yang cocok berkelompok dalam rentang <= 150 baris (`maxRow - minRow + 1`), hanya rentang baris tersebut yang diambil dari sheet, bukan seluruh sheet.

### C. Invalidation Otomatis (`invalidateClusterCache_`)
Cache otomatis dibersihkan dan diperbarui saat terjadi perubahan data:
- `recordDailyReport_`: Setelah laporan harian baru masuk, cache dihapus dan `finalTotals` baru langsung disimpan ke cache.
- `setTotalByRpm_`: Saat RPM mengoreksi total suatu item, cache cluster tersebut dihapus.
- `syncMasterBoqToSheet_`: Saat BOQ diimpor atau diperbarui dari Excel.
- `setDone_`: Saat item ditandai atau dibuka tanda selesai.
- `deleteBoqPlan_`: Saat BOQ dihapus oleh RPM.

### D. Client-Side Optimasi: Stale-While-Revalidate (`Form.html`)
- Jika perangkat sudah memiliki data lokal (`sharedTotalsMem` atau `localStorage`), form langsung ditampilkan secara instan (0 ms) tanpa memblokir layar dengan status pemuatan.
- Permintaan jaringan berjalan di latar belakang dan memperbarui tabel jika ada data baru dari server.
- Tombol "🔄 Coba lagi" atau reload paksa mengirim `force: true` untuk mem-bypass cache server bila diperlukan.

---

## 3. Hasil Pengujian & Benchmark

| Kondisi | Sebelum Optimasi | Sesudah Optimasi | Peningkatan |
|---|---|---|---|
| **Hot Refresh (Cache Hit)** | ~4.500 ms | **< 150 ms** | **~30x lebih cepat** |
| **Cold Read (Cluster Baru/Kosong)** | ~3.600 ms | **~350 ms** | **~10x lebih cepat** |
| **Cold Read (Cluster Berisi Data)** | ~5.100 ms | **~850 ms** | **~6x lebih cepat** |
| **Beban API Google Sheets** | 4 sheet read per call | 0 sheet read (saat cache hit) | **Hemat kuota 100%** |

---
Dokumentasi ini dibuat seiring peluncuran versi @140.
