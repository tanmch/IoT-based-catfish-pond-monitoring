# Rencana Implementasi — AutoFeeder Rail Gantry

Dokumen ini memecah pekerjaan menjadi beberapa plan yang dapat diselesaikan dan
diuji secara independen. Status ditandai `[x]` (selesai di repo ini), `[~]`
(sebagian), atau `[ ]` (belum).

## Ringkasan plan

| Plan | Fokus | Status |
|---|---|---|
| P0 | Fondasi proyek & mode presentasi | `[x]` |
| P1 | Data dan integrasi Fish Linker | `[x]` |
| P2 | Monitoring perangkat & telemetri | `[x]` |
| P3 | Jadwal, porsi, dan feeding otomatis | `[x]` |
| P4 | Kendali manual, keselamatan, alarm | `[x]` |
| P5 | Riwayat, ekspor, dan audit trail | `[x]` |
| P6 | UI operasional 20 kolam | `[x]` |
| P7 | Pengujian, simulator, dan operasi | `[~]` |
| P8 | Pengerasan produksi & pengembangan lanjutan | `[ ]` |

---

## P0 — Fondasi proyek & mode presentasi

**Tujuan:** aplikasi dapat dijalankan tanpa menyentuh aplikasi Fish Linker, tanpa
halaman login, dan dengan data presentasi yang siap pakai.

**Deliverable**

- [x] Folder terpisah `autofeeder/` (backend, frontend, simulator, docs).
- [x] FastAPI + SQLAlchemy 2 + Pydantic Settings.
- [x] SQLite untuk demo lokal; MySQL via `DATABASE_URL`.
- [x] Semua tabel baru berprefix `feeder_`.
- [x] `.env.example` tanpa secret nyata; `.env` di-`.gitignore`.
- [x] Validasi device key lemah ditolak saat startup.
- [x] Mode presentasi tanpa login/akun/RBAC (`DEMO_MODE=true`).
- [x] Production menolak mode demo dan seed demo.
- [x] Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy).
- [x] CORS dan TrustedHost dibatasi lewat environment.
- [x] Dokumentasi Swagger dimatikan di production.

**Kriteria selesai**

- `GET /api/health` mengembalikan `status=ok`.
- UI langsung terbuka tanpa halaman login.
- Tidak ada endpoint `/api/auth/*` atau `/api/users`.
- Tidak ada secret yang muncul di `git status` atau log.

---

## P1 — Data dan integrasi Fish Linker

**Tujuan:** model data operasional 20 kolam yang siap dipresentasikan.

**Deliverable**

- [x] Tabel `feeder_ponds`, `feeder_schedules`, `feeder_runs`, `feeder_commands`.
- [x] Satu identitas operator demo untuk atribusi audit (tanpa password).
- [x] `fishlinker_kolam_id` untuk pemetaan ke tabel `kolam`.
- [x] Seed demo 20 kolam (10 kiri, 10 kanan), 750 kg pakan, jadwal 2x sehari.
- [x] Data presentasi 14 hari: ±560 run, ±550 command, ±670 telemetry, 6 alarm,
      8 audit, stok pakan tersisa ±214 kg.
- [x] Endpoint biomassa per kolam untuk porsi persen biomassa.
- [x] Peta integrasi dan contoh SQL di `docs/INTEGRATION.md`.
- [ ] Skrip sinkronisasi otomatis dari Fish Linker (cron/worker).
- [ ] Alembic untuk migrasi produksi.
- [ ] Autentikasi & RBAC untuk produksi (dihapus dari build presentasi).

**Kriteria selesai**

- Data 20 kolam tampil konsisten di dashboard dan peta gantry.
- Riwayat 14 hari terisi otomatis saat database baru dibuat.
- Tidak ada foreign key yang mengikat ke tabel Fish Linker.

---

## P2 — Monitoring perangkat & telemetri

**Tujuan:** operator melihat kondisi gantry, hopper, daya, dan lingkungan.

**Deliverable**

- [x] Autentikasi perangkat `X-Device-Key` (hash SHA-256 di database).
- [x] Rotasi key perangkat dengan audit.
- [x] `POST /api/device/telemetry` untuk status, lingkungan, daya, hopper.
- [x] `POST /api/device/heartbeat` dan `GET /api/device/config`.
- [x] Deteksi online/offline (`DEVICE_OFFLINE_SECONDS`, default 30 detik).
- [x] Ambang alarm suhu, kelembapan, hopper low/empty, tegangan.
- [x] Riwayat telemetri + ekspor CSV.
- [x] Grafik suhu, kelembapan, daya, dan level hopper di dashboard.
- [x] Retensi data (`RETENTION_DAYS`, default 365 hari).

**Kriteria selesai**

- Telemetry dari simulator mengubah status perangkat menjadi online.
- Mematikan simulator > 30 detik memunculkan alarm `DEVICE_OFFLINE`.
- Key salah menghasilkan `401` tanpa membocorkan detail.

