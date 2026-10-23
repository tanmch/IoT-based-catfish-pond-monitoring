# AutoFeeder Rail Gantry

Aplikasi web mandiri untuk memantau dan menjalankan **auto-feeder rail gantry**
pada 20 kolam lele (10 kiri + 10 kanan). Proyek ini terpisah dari aplikasi Fish
Linker, tetapi disiapkan agar mudah diintegrasikan: FastAPI, MySQL-ready, waktu
WIB, dan UI berbahasa Indonesia yang sederhana.

> **Versi presentasi.** Build ini sengaja **tanpa login dan tanpa fitur akun**.
> Semua orang yang dapat membuka alamat aplikasi memiliki akses penuh. Data
> dummy 14 hari disiapkan otomatis saat pertama kali dijalankan. **Jangan
> mengekspos aplikasi ini ke internet atau memakainya untuk produksi.**

## Fitur

- **Dashboard** status gantry, hopper, stok pakan, alarm aktif, jadwal berikutnya,
  dan grafik telemetri.
- **Peta 20 kolam** kiri/kanan dengan porsi efektif dan status perangkat.
- **Jadwal** global, per baris, atau per kolam; porsi gram atau persen biomassa;
  override per kolam; pause/resume. Hanya jadwal paling spesifik yang berlaku
  untuk tiap kolam.
- **Manual feed** dengan konfirmasi, idempotency, validasi stok dan hopper.
- **Keselamatan**: E-stop, home, reset, command expiry.
- **Monitoring perangkat**: telemetry suhu, kelembapan, tekanan, daya, level
  hopper, status online/offline.
- **Alarm** suhu, kelembapan, hopper, tegangan, offline, kegagalan feeding;
  acknowledge/resolve.
- **Riwayat** target vs aktual, filter, ekspor CSV, ekspor PDF server-side.
- **Audit trail** perubahan jadwal, feeding manual, dan aksi perangkat.
- **Offline-first**: perangkat menyimpan jadwal di NVS dan tetap feeding saat
  server tidak terjangkau (lihat [`docs/DEVICE_API.md`](docs/DEVICE_API.md)).

## Data dummy presentasi

Saat pertama kali dijalankan, seed membuat:

| Data | Jumlah |
|---|---|
| Kolam | 20 (L1–L10, R1–R10) |
| Riwayat feeding | 14 hari, ±560 run dengan status selesai/dilewati/gagal |
| Command perangkat | ±550 command `executed`/`failed` |
| Telemetry | ±670 sampel (interval 30 menit) |
| Alarm | 6 kejadian (open, acknowledged, resolved) |
| Audit | 8 aktivitas operasional |
| Stok pakan | 2 jenis, tersisa ±214 kg |
| Jadwal | Global 07:00 & 16:00 (1 kg/kolam), override L3/R7, 1 contoh nonaktif |

Tanggal dan jam dihitung relatif terhadap hari ini, sehingga dashboard selalu
terlihat aktual. Slot hari ini yang belum lewat akan diisi oleh scheduler dan
muncul sebagai jadwal berikutnya.

## Stack

| Lapisan | Teknologi |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, Pydantic v2 |
| Database | SQLite (demo) / MySQL 8+ |
| Frontend | React 18, Vite, CSS sederhana (tanpa Material UI) |
| Perangkat | REST polling + `X-Device-Key` |
| Waktu | Disimpan UTC, ditampilkan WIB (`Asia/Jakarta`) |

## Menjalankan cepat

Prasyarat: Python 3.11+ dan Node.js 20+.

```bash
cd autofeeder
./start.sh
```

Buka **http://127.0.0.1:8010** — tidak ada halaman login. Aplikasi langsung
masuk ke dashboard sebagai **Operator Demo**.

Skrip akan:

1. membuat virtualenv dan memasang dependensi backend;
2. membuat `backend/.env` dengan device key acak (hanya jika belum ada);
3. memasang dependensi frontend dan membangun UI;
4. menjalankan API + UI di port **8010**.

Mode pengembangan:

```bash
./start.sh --dev      # API :8010 + Vite :5174 (hot reload)
./start.sh --reload   # API :8010 dengan auto-reload
```

### Menjalankan simulator

Di terminal lain, setelah backend hidup:

