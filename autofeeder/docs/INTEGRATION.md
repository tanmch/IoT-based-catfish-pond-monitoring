# Integrasi dengan Fish Linker

AutoFeeder sengaja dibuat sebagai **layanan terpisah** agar aplikasi Fish Linker
yang sudah berjalan tidak perlu diubah atau di-deploy ulang. Integrasi dilakukan
melalui database MySQL bersama, JWT, dan kontrak data yang stabil.

## 1. Prinsip integrasi

- Semua tabel AutoFeeder memakai prefix `feeder_` sehingga aman berada di schema
  `budidaya_lele` bersama 22 tabel Fish Linker.
- Tidak ada foreign key langsung ke tabel Fish Linker. Relasi memakai kolom
  `fishlinker_kolam_id` (opsional) agar migrasi/rollback tidak merusak data lama.
- AutoFeeder tidak menulis ke tabel `kolam`, `users`, `feed_stock`, atau
  `pemberian_pakan` milik Fish Linker. Sinkronisasi bersifat satu arah
  (Fish Linker → AutoFeeder) atau melalui API.
- Waktu disimpan sebagai UTC naive di database dan dikirim ke UI sebagai WIB
  (`+07:00`), konsisten dengan kebiasaan operasional kolam.

## 2. Peta data

| Kebutuhan AutoFeeder | Sumber Fish Linker | Tabel AutoFeeder | Catatan |
|---|---|---|---|
| Pengguna & peran | `users` | `feeder_users` | Admin/pemilik/petani; password bcrypt terpisah |
| Kolam 20 unit | `kolam` | `feeder_ponds` | `fishlinker_kolam_id` menyimpan id asli |
| Penugasan petani | `pemilik_petani_kolam` | `feeder_pond_assignments` | Menentukan scope akses petani |
| Biomassa | `isi_kolam` / `fish_stock` / `growth_log` | `feeder_ponds.biomass_kg` | Dipakai untuk porsi persen biomassa |
| Stok pakan | `feed_stock` | `feeder_feed_stock` | AutoFeeder memotong stoknya sendiri |
| Riwayat feeding | `pemberian_pakan` | `feeder_runs`, `feeder_commands` | AutoFeeder mencatat target vs aktual |
| Sensor | `sensor_data` | `feeder_telemetry` | Data hopper, daya, lingkungan gantry |
| Audit | `aktivitas` | `feeder_audit_logs` | Aksi AutoFeeder tetap tercatat sendiri |

## 3. Opsi A — satu database MySQL (disarankan)

```env
DATABASE_URL=mysql+pymysql://feeder_app:STRONG_PASSWORD@127.0.0.1:3306/budidaya_lele
```

Langkah:

1. Buat user MySQL khusus AutoFeeder:

   ```sql
   CREATE USER 'feeder_app'@'%' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_KUAT';
   GRANT SELECT, INSERT, UPDATE, DELETE ON budidaya_lele.feeder_* TO 'feeder_app'@'%';
   FLUSH PRIVILEGES;
   ```

2. Jalankan AutoFeeder sekali agar tabel `feeder_*` dibuat otomatis.
3. Salin data awal (lihat bagian 5) atau gunakan halaman **Pengguna** dan
   **Perangkat** untuk mengisi manual.
4. Untuk produksi, pasang Alembic sebelum perubahan skema berikutnya. Saat ini
   pembuatan tabel memakai `Base.metadata.create_all`, yang aman untuk instalasi
   baru tetapi belum menangani migrasi kolom.

> Jangan memberi AutoFeeder hak `DROP` atau akses ke tabel non-`feeder_*`.
> Gunakan user read-only terpisah untuk proses impor.

## 4. Opsi B — dua database

AutoFeeder memakai database sendiri, sedangkan Fish Linker tetap di
`budidaya_lele`. Keuntungannya isolasi penuh; kekurangannya sinkronisasi harus
dijadwalkan.

