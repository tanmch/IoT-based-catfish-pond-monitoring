# Integrasi dengan Fish Linker

AutoFeeder sengaja dibuat sebagai **layanan terpisah** agar aplikasi Fish Linker
yang sudah berjalan tidak perlu diubah atau di-deploy ulang. Integrasi dilakukan
melalui database MySQL bersama dan kontrak data yang stabil.

> Build presentasi tidak memiliki login/akun. Integrasi identitas (SSO) hanya
> relevan setelah autentikasi diimplementasikan kembali untuk produksi.

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
| Kolam 20 unit | `kolam` | `feeder_ponds` | `fishlinker_kolam_id` menyimpan id asli |
| Biomassa | `isi_kolam` / `fish_stock` / `growth_log` | `feeder_ponds.biomass_kg` | Dipakai untuk porsi persen biomassa |
| Stok pakan | `feed_stock` | `feeder_feed_stock` | AutoFeeder memotong stoknya sendiri |
| Riwayat feeding | `pemberian_pakan` | `feeder_runs`, `feeder_commands` | AutoFeeder mencatat target vs aktual |
| Sensor | `sensor_data` | `feeder_telemetry` | Data hopper, daya, lingkungan gantry |
| Audit | `aktivitas` | `feeder_audit_logs` | Aksi AutoFeeder tetap tercatat sendiri |

Identitas pelaku audit disimpan sebagai snapshot (`username`, `role`) di
`feeder_audit_logs`; tidak ada tabel akun yang perlu disinkronkan pada build ini.

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
3. Salin data awal (lihat bagian 5) atau isi melalui halaman **Perangkat**.
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
- stok pakan → `feeder_feed_stock`

## 5. SQL impor contoh

Jalankan dengan user yang punya akses baca ke Fish Linker dan tulis ke
`feeder_*`. Sesuaikan nama kolom dengan skema aktual sebelum eksekusi.

```sql
-- Kolam: 10 kiri + 10 kanan, indeks 1..20
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
```

> `ROW_NUMBER()` membutuhkan MySQL 8+. Untuk MySQL 5.7 gunakan variabel
> `@row := @row + 1` atau lakukan pemetaan di skrip Python.

## 6. Integrasi feeding & stok

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

## 7. MQTT vs REST

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

## 8. Checklist go-live integrasi

- [ ] Autentikasi dan RBAC diimplementasikan kembali sebelum aplikasi diekspos.
- [ ] `DEVICE_API_KEY` dibuat acak, tidak ada di git.
- [ ] `ENVIRONMENT=production`, `DEMO_MODE=false`, `SEED_DEMO=false`,
      `SEED_DEMO_HISTORY=false`, `DEBUG=false`.
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
