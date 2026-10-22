# Keamanan — AutoFeeder Rail Gantry

Dokumen ini merangkum model ancaman, kontrol yang sudah diterapkan, dan syarat
sebelum produksi. Aplikasi mengendalikan mesin fisik, jadi keamanan siber dan
keselamatan mekanik harus ditangani bersama.

## 1. Aset yang dilindungi

- Akun pengguna dan sesi (JWT).
- Kredensial perangkat (`X-Device-Key`).
- Perintah pengendalian gantry (feed, move, home, E-stop, reset).
- Data operasional: jadwal, biomassa, stok pakan, riwayat, telemetry.
- Audit trail dan data pribadi pengguna (username, email, IP).

## 2. Aktor ancaman

| Aktor | Kemampuan | Dampak yang dicegah |
|---|---|---|
| Pengguna tanpa login | akses internet/internal | melihat data, mengirim perintah |
| Petani dengan akun terbatas | login sah | mengubah kolam lain, jadwal global, pengguna, audit |
| Perangkat palsu | akses jaringan | mengirim telemetry/ACK palsu |
| Penyerang jaringan | sniffing/MITM | mencuri token/key, memalsukan perintah |
| Insider | akun sah | aksi tanpa jejak, penyalahgunaan stok |
| Beban berlebih | request berulang | brute force, pengiriman perintah ganda |

## 3. Kontrol yang diterapkan

### 3.1 Autentikasi pengguna

- Password disimpan sebagai **bcrypt cost 12**. Password > 72 byte di-pre-hash
  SHA-256 agar tidak terpotong diam-diam.
- JWT **HS256**, masa berlaku **60 menit**, berisi `sub` (email), `uid`, `role`,
  `ver` (token version), `iat`, `nbf`, `exp`, `jti`.
- Setiap request memuat ulang user dari database; role dari token tidak
  dipercaya. User nonaktif langsung ditolak.
- `token_version` dinaikkan saat password berubah atau akun dinonaktifkan,
  sehingga token lama tidak berlaku.
- Pesan login gagal bersifat generik; hash dummy dipakai saat user tidak ada
  untuk mengurangi perbedaan waktu respons.
- Rate limit login: 5 percobaan / 10 menit per IP+identifier, lockout 15 menit.
- Registrasi publik dapat dimatikan (`ALLOW_REGISTRATION=false`); akun baru
  selalu role `petani` dan tidak otomatis mendapat kolam.

### 3.2 Otorisasi

- Role: `admin`, `pemilik`, `petani` (operator).
- `admin`/`pemilik` dapat mengelola seluruh sistem.
- `petani` dibatasi pada `feeder_pond_assignments`:
  - semua endpoint kolam, jadwal, riwayat, alarm, dan manual feed memeriksa
    scope kolam;
  - tidak dapat membuat jadwal global/baris;
  - tidak dapat mengubah pengguna, perangkat, audit, atau reset/home;
  - hanya dapat membatalkan perintah feed miliknya sendiri.
- Perintah E-stop/home/reset tidak dapat dibatalkan dari antrean.
- Pemeriksaan dilakukan di backend, bukan hanya menyembunyikan tombol di UI.

### 3.3 Autentikasi perangkat

- Setiap perangkat memiliki key acak `fg_...` yang disimpan sebagai **SHA-256
  hash**; plaintext hanya ditampilkan sekali saat rotasi.
- Key lama langsung tidak berlaku setelah rotasi.
- Endpoint perangkat terpisah dari endpoint pengguna dan tidak menerima JWT.
- ACK hanya diterima dari perangkat pemilik `command_uid`.
- Command memiliki TTL dan idempotency key; ACK duplikat ditolak.
- Disarankan HTTPS di produksi dan penyimpanan key di NVS terenkripsi.

### 3.4 Validasi input & integritas

- Semua body divalidasi Pydantic: tipe, panjang, rentang, enum, format jam,
  duplikasi kolam/override.
- Query memakai SQLAlchemy ORM (parameterized), tidak ada string SQL dari input.
- Porsi dibatasi: jadwal maksimum 10.000 g, manual 5.000 g, persen biomassa
  maksimum 10%.
- Manual feed wajib `confirm=true`; E-stop/reset juga.
- Idempotency key mencegah double-submit manual feed.
- Transaksi database: dispatch, ACK, pemotongan stok, alarm, dan audit berada
  dalam satu commit; kegagalan tidak meninggalkan stok terpotong sebagian.
- Perubahan jadwal membatalkan command pending agar alat tidak mengeksekusi
  konfigurasi lama.