```bash
python3 simulator/device_sim.py
```

Simulator membaca `DEVICE_API_KEY` dari `backend/.env`, mengirim telemetry,
menerima command, menggerakkan gantry virtual, mengurangi hopper, dan mengirim
ACK. Ini memungkinkan uji end-to-end tanpa hardware.

## Setup manual

```bash
cd autofeeder/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# edit .env: isi DEVICE_API_KEY dengan nilai acak
.venv/bin/uvicorn app.main:app --reload --port 8010
```

Frontend terpisah:

```bash
cd autofeeder/frontend
npm install
npm run dev        # http://127.0.0.1:5174, proxy /api ke :8010
npm run build      # hasil di dist/, otomatis disajikan backend
```

Generate device key:

```bash
python3 -c "import secrets; print('fg_' + secrets.token_urlsafe(32))"
```

## Konfigurasi penting

Semua lewat environment atau `backend/.env`. Lihat
[`backend/.env.example`](backend/.env.example) untuk daftar lengkap.

| Variabel | Default | Keterangan |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` / `test` / `production` |
| `DEMO_MODE` | `true` | tanpa login; wajib `false` di production |
| `DEVICE_API_KEY` | wajib | key perangkat, minimal 24 karakter |
| `DATABASE_URL` | SQLite | ganti ke `mysql+pymysql://...` untuk MySQL |
| `DEVICE_OFFLINE_SECONDS` | `30` | batas detik sebelum perangkat offline |
| `COMMAND_TTL_SECONDS` | `120` | command kedaluwarsa jika belum di-ACK |
| `SCHEDULER_TICK_SECONDS` | `5` | interval scheduler |
| `HOPPER_CAPACITY_KG` | `15` | kapasitas hopper |
| `GRAMS_PER_ROTATION` | `200` | kalibrasi rotary |
| `MAX_PORTION_GRAMS` | `10000` | batas porsi jadwal |
| `MAX_MANUAL_PORTION_GRAMS` | `5000` | batas porsi manual |
| `SEED_DEMO` | `true` | wajib `false` di production |
| `SEED_DEMO_HISTORY` | `true` | membuat riwayat dummy 14 hari |
| `DEMO_HISTORY_DAYS` | `14` | panjang riwayat dummy |
| `PUBLIC_MONITORING` | `false` | endpoint ringkasan publik |

Contoh MySQL:

```env
DATABASE_URL=mysql+pymysql://feeder_app:password@127.0.0.1:3306/budidaya_lele
```

