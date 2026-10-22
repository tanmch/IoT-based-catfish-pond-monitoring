# Fish Linker: Product Requirements Document and C4 Architecture Model

Version 1.0 | Status: Draft | Date: 22 October 2026 | Repository: tanmch/IoT-based-catfish-pond-monitoring

## 1. Purpose and scope

This PRD describes the Fish Linker web application as it exists in the codebase, and defines requirements for the next iteration, which adds automated feeding (auto-feeder). It was reverse-engineered from the source code. Requirements marked **As built** reflect current behaviour. Items marked **Gap** or **Proposed** are recommendations that are not yet implemented.

In scope: catfish (lele) pond management, IoT monitoring of pH, temperature and dissolved oxygen (DO), remote control of pump and valve, feeding, harvest, finance, and role-based access.

Out of scope: native mobile apps, SaaS billing, marketplace integrations, and ESP firmware (not included in this repository).

## 2. Problem statement

Small and medium catfish farmers usually record pond conditions, feed, stock, mortality, growth and sales on paper or in spreadsheets. Water quality is checked by hand and feeding is estimated by feel. This leads to late detection of unsafe water, over- or under-feeding, weak traceability of stock and money, and no shared view between owners and field workers.

Fish Linker provides one system for records, operations and finance, connected to ESP-based sensors and actuators in the pond.

## 3. Goals and success metrics

| ID | Goal | Metric | Target |
|---|---|---|---|
| G1 | Detect unsafe water quickly | Time from out-of-range reading to alert on screen | Within one 3-second polling cycle |
| G2 | Reduce manual logging | Share of feeding, mortality and harvest events logged in the app | Above 90% |
| G3 | Feed accurately (auto-feeder) | Deviation from planned feed percentage of biomass | Within ±5% |
| G4 | Financial visibility | Share of feed purchases and harvest sales recorded as transactions | 100% |
| G5 | Accountability | Share of write endpoints that create an activity record | 100% |

## 4. Users and personas

**Admin** manages users, roles and master data. Full access.

**Owner (pemilik)** runs the farm business. Views dashboard, finance and management, assigns field workers to ponds, and manages stock. Full operational access.

**Field worker (petani)** performs daily operations on assigned ponds. Access is limited to those ponds.

**Device (ESP microcontroller)** is an unattended client that sends sensor readings and polls actuator state. It currently has no authentication (see section 10).

## 5. Assumptions and constraints

- Users access the web app from desktop or mobile browsers with network access to the backend. There is no offline mode.
- Each pond has an integer ID that is configured in the ESP firmware.
- Currency is IDR and the time zone is Asia/Jakarta (WIB).
- MySQL is the only database. The schema is created automatically at start-up, without a migration tool.
- This is an internship project with a small team, so no formal SLA is required.

## 6. Feature overview

| Module | Scope | Users |
|---|---|---|
| Authentication and users | Login, register, profile, role management | All |
| Dashboard | Farm-wide summary | Admin, Owner |
| Pond management | Pond list and detail (monitoring, operations, assets) | All (scoped) |
| Fish stock | Fish master data, stocking, mortality, growth, sorting | All (scoped) |
| Feeding and vitamins | Feed and vitamin stock, administration | All (scoped) |
| Harvest | Harvest records, summary, CSV export | All (scoped) |
| Finance | Income, expense, balance | Admin, Owner |
| Management | Field worker assignment, user roles | Admin, Owner |
| Master data | Reference tables and vendors | Admin, Owner |
| Activity log | Audit trail (global, or per pond) | Admin, Owner (global); all (per pond) |

## 7. Functional requirements

### 7.1 Authentication and access control

**FR-AUTH-01 (As built):** Users register with username, email and password. New accounts receive the role `petani`.

**FR-AUTH-02 (As built):** Login returns a JWT bearer token valid for 60 minutes (HS256).

**FR-AUTH-03 (As built):** Passwords are stored as bcrypt hashes. Input is truncated to the 72-byte bcrypt limit.

**FR-AUTH-04 (As built):** The frontend redirects to login on HTTP 401 and sends each role to its landing page (admin and owner to `/dashboard`, petani to `/kolam`).

**FR-AUTH-05 (As built):** Admin and Owner can list users and change roles.

**FR-AUTH-06 (Gap):** There is no password change or password reset.

**FR-AUTH-07 (Gap):** Field worker pond assignment is not checked consistently on every endpoint.

### 7.2 Pond management

**FR-POND-01 (As built):** Create, read, update and delete ponds, with name, location, description, type, status and dimensions.