```env
DATABASE_URL=mysql+pymysql://feeder_app:...@127.0.0.1:3306/autofeeder
FISHLINKER_DATABASE_URL=mysql+pymysql://feeder_readonly:...@127.0.0.1:3306/budidaya_lele
```

Skrip sinkronisasi dapat dijalankan sebagai cron setiap 15 menit:

- `kolam` → `feeder_ponds` (berdasarkan `fishlinker_kolam_id`)
- `users` → `feeder_users` (hanya jika ingin login tunggal; hash password harus
  kompatibel bcrypt)
- stok pakan → `feeder_feed_stock`

## 5. SQL impor contoh

Jalankan dengan user yang punya akses baca ke Fish Linker dan tulis ke
`feeder_*`. Sesuaikan nama kolom dengan skema aktual sebelum eksekusi.

```sql
-- 1) Kolam: 10 kiri + 10 kanan, indeks 1..20
INSERT INTO feeder_ponds
  (fishlinker_kolam_id, name, side, pond_index, position_m, biomass_kg, diameter_m, is_active, created_at)
SELECT
  k.id,
  k.nama_kolam,
  CASE WHEN k.id % 2 = 1 THEN 'left' ELSE 'right' END,
  ROW_NUMBER() OVER (ORDER BY k.id),
  ((ROW_NUMBER() OVER (ORDER BY k.id) - 1) % 10) * 1.6 + 0.8,
  COALESCE((
    SELECT SUM(fs.jumlah_kg)
    FROM fish_stock fs
    WHERE fs.kolam_id = k.id AND fs.status = 'aktif'
  ), 0),
  COALESCE(k.diameter, 3.0),
  1,
  UTC_TIMESTAMP()
FROM kolam k
WHERE k.status = 'Sedang Pemeliharaan'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  biomass_kg = VALUES(biomass_kg),
  is_active = VALUES(is_active);

-- 2) Penugasan petani (contoh: semua kolam untuk user role petani)
INSERT IGNORE INTO feeder_pond_assignments (user_id, pond_id, created_at)
SELECT u.id, p.id, UTC_TIMESTAMP()
FROM feeder_users u
CROSS JOIN feeder_ponds p
WHERE u.role = 'petani';
```

> `ROW_NUMBER()` membutuhkan MySQL 8+. Untuk MySQL 5.7 gunakan variabel
> `@row := @row + 1` atau lakukan pemetaan di skrip Python.

## 6. Autentikasi bersama (SSO)

AutoFeeder memakai JWT HS256 dengan klaim:

```json
{
  "sub": "user@example.com",
  "uid": 12,
  "role": "pemilik",
  "ver": 1,
  "iat": 1760000000,
  "nbf": 1760000000,
  "exp": 1760003600,
  "jti": "..."
}
```

Ada tiga pilihan, dari yang paling sederhana:

### 6.1 Secret sama, klaim kompatibel

Jika Fish Linker dan AutoFeeder memakai `SECRET_KEY` yang sama dan Fish Linker
sudah mengirim `sub`, `uid`, `role`, serta `ver`:

1. Salin `SECRET_KEY` Fish Linker ke `backend/.env` AutoFeeder **melalui secret
   manager**, jangan lewat git.
2. Pastikan nilai `role`Fish Linker dipetakan ke `admin`/`pemilik`/`petani`.
3. Salin user ke `feeder_users` dengan `id` yang sama dan `token_version` yang
   sama dengan `ver`. Token lama otomatis berlaku di kedua aplikasi.
4. Ganti password di AutoFeeder akan menaikkan `token_version` sehingga token
   lama ditolak. Ini juga mencabut sesi Fish Linker bila memakai secret yang sama;
   koordinasikan kebijakan logout.

**Risiko:** siapa pun yang memegang secret dapat membuat token untuk kedua
aplikasi. Simpan secret hanya di environment/secret manager, rotasi berkala, dan
jangan pernah mengirimnya ke browser.

### 6.2 Reverse proxy dengan validasi terpusat

Letakkan kedua aplikasi di belakang Nginx/Traefik:

- `/` → Fish Linker :8000
- `/feeder/` → AutoFeeder :8010
- Validasi JWT dilakukan di gateway; AutoFeeder menerima header identitas dari
  gateway melalui jaringan internal.

Cara ini membutuhkan adaptasi dependency `get_current_user` agar memercayai
header gateway **hanya** dari IP internal. Jangan aktifkan mode ini jika backend
dapat diakses langsung dari internet.

### 6.3 Token exchange (paling aman untuk jangka panjang)

Fish Linker menambahkan endpoint `POST /auth/feeder-token` yang menerbitkan token
AutoFeeder berumur pendek setelah memvalidasi sesi Fish Linker. AutoFeeder tetap
memakai `SECRET_KEY` sendiri. Ini menghindari sharing secret dan memudahkan audit.

## 7. Integrasi feeding & stok

AutoFeeder adalah **sumber kebenaran** untuk eksekusi gantry dan stok hopper.
Fish Linker tetap menjadi sumber kebenaran untuk pembelian pakan dan keuangan.

Rekomendasi:

- Setelah run `dispensed`, AutoFeeder dapat memanggil webhook Fish Linker
  (belum diimplementasikan) atau Fish Linker membaca `feeder_runs` untuk membuat
  baris `pemberian_pakan`.
- Jangan memotong stok di kedua aplikasi. Pilih satu pemilik stok:
  - **AutoFeeder memiliki stok operasional** (default): `feeder_feed_stock`
    berkurang saat ACK sukses; Fish Linker mencatat pembelian.
  - **Fish Linker memiliki stok**: nonaktifkan pemotongan di AutoFeeder dan
    sinkronkan stok harian. Ini membutuhkan perubahan kode.
- Untuk laporan keuangan, ekspor CSV AutoFeeder dapat diimpor ke modul Fish
  Linker atau digabungkan di lapisan BI.

## 8. MQTT vs REST

PRD awal memilih MQTT/TLS (HiveMQ). Implementasi ini memilih **REST polling**
karena:

| Aspek | REST polling (dipakai) | MQTT/TLS |
|---|---|---|
| Broker | Tidak perlu | HiveMQ Cloud + kredensial |
| Firmware | HTTP client sederhana | MQTT client, keepalive, LWT |
| Latensi | 2–5 detik (cukup untuk feeding) | < 1 detik |
| Offline | Jadwal lokal di NVS | Perlu buffer/LWT |
| Integrasi Fish Linker | Sama dengan pola device existing | Perlu komponen baru |
| Skala | Ribuan request/menit masih wajar untuk 1 gantry | Lebih efisien untuk banyak device |

Untuk satu gantry dan 20 kolam, REST polling lebih sederhana dan cukup. Jika
nanti ada banyak gantry, tambahkan adapter MQTT di belakang service yang sama:
MQTT handler memanggil fungsi `poll_commands`/`ack_command` yang sudah ada,
sehingga logika bisnis tidak berubah.

## 9. Checklist go-live integrasi

- [ ] `SECRET_KEY` dan `DEVICE_API_KEY` dibuat acak, tidak ada di git.
- [ ] `ENVIRONMENT=production`, `SEED_DEMO=false`, `DEBUG=false`.
- [ ] HTTPS aktif; `ALLOWED_HOSTS` dan `CORS_ORIGINS` berisi domain nyata.
- [ ] User MySQL AutoFeeder hanya punya akses `feeder_*`.
- [ ] Backup harian schema `budidaya_lele` dan uji restore.
- [ ] `fishlinker_kolam_id` terisi untuk 20 kolam dan biomassa terbaru.
- [ ] Stok pakan awal dan kapasitas hopper sesuai alat.
- [ ] Simulator atau perangkat uji berhasil ACK satu feeding.
- [ ] Alarm offline, hopper low, dan command expired diuji.
- [ ] Audit trail diperiksa setelah perubahan jadwal/manual feed.
- [ ] Rotasi device key diuji dan key lama ditolak.
- [ ] Runbook darurat (E-stop fisik, kontak, rollback) tersedia.
