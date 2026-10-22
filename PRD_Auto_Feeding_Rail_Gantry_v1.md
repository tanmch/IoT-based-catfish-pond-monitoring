## PRODUCT REQUIREMENTS DOCUMENT

## Sistem Auto-Feeding Sistem Auto-Feeding<br/>Rail Gantry Rail Gantry Untuk Budi Daya Ikan Lele — 20 Kolam

| Nama produk | Sistem Auto-Feeding Rail Gantry |
| --- | --- |
| Kode dokumen | PRD-AFF-001 |
| Versi | v1.0 — Draft Riset |
| Tanggal | 13 Oktober 2026 |
| Pemilik produk | Julman Notatema Waruwu |
| Status | Tahap riset dan perancangan |
| Ruang lingkup | Satu lokasi budi daya; 20 kolam |
| Platform | Perangkat IoT fisik dan Web Dashboard |
| Dokumen acuan | URS-AFF-001 — Draft v0.1 untuk validasi stakeholder |

Dokumen ini merapikan kebutuhan produk, perilaku sistem, arsitektur, data, keamanan, dan rencana validasi. Parameter yang masih berupa asumsi atau belum disepakati tetap ditandai untuk ditinjau; dokumen ini bukan pengesahan bahwa desain mekanik maupun listrik telah aman.

STATUS DOKUMEN: DRAFT — PERLU VALIDASI STAKEHOLDER


## Daftar Isi

- 1. Ringkasan Produk

- 2. Masalah yang Diselesaikan

- 3. Tujuan Produk

- 4. Pengguna dan Peran

- 5. Lingkup Sistem

- 6. Deskripsi Fisik Sistem

- 7. Kebutuhan Perangkat Keras

- 8. Kebutuhan Fungsional

- 9. Kebutuhan Non-Fungsional

- 10. Arsitektur Sistem

- 11. Desain MQTT

- 12. Model Data MongoDB

- 13. Keamanan

- 14. Kriteria Penerimaan

- 15. Metrik Keberhasilan

- 16. Asumsi

- 17. Kendala

- 18. Risiko dan Mitigasi

- 19. Pertanyaan Terbuka

- 20. Rencana Pengembangan Bertahap

- 21. Definisi Istilah

- 22. Lampiran: Alur Eksekusi Feeding

- 23. Lampiran: Status LED

- 24. Keputusan Desain Penting

## Cara membaca dokumen

PRD menjelaskan perilaku dan kapabilitas produk yang direncanakan. ID kebutuhan (FR/NFR) digunakan untuk pelacakan implementasi dan pengujian. Parameter yang masih belum pasti tidak dianggap sebagai keputusan final. URS-AFF-001 menjadi sumber kebutuhan pengguna; isu yang belum konsisten perlu diputuskan bersama stakeholder sebelum implementasi.


## 1. Ringkasan Produk

Sistem ini adalah auto-feeder berbasis rail gantry yang bergerak secara linear di atas dua baris kolam terpal ikan lele. Sistem melayani 20 kolam, terdiri dari 10 kolam sisi kiri dan 10 kolam sisi kanan, melalui satu hopper/carriage yang bergerak sepanjang rail sekitar 30–35 meter.

Tujuan utamanya adalah mempermudah dan menstandardisasi proses pemberian pakan, mengurangi ketergantungan pada pekerjaan manual, serta menyediakan pemantauan kondisi sistem dan riwayat feeding melalui website.

Sistem harus tetap dapat menjalankan jadwal feeding secara lokal/offline meskipun koneksi internet atau HiveMQ Cloud terputus. Saat koneksi kembali tersedia, perangkat melakukan sinkronisasi konfigurasi terbaru dan mengirim log/event yang tertunda.

## 2. Masalah yang Diselesaikan

Pada budi daya ikan lele, pemberian pakan manual membutuhkan waktu, konsistensi tenaga kerja, dan disiplin jadwal. Risiko umum meliputi:

| • | Jadwal feeding tidak konsisten. |
| --- | --- |
| • | Porsi pakan berbeda antar kolam atau antar operator. |
| • | Keterlambatan pemberian pakan. |
| • | Sulit memantau kondisi alat dan lingkungan hopper. |
| • | Sulit mengetahui riwayat pemberian pakan per kolam. |
| • | Tidak adanya catatan audit ketika jadwal atau kendali manual diubah. |

Sistem ini dirancang untuk mengurangi masalah tersebut melalui otomatisasi berbasis jadwal, porsi terukur, kendali manual, monitoring, logging, dan alarm.

## 3. Tujuan Produk

## 3.1 Tujuan bisnis

| • | Mengurangi ketergantungan pada feeding manual. |
| --- | --- |
| • | Meningkatkan konsistensi jadwal dan porsi pakan. |
| • | Mempermudah pemilik kolam memantau kondisi sistem dari website. |
| • | Menyediakan riwayat feeding yang dapat digunakan untuk evaluasi budi daya. |

## 3.2 Tujuan teknis

| • | Membangun sistem rail gantry yang mampu melayani 20 kolam. |
| --- | --- |
| • | Menjalankan feeding otomatis secara lokal tanpa bergantung pada cloud. |
| • | Menyediakan kendali manual melalui website. |
| • | Mengirim data telemetry, status perangkat, event feeding, dan alarm ke backend. |
| • | Menyimpan konfigurasi terakhir di perangkat agar tetap berjalan saat offline. |
| • | Menyediakan mekanisme fault detection dan safe state. |


## 4. Pengguna dan Peran

## 4.1 Owner / Pemilik Kolam

| Aspek | Keterangan |
| --- | --- |
| Peran | Pemilik atau pengelola utama budi daya |
| Kemampuan | Melihat dashboard, monitoring, riwayat, laporan, audit trail |
| Akses kendali | Tidak mengubah jadwal; hanya owner |
| Kebutuhan utama | Memantau kondisi kolam dan sistem secara ringkas |

## 4.2 Operator

| Aspek | Keterangan |
| --- | --- |
| Peran | Petugas yang mengelola operasional harian |
| Kemampuan | Mengatur jadwal, porsi, konfigurasi, dan menjalankan manual feed |
| Akses kendali | Boleh mengubah jadwal dan menjalankan manual feed |
| Kebutuhan utama | Mengatur feeding dan menangani kondisi abnormal |