---

## P3 — Jadwal, porsi, dan feeding otomatis

**Tujuan:** feeding berjalan tepat waktu, tepat kolam, dan tepat porsi.

**Deliverable**

- [x] Jadwal scope `global`, `row` (kiri/kanan), dan `pond`.
- [x] Prioritas jadwal: pond > row > global.
- [x] Maksimum 3 waktu feeding per jadwal, format `HH:MM` WIB.
- [x] Mode porsi `fixed` (gram) dan `percent` (% biomassa).
- [x] Override porsi per kolam dalam satu jadwal.
- [x] Batas porsi jadwal 10.000 g; manual feed 5.000 g.
- [x] Konversi gram → putaran rotary (`GRAMS_PER_ROTATION`, default 200 g).
- [x] Materialisasi run harian idempoten (scheduler tick 5 detik), hanya dari
      jadwal efektif per kolam.
- [x] Dispatch satu perintah feed pada satu waktu; run berikutnya menunggu ACK
      agar antrean 20 kolam tidak kedaluwarsa.
- [x] Dispatch command dengan prioritas dan masa berlaku (`COMMAND_TTL_SECONDS`).
- [x] Run status: `planned`, `dispensed`, `skipped`, `failed`.
- [x] Perubahan/penonaktifan jadwal membatalkan command pending.
- [x] Pause/resume jadwal tanpa menghapus riwayat.
- [x] Perhitungan kebutuhan pakan harian dan estimasi hari stok.

**Kriteria selesai**

- Satu jadwal global 07:00/16:00 membuat 40 run per hari (20 kolam × 2).
- Perubahan jadwal menaikkan `version` dan terlihat di config perangkat.
- Porsi persen biomassa berubah saat biomassa diperbarui.
- Tidak ada run ganda untuk slot yang sama.

---

## P4 — Kendali manual, keselamatan, alarm

**Tujuan:** operator dapat turun tangan dengan aman, dan sistem menolak aksi
berisiko.

**Deliverable**

- [x] Manual feed dengan konfirmasi eksplisit dan idempotency key.
- [x] Validasi perangkat online sebelum command manual.
- [x] Validasi stok gudang dan sisa hopper sebelum mengirim.
- [x] Reservasi stok untuk command pending.
- [x] E-stop, home, dan reset/validasi keamanan (admin/pemilik).
- [x] ACK perangkat: sukses memotong stok, gagal membuat alarm.
- [x] Penolakan replay ACK dan command kedaluwarsa.
- [x] Alarm: suhu, kelembapan, hopper low/empty, tegangan, offline, command
      expired, kegagalan feeding.
- [x] Acknowledge/resolve alarm dengan catatan.
- [x] Pembatalan command manual oleh operator yang berwenang.
- [ ] Integrasi WhatsApp/email untuk alarm kritis.
- [ ] Sirene/indikator fisik terhubung ke status alarm.

**Kriteria selesai**

- E-stop dari dashboard diterima simulator dan mengubah state perangkat.
- Manual feed saat hopper kosong ditolak dengan pesan jelas.
- ACK ganda tidak menggandakan pemotongan stok.
- Command yang tidak di-ACK dalam 120 detik menjadi `expired` + alarm.

---

## P5 — Riwayat, ekspor, dan audit trail

**Tujuan:** setiap keputusan dapat ditelusuri dan dilaporkan.

**Deliverable**

- [x] Riwayat run dengan filter tanggal, kolam, status, sumber, pagination.
- [x] Detail run beserta command dan hasil aktual.
- [x] Ekspor CSV riwayat feeding dan telemetri.
- [x] Halaman audit trail dengan filter aksi/entitas/pengguna.
- [x] Audit untuk perubahan jadwal, manual feed, E-stop, reset, rotasi key,
      dan aksi alarm.
- [x] Audit mencatat aktor demo, peran, IP, waktu WIB, dan metadata.
- [x] Cetak laporan (print-friendly) dari halaman riwayat.
- [x] Ekspor PDF server-side dengan kop laporan (ReportLab).
- [ ] Penandatanganan/immutability audit untuk kebutuhan kepatuhan tinggi.

**Kriteria selesai**

- Setiap perubahan jadwal muncul di audit < 1 detik setelah commit.
- CSV dapat dibuka di Excel dengan kolom waktu WIB.
- Ekspor PDF berisi seluruh data sesuai filter aktif.

---

## P6 — UI operasional 20 kolam

**Tujuan:** antarmuka sederhana, cepat dipahami, dan tidak memakai komponen
Material UI.

**Deliverable**