### 3.5 Audit trail

Dicatat: login berhasil/gagal, registrasi, ganti password, perubahan jadwal,
manual feed, dispatch/ACK/expiry/cancel command, E-stop/reset/home, rotasi key,
perubahan pengguna/penugasan, perubahan biomassa, alarm acknowledge/resolve.

Setiap baris memuat waktu UTC (ditampilkan WIB), aktor, role, aksi, entitas,
deskripsi, IP, dan metadata. Audit tidak dapat diubah dari UI.

### 3.6 Header & konfigurasi web

- `Content-Security-Policy`: default `self`, tanpa inline script, frame dilarang.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` membatasi kamera/mic/geo.
- `Strict-Transport-Security` saat HTTPS di production.
- CORS hanya origin yang dikonfigurasi, tanpa credentials.
- `TrustedHostMiddleware` membatasi Host header.
- Swagger/OpenAPI dimatikan di production.
- API mengirim `Cache-Control: no-store`; setiap respons punya `X-Request-ID`.
- Error 500 tidak membocorkan stack trace ke klien.

### 3.7 Secret & dependensi

- Secret hanya dari environment; `.env` di-`.gitignore`.
- Startup menolak `SECRET_KEY`/`DEVICE_API_KEY` lemah atau berpola default.
- Production menolak `SEED_DEMO=true` dan `DEBUG=true`.
- Tidak ada kredensial di source code atau dokumentasi.
- Dependensi dipin dengan rentang mayor; jalankan `pip-audit` dan `npm audit`
  secara berkala.

## 4. Risiko yang masih ada

| Risiko | Dampak | Mitigasi saat ini | Rekomendasi |
|---|---|---|---|
| Token di `localStorage` | XSS dapat mencuri token | React escaping + CSP tanpa inline script | Pertimbangkan cookie HttpOnly + CSRF token |
| Rate limit in-memory | brute force terdistribusi | lockout per proses | Redis/API gateway di multi-worker |
| REST polling tanpa mTLS | key bocor dapat disalahgunakan | key hash + rotasi + HTTPS | mTLS atau sertifikat perangkat |
| Tidak ada 2FA | akun admin dicuri | password kuat + rate limit | 2FA untuk admin/pemilik |
| Audit bisa dihapus oleh DBA | jejak hilang | akses DB terbatas | append-only storage/WORM |
| E-stop berbasis software | latency jaringan | E-stop fisik wajib | uji rantai keselamatan hardware |
| `create_all` tanpa Alembic | perubahan skema berisiko | instalasi baru | Alembic sebelum produksi |
| Backup belum otomatis | kehilangan data | prosedur manual | backup harian + uji restore |

## 5. Checklist sebelum produksi

- [ ] `ENVIRONMENT=production`, `DEBUG=false`, `SEED_DEMO=false`.
- [ ] `SECRET_KEY` dan `DEVICE_API_KEY` dari secret manager, bukan file repo.
- [ ] Ganti semua akun/password demo; nonaktifkan registrasi publik.
- [ ] HTTPS aktif di reverse proxy; HTTP redirect ke HTTPS; HSTS.
- [ ] `ALLOWED_HOSTS` dan `CORS_ORIGINS` hanya domain nyata.
- [ ] Database user hanya punya akses ke schema/tabel yang diperlukan.
- [ ] Backup terjadwal dan restore diuji.
- [ ] Log dikirim ke penyimpanan terpusat; alert untuk 5xx dan login gagal masif.
- [ ] Rate limit dipindahkan ke Redis bila memakai >1 worker.
- [ ] Rotasi key perangkat diuji; key lama ditolak.
- [ ] E-stop fisik diuji dan tidak bergantung pada server.
- [ ] Audit trail diperiksa setelah simulasi perubahan jadwal dan manual feed.
- [ ] Dependensi diaudit; tidak ada CVE kritis yang belum ditangani.
- [ ] Runbook insiden dan kontak darurat tersedia di dekat panel.

## 6. Pelaporan insiden

Jika key atau token dicurigai bocor:

1. Rotasi `DEVICE_API_KEY` dari halaman Perangkat (key lama langsung mati).
2. Naikkan `token_version` user terkait (ganti password) atau nonaktifkan akun.
3. Rotasi `SECRET_KEY` dan restart semua instance (mencabut semua JWT).
4. Periksa audit trail untuk aksi mencurigakan dan command yang tidak dikenal.
5. Periksa log perangkat; cocokkan `command_uid` dengan audit.
6. Jika menyangkut keselamatan fisik, hentikan gantry dengan E-stop fisik.