## 4.3 Mode Monitoring Tanpa Login

Sistem menyediakan mode monitoring tanpa login untuk melihat informasi dasar, misalnya status perangkat dan data lingkungan. Namun, aksi sensitif seperti mengubah konfigurasi, menjalankan manual feed, atau melihat audit trail harus melalui autentikasi.

## 5. Lingkup Sistem

## 5.1 Termasuk dalam lingkup

| • | Satu hopper/carriage untuk 20 kolam. |
| --- | --- |
| • | Rail gantry linear sepanjang sekitar 30–35 meter. |
| • | Gerak gantry menggunakan NEMA 34 stepper motor dan driver DM860H. |
| • | Mekanisme feeding berbasis gravitasi. |
| • | Tiga servo: |
| 1. | Rotary dosing untuk menentukan porsi. |
| 2. | Diverter gate untuk memilih outlet kolam kiri/kanan. |
| 3. | Butterfly open gate untuk membuka aliran pakan. |
| • | Kontrol otomatis berbasis jadwal. |
| • | Kontrol manual melalui website. |
| • | Dashboard monitoring realtime dan histori. |
| • | Penyimpanan konfigurasi lokal di ESP32-S3. |
| • | Operasi offline-first. |
| • | Pengiriman data menggunakan MQTT melalui HiveMQ Cloud. |
| • | Backend Node.js dan frontend React. |
| • | Database MongoDB. |


| • | Satu hopper/carriage untuk 20 kolam. |
| --- | --- |
| • | Log feeding, telemetry, alarm, dan audit trail. |
| • | Ekspor data CSV/PDF. |
| • | Role-based access untuk owner dan operator. |
| • | E-stop lokal, buzzer, LED status, dan home control panel. |

## 5.2 Tidak termasuk dalam lingkup versi ini

| • | Baterai backup atau UPS. |
| --- | --- |
| • | Mekanisme penyebar pakan ke permukaan air. |
| • | Refill pakan otomatis. |
| • | Deteksi kualitas air kolam. |
| • | Deteksi kesehatan ikan. |
| • | Notifikasi WhatsApp/Telegram/email untuk saat ini. |
| • | Multi-location/multi-site management. |
| • | Load cell untuk verifikasi porsi. |
| • | Encoder pada stepper atau rotary dosing. |
| • | Proteksi hujan otomatis pada hopper. |
| • | AI/computer vision untuk deteksi pakan atau ikan. |

## 6. Deskripsi Fisik Sistem

## 6.1 Konfigurasi kolam

| • | Jumlah kolam: 20 kolam terpal. |
| --- | --- |
| • | Susunan: 2 baris, masing-masing 10 kolam. |
| • | Posisi: kolam kiri dan kolam kanan. |
| • | Diameter tiap kolam: 3 meter. |
| • | Tinggi kolam: sekitar 1 meter. |
| • | Jarak antar kolam: sekitar 10 cm. |
| • | Panjang rail: sekitar 30–35 meter. |
| • | Rail berada di tengah antara baris kolam kiri dan kanan. |

## 6.2 Hopper dan carriage

| • | Jumlah hopper/carriage: 1 unit. |
| --- | --- |
| • | Kapasitas hopper awal: diasumsikan 15 kg pakan. |
| • | Kapasitas potensial: 15–25 kg. |
| • | Hopper bergerak sepanjang rail di atas kolam. |
| • | Pakan dikeluarkan menggunakan gravitasi. |
| • | Tidak ada mekanisme penyebar pakan; pakan langsung jatuh ke kolam. |
| • | Refill pakan dilakukan manual oleh karyawan. |


| • | Jumlah hopper/carriage: 1 unit. |
| --- | --- |
| • | Setelah refill atau operasi selesai, gantry harus kembali ke home position. |

## 6.3 Mekanisme gerak

| • | Rail berbentuk profil inverted-V: /\. |
| --- | --- |
| • | Gantry menggunakan V-wheel yang berjalan pada rail. |
| • | NEMA 34 menggerakkan roda gantry melalui timing belt. |
| • | Gerak gantry bersifat linear satu sumbu. |
| • | Kecepatan motor maksimum: 260 RPM. |
| • | Target waktu perpindahan antar kolam: maksimal 20 detik. |
| • | Home position berada di ujung belakang rail. |
| • | Sistem harus homing saat: |
| o | Pertama kali dinyalakan. |
| o | Setelah E-stop. |
| o | Setelah fault tertentu. |
| o | Saat diperlukan kalibrasi ulang. |

## 6.4 Mekanisme feeding

Urutan feeding untuk satu kolam:

- 1. Gantry bergerak ke kolam target.

- 2. Rotary dosing mengisi/menakar pakan.

- 3. Diverter gate diposisikan ke kolam kiri atau kanan.

- 4. Butterfly open gate dibuka.

- 5. Pakan keluar melalui gravitasi ke kolam.

- 6. Delay singkat agar pakan selesai keluar.

- 7. Rotary dosing dan open gate berhenti/tertutup bersamaan.


## 8. Sistem mencatat hasil feeding.

## 9. Gantry lanjut ke kolam berikutnya.

## 10. Setelah seluruh jadwal selesai, gantry kembali ke home.

## 6.5 Aturan feeding

| • | Satu siklus feeding hanya mengeluarkan pakan ke satu sisi kolam: kiri atau kanan. |
| --- | --- |
| • | Diverter tidak dapat mengeluarkan pakan ke kiri dan kanan secara bersamaan. |
| • | Diverter tidak perlu kembali ke posisi netral setelah feeding. |
| • | Porsi ditentukan oleh jumlah putaran rotary dosing. |
| • | Nilai kalibrasi awal: sekitar 200 gram per putaran rotary dosing. |
| • | Contoh: porsi 1 kg dengan pellet sedang memerlukan sekitar 5 putaran rotary dosing. |
| • | Nilai aktual harus dikalibrasi dan divalidasi karena ukuran pellet dapat berubah. |
| • | Toleransi porsi yang dapat diterima: ±10%. |
| • | Kecepatan rotary dosing: sekitar 2–5 detik per putaran. |
| • | Rotary dosing dan open gate berhenti/tertutup bersamaan. |
| • | Sisa pakan pada bagian rawan sumbat dibersihkan melalui pembongkaran modular. |

