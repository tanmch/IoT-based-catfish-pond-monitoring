# Device API — Rail Gantry ESP32

Dokumen ini adalah kontrak antara firmware ESP32-S3 dan backend AutoFeeder.
Pola yang dipakai sama dengan perangkat Fish Linker: **HTTPS REST polling**, bukan
MQTT. Firmware cukup melakukan HTTP request keluar, sehingga tidak perlu broker
atau port masuk di jaringan kolam.

> Versi: `1.0.0` · Base URL contoh: `http://127.0.0.1:8010/api/device`

## 1. Autentikasi

Setiap request wajib menyertakan header:

```http
X-Device-Key: fg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Key dibuat di `backend/.env` (`DEVICE_API_KEY`) dan disimpan di database sebagai
  **hash bcrypt**, bukan plaintext.
- Key dapat dirotasi dari halaman **Perangkat** atau
  `POST /api/devices/{device_id}/rotate-key`. Key lama langsung tidak berlaku.
- Jangan menaruh key di source code, firmware repo publik, atau log. Gunakan
  NVS/secure storage pada ESP32.
- Respons `401` berarti key salah/nonaktif. Firmware harus berhenti mencoba
  command dan tetap menjalankan jadwal lokal.

Semua waktu dari server memakai ISO-8601 dengan offset `+07:00` (WIB).

## 2. Alur normal

```
boot
 ├─ GET  /api/device/config          → jadwal + batas porsi (config version)
 ├─ loop setiap 2–5 detik:
 │   ├─ POST /api/device/telemetry   → status, sensor, hopper, daya
 │   └─ GET  /api/device/commands    → ambil perintah pending
 │       └─ POST /api/device/commands/{uid}/ack → hasil eksekusi
 └─ POST /api/device/heartbeat       → opsional, jika tidak mengirim telemetry
