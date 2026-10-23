# Keamanan — AutoFeeder Rail Gantry (mode presentasi)

Dokumen ini merangkum kontrol yang masih berlaku pada build presentasi dan
syarat mutlak sebelum aplikasi dipakai untuk produksi. Aplikasi mengendalikan
mesin fisik, jadi keamanan siber dan keselamatan mekanik harus ditangani bersama.

> **Peringatan:** build ini **tidak memiliki login, akun, atau RBAC**. Siapa pun
> yang dapat menjangkau port aplikasi dapat mengirim manual feed, E-stop, reset,
> dan mengubah jadwal. Jalankan hanya di localhost atau jaringan internal yang
> tepercaya. Jangan pernah mengeksposnya ke internet.

## 1. Aset yang dilindungi

- Kredensial perangkat (`X-Device-Key`).
- Perintah pengendalian gantry (feed, move, home, E-stop, reset).
- Data operasional: jadwal, biomassa, stok pakan, riwayat, telemetry.
- Audit trail aksi operasional.

## 2. Aktor ancaman

| Aktor | Kemampuan | Dampak |
|---|---|---|
| Siapa pun di jaringan | membuka UI tanpa login | dapat mengendalikan gantry |
| Perangkat palsu | akses jaringan | mengirim telemetry/ACK palsu |
| Penyerang jaringan | sniffing/MITM | mencuri device key, memalsukan perintah |
| Insider | akses UI | aksi tanpa jejak jika audit dihapus |
| Beban berlebih | request berulang | pengiriman perintah ganda |

## 3. Kontrol yang masih diterapkan

### 3.1 Autentikasi perangkat

- Setiap perangkat memiliki key acak `fg_...` yang disimpan sebagai **SHA-256
  hash**; plaintext hanya ditampilkan sekali saat rotasi.
- Key lama langsung tidak berlaku setelah rotasi.
- Endpoint perangkat terpisah dari endpoint UI dan hanya menerima `X-Device-Key`.
- ACK hanya diterima dari perangkat pemilik `command_uid`.
- Command memiliki TTL, idempotency key, dan ACK duplikat ditolak.
- Gunakan HTTPS dan simpan key di NVS terenkripsi pada perangkat nyata.

### 3.2 Validasi input & integritas

- Semua body divalidasi Pydantic: tipe, panjang, rentang, enum, format jam,
  duplikasi kolam/override.
- Query memakai SQLAlchemy ORM (parameterized), tidak ada string SQL dari input.
- Porsi dibatasi: jadwal maksimum 10.000 g, manual 5.000 g, persen biomassa
  maksimum 10%.
- Manual feed, E-stop, dan reset wajib `confirm=true`.
- Idempotency key mencegah double-submit manual feed.
- Dispatch, ACK, pemotongan stok, alarm, dan audit berada dalam satu transaksi.
- Perubahan jadwal membatalkan command pending agar alat tidak mengeksekusi
  konfigurasi lama.

### 3.3 Audit trail

Dicatat: perubahan jadwal, manual feed, dispatch/ACK/expiry/cancel command,
E-stop/reset/home, rotasi key, perubahan biomassa, dan alarm acknowledge/resolve.

Setiap baris memuat waktu UTC (ditampilkan WIB), aktor demo, role, aksi, entitas,
deskripsi, IP, dan metadata. Audit tidak dapat diubah dari UI.

### 3.4 Header & konfigurasi web

- `Content-Security-Policy`: default `self`, tanpa inline script, frame dilarang.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` membatasi kamera/mic/geo.
- `Strict-Transport-Security` saat HTTPS di production.
- CORS hanya origin yang dikonfigurasi, tanpa credentials.
- `TrustedHostMiddleware` membatasi Host header.
- Swagger/OpenAPI dimatikan di production.
- API mengirim `Cache-Control: no-store`; setiap respons punya `X-Request-ID`.
- Error 500 tidak membocorkan stack trace ke klien.

### 3.5 Secret & dependensi

- `DEVICE_API_KEY` hanya dari environment; `.env` di-`.gitignore` dan `chmod 600`.
- Startup menolak device key lemah atau berpola default.
- Production menolak `DEMO_MODE=true`, `SEED_DEMO=true`,
  `SEED_DEMO_HISTORY=true`, dan `DEBUG=true`.
- Dependensi dipin dengan rentang mayor; jalankan `pip-audit` dan `npm audit`
  secara berkala.

## 4. Risiko yang masih ada

| Risiko | Dampak | Mitigasi saat ini | Rekomendasi |
|---|---|---|---|
| Tanpa login/RBAC | siapa pun di jaringan dapat mengendalikan alat | batasi ke localhost/jaringan internal | implementasikan autentikasi + RBAC sebelum produksi |
| REST polling tanpa mTLS | key bocor dapat disalahgunakan | key hash + rotasi + HTTPS | mTLS atau sertifikat perangkat |
| Audit bisa dihapus oleh DBA | jejak hilang | akses DB terbatas | append-only storage/WORM |
| E-stop berbasis software | latency jaringan | E-stop fisik wajib | uji rantai keselamatan hardware |
| `create_all` tanpa Alembic | perubahan skema berisiko | instalasi baru | Alembic sebelum produksi |
| Backup belum otomatis | kehilangan data | prosedur manual | backup harian + uji restore |

## 5. Checklist sebelum produksi

- [ ] **Implementasikan ulang login, sesi, dan RBAC** (riwayat git menyimpan
      implementasi JWT/bcrypt yang pernah ada).
- [ ] `ENVIRONMENT=production`, `DEMO_MODE=false`, `DEBUG=false`,
      `SEED_DEMO=false`, `SEED_DEMO_HISTORY=false`.
- [ ] `DEVICE_API_KEY` dari secret manager, bukan file repo.
- [ ] HTTPS aktif di reverse proxy; HTTP redirect ke HTTPS; HSTS.
- [ ] `ALLOWED_HOSTS` dan `CORS_ORIGINS` hanya domain nyata.
- [ ] Database user hanya punya akses ke schema/tabel yang diperlukan.
- [ ] Backup terjadwal dan restore diuji.
- [ ] Log dikirim ke penyimpanan terpusat; alert untuk 5xx.
- [ ] Rotasi key perangkat diuji; key lama ditolak.
- [ ] E-stop fisik diuji dan tidak bergantung pada server.
- [ ] Audit trail diperiksa setelah simulasi perubahan jadwal dan manual feed.
- [ ] Dependensi diaudit; tidak ada CVE kritis yang belum ditangani.
- [ ] Runbook insiden dan kontak darurat tersedia di dekat panel.

## 6. Pelaporan insiden

Jika device key dicurigai bocor:

1. Rotasi key dari halaman **Perangkat** (key lama langsung mati).
2. Periksa audit trail untuk aksi mencurigakan dan command yang tidak dikenal.
3. Periksa log perangkat; cocokkan `command_uid` dengan audit.
4. Jika menyangkut keselamatan fisik, hentikan gantry dengan E-stop fisik.
5. Setelah autentikasi dipulihkan, cabut sesi dan rotasi kredensial terkait.