## 7. Kebutuhan Perangkat Keras

## 7.1 Komponen utama

| Komponen | Fungsi |
| --- | --- |
| ESP32-S3 | Controller utama, menjalankan logika lokal, komunikasi MQTT, penyimpanan konfigurasi |
| ESP32-S3 16 MB flash / | Menyimpan firmware, konfigurasi, dan buffer event penting |
| 8 MB PSRAM |   |
| NEMA 34 stepper motor | Menggerakkan gantry/hopper sepanjang rail |
| Stepper driver DM860H | Mengendalikan NEMA 34 |
| 3 servo MG996R | Menggerakkan rotary dosing, diverter gate, dan butterfly open gate |
| 2 limit switch | Mendeteksi posisi home dan ujung edge rail |
| Hall-effect sensor | Feedback gerak/posisi gantry |
| Capacitive proximity | Mendeteksi keberadaan pakan di hopper |
| sensor |   |
| SHT31-D | Mengukur suhu dan kelembapan di dalam hopper |
| Sensor tekanan | Monitoring tekanan di dalam hopper |
| PZEM-004T | Monitoring tegangan, arus, daya, dan energi pada 220 VAC |
| ACS758 | Monitoring arus pada jalur 48 VDC |
| Buzzer | Alarm lokal saat fault atau kondisi kritis |
| LED status | Indikator lokal status sistem |


| Komponen | Fungsi |
| --- | --- |
| E-stop | Penghentian darurat lokal |
| Home control panel | Kontrol dan indikasi status lokal |
| PSU 48 V 10 A | Sumber daya utama sistem |
| Buck converter 5 V | Menurunkan 48 V menjadi 5 V untuk ESP32, sensor, dan servo |
| Enclosure IP65/IP66 | Melindungi komponen dari debu dan air |
| Konektor outdoor kedap | Melindungi jalur kabel dan sambungan |
| air |   |

## 7.2 Kebutuhan daya

| • | Sumber utama: 220 VAC. |
| --- | --- |
| • | PSU utama: 48 VDC, 10 A. |
| • | NEMA 34: rated current sekitar 4.5 A. |
| • | Servo MG996R: tegangan kerja 4.8–7.2 V, dengan potensi arus puncak tinggi saat stall/beban berat. |
| • | Servo bergerak bergantian, tidak bersamaan. |
| • | ESP32, sensor, dan komponen logika menggunakan 5 V. |
| • | Estimasi kebutuhan 5 V: sekitar 2–5 A. |
| • | Tidak ada baterai backup atau UPS. |
| • | Sistem bergantung pada pasokan listrik utama melalui kabel. |
| • | Proteksi dasar berasal dari PSU dan breaker short-circuit pada control panel. |
| • | Enclosure control panel direncanakan IP65/IP66. |
| • | Instalasi berada di outdoor dan terpapar cuaca. |

## 7.3 Catatan keselamatan

Meskipun fuse terpisah belum dianggap krusial, untuk implementasi fisik disarankan tetap menambahkan:

| • | Fuse atau proteksi terpisah untuk jalur 48 V stepper. |
| --- | --- |
| • | Fuse atau proteksi terpisah untuk jalur 5 V servo. |
| • | Fuse atau proteksi terpisah untuk jalur 5 V ESP32/sensor. |
| • | Grounding chassis/panel. |
| • | Surge protection pada input 220 VAC. |
| • | Pemisahan fisik yang jelas antara bagian 220 VAC, 48 VDC, dan 5 VDC. |
| • | Label tegangan dan jalur kabel. |
| • | Emergency stop yang benar-benar memutus atau menonaktifkan aktuator secara aman. |

MG996R dapat menarik arus puncak sekitar 2,5 A pada 5 V saat stall atau beban berat, sehingga rail 5 V servo perlu dirancang terpisah dari rail logika agar tidak menyebabkan voltage drop atau reset ESP32.

## 8. Kebutuhan Fungsional

## 8.1 Manajemen jadwal


| ID | Kebutuhan |
| --- | --- |
| FR-01 | Operator dapat membuat, mengubah, mengaktifkan, dan menonaktifkan jadwal feeding. |
| FR-02 | Jadwal dapat diatur untuk satu kolam, satu baris kiri/kanan, atau global untuk seluruh kolam. |
| FR-03 | Porsi dapat diatur berbeda untuk tiap kolam meskipun jadwalnya sama. |
| FR-04 | Maksimum jadwal feeding per kolam per hari adalah 3 kali; operasi normal umumnya 2 kali. |
| FR-05 | Jadwal berlaku merata untuk semua hari; perubahan dilakukan manual melalui website. |
| FR-06 | Sistem harus menyimpan konfigurasi jadwal terakhir di ESP32-S3. |
| FR-07 | ESP32-S3 harus menjalankan jadwal secara lokal menggunakan RTC. |
| FR-08 | Jika ada konfigurasi baru saat perangkat online, konfigurasi baru menggantikan konfigurasi lama. |
| FR-09 | Jika tidak ada konfigurasi baru, perangkat tetap menjalankan konfigurasi terakhir yang valid. |

## 8.2 Kendali manual

| ID | Kebutuhan |
| --- | --- |
| FR-10 | Operator dapat menjalankan manual feed melalui website. |
| FR-11 | Operator dapat memilih kolam target untuk manual feed. |
| FR-12 | Jika gantry sedang bergerak, perintah manual harus menunggu hingga gantry menyelesaikan langkah/posisi |
|   | target terakhir. |
| FR-13 | Jika sistem online dan sedang berjalan, manual feed memerlukan popup konfirmasi. |
| FR-14 | Jika sistem offline, kendali manual dari website tidak dapat dieksekusi. |
| FR-15 | Jika feeding otomatis sedang berjalan, perintah manual memiliki prioritas lebih tinggi setelah langkah aktif |
|   | selesai. |
| FR-16 | Pengguna dapat membatalkan antrean feeding berikutnya, tetapi siklus dosing/dispensing yang sedang |
|   | berjalan harus diselesaikan terlebih dahulu. |
| FR-17 | Semua perintah manual harus memiliki command_id, waktu diterbitkan, masa berlaku, penerbit, dan status |
|   | eksekusi. |
| FR-18 | Perintah yang sudah dieksekusi tidak boleh dieksekusi ulang. |