- [x] HTML/CSS sederhana dengan React 18 + Vite (tanpa framework UI berat).
- [x] Dashboard, jadwal, manual feed, riwayat, alarm, perangkat, audit.
- [x] Peta gantry 10 kiri + 10 kanan dengan status dan porsi efektif.
- [x] Grafik telemetri ringan (SVG, tanpa library chart besar).
- [x] Jam WIB live dan format tanggal Indonesia.
- [x] Responsif untuk tablet/HP di lapangan.
- [x] Dialog konfirmasi untuk aksi berbahaya.
- [x] Polling dashboard 3 detik, halaman lain 5–15 detik.
- [x] Build produksi disajikan langsung oleh FastAPI.
- [ ] Audit aksesibilitas (WCAG AA) menyeluruh.
- [ ] PWA/offline shell untuk operator dengan sinyal lemah.

**Kriteria selesai**

- `npm run build` tanpa error.
- Semua halaman dapat diakses langsung tanpa login.
- Tidak ada horizontal scroll pada lebar 768 px.
- Aksi berbahaya selalu meminta konfirmasi.

---

## P7 — Pengujian, simulator, dan operasi

**Tujuan:** hasil dapat diverifikasi tanpa hardware dan aman dioperasikan.

**Deliverable**

- [x] 18 tes API: mode demo tanpa akun, jadwal, perangkat, telemetry, manual
      feed, stok, replay, idempotency, scheduler, prioritas jadwal efektif, hopper
      kosong, expiry, E-stop, alarm, rotasi key, CSV, PDF, audit, pembatalan
      command.
- [x] Simulator perangkat stdlib (`simulator/device_sim.py`).
- [x] `start.sh` untuk setup + build + run.
- [x] Dokumentasi device API dan integrasi.
- [x] Log terstruktur dengan request id.
- [ ] Tes end-to-end browser (Playwright) di CI.
- [ ] Load test polling 1 gantry + 20 kolam.
- [ ] Uji hardware: load cell, limit switch, arus motor, E-stop fisik.
- [ ] Uji lapangan 7 hari dengan fallback offline.

**Kriteria selesai**

- `pytest` hijau di lingkungan bersih.
- Simulator berhasil menyelesaikan satu feeding end-to-end.
- Tidak ada error 500 pada alur utama.
- Backup/restore database diuji.

---

## P8 — Pengerasan produksi & pengembangan lanjutan

**Tujuan:** siap untuk operasi nyata dan pengembangan berikutnya.

**Keamanan & operasi**

- [ ] HTTPS di reverse proxy, HSTS aktif, HTTP diarahkan ke HTTPS.
- [ ] Secret manager (bukan file `.env`) untuk production.
- [ ] Rate limit terdistribusi (Redis) untuk multi-worker.
- [ ] Implementasikan ulang autentikasi, sesi, dan RBAC (dihapus dari build demo).
- [ ] Prosedur pencabutan sesi dan rotasi kredensial.
- [ ] Backup harian + retensi + uji restore.
- [ ] Monitoring uptime, alert ke tim operasional.
- [ ] Runbook insiden: hopper tumpah, motor macet, offline lama, E-stop.
- [ ] Penetration test ringan dan review dependensi (`pip-audit`, `npm audit`).

**Fitur lanjutan**

- [ ] Alembic dan kebijakan migrasi zero-downtime.
- [ ] Sinkronisasi otomatis Fish Linker (kolam, biomassa, stok).
- [ ] Webhook/event bus untuk `run.dispensed` dan alarm kritis.
- [ ] Adapter MQTT/TLS di samping REST untuk skala banyak gantry.
- [ ] Dukungan lebih dari satu gantry dan penjadwalan lintas gantry.
- [ ] Kalibrasi porsi otomatis berdasarkan hasil timbangan.
- [ ] Prediksi kebutuhan pakan dari pertumbuhan biomassa.
- [ ] Mode monitoring publik read-only (sudah ada endpoint, perlu UI).
- [ ] Aplikasi mobile/PWA untuk operator lapangan.
- [ ] Ekspor PDF dan laporan bulanan otomatis.

---

## Urutan eksekusi yang disarankan

1. **Minggu 1:** P0 + P1 — jalankan demo, verifikasi data 20 kolam dan dummy.
2. **Minggu 2:** P2 + P3 — sambungkan simulator, uji jadwal dan porsi.
3. **Minggu 3:** P4 + P5 — uji manual feed, E-stop, alarm, audit, ekspor.
4. **Minggu 4:** P6 + P7 — rapikan UI, jalankan seluruh tes, uji lapangan terbatas.
5. **Minggu 5+:** P8 — HTTPS, backup, monitoring, integrasi produksi.

## Definition of done keseluruhan

- 20 kolam dapat dipantau dan dijadwalkan dari satu dashboard.
- Feeding otomatis berjalan tanpa intervensi dan tetap jalan saat offline.
- Setiap feeding memiliki target, aktual, status, dan jejak audit.
- Aksi berbahaya memerlukan konfirmasi; RBAC ditambahkan kembali untuk produksi.
- Tidak ada secret di repository; semua konfigurasi lewat environment.
- Dokumentasi operator, device API, dan integrasi tersedia.