Tabel AutoFeeder berprefix `feeder_` sehingga aman berdampingan dengan 22 tabel
Fish Linker. Detail di [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## Keamanan

Karena akun/login dihapus, **tidak ada otorisasi pengguna** di build ini. Yang
masih berlaku:

- `backend/.env` di-`.gitignore`, permission `600`, dan tidak pernah di-commit.
- Perangkat memakai `X-Device-Key` yang disimpan sebagai hash dan dapat dirotasi.
- Command memiliki TTL, idempotency key, dan penolakan replay ACK.
- Security header: CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy,
  dan Permissions-Policy. HSTS aktif saat HTTPS di production.
- Swagger/OpenAPI dimatikan di production.
- Audit trail tetap mencatat aktor demo, aksi, IP, waktu WIB, dan metadata.
- `ENVIRONMENT=production` menolak `DEMO_MODE=true`, `SEED_DEMO=true`, dan
  `SEED_DEMO_HISTORY=true`.

Untuk deployment nyata, implementasikan kembali autentikasi/RBAC (lihat riwayat
git dan [`docs/SECURITY.md`](docs/SECURITY.md)) sebelum aplikasi diekspos.

## Struktur proyek

```
autofeeder/
├── backend/
│   ├── app/
│   │   ├── main.py            # app, middleware, scheduler loop, static UI
│   │   ├── config.py          # env + validasi mode demo
│   │   ├── models.py          # tabel feeder_*
│   │   ├── schemas.py         # validasi request
│   │   ├── security.py        # hash & rotasi device key
│   │   ├── deps.py            # operator demo & scope kolam
│   │   ├── seed.py            # seed demo + data presentasi 14 hari
│   │   ├── routers/           # ponds, schedules, feeds, runs, alarms,
│   │   │                      # audit, devices, device_api, dashboard
│   │   └── services/          # feeder, schedules, devices, alarms, audit,
│   │                          # serializers, export, timeutil
│   ├── tests/test_api.py      # 18 tes API
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/             # dashboard, jadwal, manual, riwayat, alarm, ...
│       ├── components/        # peta gantry, grafik SVG, komponen UI
│       ├── api.js             # client API tanpa token
│       └── styles.css         # UI sederhana, responsif
├── simulator/device_sim.py    # simulator perangkat tanpa dependensi
├── docs/
│   ├── DEVICE_API.md          # kontrak firmware ESP32
│   ├── INTEGRATION.md         # integrasi Fish Linker & MySQL
│   └── SECURITY.md            # model ancaman & checklist produksi
├── PLAN.md                    # rencana implementasi bertahap
└── start.sh
```

## API singkat

| Area | Endpoint |
|---|---|
| Dashboard | `GET /api/dashboard` |
| Kolam | `GET /api/ponds`, `PATCH /api/ponds/{id}/biomass` |
| Jadwal | `GET/POST /api/schedules`, `PUT /api/schedules/{id}`, `GET /api/schedules/effective` |
| Manual feed | `POST /api/commands/manual-feed` |
| Riwayat | `GET /api/runs`, `GET /api/runs/export.csv`, `GET /api/runs/export.pdf` |
| Alarm | `GET /api/alarms`, `POST /api/alarms/{id}/acknowledge` |
| Perangkat | `GET /api/devices`, `POST /api/devices/{id}/rotate-key` |
| Device API | `POST /api/device/telemetry`, `GET /api/device/commands`, `POST /api/device/commands/{uid}/ack` |
| Audit | `GET /api/audit` |

Tidak ada endpoint `/api/auth/*` maupun `/api/users`. Saat `ENVIRONMENT` bukan
production, dokumentasi interaktif tersedia di **http://127.0.0.1:8010/docs**.

## Pengujian

```bash
cd backend
.venv/bin/python -m pytest -q
```

Cakupan: mode demo tanpa akun, jadwal, prioritas jadwal efektif, autentikasi
perangkat, telemetry, manual feed, pemotongan stok, replay ACK, idempotency,
dispatch scheduler, stok kurang, command expiry, E-stop/reset, alarm, rotasi
key, CSV, PDF, dan audit.

Uji end-to-end dengan simulator:

```bash
# terminal 1
./start.sh
# terminal 2
python3 simulator/device_sim.py --once   # cek kredensial
python3 simulator/device_sim.py          # polling penuh
```

Di UI, lakukan **Manual Feed** 500 g; simulator akan meng-ACK dan status run
berubah menjadi `dispensed` dengan berat aktual.

## Reset data demo

Hentikan backend, lalu:

```bash
rm backend/data/autofeeder.db
```

Jalankan ulang; database, data dummy 14 hari, dan seed demo dibuat kembali.
Untuk MySQL, gunakan migrasi/seed terkontrol—jangan menjalankan `DROP` di
production.

## Batasan saat ini

- Tanpa login/akun/RBAC; hanya cocok untuk presentasi.
- Seeded device ditampilkan online di `DEMO_MODE`; data telemetry terakhir tidak
  bertambah sampai simulator dijalankan.
- Satu gantry aktif; model sudah menyimpan `device_id` untuk multi-gantry.
- REST polling, bukan MQTT. Alasannya dan jalur migrasinya ada di
  [`docs/INTEGRATION.md`](docs/INTEGRATION.md) bagian 8.
- Belum ada Alembic; perubahan skema memakai `create_all` (cocok untuk instalasi
  baru, bukan migrasi produksi).
- Firmware ESP32 dan kalibrasi mekanik belum termasuk repo ini.

## Dokumentasi

- [`PLAN.md`](PLAN.md) — rencana bertahap dan status.
- [`docs/DEVICE_API.md`](docs/DEVICE_API.md) — kontrak firmware/perangkat.
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — Fish Linker, MySQL, SQL impor.
- [`docs/SECURITY.md`](docs/SECURITY.md) — model ancaman, kontrol, checklist go-live.

## Lisensi

Internal. Sesuaikan dengan kebijakan organisasi sebelum distribusi.