## 8.3 Monitoring dashboard

| ID | Kebutuhan |
| --- | --- |
| FR-19 | Dashboard menampilkan status koneksi perangkat: online/offline. |
| FR-20 | Dashboard menampilkan status operasi gantry: idle, moving, feeding, fault, emergency stop. |
| FR-21 | Dashboard menampilkan posisi gantry relatif terhadap kolam 1–20. |
| FR-22 | Dashboard menampilkan data suhu, kelembapan, dan tekanan di dalam hopper. |
| FR-23 | Dashboard menampilkan status pakan hopper: terisi atau kosong. |
| FR-24 | Dashboard menampilkan estimasi sisa hari sebelum pakan habis, tidak harus akurat. |
| FR-25 | Dashboard menampilkan data tegangan, arus, dan daya dari PZEM-004T pada 220 VAC. |
| FR-26 | Dashboard menampilkan data arus 48 VDC dari ACS758. |
| FR-27 | Dashboard menampilkan grafik realtime dan grafik histori harian. |
| FR-28 | Dashboard menampilkan peta/visual posisi gantry di atas 20 kolam. |
| FR-29 | Dashboard menampilkan alarm dan status fault. |


## 8.4 Riwayat dan pelaporan

| ID | Kebutuhan |
| --- | --- |
| FR-30 | Sistem menyimpan riwayat feeding per kolam. |
| FR-31 | Riwayat mencakup waktu feeding, kolam, sisi kiri/kanan, target porsi, jumlah putaran rotary, status |
|   | berhasil/gagal, dan penyebab kegagalan. |
| FR-32 | Sistem menyimpan riwayat telemetry. |
| FR-33 | Sistem menyimpan event fault dan alarm. |
| FR-34 | Data historis dapat difilter berdasarkan tanggal, kolam, jenis event, dan status keberhasilan. |
| FR-35 | Data dapat diekspor ke CSV dan PDF. |
| FR-36 | Ekspor mencakup telemetry mentah dan ringkasan feeding. |
| FR-37 | Data disimpan maksimal 1 tahun, kemudian dihapus untuk menjaga kapasitas database. |
| FR-38 | Sistem menyimpan audit trail untuk perubahan jadwal, perubahan konfigurasi, manual feed, dan aksi penting |
|   | lainnya. |
| FR-39 | Audit trail mencatat siapa, apa yang diubah, kapan, dan dari mana aksi dilakukan. |

## 8.5 Alarm dan fault handling

| ID | Kebutuhan |
| --- | --- |
| FR-40 | Jika pakan habis, sistem menghentikan proses, membunyikan buzzer, kembali home, dan mengirim informasi |
|   | ke website. |
| FR-41 | Jika pakan habis di tengah proses, website menampilkan popup untuk menanyakan apakah proses akan |
|   | dilanjutkan atau tidak. |
| FR-42 | Jika servo/gate gagal, sistem berhenti, membunyikan buzzer, dan mengirim notifikasi. |
| FR-43 | Jika gantry macet, sistem berhenti, membunyikan buzzer, dan mengirim notifikasi. |
| FR-44 | Jika tegangan 48 V abnormal melewati ambang, sistem berhenti dan mengirim alarm. |
| FR-45 | Saat fault, buzzer berbunyi terus sampai kondisi ditangani. |
| FR-46 | LED lokal menunjukkan status: normal, feeding, warning, fault, dan offline. |
| FR-47 | E-stop menghentikan seluruh aktuator secara segera. |
| FR-48 | Setelah E-stop dilepas, sistem tidak wajib homing ulang, tetapi tetap harus melalui validasi keamanan sebelum |
|   | operasi normal. |
| FR-49 | Sistem tidak boleh memaksa melanjutkan proses saat terjadi fault mekanis atau elektrik. |

## 9. Kebutuhan Non-Fungsional

| ID | Kategori | Kebutuhan |
| --- | --- | --- |
| NFR-01 | Reliabilitas | Sistem harus tetap menjalankan jadwal feeding secara lokal tanpa internet. |
| NFR-02 | Offline-first | Perangkat harus menyimpan konfigurasi terakhir di NVS. |
| NFR-03 | Ketahanan offline | Sistem harus tetap beroperasi tanpa batas waktu selama daya utama tersedia. |
| NFR-04 | Sinkronisasi | Saat reconnect, perangkat memeriksa konfigurasi terbaru dan mengirim log tertunda secara |
|   |   | berurutan. |
| NFR-05 | Integritas data | Log offline harus dikirim berurutan berdasarkan waktu dan dihapus hanya setelah menerima |
|   |   | ACK backend. |
| NFR-06 | Prioritas data offline | Alarm dan status perangkat kritikal diprioritaskan dibanding telemetry lingkungan. |


| ID | Kategori | Kebutuhan |
| --- | --- | --- |
| NFR-07 | Waktu respons lokal | Perintah E-stop harus menghentikan aktuator secara segera. |
| NFR-08 | Akurasi porsi | Toleransi porsi target adalah ±10%. |
| NFR-09 | Keamanan komunikasi MQTT menggunakan TLS pada port 8883. |   |
| NFR-10 | Autentikasi | Perangkat dan backend menggunakan credential terpisah. |
| NFR-11 | Otorisasi | Akses publish/subscribe MQTT dibatasi berdasarkan peran dan topik. |
| NFR-12 | Keamanan web | Perubahan konfigurasi dan manual feed memerlukan autentikasi serta otorisasi. |
| NFR-13 | Ketahanan lingkungan | Perangkat harus dirancang untuk outdoor dengan proteksi debu, hujan, dan kelembapan. |
| NFR-14 | Maintainability | Bagian rawan sumbat harus modular dan mudah dibongkar-pasang. |
| NFR-15 | Observability | Sistem harus menghasilkan log operasi, telemetry, event, alarm, dan audit trail. |