```

Server menandai perangkat **online** jika ada telemetry/heartbeat dalam
`DEVICE_OFFLINE_SECONDS` (default 30 detik). Jika lewat batas itu, dashboard
menampilkan offline dan membuat alarm `DEVICE_OFFLINE`.

## 3. Endpoint

### 3.1 `POST /api/device/telemetry`

Kirim satu atau beberapa kelompok data. Minimal satu kelompok harus ada.

```json
{
  "recorded_at": "2026-10-22T18:44:12+07:00",
  "status": {
    "state": "idle",
    "gantry_pond_index": 7,
    "rail_position_step": 720
  },
  "environment": {
    "temperature_c": 29.4,
    "humidity_pct": 71.2,
    "pressure_kpa": 100.9
  },
  "power": {
    "voltage_v": 220.3,
    "current_a": 0.52,
    "power_w": 114.6,
    "energy_kwh": 1.284,
    "dc_current_a": 1.21
  },
  "hopper": {
    "feed_present": true,
    "remaining_kg": 13.506,
    "level_percent": 90.0
  },
  "device": { "firmware_version": "gantry-1.2.0" }
}
```

`state` yang disarankan: `idle`, `moving`, `homing`, `feeding`, `emergency_stop`,
`fault`.

Ambang alarm yang dievaluasi server:

| Data | Ambang | Alarm |
|---|---|---|
| suhu hopper | > 40 °C (critical > 50 °C) | `HOPPER_TEMPERATURE` |
| kelembapan hopper | > 85 % | `HOPPER_HUMIDITY` |
| level hopper | < 15 % | `HOPPER_LOW` |
| pakan tidak terdeteksi | `feed_present=false` | `HOPPER_EMPTY` |
| tegangan AC | < 190 V atau > 250 V | `POWER_VOLTAGE` |

Nilai `recorded_at` boleh dikosongkan; server memakai waktu terima. Firmware
disarankan mengirim waktu UTC yang disinkronkan NTP.

### 3.2 `GET /api/device/commands`

Respons:

```json
{
  "count": 1,
  "server_time": "2026-10-22T18:44:13+07:00",
  "commands": [
    {
      "command_uid": "273d3315d3ce41e48517a777e0aab8a6",
      "kind": "feed",
      "status": "delivered",
      "priority": 10,
      "expires_at": "2026-10-22T18:46:12+07:00",
      "payload": {
        "command_id": "273d3315d3ce41e48517a777e0aab8a6",
        "type": "feed",
        "run_id": 1,
        "pond_id": 1,
        "pond_index": 1,
        "side": "left",
        "portion_grams": 500.0,
        "rotary_rotations": 2.5,
        "pellet_type": "medium",
        "schedule_id": null,
        "issued_at": "2026-10-22T18:44:12+07:00",
        "expires_at": "2026-10-22T18:46:12+07:00"
      }
    }
  ]
}
```

Server hanya mengembalikan command `pending`/`delivered` yang belum kedaluwarsa,
dan langsung menandainya `delivered`. Command yang sama tidak dikirim ulang
setelah di-ACK, tetapi perangkat **wajib** memperlakukan `command_uid` sebagai
idempotency key jika terjadi retry jaringan.

Jenis command:

| `kind` | Payload penting | Aksi firmware |
|---|---|---|
| `feed` | `pond_index`, `portion_grams`, `rotary_rotations` | pindah ke kolam, takar pakan, kembali/next |
| `move` | `pond_index` | pindah tanpa menakar |
| `home` | — | homing ke posisi 0 |
| `emergency_stop` | — | hentikan motor segera, matikan aktuator |
| `reset` | — | validasi keamanan, izinkan operasi kembali |

Jika `expires_at` sudah lewat saat diterima, **jangan eksekusi**; kirim ACK
`failed` dengan alasan `expired`.

### 3.3 `POST /api/device/commands/{command_uid}/ack`

Sukses:

```json
{
  "status": "success",
  "actual_grams": 493.6,
  "executed_at": "2026-10-22T18:44:14+07:00",
  "result": {
    "rotary_rotations": 2.5,
    "pond_index": 1,
    "hopper_kg": 13.506
  }
}
```

Gagal:

```json
{
  "status": "failed",
  "failure_reason": "Pakan di hopper habis",
  "executed_at": "2026-10-22T18:44:14+07:00"
}
```

Aturan:

- `actual_grams` adalah hasil timbangan/estimasi putaran, bukan target.
- ACK `success` untuk `feed` akan memotong stok pakan dan menandai run
  `dispensed`.
- ACK `failed` menandai run `failed`, membuat alarm, dan **tidak** memotong stok.
- ACK hanya diterima dari perangkat pemilik command dan hanya sekali.
- Jika hopper kosong, firmware harus mengirim `failed`, bukan mengulang terus.

### 3.4 `GET /api/device/config`

Mengembalikan snapshot jadwal efektif dan batas perangkat:

```json
{
  "device_id": "lele-gantry-001",
  "config_version": 1792644217,
  "known_version": 1792644217,
  "changed": false,
  "schedules": [
    {
      "id": 1,
      "scope": "global",
      "times": ["07:00", "16:00"],
      "pellet_type": "medium",
      "targets": [
        { "pond_id": 1, "pond_index": 1, "side": "left", "grams": 1000.0, "time": "07:00" }
      ],
      "version": 1
    }
  ],
  "limits": {
    "max_feeding_per_pond_per_day": 3,
    "grams_per_rotation": 200.0,
    "max_portion_grams": 10000.0,
    "max_manual_portion_grams": 5000.0
  }
}
```

Setelah menyimpan config di NVS, firmware memanggil:

```http
POST /api/device/config/ack
{"config_version": 1792644217}
```

Dengan begitu server tahu firmware sudah memakai versi terbaru. Firmware tetap
menyimpan jadwal terakhir dan dapat menjalankannya **offline**; command dari
server hanya untuk feeding manual, perubahan mendadak, dan koreksi.

### 3.5 `POST /api/device/heartbeat`

Alternatif ringan bila telemetry belum siap. Respons berisi `server_time` yang
bisa dipakai untuk sinkronisasi jam.

## 4. Offline-first

1. Saat boot dan setiap config berubah, simpan jadwal + `config_version` di NVS.
2. Jalankan jadwal lokal memakai RTC/NTP. Jangan menunggu server.
3. Saat online, kirim telemetry dan ACK hasil feeding yang tertunda (antrean lokal).
4. Gunakan `command_uid` untuk mencegah feeding ganda saat reconnect.
5. Jika server tidak terjangkau, jangan menghentikan jadwal otomatis; hanya
   manual feed yang tidak tersedia.

## 5. Keamanan firmware

- Simpan `X-Device-Key` di NVS terenkripsi; jangan hardcode di repo.
- Gunakan HTTPS di produksi. Jangan menonaktifkan verifikasi sertifikat.
- Batasi ukuran body dan validasi semua field sebelum menggerakkan motor.
- Terapkan watchdog hardware dan batas arus motor.
- E-stop fisik harus memutus daya motor, tidak bergantung pada perintah server.
- Setelah E-stop/tegangan rendah, wajib validasi keamanan sebelum bergerak.
- Kirim `state=emergency_stop` pada telemetry berikutnya agar dashboard akurat.

## 6. Uji cepat dengan simulator

```bash
python3 simulator/device_sim.py --once      # uji kredensial + telemetry
python3 simulator/device_sim.py             # polling penuh, ACK otomatis
```

Simulator membaca `DEVICE_API_KEY` dari `backend/.env` dan menampilkan command
yang diterima, gerakan gantry, pengurangan hopper, dan ACK.