**FR-POND-02 (As built):** Round ponds require a diameter and height above zero. Rectangular ponds require length, width and height above zero. Irrelevant dimensions are cleared automatically.

**FR-POND-03 (As built):** Status is one of: Kosong (empty), Sedang Pemeliharaan (under cultivation), Siap Panen (ready to harvest), Gagal Panen (failed harvest).

**FR-POND-04 (As built):** Owners assign and unassign field workers to one or several ponds.

**FR-POND-05 (Gap):** Deleting a pond cascades to sensor history and related records without an impact check. A soft delete is recommended.

### 7.3 Fish stock

**FR-FISH-01 (As built):** Master list of fish types with quantity and average weight.

**FR-FISH-02 (As built):** Stocking a pond creates a batch (`isi_kolam`) with date, quantity and average weight.

**FR-FISH-03 (As built):** Mortality is recorded and the quantity is updated.

**FR-FISH-04 (As built):** Weight updates and a growth log store average weight and total biomass (kg).

**FR-FISH-05 (As built):** Fish can be moved between ponds (sortir), with an activity record.

**FR-FISH-06 (Partial):** Growth data is available through the API, but visual growth reporting is limited.

### 7.4 Feeding and vitamins

**FR-FEED-01 (As built):** Feed and vitamin stock with quantity, unit, price and type.

**FR-FEED-02 (As built):** A feeding event deducts stock, distributes the cost across the pond's batches, and creates an activity record.

**FR-FEED-03 (As built):** The feeding form offers a manual amount or an automatic amount of 3, 4 or 5% of biomass. The automatic option is a calculator only and does not dispense feed.

**FR-FEED-04 (As built):** Feeding records can be corrected or cancelled, and stock is returned.

**FR-FEED-05 (Proposed):** Scheduled auto-feeding, specified in section 9.

### 7.5 Harvest

**FR-HARV-01 (As built):** Record harvests per pond with quantity, weight and price, linked to fish stock.

**FR-HARV-02 (As built):** List, detail and summary views, plus CSV export.

### 7.6 Finance

**FR-FIN-01 (As built):** Income and expense transactions with date, category, amount and description.

**FR-FIN-02 (As built):** Summary of total income, total expense and balance.

**FR-FIN-03 (Partial):** Feed purchases and harvest sales appear in finance only when entered manually. There is no automatic posting.

**FR-FIN-04 (Partial):** PDF and Excel export exists in the frontend, but formats are not standardised.

### 7.7 Master data

**FR-REF-01 (As built):** Owners and admins manage pond types, fish sizes, activity types, status codes and vendors. Vendor codes are generated automatically.

**FR-REF-02 (As built):** Reference values populate the dropdowns in operational forms.

### 7.8 Activity log

**FR-AUD-01 (As built):** Each write action records user, role, timestamp (WIB), activity type, action, description and affected IDs.

**FR-AUD-02 (Partial):** Logs are visible per pond and globally, with no date or user filter in the UI.

### 7.9 Dashboard and monitoring

**FR-DASH-01 (As built):** The dashboard summarises ponds, stock and finance.

**FR-DASH-02 (As built):** The pond detail page shows the latest 24 readings for pH and temperature as charts, and raises alerts outside the thresholds in section 8.

**FR-DASH-03 (Gap):** Dissolved oxygen is stored and returned by the API but has no chart or alert.

## 8. IoT monitoring and actuator control

### 8.1 Sensor data

**FR-IOT-01 (As built):** The ESP sends a JSON reading to `POST /sensor/esp` containing `kolam_id`, `temperature`, `ph` and `dissolved_oxygen`. The backend stores it and writes pH and temperature rows to the monitoring log.

**FR-IOT-02 (As built):** The frontend polls the monitoring log and the pond's sensor history every 3 seconds.

**FR-IOT-03 (As built):** Alert thresholds are pH below 6.5 or above 8.5, and temperature below 25 °C or above 32 °C. They are hardcoded in the frontend.

**FR-IOT-04 (Gap):** Thresholds cannot be set per pond or per fish stage. Alerts are not persisted, notified or acknowledged.

### 8.2 Actuator control

**FR-IOT-05 (As built):** Users switch the pump and valve on or off on the pond detail page. The command is stored via `POST /kolam/control/{pond_id}`.

**FR-IOT-06 (As built):** The device reads its state via `GET /kolam/control/{pond_id}`. The frontend polls this every 2 seconds.

**FR-IOT-07 (As built):** Each actuator change is written to the monitoring log.

**FR-IOT-08 (Gap):** The control endpoints require no authentication, so anyone who can reach the server can change pump and valve state.