## 10. Arsitektur Sistem

## 10.1 Layer arsitektur

| Layer | Komponen | Tanggung jawab |
| --- | --- | --- |
| User Layer | React Dashboard | Monitoring, konfigurasi, manual control, laporan |
| Application | Node.js Backend | API, auth, command, config, telemetry, log, alarm |
| Layer |   |   |
| Data Layer | MongoDB | Menyimpan user, kolam, jadwal, konfigurasi, log, alarm, audit |
| Communication | HiveMQ Cloud + | Perantara pesan antara backend dan ESP32 |
| Layer | MQTT/TLS |   |
| Edge Control | ESP32-S3 | Scheduler lokal, state machine, kontrol aktuator, fault handling |
| Layer |   |   |
| Motion Layer | DM860H + NEMA 34 + | Gerak linear gantry |
|   | V-wheel |   |
| Feeding Layer | 3 servo MG996R | Rotary dosing, diverter, butterfly open gate |
| Sensing Layer | Limit switch, Hall | Feedback kondisi dan keselamatan |
|   | sensor, capacitive |   |
|   | sensor, SHT31-D, |   |
|   | tekanan, PZEM, |   |
|   | ACS758 |   |
| Safety Layer | E-stop, buzzer, LED, | Penghentian darurat dan indikasi lokal |
|   | home panel |   |

## 10.2 Alur data monitoring

Sensor hopper / power / gantry

ESP32-S3

MQTT publish

HiveMQ Cloud


Node.js Backend

MongoDB

React Dashboard

## 10.3 Alur kendali manual

React Dashboard

REST/WebSocket

## Node.js Backend

MQTT command

HiveMQ Cloud

ESP32-S3

Gantry stepper

Rotary dosing servo

Diverter servo

Butterfly open gate servo

## 10.4 Alur feeding otomatis

RTC + Local Schedule

## ESP32-S3

- Move gantry to pond

- Rotary dosing fills portion

Diverter selects left/right

Butterfly gate opens

Feed falls by gravity

Delay / close gate

- Record feeding result

- Return home after schedule completed


## 10.5 Alur offline

Cloud disconnected

ESP32-S3 continues local schedule

- Execute feeding normally

- Store critical events locally

- Show offline status locally

Cloud reconnected

ESP32-S3 publishes queued events in chronological order

Backend ACK each event

ESP32 removes acknowledged event from local buffer

ESP32 requests latest config version

If newer config exists update local config

If no newer config continue existing config

## 11. Desain MQTT

## 11.1 Identitas perangkat

| • | device_id: lele-gantry-001 |
| --- | --- |
| • | Satu perangkat fisik melayani 20 kolam. |
| • | Kolam diidentifikasi dalam payload, bukan sebagai topik utama. |

## 11.2 Struktur topik

lelefeeder/{device_id}/status/connection

lelefeeder/{device_id}/status/state

lelefeeder/{device_id}/config/request

lelefeeder/{device_id}/config/update


lelefeeder/{device_id}/config/ack

lelefeeder/{device_id}/telemetry/environment

lelefeeder/{device_id}/telemetry/power

lelefeeder/{device_id}/telemetry/feed

lelefeeder/{device_id}/telemetry/gantry

lelefeeder/{device_id}/event/feeding

lelefeeder/{device_id}/event/fault

lelefeeder/{device_id}/event/command_ack

lelefeeder/{device_id}/cmd/manual/feed

lelefeeder/{device_id}/cmd/manual/move

lelefeeder/{device_id}/cmd/config/update

lelefeeder/{device_id}/cmd/emergency/stop

## 11.3 Aturan retained message

| Topik | Retained | Alasan |
| --- | --- | --- |
| status/connectio | Ya | Agar dashboard langsung mengetahui status terakhir |
| n |   |   |
| status/state | Ya | Agar dashboard langsung mengetahui state terakhir |
| config/update | Ya | Agar perangkat mendapatkan konfigurasi aktif terbaru |
| cmd/manual/fee | Tidak | Mencegah perintah lama dieksekusi ulang |
| d |   |   |
| cmd/manual/mo | Tidak | Mencegah perintah gerak lama dieksekusi ulang |
| ve |   |   |
| cmd/emergency | Tidak | Perintah darurat harus kontekstual dan tidak diputar ulang |
| /stop |   |   |

## 11.4 Last Will and Testament

ESP32-S3 harus mengatur LWT:

Topic: lelefeeder/lele-gantry-001/status/connection

Payload: {"device_id":"lele-gantry-001","status":"offline","reason":"unexpected_disconnect"}

QoS: 1

Retain: true

Saat ESP32 berhasil terhubung, ia harus langsung mempublikasikan:

Topic: lelefeeder/lele-gantry-001/status/connection

Payload: {"device_id":"lele-gantry-001","status":"online","timestamp":"..."}

QoS: 1

Retain: true


## 12. Model Data MongoDB

## 12.1 Koleksi utama

| Koleksi | Fungsi |
| --- | --- |
| users | Data pengguna, role, credential |
| devices | Data perangkat, status, versi firmware, koneksi terakhir |
| ponds | Data 20 kolam, posisi rail, sisi kiri/kanan, status aktif |
| schedules | Jadwal feeding per kolam/baris/global |
| device_configs | Konfigurasi aktif dan versi konfigurasi |
| commands | Perintah manual, status, penerbit, expiry |
| feeding_logs | Riwayat feeding per kolam |
| telemetry | Data lingkungan, daya, gantry, pakan |
| alarms | Fault, warning, dan status penyelesaian |
| audit_logs | Jejak perubahan dan aksi pengguna |

## 12.2 Contoh skema jadwal

```
{
"schedule_id": "sched_001",
"scope": "pond",
"pond_id": "pond_left_04",
"side": "left",
"pond_index": 4,
"feeding_times": ["07:00", "12:00", "16:00"],
"portion_grams": 1000,
"rotary_rotations": 5,
"pellet_type": "medium",
"active": true,
"created_by": "user_operator_01",
"updated_at": "2026-10-13T09:00:00+07:00"
}
```

