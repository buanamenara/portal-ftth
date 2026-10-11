# Gateway - Portal Terpadu BMI

Project Apps Script terpisah: login sekali (sheet USERS yang sama dengan Portal FTTH), lalu menu
portal sesuai role. Tombol menu membuka URL exec Portal FTTH / Portal Waspang (navigasi sungguhan).

Akses per role diatur di `CONFIG.ROLE_PORTALS` (Kode.gs):

| Role    | Portal                      |
|---------|-----------------------------|
| rpm     | Portal FTTH, Portal Waspang |
| admin   | Portal FTTH                 |
| waspang | Portal Waspang, Portal FTTH |

## Pasang
1. script.google.com > New project, beri nama "Gateway Portal Terpadu BMI".
2. Ganti isi `Code.gs` dengan `Kode.gs`; tambah file HTML bernama `Form` dan isi dengan `Form.html`.
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Izinkan akses Spreadsheet.
4. Update berikutnya: Deploy > Manage deployments > Edit > Version: New version > Deploy, lalu hard refresh.

Folder `portal-ftth-gas/` adalah salinan Kode.gs + Form.html Portal FTTH yang live (versi deployment 182)
sebagai acuan. Gateway tidak mengubah Portal FTTH.