**FR-IOT-09 (Gap):** There is no acknowledgement that the device applied a command, no timeout, and no offline indicator.

## 9. Auto-feeder requirements (Proposed)

The README describes this fork as focused on auto-feeder features. The code currently provides only the percentage calculator in FR-FEED-03. The requirements below define the auto-feeder.

**AF-01:** Each pond can have one active feeding schedule with a start time, interval, and amount rule (fixed kg or percent of biomass).

**AF-02:** The backend computes each run's amount from the latest biomass in the growth log and the schedule's percentage.

**AF-03:** Before each run, the backend checks feed stock. If stock is insufficient, the run is skipped and an alert is created.

**AF-04:** The device receives a dispense command (grams) through the same polling pattern as the actuators, and reports the amount actually dispensed.

**AF-05:** Each run is recorded as a feeding event with status `planned`, `dispensed`, `skipped` or `failed`, linked to its schedule.

**AF-06:** Owners and assigned field workers can pause, resume or trigger a run manually.

**AF-07:** Unacknowledged dispense commands expire after a set time, to prevent double feeding after a network loss.

**AF-08:** All device commands require device authentication (section 10).

## 10. Non-functional requirements

**Security:** `SECRET_KEY` and database settings must come from environment variables, not source code. Device endpoints need a per-device API key. Control endpoints need authentication and pond-level authorisation. Credentials must not be committed. Current status: all Gap. The backend `.env` file is in the repository, so its credentials must be treated as exposed and rotated.

**Performance:** Dashboard and pond pages load within 2 seconds on 4G with up to 50 ponds. Each device sends at most one request every 3 seconds.

**Reliability:** The device keeps its last known actuator state for up to 10 minutes without network. Writes are transactional.

**Availability:** 99% monthly uptime during operating hours, subject to hosting.

**Data retention:** Sensor readings are kept for at least 12 months. Activity records are kept for the life of the pond.

**Time:** All timestamps are in Asia/Jakarta. The current code mixes UTC and WIB and must be unified.

**Usability:** UI in Bahasa Indonesia, responsive layout. Wide tables and charts scroll horizontally on small screens.

**Maintainability:** Schema changes go through a migration tool such as Alembic. Automated tests cover auth, pond, feeding and sensor endpoints. Current status: no migrations and no tests (Gap).

**Observability:** Errors are logged with request context and debug prints are removed. Current status: partial.

## 11. Data model summary

The MySQL database `budidaya_lele` has 22 tables in five groups.

- **Identity:** `users`
- **Ponds and fish:** `kolam`, `kolam_log`, `isi_kolam`, `fish_stock`, `fish_mortality`, `growth_log`, `pemilik_petani_kolam`
- **Feeding, finance and harvest:** `feed_stock`, `feed_logs`, `pemberian_pakan`, `aktivitas`, `transaksi_keuangan`, `panen`
- **IoT:** `sensor_data`, `device_control`, `monitoring_log`
- **Reference data:** `reference_jenis_kolam`, `reference_ukuran_ikan`, `reference_aktivitas_kolam`, `reference_status_kolam_ikan`, `ref_vendor`

## 12. Release plan

**Phase 0, stabilise (prerequisite):** Rotate exposed credentials. Move `SECRET_KEY` and DB settings to environment variables. Add authentication to device and control endpoints. Remove the duplicate router mount. Fix route order so `/panen/summary` and `/panen/export.csv` are not captured by `/panen/{panen_id}`. Add `.gitignore` entries for logs, caches and venv. Introduce Alembic.

**Phase 1, complete monitoring:** DO chart and alert, per-pond thresholds, persisted and acknowledged alerts, device online status, command acknowledgement.

**Phase 2, auto-feeder:** Requirements AF-01 to AF-08, feeder hardware integration, schedule page.

**Phase 3, operations and finance:** Automatic finance posting, password reset, standard reports, automated tests.

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Unauthenticated device and control endpoints | Unauthorised pump/valve changes, false sensor data | Phase 0 device authentication |
| Committed credentials may already be public | Database compromise | Rotate now and purge from git history |
| No command acknowledgement | UI shows a state that differs from the device | Phase 1 acknowledgement |
| Hardcoded thresholds | Alerts unsuitable for some fish stages | Per-pond configuration |
| Single developer, no tests | Regression risk | Smoke tests before Phase 2 |

## 14. Open questions

1. Which feeder hardware is used (motor type, hopper size, dispense control)?
2. Which ESP board is used, and how is the pond ID configured on the device?
3. Should alerts also reach owners by WhatsApp or e-mail?
4. Who approves a feeding schedule change?
5. Is multi-owner support needed in the next release?