## 12.3 Contoh skema feeding log

```
{
"log_id": "feed_20261013_000123",
"device_id": "lele-gantry-001",
"schedule_id": "sched_001",
"pond_id": "pond_left_04",
"side": "left",
"pond_index": 4,
"portion_target_g": 1000,
"portion_tolerance_percent": 10,
"rotary_rotations": 5,
"started_at": "2026-10-13T09:00:00+07:00",
"completed_at": "2026-10-13T09:01:12+07:00",
"result": "success",
"failure_reason": null,
"synced": true
}
```


## 12.4 Contoh skema alarm

```
{
"alarm_id": "alarm_20261013_000045",
"device_id": "lele-gantry-001",
"type": "GANTRY_STALL",
"severity": "critical",
"message": "Gantry movement abnormal detected",
"pond_index": 7,
"rail_position_step": 125000,
"detected_at": "2026-10-13T10:12:33+07:00",
"resolved_at": null,
"status": "open"
}
```

## 13. Keamanan

## 13.1 Autentikasi web

| • | Owner dan operator harus login untuk aksi sensitif. |
| --- | --- |
| • | Password disimpan menggunakan hashing yang aman. |
| • | Sesi login menggunakan token yang kedaluwarsa. |
| • | Mode monitoring tanpa login hanya untuk data non-sensitif. |

## 13.2 Otorisasi

| Aksi | Owner | Operator |
| --- | --- | --- |
| Melihat | Ya | Ya |
| dashboard |   |   |
| Melihat riwayat | Ya | Ya |
| Melihat audit | Ya | Ya |
| trail |   |   |
| Mengubah | Tidak | Ya |
| jadwal |   |   |
| Mengubah porsi Tidak |   | Ya |
| Manual feed | Tidak | Ya |
| Mengubah | Tidak | Ya |
| konfigurasi |   |   |
| perangkat |   |   |

## 13.3 Keamanan MQTT

| • | Gunakan HiveMQ Cloud dengan MQTTS di port 8883. |
| --- | --- |
| • | Gunakan TLS 1.2 atau 1.3. |
| • | ESP32 dan backend memiliki credential berbeda. |
| • | Credential tidak boleh di-hardcode dalam source code. |
| • | ESP32 hanya boleh mengakses topik milik lele-gantry-001. |
| • | Backend memvalidasi user dan role sebelum menerbitkan command. |
| • | Setiap command memiliki command_id, issued_at, expires_at, issued_by, dan status eksekusi. |
| • | Command yang sudah dieksekusi dicatat sebagai executed untuk mencegah replay. |


HiveMQ menyediakan autentikasi, otorisasi, dan RBAC untuk membatasi izin klien MQTT terhadap topik tertentu.

## 14. Acceptance Criteria

## 14.1 Feeding otomatis

Sistem dianggap lulus jika:

| • | ESP32 dapat menjalankan jadwal tanpa koneksi internet. |
| --- | --- |
| • | Gantry bergerak ke kolam target berdasarkan konfigurasi lokal. |
| • | Rotary dosing mengeluarkan porsi sesuai kalibrasi dengan toleransi ±10%. |
| • | Diverter memilih outlet kiri atau kanan sesuai target. |
| • | Butterfly gate membuka dan menutup sesuai sequence. |
| • | Sistem mencatat feeding berhasil atau gagal. |
| • | Gantry kembali ke home setelah seluruh jadwal selesai. |

## 14.2 Offline-first

Sistem dianggap lulus jika:

| • | Saat HiveMQ/internet mati, feeding tetap berjalan. |
| --- | --- |
| • | Event kritikal disimpan secara lokal. |
| • | Saat online kembali, event dikirim berurutan berdasarkan waktu. |
| • | Event hanya dihapus setelah menerima ACK backend. |
| • | Jika ada konfigurasi baru, perangkat memperbarui konfigurasi lokal. |
| • | Jika tidak ada konfigurasi baru, perangkat tetap menjalankan konfigurasi lama. |

## 14.3 Kendali manual

Sistem dianggap lulus jika:

| • | Operator dapat memilih kolam dan menjalankan manual feed. |
| --- | --- |
| • | Perintah manual menunggu hingga gantry menyelesaikan langkah aktif. |
| • | Popup konfirmasi muncul saat sistem online dan sedang berjalan. |
| • | Perintah manual memiliki command ID dan tidak dieksekusi ulang. |
| • | Perintah manual tidak dapat dieksekusi saat perangkat offline. |

## 14.4 Fault handling

Sistem dianggap lulus jika:

| • | E-stop menghentikan seluruh aktuator. |
| --- | --- |
| • | Pakan habis memicu buzzer, notifikasi, dan return-to-home. |
| • | Servo gagal menghentikan proses tanpa memaksa lanjut. |
| • | Gantry stall menghentikan proses dan mengirim alarm. |
| • | Tegangan abnormal melewati ambang memicu stop dan alarm. |


| • | E-stop menghentikan seluruh aktuator. |
| --- | --- |
| • | LED menunjukkan status normal, feeding, warning, fault, dan offline. |

## 14.5 Website

Sistem dianggap lulus jika:

| • | Dashboard menampilkan status perangkat dan posisi gantry. |
| --- | --- |
| • | Dashboard menampilkan telemetry lingkungan dan daya. |
| • | Dashboard menampilkan grafik realtime dan histori. |
| • | Riwayat feeding dapat difilter dan diekspor. |
| • | Audit trail mencatat perubahan konfigurasi dan manual feed. |
| • | Role owner dan operator memiliki hak akses berbeda. |

## 15. Metrik Keberhasilan

| Metrik | Target awal |
| --- | --- |
| Keberhasilan feeding | Minimal 95% siklus berhasil |
| otomatis |   |
| Akurasi porsi | Deviasi maksimal ±10% dari target |
| Keberhasilan homing | 100% setelah power-on dan kondisi yang memerlukan homing |
| Keberhasilan sinkronisasi | Minimal 99% event kritikal terkirim setelah reconnect |
| log offline |   |
| Ketersediaan operasi | Sistem tetap berjalan tanpa internet selama daya tersedia |
| lokal |   |
| Waktu perpindahan antar | Maksimal 20 detik |
| kolam |   |
| Waktu deteksi fault | Event fault dikirim segera setelah terdeteksi saat online |
| Keandalan koneksi | Status online/offline terdeteksi otomatis melalui LWT |

## 16. Asumsi

| • | Satu hopper cukup untuk melayani 20 kolam. |
| --- | --- |
| • | Kapasitas hopper awal diasumsikan 15 kg. |
| • | Porsi awal diasumsikan sekitar 200 gram per putaran rotary dosing. |
| • | Nilai tersebut akan dikalibrasi ulang berdasarkan ukuran pellet dan hasil pengujian. |
| • | Toleransi porsi ±10% dapat diterima. |
| • | Servo bergerak bergantian, sehingga beban puncak 5 V tidak terjadi bersamaan. |
| • | Wi-Fi tersedia tetapi tidak stabil. |
| • | Sistem harus tetap berjalan tanpa batas waktu selama listrik utama tersedia. |
| • | Flash internal ESP32-S3 cukup untuk konfigurasi dan buffer event kritikal. |
| • | Data disimpan maksimal 1 tahun di MongoDB. |
| • | Belum ada kebutuhan notifikasi eksternal selain dashboard. |


## 17. Kendala

| • | Tidak ada baterai backup atau UPS. |
| --- | --- |
| • | Jaringan Wi-Fi tidak stabil. |
| • | Sistem beroperasi outdoor dan terpapar hujan, debu, serta kelembapan. |
| • | Kapasitas hopper final belum pasti. |
| • | Kalibrasi rotary dosing belum dilakukan. |
| • | Mekanisme deteksi stall berbasis Hall sensor masih perlu divalidasi. |
| • | Posisi kolam masih bergantung pada kombinasi step counting dan sensor posisi. |
| • | GPS belum cocok sebagai navigasi utama karena rail bersifat tetap dan jarak antar kolam hanya sekitar 10 cm. |

## 18. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Gantry slip atau | Posisi kolam salah | Gunakan Hall sensor/odometer, homing rutin, dan validasi posisi |
| step loss |   |   |
| Gantry macet | Feeding gagal atau | Deteksi berbasis Hall/current/time-out, stop aman, alarm |
|   | gantry berhenti |   |
| Servo gagal | Pakan tidak keluar | Fault detection, stop proses, buzzer, notifikasi |
|   | atau diverter salah |   |
| Pakan habis | Jadwal tidak selesai | Sensor level, alarm, return home, popup lanjut/tidak lanjut |
| Wi-Fi tidak | Dashboard tidak | Operasi lokal, buffer event, sinkronisasi saat reconnect |
| stabil | realtime |   |
| Flash penuh | Log hilang | Prioritaskan alarm/event kritikal, batasi telemetry offline |
| Lonjakan arus | ESP32 reset atau buck | Pisahkan rail daya servo dan logika, tambah kapasitor/proteksi |
| servo | converter drop |   |
| Air/debu masuk | Kerusakan listrik | Enclosure IP65/IP66, konektor kedap air, pemisahan AC/DC |
| panel |   |   |
| Kesalahan | Feeding salah | Validasi konfigurasi, config versioning, audit trail |
| konfigurasi | porsi/kolam |   |
| Perintah lama | Feeding ganda | Command ID, expiry, status executed, tidak memakai retained command |
| dieksekusi |   |   |
| ulang |   |   |

## 19. Pertanyaan Terbuka

| ID | Pertanyaan | Dampak |
| --- | --- | --- |
| OQ-01 | Apa fungsi pasti | Menentukan desain deteksi stall |
|   | Hall-effect sensor: |   |
|   | odometer roda gantry, |   |
|   | deteksi posisi, atau |   |
|   | deteksi rotary dosing? |   |


| ID | Pertanyaan | Dampak |
| --- | --- | --- |
| OQ-02 | Berapa jumlah | Menentukan resolusi posisi |
|   | magnet/Hall sensor |   |
|   | yang akan dipasang |   |
|   | pada gantry? |   |
| OQ-03 | Berapa step per mm | Menentukan kalibrasi posisi |
|   | atau step per putaran |   |
|   | roda gantry? |   |
| OQ-04 | Berapa diameter roda | Menentukan konversi RPM ke kecepatan linear |
|   | V-wheel dan rasio |   |
|   | timing belt? |   |
| OQ-05 | Berapa arus puncak | Menentukan kapasitas buck converter |
|   | aktual MG996R pada |   |
|   | beban diverter/open |   |
|   | gate? |   |
| OQ-06 | Berapa ambang | Menentukan logika power fault |
|   | normal, warning, dan |   |
|   | fault untuk tegangan |   |
|   | 48 V? |   |
| OQ-07 | Apakah rotary dosing | Menentukan akurasi porsi |
|   | benar-benar konsisten |   |
|   | 200 gram per putaran |   |
|   | untuk semua ukuran |   |
|   | pellet? |   |
| OQ-08 | Apakah perlu load cell | Menentukan strategi validasi porsi |
|   | minimal untuk kalibrasi |   |
|   | awal? |   |
| OQ-09 | Berapa delay yang | Menentukan sequence feeding |
|   | tepat setelah open |   |
|   | gate sebelum ditutup? |   |
| OQ-10 | Bagaimana bentuk | Menentukan konversi porsi ke putaran |
|   | final rotary dosing dan |   |
|   | kapasitas tiap rongga? |   |
| OQ-11 | Apakah home control | Menentukan antarmuka lokal |
|   | panel akan memiliki |   |
|   | tombol fisik untuk |   |
|   | start/stop/E-stop? |   |
| OQ-12 | Apakah ESP32-S3 | Menentukan arsitektur penyimpanan lokal |
|   | akan menggunakan |   |
|   | NVS saja atau LittleFS |   |
|   | untuk buffer event? |   |
| OQ-13 | Berapa batas | Menentukan kebijakan retensi lokal |
|   | maksimum buffer |   |
|   | offline yang realistis |   |
|   | berdasarkan flash |   |
|   | tersedia? |   |
| OQ-14 | Apakah GPS | Menentukan kebutuhan sensor posisi |
|   | benar-benar |   |
|   | diperlukan, atau cukup |   |
|   | posisi relatif kolam |   |
|   | 1–20? |   |
| OQ-15 | Apakah perlu proteksi | Menentukan desain panel listrik |
|   | tambahan seperti fuse |   |
|   | per jalur dan surge |   |
|   | protection meski |   |
|   | belum dianggap |   |
|   | krusial? |   |