## 15. C4 architecture model

The model is presented at four levels of zoom. Levels 1 and 2 are complete below, level 3 covers the API application, and level 4 is summarised. Diagrams are plain text so they render in any editor.

### 15.1 Level 1: System context

```
  [Admin / Owner / Field worker]
               | uses (browser)
               v
  +-----------------------------------+
  |            Fish Linker            |
  |  pond, feed, fish, harvest,       |
  |  finance and monitoring system    |
  +-----------------------------------+
        ^                       |
        | sensor readings,      | pump/valve commands
        | polled every 2-3 s    v
  +-----------------------------------+
  |  ESP device (external hardware)   |
  |  pH, temperature, DO sensors      |
  |  pump and valve relays            |
  +-----------------------------------+
```

People use the web application to manage ponds, stock and finance. The ESP device pushes sensor readings and polls for actuator commands over HTTP.

### 15.2 Level 2: Containers

**Web application:** React 18, Vite, Material UI, React Router 7. Runs on port 5173 in development. Stores the JWT in localStorage.

**API application:** FastAPI on Uvicorn, port 8000. JSON REST endpoints, JWT validation, role checks, activity logging.

**Database:** MySQL, schema `budidaya_lele`. Accessed through SQLAlchemy and PyMySQL.

**ESP device:** ESP8266 or ESP32 (firmware not in repository). Sends readings, polls actuator state, drives relays.

```
+----------------------+   JSON over HTTP, JWT      +----------------------+
| Web application      | -------------------------> | API application      |
| React + Vite :5173   |  /kolam, /feed, /panen     | FastAPI :8000        |
+----------------------+                            +----------+-----------+
                                                              | SQLAlchemy / PyMySQL
+----------------------+   JSON over HTTP, no auth  +----------v-----------+
| ESP device           | -------------------------> | Database             |
| sensors and relays   |  POST /sensor/esp          | MySQL budidaya_lele  |
|                      |  GET, POST /kolam/control  +----------------------+
+----------------------+
```

Design choice: REST polling instead of WebSocket or MQTT. This keeps firmware simple and meets the 3-second latency requirement. The trade-off is higher request volume at scale.

### 15.3 Level 3: API application components

**Routing (`main.py`):** Endpoint groups for auth, ponds, fish, feeding, finance, sensor and control, harvest, reference data and activity. Two routers are mounted, which creates duplicate paths (Gap).

**Security:** bcrypt hashing (passlib), JWT creation and validation (python-jose), and the `get_current_user` dependency.

**Business logic:** Cost distribution across batches, stock deduction and return, mortality and growth calculations, dimension validation, and `capture_activity` for audit records.

**Data access:** SQLAlchemy models (`models.py`), the session dependency (`get_db`), and Pydantic schemas (`schemas.py`).

**IoT:** Sensor ingestion, monitoring log writer, and the `device_control` state store.

```
[Web app] -> [Routing] -> [Security] -> [Business logic] -> [Data access] -> [MySQL]
                                                                   ^
[ESP device] -> [IoT component] -----------------------------------+
```

### 15.4 Level 4: Code

`main.py` (about 3,650 lines, all endpoints), `models.py` (about 440 lines, 22 tables), `schemas.py` (about 690 lines), `database.py` (engine and session), `utils.py` (password helpers). On the frontend there is one file per screen. The largest is `KolamDetail.jsx` (about 2,600 lines). Splitting the API into routers and services is recommended in Phase 0.

### 15.5 Deployment

Development: `start.sh` runs Uvicorn with reload on port 8000 and Vite on port 5173, with MySQL on localhost.

Production candidate: the `Procfile` (`uvicorn app.main:app`) suits a platform host. The frontend would be built as static files and connected to managed MySQL. CORS currently allows only `localhost:5173`, and the frontend API base URL is hardcoded to localhost. Both must become environment settings before deployment.

## 16. Glossary

| Term | Meaning |
|---|---|
| Kolam | Pond |
| Ikan | Fish |
| Lele | Catfish (Clarias) |
| Isi kolam | Fish batch stocked in a pond |
| Pakan | Feed |
| Vitamin | Supplement given with feed |
| Panen | Harvest |
| Sortir | Sorting or moving fish between ponds |
| Biomassa | Total live weight of fish |
| Pemilik | Owner |
| Petani | Farmer or field worker |
| Aktivitas | Activity log entry |
| ESP | Low-cost Wi-Fi microcontroller |
| DO | Dissolved oxygen |

## 17. Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 22 October 2026 | Initial PRD and C4 model, reverse-engineered from the repository |