## 20. Rencana Pengembangan Bertahap

## Fase 1 — Validasi mekanik

| • | Uji gerak gantry di rail. |
| --- | --- |
| • | Uji V-wheel, timing belt, NEMA 34, dan DM860H. |
| • | Kalibrasi homing dan step per jarak. |
| • | Uji kecepatan perpindahan antar kolam. |

## Fase 2 — Validasi feeding

| • | Uji rotary dosing. |
| --- | --- |
| • | Kalibrasi gram per putaran. |
| • | Uji diverter kiri/kanan. |
| • | Uji butterfly open gate. |
| • | Uji urutan dosing diverter open gate. |

## Fase 3 — Kontrol lokal

| • | Implementasi RTC dan scheduler lokal. |
| --- | --- |
| • | Implementasi penyimpanan konfigurasi di NVS. |
| • | Implementasi state machine feeding. |
| • | Implementasi E-stop dan safe state. |

*Fase 4 — Komunikasi IoT*

| • | Integrasi HiveMQ Cloud. |
| --- | --- |
| • | Implementasi MQTT TLS. |
| • | Implementasi telemetry, event, command, ACK, dan LWT. |
| • | Implementasi buffer offline dan sinkronisasi ulang. |

*Fase 5 — Website*

| • | Bangun auth owner/operator. |
| --- | --- |
| • | Bangun dashboard monitoring. |
| • | Bangun manajemen jadwal dan porsi. |
| • | Bangun manual feed dan konfirmasi. |
| • | Bangun riwayat, ekspor, dan audit trail. |

## Fase 6 — Uji lapangan

| • | Uji 20 kolam. |
| --- | --- |
| • | Uji jangka panjang. |
| • | Uji kondisi offline. |
| • | Uji fault injection. |


| • | Uji 20 kolam. |
| --- | --- |
| • | Uji ketahanan outdoor. |
| • | Validasi akurasi porsi dan keandalan homing. |

## 21. Definisi Istilah

| Istilah | Definisi |
| --- | --- |
| Gantry | Struktur bergerak yang membawa hopper di atas rail |
| Carriage | Unit bergerak yang membawa hopper dan mekanisme feeding |
| Hopper | Wadah penyimpan pakan |
| Rotary dosing | Mekanisme rotari untuk menakar jumlah pakan |
| Diverter gate | Servo/gate yang memilih outlet kolam kiri atau kanan |
| Butterfly open gate | Gate berbentuk kupu-kupu yang membuka aliran pakan |
| Home position | Posisi awal/aman gantry di ujung belakang rail |
| Homing | Proses mencari posisi awal menggunakan limit switch |
| Offline-first | Prinsip agar perangkat tetap berfungsi tanpa cloud |
| Telemetry | Data pengukuran yang dikirim perangkat |
| ACK | Konfirmasi bahwa pesan/command/event telah diterima atau diproses |
| LWT | Last Will and Testament; pesan otomatis saat perangkat terputus tidak normal |
| NVS | Non-Volatile Storage pada ESP32 untuk menyimpan konfigurasi |
| Safe state | Kondisi aman sistem saat terjadi fault |

## 22. Lampiran: Alur Eksekusi Feeding

Check system safety

Fault detected

Read local schedule

Select next pond

Move gantry to pond position

SAFE_STATE / ALARM


```
Stall/limit fault STOP + ALARM
Run rotary dosing
Position diverter to left/right
Open butterfly gate
Feed falls by gravity
Short delay
Stop rotary dosing + close gate
Record feeding result
Feed empty ALARM + RETURN_HOME
Next pond available?
Yes Move to next pond
No RETURN_HOME
IDLE
```

## 23. Lampiran: Status LED yang Disarankan


| Status | LED | Buzzer |
| --- | --- | --- |
| Normal / idle | Hijau stabil | Mati |
| Moving to pond | Biru berkedip | Mati |
| Feeding | Kuning berkedip | Mati |
| Warning | Kuning stabil | Beep berkala |
| Fault | Merah berkedip | Menyala terus |
| Offline | Biru pelan / indikator | Mati |
|   | khusus |   |
| Emergency stop Merah stabil |   | Menyala terus |

## 24. Keputusan Desain Penting

| Keputusan | Nilai yang dipilih |
| --- | --- |
| Jumlah hopper | 1 |
| Jumlah kolam | 20 |
| Susunan kolam | 10 kiri + 10 kanan |
| Panjang rail | 30–35 m |
| Metode pembuangan | Gravitasi |
| pakan |   |
| Metode takaran | Rotary dosing |
| Nilai kalibrasi awal | 200 gram per putaran |
| Toleransi porsi | ±10% |
| Motor gantry | NEMA 34, 4.5 A |
| Driver stepper | DM860H |
| Jumlah servo | 3 |
| Tipe servo | MG996R |
| Servo bergerak | Bergantian |
| Controller utama | ESP32-S3 |
| Flash / PSRAM | 16 MB / 8 MB |
| Penyimpanan konfigurasi NVS |   |
| RTC | Wajib, dengan baterai cadangan |
| Komunikasi | MQTT/TLS via HiveMQ Cloud |
| Backend | Node.js |
| Frontend | React |
| Database | MongoDB |
| Role pengguna | Owner dan operator |
| Retensi data | Maksimal 1 tahun |
| Mode offline | Wajib, tanpa batas waktu selama daya tersedia |
| Return home | Wajib setelah selesai/refill |
| E-stop | Wajib |
| Buzzer saat fault | Menyala terus |
