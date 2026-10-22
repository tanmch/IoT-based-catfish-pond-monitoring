// src/pages/KolamDetail.jsx
import { useEffect, useState, useMemo } from 'react';
import {
  Typography,
  Box,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  MenuItem,
  LinearProgress,
  Card,
  CardContent,
  Grid,
  Snackbar,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import Layout from '../components/Layout';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import empty from '../assets/empty.jpg';

const PANEN_TARGET_HARI = 75;
const API_BASE = 'http://localhost:8000';

// ✅ toleransi pembulatan kg (ekor pakai integer saja)
const EPS_KG = 0.001;
const EPS_EKOR = 1;

const formatRp = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(value));
};

// ⬇️ Formatter berat supaya 1 => 1,0 kg (bukan 1.000)
const formatKg = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 3 }).format(n) + ' kg';
};

const formatWaktu = (val) => {
  if (!val) return '-';

  const d = new Date(val);

  if (isNaN(d)) return '-';

  return d
    .toLocaleString('id-ID', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/:/g, '.');
};

// helper waktu → selalu HH:mm (untuk <input type="time">)
const toHHmm = (val) => {
  if (!val) return '';
  const s = String(val);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
};
// helper untuk server (HH:mm:ss)
const toHHmmss = (val) => {
  if (!val) return null;
  const s = String(val);
  if (s.length === 5) return `${s}:00`;
  if (s.length === 8) return s;
  return null;
};

/** ===== Helpers ukuran/label ===== */
/** Gabungkan nama + ukuran untuk tampilan */
const composeSizeLabel = (name, ukuran) => {
  const n = (name ?? '').trim();
  const u = (ukuran ?? '').trim();
  return u ? `${n} - ${u}` : n || '-';
};
/** Ambil bagian ukuran saja dari label "nama - ukuran" atau string lainnya */
const extractUkuranOnly = (text) => {
  if (!text) return '';
  const s = String(text).trim();
  // Jika ada " - ", ambil bagian setelah tanda minus terakhir
  const idx = s.lastIndexOf(' - ');
  if (idx >= 0) return s.slice(idx + 3).trim();
  return s; // fallback: anggap seluruh string adalah ukuran
};
/** Ambil bagian NAMA (kode ukuran) saja dari label "nama - ukuran" */
const extractNamaOnly = (text) => {
  if (!text) return '';
  const s = String(text).trim();
  const idx = s.indexOf(' - ');
  if (idx >= 0) return s.slice(0, idx).trim();
  return s;
};

export default function KolamDetail() {
  const { id } = useParams();
  const token = localStorage.getItem('token');

  const [kolam, setKolam] = useState(null);
  const [fish, setFish] = useState([]); // batch isi_kolam (quantity/total_kg + snapshot harga + cost akumulasi)
  const [sensor, setSensor] = useState([]);
  const [masterFish, setMasterFish] = useState([]); // master ikan (catalog)
  const [feeds, setFeeds] = useState([]);
  const [refUkuran, setRefUkuran] = useState([]); // reference ukuran ikan
  const [loading, setLoading] = useState(true);

  // ⬇️ master data Vendor (ref_vendor)
  const [vendorsRef, setVendorsRef] = useState([]);

  // Logs
  const [feedingLogsRaw, setFeedingLogsRaw] = useState([]); // raw logs untuk quantity kg pakan/vitamin
  const [feedingLogs, setFeedingLogs] = useState([]); // mapped untuk tabel
  const [deathLogs, setDeathLogs] = useState([]);
  const [growthLogs, setGrowthLogs] = useState([]);
  const [addFishLogs, setAddFishLogs] = useState([]); // masih disimpan lokal, tapi TAMPILAN pakai aktivitas
  const [showAllSensor, setShowAllSensor] = useState(false);
  const [showAllDevice, setShowAllDevice] = useState(false);
  const [showAllAddFish, setShowAllAddFish] = useState(false);

  const [logs, setLogs] = useState([]);
  const [lastAlert, setLastAlert] = useState(null);
  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/monitoring-log/${id}`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();

    const interval = setInterval(() => {
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  const sensorLogs = logs.filter((log) => log.type === 'ph' || log.type === 'suhu');

  const deviceLogs = logs.filter((log) => log.type === 'pompa' || log.type === 'valve');

  // 🔹 Aktivitas (termasuk sortir, add fish, panen, dll)
  const [activities, setActivities] = useState([]);
  const [showAllSortir, setShowAllSortir] = useState(false);

  // --- state tambahan untuk sortir/panen ---
  const [allKolams, setAllKolams] = useState([]);
  const [movements, setMovements] = useState([]);
  const [validatePanenError, setValidatePanenError] = useState('');

  // ✅ index ukuran kolam tujuan:
  // - kolamSizeIndex: label tampilan (array "nama - ukuran")
  // - kolamSizeIndexUkuran: hanya ukuran (array "ukuran")
  const [kolamSizeIndex, setKolamSizeIndex] = useState({});
  const [kolamSizeIndexUkuran, setKolamSizeIndexUkuran] = useState({});
  // ✅ tambahan: daftar NAMA/KODE ukuran per kolam (contoh: ["LBG", "MBG"])
  const [kolamSizeIndexNama, setKolamSizeIndexNama] = useState({});
  // ✅ tambahan: daftar nama ikan per kolam tujuan
  const [kolamFishNames, setKolamFishNames] = useState({});

  // PH data
  const [phData, setPhData] = useState([]);
  // Temperature data
  const [tempData, setTempData] = useState([]);

  // tombol pompa
  const [pompaNyala, setPompaNyala] = useState(false);
  // tombol valve
  const [valveTerbuka, setValveTerbuka] = useState(false);
  // 🔥 TARUH DI SINI
  const sendControl = async (newPompa, newValve) => {
    try {
      await fetch(`${API_BASE}/kolam/control/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pompa: newPompa ? 1 : 0,
          valve: newValve ? 1 : 0,
        }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Form
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add_fish'); // "add_fish" | "pakan" | "vitamin" | "mortalitas" | "sortir" | "panen"
  const [formData, setFormData] = useState({
    ikan_id: '',
    populasi: '',
    beratRata: '',
    jumlahPakan: '',
    jumlahMati: '',
    feed_id: '',
    tanggal: '',
    waktu: '',
    keterangan: '',
    // tambahan panen
    panen_type: 'penuh',
    total_berat_kg: '',
    jumlah_ekor: '',
    harga_jual: '',
    penerima: '',
    // kirim vendor pembeli panen ke server
    vendor_id: '',
  });

  // EDIT dialog (pemberian_pakan)
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({
    id: null,
    jenis: 'pakan', // "pakan" | "vitamin" (untuk filter select)
    stok_pakan_id: '',
    jumlah_kg: '',
    tanggal: '',
    waktu: '',
    isi_kolam_id: null, // opsional
    // untuk hitung delta biomass:
    _old_jumlah_kg: 0,
    _old_jenis: 'pakan', // "pakan"/"vitamin"
  });

  // mode pemberian pakan
  // "manual" | "auto_3" | "auto_4" | "auto_5"
  const [feedingMode, setFeedingMode] = useState('manual');

  // Snackbar
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('error');

  const [showAllFeeding, setShowAllFeeding] = useState(false);
  const [showAllDeath, setShowAllDeath] = useState(false);

  const showAlert = (message, severity = 'error') => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
  };
  const handleAlertClose = () => setAlertOpen(false);

  // ✅ DEBUG SORTIR: didefinisikan DI DALAM komponen agar akses state/scope aman
  const debugSortir = (label, data = {}) => {
    try {
      console.groupCollapsed(`🧪 SORTIR DEBUG — ${label}`);
      console.log('Kolam ID:', id);
      console.log('Snapshot pond:', {
        pondTotalEkor,
        pondTotalKg,
        avgGramPerEkor,
      });
      console.log('Movements:', movements);
      console.log('Accumulated moved:', {
        movedTotalEkor,
        movedTotalKg,
        movedExpectedKg,
        movedSusutKg,
        movedSusutPct,
      });
      if (data.payload) console.log('Payload:', data.payload);
      if (data.response) console.log('Response:', data.response);
      if (data.extra) console.log('Extra:', data.extra);
      console.groupEnd();
    } catch (e) {
      console.warn('debugSortir error:', e);
    }
  };

  // ------------- Fetch / refresh -------------
  const refreshAllData = async () => {
    setLoading(true);
    await Promise.all([fetchKolam(), fetchFish(), fetchSensor(), fetchFeedingLogs(), fetchGrowthLogs(), fetchDeathLogs(), fetchMasterFish(), fetchFeeds(), fetchRefUkuran(), fetchVendors(), fetchAktivitas()]);
    setLoading(false);
  };

  const fetchAllKolams = async () => {
    try {
      const res = await fetch(`${API_BASE}/kolam`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal ambil daftar kolam');
      const data = await res.json();
      const targets = (data || []).filter((k) => Number(k.id) !== Number(id));
      setAllKolams(targets);

      // ✅ bangun index ukuran kolam tujuan (pakai /kolam/{id}/fish) + nama ikan + NAMA/KODE ukuran
      try {
        // map ref_id → {label, ukuran, name}
        const refMap = {};
        (refUkuran || []).forEach((u) => {
          const rid = Number(u.id);
          refMap[rid] = {
            label: composeSizeLabel(u.name, u.ukuran),
            ukuran: (u.ukuran ?? '').trim(),
            name: (u.name ?? '').trim(),
          };
        });

        const entries = await Promise.all(
          (targets || []).map(async (k) => {
            try {
              const r = await fetch(`${API_BASE}/kolam/${k.id}/fish`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!r.ok) throw new Error('fail');
              const fishes = await r.json();

              const labelSet = new Set();
              const sizeSet = new Set();
              const nameSet = new Set(); // ⬅️ nama/kode ukuran (mis. LBG)
              const fishNameSet = new Set(); // ⬅️ species

              (fishes || []).forEach((it) => {
                // kumpulkan nama ikan
                const species = it?.ikan?.species || it?.species;
                if (species) fishNameSet.add(String(species));

                // kumpulkan ukuran berdasarkan referensi
                const refId = Number(it.ref_ukuran_id || it.ikan?.ref_ukuran_id);
                if (refId && refMap[refId]) {
                  labelSet.add(refMap[refId].label);
                  sizeSet.add(refMap[refId].ukuran);
                  nameSet.add(refMap[refId].name);
                  return;
                }

                // fallback dari snapshot
                const snap = it.ukuran_ikan_snapshot || it.ikan?.size;
                if (!snap) return;

                // coba cocokkan ke referensi by label penuh
                const byLabel = (refUkuran || []).find((u) => composeSizeLabel(u.name, u.ukuran) === snap);
                if (byLabel) {
                  labelSet.add(composeSizeLabel(byLabel.name, byLabel.ukuran));
                  sizeSet.add((byLabel.ukuran ?? '').trim());
                  nameSet.add((byLabel.name ?? '').trim());
                  return;
                }

                // coba cocokkan by name saja
                const byName = (refUkuran || []).find((u) => (u.name ?? '').trim() === snap);
                if (byName) {
                  labelSet.add(composeSizeLabel(byName.name, byName.ukuran));
                  sizeSet.add((byName.ukuran ?? '').trim());
                  nameSet.add((byName.name ?? '').trim());
                  return;
                }

                // terakhir: ambil dari snapshot (pisahkan "nama - ukuran")
                labelSet.add(snap);
                sizeSet.add(extractUkuranOnly(snap));
                nameSet.add(extractNamaOnly(snap));
              });

              return [
                k.id,
                {
                  labels: Array.from(labelSet),
                  sizes: Array.from(sizeSet),
                  names: Array.from(nameSet),
                  fishNames: Array.from(fishNameSet),
                },
              ];
            } catch {
              return [k.id, { labels: [], sizes: [], names: [], fishNames: [] }];
            }
          }),
        );

        const idxLabel = {};
        const idxSizeOnly = {};
        const idxNameOnly = {};
        const idxFishNames = {};
        entries.forEach(([kid, obj]) => {
          idxLabel[kid] = obj.labels;
          idxSizeOnly[kid] = obj.sizes;
          idxNameOnly[kid] = obj.names;
          idxFishNames[kid] = obj.fishNames;
        });
        setKolamSizeIndex(idxLabel);
        setKolamSizeIndexUkuran(idxSizeOnly);
        setKolamSizeIndexNama(idxNameOnly); // ⬅️ simpan nama/kode ukuran
        setKolamFishNames(idxFishNames);
      } catch (e) {
        console.warn('Gagal bangun index ukuran kolam:', e);
        setKolamSizeIndex({});
        setKolamSizeIndexUkuran({});
        setKolamSizeIndexNama({});
        setKolamFishNames({});
      }
    } catch (err) {
      console.error(err);
      setAllKolams([]);
    }
  };

  const fetchKolam = async () => {
    try {
      const res = await fetch(`${API_BASE}/kolam/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch kolam');
      const data = await res.json();
      setKolam(data);
    } catch (err) {
      console.error(err);
      showAlert('Gagal mengambil data kolam.');
    }
  };

  // Ambil feeding logs — ONLY dari endpoint pemberian-pakan/{kolam_id}
  const fetchFeedingLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/pemberian-pakan/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch log pakan');

      const rows = await res.json();
      const mapped = (rows || []).map((log) => {
        const dt = log.created_at ? new Date(log.created_at) : null;
        const waktuFormatted = log.created_at ? formatWaktu(log.created_at) : '-';
        const typeRaw = (log.stok_pakan?.jenis || log.stok_pakan?.type || '').toLowerCase();
        const isVitamin = typeRaw === 'vitamin';

        return {
          id: log.id,
          waktu: waktuFormatted,
          nama: log.stok_pakan?.nama_pakan || log.stok_pakan?.name || '-',
          jenis: isVitamin ? 'Vitamin' : log.stok_pakan?.jenis || log.stok_pakan?.type || '-',
          jumlah: Number(log.jumlah_kg ?? 0),
          stok_pakan_id: log.stok_pakan?.id ?? log.stok_pakan_id,
          isi_kolam_id: log.isi_kolam?.id ?? log.isi_kolam_id ?? null,
          _type_raw: typeRaw || '-',
          _tanggal_raw: log.tanggal || null,
          _waktu_raw: log.waktu || null,
        };
      });

      setFeedingLogsRaw(rows || []);
      setFeedingLogs(mapped);
    } catch (err) {
      console.error(err);
      setFeedingLogsRaw([]);
      setFeedingLogs([]);
      showAlert('Gagal mengambil data log pakan/vitamin.');
    }
  };

  const fetchFish = async () => {
    try {
      const res = await fetch(`${API_BASE}/kolam/${id}/fish`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch ikan');
      const data = await res.json();

      const normalized = (data || []).map((it) => {
        const quantity = Number(it.quantity ?? it.jumlah_ekor ?? 0);
        const total_kg = Number(it.total_kg ?? it.ikan?.total_kg ?? 0);
        const feed_cost_accum = Number(it.feed_cost_accum ?? 0);
        const vitamin_cost_accum = Number(it.vitamin_cost_accum ?? 0);
        const feed_kg_accum = Number(it.feed_kg_accum ?? 0);
        const vitamin_kg_accum = Number(it.vitamin_kg_accum ?? 0);
        return {
          ...it,
          quantity,
          total_kg,
          feed_cost_accum,
          vitamin_cost_accum,
          feed_kg_accum,
          vitamin_kg_accum,
        };
      });

      setFish(normalized);

      console.groupCollapsed('🐟 FETCH FISH — normalized');
      console.table(
        normalized.slice(0, 10).map((f) => ({
          id: f.id,
          ikan_id: f.ikan_id,
          species: f?.ikan?.species || f?.species,
          quantity: Number(f.quantity ?? 0),
          total_kg: Number(f.total_kg ?? 0),
          feed_cost_accum: Number(f.feed_cost_accum ?? 0),
          vitamin_cost_accum: Number(f.vitamin_cost_accum ?? 0),
          feed_kg_accum: Number(f.feed_kg_accum ?? 0),
          vitamin_kg_accum: Number(f.vitamin_kg_accum ?? 0),
          ukuran_snapshot: f.ukuran_ikan_snapshot || f?.ikan?.size,
        })),
      );
      const _sumKg = normalized.reduce((s, f) => s + Number(f.total_kg || 0), 0);
      const _sumEkor = normalized.reduce((s, f) => s + Number(f.quantity || 0), 0);
      console.log('SUM total_kg:', _sumKg, 'SUM ekor:', _sumEkor);
      console.groupEnd();

      await fetchGrowthLogs();
    } catch (err) {
      console.error(err);
      setFish([]);
      setGrowthLogs([]);
      showAlert('Gagal mengambil data ikan.');
    }
  };

  const fetchDeathLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/fish_mortality/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch mortalitas');
      const data = await res.json();

      const mapped = data.map((log) => {
        const dtRaw = log.tanggal && log.waktu ? `${log.tanggal}T${log.waktu}` : log.tanggal;

        return {
          waktu: formatWaktu(dtRaw),
          jumlah: log.jumlah_mati,
          keterangan: log.keterangan || '-',
        };
      });

      setDeathLogs(mapped);
    } catch (err) {
      console.error(err);
      setDeathLogs([]);
      showAlert('Gagal mengambil log mortalitas.');
    }
  };

  const fetchSensor = async () => {
    const PH_MIN = 6.5;
    const PH_MAX = 8.5;

    const TEMP_MIN = 25;
    const TEMP_MAX = 32;
    try {
      const res = await fetch(`${API_BASE}/sensor/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Gagal fetch sensor');
      }

      const data = await res.json();
      console.log('SENSOR DATA:', data);

      setSensor(data);

      const sorted = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const latest = sorted[sorted.length - 1];

      const phDummy = sorted.map((s) => ({
        jam: new Date(s.created_at).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Jakarta',
        }),

        ph: Number(s.ph),
      }));

      const tempDummy = sorted.map((s) => ({
        jam: new Date(s.created_at).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Jakarta',
        }),
        suhu: Number(s.temperature),
      }));

      if (latest) {
        const ph = Number(latest.ph);
        const temp = Number(latest.temperature);

        let messages = [];

        if (ph < PH_MIN) {
          messages.push(`pH terlalu asam (${ph})`);
        } else if (ph > PH_MAX) {
          messages.push(`pH terlalu basa (${ph})`);
        }

        if (temp < TEMP_MIN) {
          messages.push(`Suhu terlalu rendah (${temp}°C)`);
        } else if (temp > TEMP_MAX) {
          messages.push(`Suhu terlalu tinggi (${temp}°C)`);
        }

        if (messages.length > 0) {
          const finalMessage = '⚠️ ' + messages.join(' | ');

          if (finalMessage !== lastAlert) {
            showAlert(finalMessage);
            setLastAlert(finalMessage);
          }
        } else {
          setLastAlert(null); // reset kalau normal
        }
      }

      setPhData(phDummy);
      setTempData(tempDummy); // 🔥 INI YANG KURANG TADI
    } catch (err) {
      console.error(err);
      setSensor([]);
      setPhData([]);
      setTempData([]); // 🔥 reset juga
      showAlert('Gagal mengambil data sensor.');
    }
  };

  const fetchControl = async () => {
    try {
      const res = await fetch(`${API_BASE}/kolam/control/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      setPompaNyala(data.pompa === 1);
      setValveTerbuka(data.valve === 1);
    } catch (err) {
      console.error(err);
    }
  };
  useEffect(() => {
    // pertama kali load
    fetchControl();

    // polling tiap 2 detik
    const interval = setInterval(() => {
      fetchControl();
    }, 2000);

    // cleanup
    return () => clearInterval(interval);
  }, [id]);

  const fetchMasterFish = async () => {
    try {
      const res = await fetch(`${API_BASE}/ikan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch master ikan');
      const data = await res.json();
      const normalized = (data || []).map((m) => ({
        ...m,
        total_kg: m.total_kg ?? m.avg_weight ?? null,
      }));
      setMasterFish(normalized || []);
    } catch (err) {
      console.error(err);
      setMasterFish([]);
      showAlert('Gagal mengambil data master ikan.');
    }
  };

  const fetchFeeds = async () => {
    try {
      const res = await fetch(`${API_BASE}/feed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch pakan');
      const data = await res.json();
      setFeeds(data || []);
    } catch (err) {
      console.error(err);
      setFeeds([]);
      showAlert('Gagal mengambil data pakan.');
    }
  };

  const fetchRefUkuran = async () => {
    try {
      const res = await fetch(`${API_BASE}/reference/ukuran-ikan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal fetch reference ukuran');
      const data = await res.json();
      setRefUkuran(data || []);
    } catch (err) {
      console.error(err);
      setRefUkuran([]);
    }
  };

  // Ambil master vendor dari beberapa kemungkinan endpoint
  const fetchVendors = async () => {
    const paths = [`${API_BASE}/reference/vendor`, `${API_BASE}/reference/vendors`, `${API_BASE}/vendor`, `${API_BASE}/vendors`, `${API_BASE}/ref/vendor`, `${API_BASE}/ref/vendors`];
    try {
      let data = [];
      let ok = false;
      for (const url of paths) {
        try {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) {
            data = await r.json();
            ok = true;
            break;
          }
        } catch (_) {}
      }
      if (!ok) throw new Error('Gagal fetch Business Partner');
      // Normalisasi minimal: {id, name}
      const normalized = (data || [])
        .map((v) => ({
          id: v.id ?? v.vendor_id ?? v.value ?? v.key,
          name: v.name ?? v.nama ?? v.label ?? `Vendor #${v.id ?? ''}`,
        }))
        .filter((v) => v.id);
      setVendorsRef(normalized);
    } catch (err) {
      console.error(err);
      setVendorsRef([]);
      // Tidak showAlert agar tidak ganggu layar utama. Validasi dilakukan saat submit panen.
    }
  };

  const fetchGrowthLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/growth_log/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Gagal fetch data biomassa ikan');

      const data = await res.json();

      const chartData = data.map((log) => ({
        tanggal: new Date(log.tanggal).toLocaleString(),
        total_kg: log.total_kg ?? null,
      }));

      const cleaned = chartData.filter((x) => typeof x.total_kg === 'number');

      if (cleaned.length === 0) {
        const nowTotalKg = fish.reduce((s, f) => s + Number(f.total_kg || 0), 0);
        setGrowthLogs([{ tanggal: new Date().toLocaleString(), total_kg: nowTotalKg }]);
      } else {
        setGrowthLogs(cleaned);
      }
    } catch (err) {
      console.error(err);
    }
  };
  // 🔹 Ambil aktivitas kolam (termasuk sortir, add fish, panen, dll)
  const fetchAktivitas = async () => {
    const paths = [`${API_BASE}/aktivitas/kolam/${id}`, `${API_BASE}/aktivitas/${id}`, `${API_BASE}/aktivitas?kolam_id=${id}`, `${API_BASE}/activity/kolam/${id}`, `${API_BASE}/activity/${id}`, `${API_BASE}/activity?kolam_id=${id}`];
    try {
      let ok = false;
      let data = [];
      for (const url of paths) {
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            data = await res.json();
            ok = true;
            break;
          }
        } catch (_) {}
      }
      if (!ok) throw new Error('Gagal fetch aktivitas kolam');

      const mapped = (data || []).map((a, idx) => {
        const dtRaw = a.waktu || a.created_at || a.tanggal || a.timestamp || null;

        const d = dtRaw ? new Date(dtRaw) : null;

        const waktuFormatted = d
          ? d
              .toLocaleString('id-ID', {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit', // ✅ INI KUNCINYA
                hour12: false,
              })
              .replace(/:/g, '.') // 🔥 biar jadi 09.07.06
          : '-';

        const meta = a.meta || a.metadata || {};

        return {
          id: a.id ?? idx,
          waktu: waktuFormatted, // ✅ fix disini
          tanggal: '-', // opsional, bisa dihapus sekalian
          jenis: a.jenis || a.type || '-',
          aksi: a.aksi || a.action || '-',
          deskripsi: a.deskripsi || a.description || '-',
          qty_ekor: a.qty_ekor ?? null,
          berat_kg: a.berat_kg ?? a.amount_kg ?? null,
          meta,
          created_at_raw: a.created_at || null,
          waktu_raw: a.waktu || null,
        };
      });

      setActivities(mapped);
    } catch (err) {
      console.error(err);
      setActivities([]);
      // sengaja tidak showAlert biar tidak spam
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchKolam(), fetchFish(), fetchSensor(), fetchMasterFish(), fetchFeeds(), fetchFeedingLogs(), fetchGrowthLogs(), fetchDeathLogs(), fetchRefUkuran(), fetchVendors(), fetchAktivitas()]);
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSensor(); // ✅ cuma ini
    }, 5000);

    return () => clearInterval(interval);
  }, [id]);

  // Helper: persen dari mode
  const percentFromMode = (mode) => {
    if (mode === 'auto_3') return 0.03;
    if (mode === 'auto_4') return 0.04;
    if (mode === 'auto_5') return 0.05;
    return null; // manual
  };

  // Saat form pakan terbuka & mode auto, hitung jumlah = x% biomassa
  useEffect(() => {
    if (!formOpen || formMode !== 'pakan') return;
    const perc = percentFromMode(feedingMode);
    if (perc) {
      const totalKg = fish.reduce((s, f) => s + Number(f.total_kg || 0), 0);
      const autoAmount = Number((totalKg * perc).toFixed(3));
      setFormData((prev) => ({ ...prev, jumlahPakan: autoAmount }));
    }
  }, [feedingMode, fish, formOpen, formMode]);

  // ---------------- Helpers sortir: valid targets per-row ----------------
  // id → label "nama - ukuran"
  const ukuranLabelById = useMemo(() => {
    const m = {};
    (refUkuran || []).forEach((u) => {
      m[Number(u.id)] = composeSizeLabel(u.name, u.ukuran);
    });
    return m;
  }, [refUkuran]);
  // id → hanya ukuran
  const ukuranOnlyById = useMemo(() => {
    const m = {};
    (refUkuran || []).forEach((u) => {
      m[Number(u.id)] = (u.ukuran ?? '').trim();
    });
    return m;
  }, [refUkuran]);
  // id → NAMA/KODE ukuran (contoh: "LBG")
  const ukuranNameById = useMemo(() => {
    const m = {};
    (refUkuran || []).forEach((u) => {
      m[Number(u.id)] = (u.name ?? '').trim();
    });
    return m;
  }, [refUkuran]);

  const getAllowedTargetsForRow = (row) => {
    if (!row?.ref_ukuran_id) return [];
    const sizeName = ukuranNameById[Number(row.ref_ukuran_id)]; // contoh "LBG"
    if (!sizeName) return [];
    return (allKolams || []).filter((k) => {
      const nameOnly = kolamSizeIndexNama[k.id] || []; // kumpulan ["LBG", ...]
      const isKosong = k.status === 'Kosong' || nameOnly.length === 0;
      const isMatch = nameOnly.includes(sizeName);
      return isKosong || isMatch;
    });
  };

  // ---------------- Progress dari tanggal_masuk paling awal ----------------
  const earliestTanggalMasuk = useMemo(() => {
    if (!fish || fish.length === 0) return null;
    const validDates = fish
      .map((f) => f.tanggal_masuk)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d));
    if (validDates.length === 0) return null;
    return new Date(Math.min(...validDates.map((d) => d.getTime())));
  }, [fish]);

  const daysPassed = useMemo(() => {
    if (!earliestTanggalMasuk) return 0;
    const now = new Date();
    const diff = now.getTime() - earliestTanggalMasuk.getTime();
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(d, PANEN_TARGET_HARI));
  }, [earliestTanggalMasuk]);

  const progressPct = useMemo(() => {
    return Math.round(Math.min(100, (daysPassed / PANEN_TARGET_HARI) * 100));
  }, [daysPassed]);

  // ---------------- Form handlers ----------------
  const handleFormOpen = (mode) => {
    if (mode === 'add_fish' && masterFish.length === 0) {
      showAlert('Tidak ada stock ikan. Silakan tambahkan stock dulu.');
      return;
    }
    if ((mode === 'pakan' || mode === 'vitamin') && feeds.length === 0) {
      showAlert('Tidak ada stok pakan/vitamin. Silakan tambahkan terlebih dahulu.');
      return;
    }
    if (mode === 'panen') {
      fetchAllKolams();
      fetchVendors();
      setMovements([]);
      setFormData((prev) => ({ ...prev, panen_type: 'penuh', total_berat_kg: '', jumlah_ekor: '', harga_jual: '', vendor_id: '' }));
    }
    if (mode === 'sortir') {
      fetchAllKolams();
      setMovements([]);
      setFormData((prev) => ({ ...prev, total_berat_kg: '', jumlah_ekor: '', keterangan: '', tanggal: '' }));
    }
    if (mode === 'pakan') {
      setFormData((p) => ({
        ...p,
        tanggal: p.tanggal || new Date().toISOString().slice(0, 10),
        waktu: p.waktu || new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
      }));
    }
    if (mode === 'vitamin') {
      setFormData((p) => ({
        ...p,
        tanggal: p.tanggal || new Date().toISOString().slice(0, 10),
        waktu: p.waktu || new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
      }));
    }
    setFormMode(mode);
    setFormOpen(true);
  };

  const addMovement = () => {
    setMovements((prev) => [...prev, { to_kolam_id: '', jumlah_ekor: '', berat_kg: '', ref_ukuran_id: '' }]);
  };

  const updateMovement = (index, key, value) => {
    setMovements((prev) => {
      const copy = [...prev];
      const nextRow = { ...copy[index], [key]: value };

      // ✅ Jika ukuran berubah, validasi kolam tujuan (harus kosong / NAMA ukuran sama)
      if (key === 'ref_ukuran_id' && nextRow.to_kolam_id) {
        const sizeName = ukuranNameById[Number(value)];
        const allowedNames = kolamSizeIndexNama[nextRow.to_kolam_id] || [];
        const targetKolam = allKolams.find((k) => k.id === nextRow.to_kolam_id);
        const isKosong = targetKolam?.status === 'Kosong' || allowedNames.length === 0;
        const isMatch = sizeName && allowedNames.includes(sizeName);
        if (!(isKosong || isMatch)) {
          nextRow.to_kolam_id = '';
        }
      }

      copy[index] = nextRow;
      return copy;
    });
  };

  const removeMovement = (index) => {
    setMovements((prev) => prev.filter((_, i) => i !== index));
  };

  // ======== Snapshot kolam & rasio (dipakai ringkasan sortir/panen) ========
  const pondTotalKg = fish.reduce((s, f) => s + Number(f.total_kg || 0), 0);
  const pondTotalEkor = fish.reduce((s, f) => s + Number(f.quantity ?? f.jumlah_ekor ?? 0), 0);
  const avgGramPerEkor = pondTotalEkor > 0 ? (pondTotalKg * 1000) / pondTotalEkor : 0;

  // Totals yang DIPINDAH (dari input user per-baris sortir)
  const movedTotalEkor = movements.reduce((s, m) => s + Number(m.jumlah_ekor || 0), 0);
  const movedTotalKg = movements.reduce((s, m) => s + Number(m.berat_kg || 0), 0);

  // Ekspektasi kg untuk ikan yang dipindah (pakai rasio kolam saat ini)
  const movedExpectedKg = (avgGramPerEkor / 1000) * movedTotalEkor;
  const movedSusutKg = Number((movedExpectedKg - movedTotalKg).toFixed(3));
  const movedSusutPct = movedExpectedKg > 0 ? Number(((movedSusutKg / movedExpectedKg) * 100).toFixed(2)) : 0;

  const expectedTotals = { expectedKg: pondTotalKg, expectedEkor: pondTotalEkor };

  // ⬇️ Ekspektasi subset (untuk panen parsial) berdasarkan jumlah ekor yang diinput
  const expectedSubsetKg = useMemo(() => {
    const ekor = Number(formData.jumlah_ekor || 0);
    if (!ekor || avgGramPerEkor <= 0) return 0;
    return Number(((avgGramPerEkor / 1000) * ekor).toFixed(3));
  }, [formData.jumlah_ekor, avgGramPerEkor]);

  const handleFormSubmit = async () => {
    if (!kolam) return;
    try {
      if (formMode === 'add_fish') {
        const ikanId = Number(formData.ikan_id);
        const qty = Number(formData.populasi);

        if (!ikanId) {
          showAlert('Pilih ikan terlebih dulu.');
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          showAlert('Jumlah ekor harus > 0.');
          return;
        }

        const payload = {
          ikan_id: ikanId,
          jumlah_ekor: qty,
          total_berat_kg: Number(formData.total_berat_kg || 0),
        };

        console.log('🚀 KIRIM REQUEST KE:', `${API_BASE}/kolam/${id}/add_fish`);

        const res = await fetch(`${API_BASE}/kolam/${id}/add_fish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          const txt = await res.text();
          if (!res.ok) throw new Error(txt || 'Gagal tambah ikan');
        }
        if (!res.ok) {
          const detail = data?.detail || 'Gagal tambah ikan';
          throw new Error(detail);
        }

        const newFish = data;

        // 🔹 log lokal (masih disimpan, tapi TAMPILAN ambil dari aktivitas)
        setAddFishLogs((prev) => [
          {
            action: 'Tambah Ikan',
            detail: `${newFish?.ikan?.species || newFish?.species || 'Ikan'} x${newFish?.jumlah_ekor ?? qty} ekor`,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ]);

        await fetchKolam();
        await fetchFish();
        await fetchMasterFish();
        await fetchDeathLogs();
        await fetchAktivitas(); // ⬅️ supaya log ADD_FISH dari tabel aktivitas langsung muncul

        setFormOpen(false);
        setFormData({
          ikan_id: '',
          populasi: '',
          beratRata: '',
          jumlahPakan: '',
          jumlahMati: '',
          feed_id: '',
          total_berat_kg: '',
          tanggal: '',
          waktu: '',
          keterangan: '',
        });
        showAlert('Berhasil menambahkan ikan!', 'success');
        return;
      }

      // ===== PAKAN (menambah biomassa) =====
      if (formMode === 'pakan') {
        const feedId = Number(formData.feed_id);
        const selected = feeds.find((f) => Number(f.id) === feedId);
        if (!feedId || !selected) {
          showAlert('Pilih pakan terlebih dulu.');
          return;
        }
        if ((selected.type || '').toLowerCase() === 'vitamin') {
          showAlert("Ini vitamin. Silakan pakai tombol 'Tambah Vitamin'.");
          return;
        }

        const totalKgNow = fish.reduce((s, f) => s + Number(f.total_kg || 0), 0);
        const perc = percentFromMode(feedingMode);
        const amount = perc ? Number((totalKgNow * perc).toFixed(3)) : Number(parseFloat(formData.jumlahPakan));

        if (!Number.isFinite(amount) || amount <= 0) {
          showAlert('Jumlah pakan harus > 0.');
          return;
        }

        const waktuStr = toHHmmss(formData.waktu) || new Date().toLocaleTimeString('en-GB', { hour12: false });

        const payload = {
          kolam_id: Number(id),
          stok_pakan_id: feedId,
          jumlah_kg: amount,
          isi_kolam_id: null,
          tanggal: formData.tanggal || new Date().toISOString().slice(0, 10),
          waktu: waktuStr,
        };

        const res = await fetch(`${API_BASE}/pemberian-pakan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || 'Gagal menambahkan pakan');
        }

        // Tambah biomassa kolam
        const res2 = await fetch(`${API_BASE}/kolam/${id}/tambah_berat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tambahan_kg: amount }),
        });
        if (!res2.ok) {
          const txt = await res2.text();
          throw new Error(txt || 'Gagal menambah biomassa kolam.');
        }

        await fetchKolam();
        await fetchFish();
        await fetchFeedingLogs();
        await fetchGrowthLogs();
        await fetchFeeds();
        await fetchAktivitas();

        setFormOpen(false);
        setFormData({
          ikan_id: '',
          populasi: '',
          beratRata: '',
          jumlahPakan: '',
          jumlahMati: '',
          feed_id: '',
          tanggal: '',
          waktu: '',
          keterangan: '',
        });
        setFeedingMode('manual');
        showAlert('Pakan berhasil diberikan & berat ikan bertambah!', 'success');
        return;
      }

      // ===== VITAMIN (tidak menambah biomassa) =====
      if (formMode === 'vitamin') {
        const feedId = Number(formData.feed_id);
        const selected = feeds.find((f) => Number(f.id) === feedId);
        if (!feedId || !selected) {
          showAlert('Pilih vitamin terlebih dulu.');
          return;
        }
        if ((selected.type || '').toLowerCase() !== 'vitamin') {
          showAlert("Item terpilih bukan vitamin. Pilih yang bertipe 'vitamin'.");
          return;
        }
        const amount = Number(parseFloat(formData.jumlahPakan));
        if (!Number.isFinite(amount) || amount <= 0) {
          showAlert('Jumlah vitamin harus > 0.');
          return;
        }

        const waktuStr = toHHmmss(formData.waktu) || new Date().toLocaleTimeString('en-GB', { hour12: false });

        const payload = {
          kolam_id: Number(id),
          stok_pakan_id: feedId,
          jumlah_kg: amount,
          isi_kolam_id: null,
          tanggal: formData.tanggal || new Date().toISOString().slice(0, 10),
          waktu: waktuStr,
        };

        const res = await fetch(`${API_BASE}/pemberian-pakan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Gagal menambahkan vitamin');

        await fetchFeedingLogs();
        await fetchFish();
        await fetchFeeds();
        await fetchAktivitas();

        setFormOpen(false);
        setFormData({ ...formData, feed_id: '', jumlahPakan: '' });
        showAlert('Vitamin berhasil diberikan (tanpa menambah berat)!', 'success');
        return;
      }

      if (formMode === 'mortalitas') {
        const payload = {
          kolam_id: Number(id),
          jumlah_mati: parseInt(formData.jumlahMati || 0, 10),
          tanggal: formData.tanggal || new Date().toISOString().split('T')[0],
          waktu: formData.waktu || new Date().toLocaleTimeString('en-GB', { hour12: false }),
          keterangan: formData.keterangan,
        };

        if (!payload.jumlah_mati || payload.jumlah_mati <= 0) {
          showAlert('Jumlah mati harus > 0');
          return;
        }

        const res = await fetch(`${API_BASE}/mortality`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Gagal catat mortalitas');

        setDeathLogs((prev) => [
          {
            tanggal: payload.tanggal,
            waktu: payload.waktu,
            jumlah: payload.jumlah_mati,
            keterangan: payload.keterangan || '-',
          },
          ...prev,
        ]);

        await fetchDeathLogs();
        await fetchKolam();
        await fetchFish();
        await fetchAktivitas();

        setFormOpen(false);
        setFormData({ ikan_id: '', populasi: '', beratRata: '', jumlahPakan: '', jumlahMati: '', feed_id: '', tanggal: '', waktu: '', keterangan: '' });
        showAlert('Berhasil mencatat mortalitas!', 'success');
        return;
      }

      // ===== Sortir =====
      if (formMode === 'sortir') {
        if (movements.length === 0) {
          showAlert('Tambahkan minimal satu tujuan sortir.');
          return;
        }

        debugSortir('pre-validate');

        // akumulasi untuk mencegah habis karena beberapa baris
        let accEkor = 0,
          accKg = 0;

        for (let i = 0; i < movements.length; i++) {
          const m = movements[i];
          if (!Number(m.ref_ukuran_id)) return showAlert(`Pilih ukuran di baris ${i + 1}.`);
          if (!Number(m.to_kolam_id)) return showAlert(`Pilih kolam tujuan di baris ${i + 1}.`);
          if (!(Number(m.jumlah_ekor) > 0)) return showAlert(`Isi jumlah ekor > 0 di baris ${i + 1}.`);
          if (!(Number(m.berat_kg) > 0)) return showAlert(`Isi berat (kg) > 0 di baris ${i + 1}.`);

          // validasi per baris (kolam kosong / NAMA ukuran sama)
          const sizeName = ukuranNameById[Number(m.ref_ukuran_id)];
          const namesOnly = kolamSizeIndexNama[m.to_kolam_id] || [];
          const targetKolam = allKolams.find((k) => k.id === m.to_kolam_id);
          const isKosong = targetKolam?.status === 'Kosong' || namesOnly.length === 0;
          const isMatch = sizeName && namesOnly.includes(sizeName);
          if (!(isKosong || isMatch)) {
            return showAlert(`Kolam tujuan di baris ${i + 1} harus kosong atau berukuran '${sizeName}'.`);
          }

          // akumulasi agar tidak menghabiskan kolam
          accEkor += Number(m.jumlah_ekor || 0);
          accKg += Number(m.berat_kg || 0);

          console.log(`[row ${i + 1}] accEkor=${accEkor}, accKg=${accKg.toFixed(3)} / totalEkor=${pondTotalEkor}, totalKg=${pondTotalKg.toFixed(3)}`);

          if (accEkor >= pondTotalEkor) {
            return showAlert(`Baris ${i + 1}: total ekor terakumulasi (${accEkor}) menghabiskan isi kolam (${pondTotalEkor}). ` + `Gunakan Panen Penuh jika ingin mengosongkan kolam.`);
          }
        }

        // cek global juga
        if (movedTotalEkor >= pondTotalEkor) {
          showAlert(`Sortir tidak boleh memindahkan semua ekor (${movedTotalEkor} dari ${pondTotalEkor}). ` + `Kalau mau habis, gunakan "Panen Penuh".`);
          debugSortir('blocked-by-client-guard', { extra: { reason: 'all-ekor' } });
          return;
        }

        const payload = {
          tanggal: formData.tanggal || new Date().toISOString().split('T')[0],
          keterangan: formData.keterangan || '',
          movements: movements.map((m) => ({
            to_kolam_id: Number(m.to_kolam_id),
            jumlah_ekor: Number(m.jumlah_ekor),
            berat_kg: Number(m.berat_kg),
            ref_ukuran_id: Number(m.ref_ukuran_id),
          })),
          moved: {
            total_ekor: movedTotalEkor,
            total_kg: Number(movedTotalKg.toFixed(3)),
          },
          pond_snapshot: {
            total_ekor: pondTotalEkor,
            total_kg: Number(pondTotalKg.toFixed(3)),
            avg_gram_per_ekor: Number(avgGramPerEkor.toFixed(2)),
          },
          shrinkage: {
            basis: 'ratio_kolam',
            expected_kg: Number(movedExpectedKg.toFixed(3)),
            actual_kg: Number(movedTotalKg.toFixed(3)),
            susut_kg: movedSusutKg,
            susut_percent: movedSusutPct,
          },
        };

        debugSortir('about-to-fetch', { payload });

        const res = await fetch(`${API_BASE}/kolam/${id}/sortir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

        let respText = null;
        try {
          respText = await res.clone().text();
        } catch {}

        debugSortir('after-fetch', {
          response: {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            body: respText,
          },
        });

        if (!res.ok) {
          throw new Error(respText || 'Gagal sortir ikan');
        }

        await Promise.all([fetchKolam(), fetchFish(), fetchFeedingLogs(), fetchGrowthLogs(), fetchAktivitas()]);
        await fetchAllKolams();
        setFormOpen(false);
        setMovements([]);
        setFormData((prev) => ({ ...prev, total_berat_kg: '', jumlah_ekor: '', keterangan: '' }));
        showAlert('Sortir berhasil! Susut & biaya ikut terbagi proporsional.', 'success');
        return;
      }

      // ===== Panen (penuh / parsial) =====
      if (formMode === 'panen') {
        const type = formData.panen_type; // "penuh" | "parsial"
        const actualKg = Number(formData.total_berat_kg || 0);
        const actualEkorInput = Number(formData.jumlah_ekor || 0);
        const selectedVendorId = Number(formData.vendor_id || 0);

        if (!Number.isFinite(actualKg) || actualKg <= 0) {
          showAlert('Isi berat aktual panen (kg) dengan benar.');
          return;
        }
        if (!Number.isFinite(Number(formData.harga_jual)) || Number(formData.harga_jual) <= 0) {
          showAlert('Harga jual per kg wajib diisi (> 0).');
          return;
        }
        if (!selectedVendorId) {
          showAlert('Pilih Business Partner pembeli panen terlebih dahulu.');
          return;
        }

        if (type === 'parsial') {
          if (!Number.isFinite(actualEkorInput) || actualEkorInput <= 0) {
            showAlert('Jumlah ekor wajib diisi untuk panen parsial dan harus > 0.');
            return;
          }
          if (actualKg >= pondTotalKg) {
            showAlert('Panen parsial tidak boleh sama atau melebihi total biomassa kolam.');
            return;
          }
          if (actualEkorInput >= pondTotalEkor) {
            showAlert('Panen parsial tidak boleh menghabiskan semua ekor di kolam.');
            return;
          }
        }

        const expectedForFull = expectedTotals.expectedKg;
        const expectedForPartial = expectedSubsetKg;
        const expected = type === 'penuh' ? expectedForFull : expectedForPartial;

        const susutKg = Number((expected - actualKg).toFixed(3));
        const susutPct = expected > 0 ? Number(((susutKg / expected) * 100).toFixed(2)) : 0;

        const jumlahEkorForPayload = type === 'penuh' ? null : actualEkorInput;

        const payload = {
          kolam_id: Number(id),
          tipe_panen: type,
          total_berat_kg: actualKg,
          harga_jual: Number(formData.harga_jual),
          tanggal: formData.tanggal || new Date().toISOString().split('T')[0],
          expected_kg: Number((expected || 0).toFixed(3)),
          susut_kg: susutKg,
          susut_percent: susutPct,
          vendor_id: selectedVendorId,
        };
        if (jumlahEkorForPayload) payload.jumlah_ekor = jumlahEkorForPayload;

        const res = await fetch(`${API_BASE}/kolam/panen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || 'Gagal mencatat panen');
        }

        await Promise.all([fetchKolam(), fetchFish(), fetchFeedingLogs(), fetchGrowthLogs(), fetchAktivitas()]);
        await fetchAllKolams();
        setFormOpen(false);
        setFormData((prev) => ({ ...prev, total_berat_kg: '', jumlah_ekor: '', harga_jual: '', keterangan: '', vendor_id: '' }));
        showAlert(type === 'penuh' ? 'Panen penuh berhasil dicatat.' : 'Panen parsial berhasil dicatat.', 'success');
        console.log('>> PANEN payload:', payload);
        return;
      }
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Gagal submit form.');
    }
  };

  // ------------------ EDIT pemberian_pakan ------------------
  const openEditFeeding = (row) => {
    const jenis = row._type_raw === 'vitamin' ? 'vitamin' : 'pakan';
    setEditData({
      id: row.id,
      jenis,
      stok_pakan_id: row.stok_pakan_id || '',
      jumlah_kg: row.jumlah || '',
      tanggal: row._tanggal_raw ? String(row._tanggal_raw) : new Date().toISOString().slice(0, 10),
      waktu: toHHmm(row._waktu_raw) || '',
      isi_kolam_id: row.isi_kolam_id ?? null,
      _old_jumlah_kg: row.jumlah || 0,
      _old_jenis: jenis,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    try {
      if (!editData.id) {
        showAlert('ID pemberian pakan tidak valid.');
        return;
      }
      if (!editData.stok_pakan_id) {
        showAlert('Pilih stok pakan/vitamin.');
        return;
      }
      const newJumlah = Number(editData.jumlah_kg || 0);
      if (!Number.isFinite(newJumlah) || newJumlah <= 0) {
        showAlert('Jumlah (kg) harus > 0.');
        return;
      }

      const picked = feeds.find((f) => Number(f.id) === Number(editData.stok_pakan_id));
      const newJenis = (picked?.type || '').toLowerCase() === 'vitamin' ? 'vitamin' : 'pakan';

      const body = {
        stok_pakan_id: Number(editData.stok_pakan_id),
        jumlah_kg: newJumlah,
        tanggal: editData.tanggal || new Date().toISOString().slice(0, 10),
        waktu: toHHmmss(editData.waktu) || null,
        isi_kolam_id: editData.isi_kolam_id ?? null,
      };

      const res = await fetch(`${API_BASE}/pemberian-pakan/${editData.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Gagal mengubah pemberian pakan/vitamin');
      }

      let deltaKg = 0;
      if (editData._old_jenis === 'pakan' && newJenis === 'pakan') {
        deltaKg = newJumlah - Number(editData._old_jumlah_kg || 0);
      } else if (editData._old_jenis === 'pakan' && newJenis === 'vitamin') {
        deltaKg = -Number(editData._old_jumlah_kg || 0);
      } else if (editData._old_jenis === 'vitamin' && newJenis === 'pakan') {
        deltaKg = newJumlah;
      } else {
        deltaKg = 0;
      }

      if (deltaKg !== 0) {
        const res2 = await fetch(`${API_BASE}/kolam/${id}/tambah_berat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tambahan_kg: Number(deltaKg.toFixed(3)) }),
        });
        if (!res2.ok) {
          const txt = await res2.text();
          console.warn('Gagal update biomassa kolam:', txt);
        }
      }

      await fetchKolam();
      await fetchFish();
      await fetchFeedingLogs();
      await fetchGrowthLogs();
      await fetchFeeds();
      await fetchAktivitas();

      setEditOpen(false);
      showAlert('Pemberian berhasil diubah.', 'success');
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Gagal mengubah pemberian pakan/vitamin.');
    }
  };

  // ------------------ Perhitungan aset & penggunaan ------------------
  const pondFishAsset = fish.reduce((sum, f) => {
    const qty = Number(f.quantity || 0);
    const totalKg = Number(f.total_kg || 0);
    const hargaKg = Number(f.harga_per_kg_snapshot ?? 0);
    const hargaUnit = Number(f.harga_per_unit_snapshot ?? 0);

    let aset = 0;
    if (hargaKg > 0 && totalKg > 0) {
      aset = hargaKg * totalKg;
    } else if (hargaUnit > 0) {
      aset = hargaUnit * qty;
    }

    return sum + aset;
  }, 0);

  const batchCost = fish.reduce(
    (acc, f) => {
      acc.feed += Number(f.feed_cost_accum || 0);
      acc.vitamin += Number(f.vitamin_cost_accum || 0);
      return acc;
    },
    { feed: 0, vitamin: 0 },
  );

  const feedQtySummary = useMemo(
    () => ({
      feedKg: fish.reduce((s, f) => s + Number(f.feed_kg_accum || 0), 0),
      vitaminKg: fish.reduce((s, f) => s + Number(f.vitamin_kg_accum || 0), 0),
    }),
    [fish],
  );

  // 🔹 Riwayat sortir saja (filter dari aktivitas)
  const sortirActivities = useMemo(
    () =>
      (activities || []).filter((a) => {
        const jenis = (a.jenis || '').toLowerCase();
        const aksi = (a.aksi || '').toLowerCase();
        return jenis === 'sortir' || aksi.includes('sortir');
      }),
    [activities],
  );

  // 🔹 Log tambah ikan dari tabel aktivitas (jenis/aksi terkait ikan)
  const addFishActivities = useMemo(
    () =>
      (activities || []).filter((a) => {
        const jenis = (a.jenis || '').toLowerCase();
        const aksi = (a.aksi || '').toLowerCase();
        return jenis === 'ikan' || jenis === 'add_fish' || aksi.includes('tambah ikan') || aksi.includes('add_fish');
      }),
    [activities],
  );

  const uniqueVendors = Array.from(new Set((fish || []).map((f) => f.vendor_name_snapshot || f.ikan?.vendor?.name).filter(Boolean)));
  const uniqueSizes = Array.from(new Set((fish || []).map((f) => f.ukuran_ikan_snapshot || f.ikan?.size).filter(Boolean)));
  const uniqueSpecies = Array.from(new Set((fish || []).map((f) => f.ikan?.species || f.species).filter(Boolean)));

  const pakanList = (feeds || []).filter((f) => (f.type || '').toLowerCase() !== 'vitamin');
  const vitaminList = (feeds || []).filter((f) => (f.type || '').toLowerCase() === 'vitamin');

  return (
    <Layout>
      <Box mb={2}>
        <Typography variant="h5" fontWeight="bold">
          Detail {kolam?.name}
        </Typography>
      </Box>

      {!kolam || kolam.status === 'Kosong' ? (
        <Paper sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 3, minHeight: 300 }}>
          <img src={empty} alt="Kolam Kosong" style={{ width: 150, marginBottom: 16 }} />
          <Typography variant="body1" mb={2}>
            Kolam ini masih kosong.
          </Typography>
          <Button variant="contained" onClick={() => handleFormOpen('add_fish')}>
            Tambah Ikan
          </Button>
        </Paper>
      ) : (
        <>
          {/* Info Kolam + asset summary */}
          <Card sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
            <CardContent>
              <Grid container alignItems="flex-start" spacing={3} justifyContent="space-between">
                {/* Informasi Kolam di kiri */}
                <Grid item xs={12} md={7}>
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="h6" gutterBottom>
                      Informasi Kolam
                    </Typography>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      {uniqueSpecies.length > 0 && uniqueSpecies.map((s) => <Chip key={s} label={`Ikan: ${s}`} size="small" variant="outlined" />)}
                      {uniqueSizes.length > 0 && uniqueSizes.map((s) => <Chip key={s} label={`Ukuran: ${s}`} size="small" variant="outlined" />)}
                      {uniqueVendors.length > 0 && uniqueVendors.map((v) => <Chip key={v} label={`Business Partner: ${v}`} size="small" variant="outlined" />)}
                      <Chip label={`Status: ${kolam?.status ?? '-'}`} size="small" color="primary" variant="filled" />
                    </Box>

                    <Grid container spacing={2} sx={{ mb: 1 }}>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          Jumlah Ekor
                        </Typography>
                        <Typography variant="h6">{pondTotalEkor.toLocaleString('id-ID')} ekor</Typography>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          Total Berat
                        </Typography>
                        <Typography variant="h6">{formatKg(pondTotalKg)}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          Tanggal Masuk Pertama
                        </Typography>
                        <Typography variant="h6">{earliestTanggalMasuk ? earliestTanggalMasuk.toLocaleDateString() : '-'}</Typography>
                      </Grid>
                    </Grid>

                    <Box mt={1}>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        Progress Pemeliharaan: {daysPassed} / {PANEN_TARGET_HARI} hari ({progressPct}%)
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        sx={{
                          height: 10,
                          borderRadius: 5,
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 5,
                          },
                        }}
                      />
                    </Box>

                    <Box mt={2} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Button variant="outlined" color="info" onClick={() => handleFormOpen('add_fish')} sx={{ mr: { md: 1 } }}>
                        Tambah Ikan
                      </Button>
                      <Button variant="outlined" onClick={() => handleFormOpen('pakan')} sx={{ mr: { md: 1 } }}>
                        Tambah Pakan
                      </Button>
                      <Button variant="outlined" color="warning" onClick={() => handleFormOpen('vitamin')} sx={{ mr: { md: 1 } }}>
                        Tambah Vitamin
                      </Button>
                      <Button variant="outlined" onClick={() => handleFormOpen('mortalitas')} sx={{ mr: { md: 1 } }}>
                        Catat Mortalitas
                      </Button>
                      <Button variant="outlined" color="secondary" onClick={() => handleFormOpen('sortir')} sx={{ mr: { md: 1 } }}>
                        Sortir
                      </Button>
                      <Button variant="contained" color="success" onClick={() => handleFormOpen('panen')}>
                        Panen
                      </Button>
                    </Box>
                    {/* Tombol Kontrol Aktuator Monitoring 
                    <Box mt={3}>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Kontrol Monitoring
                      </Typography>

                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Button
                          variant="contained"
                          color={pompaNyala ? 'success' : 'error'}
                          onClick={() => {
                            const newState = !pompaNyala;
                            setPompaNyala(newState);
                            sendControl(newState, valveTerbuka);
                          }}
                        >
                          {pompaNyala ? 'Pompa Nyala' : 'Pompa Mati'}
                        </Button>

                        <Button
                          variant="contained"
                          color={valveTerbuka ? 'success' : 'error'}
                          onClick={() => {
                            const newState = !valveTerbuka;
                            setValveTerbuka(newState);
                            sendControl(pompaNyala, newState);
                          }}
                        >
                          {valveTerbuka ? 'Valve Terbuka' : 'Valve Tertutup'}
                        </Button>
                      </Box>
                    </Box>
                    */}
                  </Box>
                </Grid>

                {/* Ringkasan finansial / aset di kanan */}
                <Grid item xs={12} md={5} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                    <Typography variant="subtitle2" color="textSecondary">
                      Ringkasan Aset
                    </Typography>

                    <Typography variant="h6" fontWeight="bold">
                      Total Aset di Kolam
                    </Typography>
                    <Typography variant="h5" fontWeight="bold" color="primary">
                      {formatRp((pondFishAsset || 0) + (batchCost.feed || 0) + (batchCost.vitamin || 0))}
                    </Typography>

                    <Box mt={2}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Aset Ikan
                      </Typography>
                      <Typography>{formatRp(pondFishAsset || 0)}</Typography>
                    </Box>

                    <Box mt={2}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Pakan terpakai
                      </Typography>
                      <Typography>
                        {(feedQtySummary.feedKg || 0).toFixed(2)} kg — {formatRp(batchCost.feed)}
                      </Typography>
                    </Box>

                    <Box mt={1}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Vitamin terpakai
                      </Typography>
                      <Typography>
                        {(feedQtySummary.vitaminKg || 0).toFixed(2)} kg — {formatRp(batchCost.vitamin)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Growth Chart -> Biomassa (kg) */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Grafik Biomassa (kg)
              </Typography>
              {growthLogs.length === 0 ? (
                <Typography>Belum ada data biomassa</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={growthLogs}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tanggal" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="total_kg" stroke="#8884d8" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* PH Chart */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Data Sensor pH
              </Typography>
              {phData.length === 0 ? (
                <Typography>Belum ada data sensor</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={phData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="jam" />
                    <YAxis domain={[5, 9]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="ph" stroke="#82ca9d" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Temperature Chart */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Data Sensor Suhu
              </Typography>

              {tempData.length === 0 ? (
                <Typography>Belum ada data suhu</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={tempData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="jam" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="suhu" stroke="#ff7300" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Mortalitas Chart */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Mortalitas Harian
              </Typography>
              {deathLogs.length === 0 ? (
                <Typography>Belum ada data</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={deathLogs}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tanggal" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => [`${value} ekor`, 'Jumlah Mati']}
                      labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                          const log = payload[0].payload;
                          return `${label} | ${log.keterangan || '-'}`;
                        }
                        return label;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="jumlah" fill="#e53935" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Log Sensor
              </Typography>

              {sensorLogs.length === 0 ? (
                <Typography>Belum ada data.</Typography>
              ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#5856d6' }}>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Sensor</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Nilai</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(showAllSensor ? sensorLogs : sensorLogs.slice(0, 5)).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {' '}
                            {new Date(log.created_at + 'Z').toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                            })}
                          </TableCell>
                          <TableCell>{log.type === 'ph' ? 'pH' : 'Suhu'}</TableCell>
                          <TableCell>{log.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {sensorLogs.length > 5 && (
                    <Box textAlign="center" mt={1}>
                      <Button size="small" onClick={() => setShowAllSensor(!showAllSensor)}>
                        {showAllSensor ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua'}
                      </Button>
                    </Box>
                  )}
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Log Aktuator
              </Typography>

              {deviceLogs.length === 0 ? (
                <Typography>Belum ada data.</Typography>
              ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#5856d6' }}>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Device</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(showAllDevice ? deviceLogs : deviceLogs.slice(0, 5)).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {' '}
                            {new Date(log.created_at + 'Z').toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                            })}
                          </TableCell>
                          <TableCell>{log.type === 'pompa' ? 'Pompa' : 'Valve'}</TableCell>
                          <TableCell>{log.value === 1 ? 'Nyala / Terbuka' : 'Mati / Tertutup'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {deviceLogs.length > 5 && (
                    <Box textAlign="center" mt={1}>
                      <Button size="small" onClick={() => setShowAllDevice(!showAllDevice)}>
                        {showAllDevice ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua'}
                      </Button>
                    </Box>
                  )}
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* 🔹 Log Tambah Ikan (dari tabel aktivitas) */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Log Tambah Ikan
              </Typography>

              {addFishActivities.length === 0 ? (
                <Typography>Belum ada aktivitas tambah ikan tercatat.</Typography>
              ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                  <Table size="small">
                    {/* 🔹 TABLE HEAD DENGAN KOLOM BARU */}
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#5856d6' }}>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Aksi</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Qty (ekor)</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Berat (kg)</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Detail</TableCell>
                      </TableRow>
                    </TableHead>

                    {/* 🔹 TABLE BODY */}
                    <TableBody>
                      {(showAllAddFish ? addFishActivities : addFishActivities.slice(0, 5)).map((row, idx) => {
                        // Waktu (backend sudah kirim dalam row.waktu)
                        const waktuTeks = row.waktu;

                        return (
                          <TableRow key={row.id ?? idx}>
                            <TableCell>{waktuTeks}</TableCell>
                            <TableCell>{row.aksi || '-'}</TableCell>

                            {/* 🔹 Qty Ekor */}
                            <TableCell>{row.qty_ekor ?? '-'}</TableCell>

                            {/* 🔹 Berat KG */}
                            <TableCell>{row.berat_kg != null ? `${row.berat_kg} kg` : '-'}</TableCell>

                            {/* 🔹 Detail */}
                            <TableCell>{row.deskripsi || `Qty: ${row.qty_ekor ?? '-'} ekor, Berat: ${row.berat_kg != null ? row.berat_kg + ' kg' : '-'}`}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {/* 🔥 PINDAH KE SINI */}
                  {addFishActivities.length > 5 && (
                    <Box textAlign="center" mt={1}>
                      <Button size="small" onClick={() => setShowAllAddFish(!showAllAddFish)}>
                        {showAllAddFish ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua'}
                      </Button>
                    </Box>
                  )}
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* Feeding Log Table */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent sx={{ backgroundColor: '#ffff' }}>
              <Typography variant="h6">Log Pakan & Vitamin</Typography>
              {feedingLogs.length === 0 ? (
                <Typography>Belum ada data.</Typography>
              ) : (
                <>
                  <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#5856d6' }}>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Nama</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Jenis</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Jumlah (kg)</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }} align="right">
                            Aksi
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(showAllFeeding ? feedingLogs : feedingLogs.slice(0, 5)).map((log, i) => (
                          <TableRow key={log.id ?? i}>
                            <TableCell>{log.waktu}</TableCell>
                            <TableCell>{log.nama}</TableCell>
                            <TableCell>
                              <Chip size="small" label={log.jenis} color={log.jenis === 'Vitamin' ? 'warning' : 'default'} variant="outlined" />
                            </TableCell>
                            <TableCell>{log.jumlah}</TableCell>
                            <TableCell align="right">
                              <Button size="small" variant="outlined" onClick={() => openEditFeeding(log)}>
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {feedingLogs.length > 5 && (
                    <Box textAlign="center" mt={1}>
                      <Button size="small" onClick={() => setShowAllFeeding(!showAllFeeding)}>
                        {showAllFeeding ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua'}
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Mortalitas Log Table */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Log Mortalitas
              </Typography>
              {deathLogs.length === 0 ? (
                <Typography>Belum ada data.</Typography>
              ) : (
                <>
                  <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#5856d6' }}>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Jumlah Mati</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Keterangan</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(showAllDeath ? deathLogs : deathLogs.slice(0, 5)).map((log, i) => (
                          <TableRow key={i}>
                            <TableCell>{log.waktu}</TableCell>
                            <TableCell>{log.jumlah}</TableCell>
                            <TableCell>{log.keterangan}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {deathLogs.length > 5 && (
                    <Box textAlign="center" mt={1}>
                      <Button size="small" onClick={() => setShowAllDeath(!showAllDeath)}>
                        {showAllDeath ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua'}
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 🔹 Riwayat Sortir (dari tabel aktivitas) */}
          <Card sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Riwayat Sortir
              </Typography>
              {sortirActivities.length === 0 ? (
                <Typography>Belum ada sortir tercatat.</Typography>
              ) : (
                <>
                  <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#5856d6' }}>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Aksi</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Deskripsi</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Ekor Dipindah</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Berat Aktual</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Susut (kg)</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Susut (%)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(showAllSortir ? sortirActivities : sortirActivities.slice(0, 5)).map((row) => {
                          const susutKg = row.meta?.susut_kg ?? null;
                          const susutPct = row.meta?.susut_percent ?? null;
                          return (
                            <TableRow key={row.id}>
                              <TableCell>{row.waktu}</TableCell>
                              <TableCell>{row.aksi}</TableCell>
                              <TableCell>{row.deskripsi}</TableCell>
                              <TableCell>{row.qty_ekor ?? '-'}</TableCell>
                              <TableCell>{row.berat_kg != null ? formatKg(row.berat_kg) : '-'}</TableCell>
                              <TableCell>{susutKg != null ? `${Number(susutKg).toFixed(3)} kg` : '-'}</TableCell>
                              <TableCell>{susutPct != null ? `${Number(susutPct).toFixed(2)} %` : '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {sortirActivities.length > 5 && (
                    <Box textAlign="center" mt={1}>
                      <Button size="small" onClick={() => setShowAllSortir(!showAllSortir)}>
                        {showAllSortir ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua'}
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Form Dialog Tambah */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {formMode === 'add_fish'
            ? 'Tambah Ikan'
            : formMode === 'pakan'
              ? 'Tambah Pakan'
              : formMode === 'vitamin'
                ? 'Tambah Vitamin'
                : formMode === 'mortalitas'
                  ? 'Catat Mortalitas'
                  : formMode === 'sortir'
                    ? 'Sortir Kolam'
                    : 'Panen Kolam'}
        </DialogTitle>
        <DialogContent>
          {formMode === 'add_fish' && (
            <Stack spacing={2} mt={1}>
              <TextField
                select
                label="Ikan"
                value={formData.ikan_id}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    ikan_id: val,
                    populasi: '',
                    total_berat_kg: '',
                  }));
                }}
              >
                {masterFish.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.species} — Ukuran: {m.size || '-'} — Business Partner: {m.vendor?.name || '-'} — Stok: {m.quantity ?? 0} ekor, {m.total_kg ?? '-'} kg
                  </MenuItem>
                ))}
              </TextField>

              <TextField label="Ukuran" value={masterFish.find((x) => x.id === Number(formData.ikan_id))?.size || '-'} InputProps={{ readOnly: true }} fullWidth />

              <TextField label="Business Partner" value={masterFish.find((x) => x.id === Number(formData.ikan_id))?.vendor?.name || '-'} InputProps={{ readOnly: true }} fullWidth />

              <TextField
                type="number"
                label="Jumlah Ekor"
                value={formData.populasi}
                onChange={(e) => {
                  const qty = Number(e.target.value || 0);
                  const selectedStock = masterFish.find((m) => m.id === Number(formData.ikan_id));

                  let totalKg = formData.total_berat_kg;
                  if (selectedStock && selectedStock.quantity > 0 && selectedStock.total_kg > 0) {
                    totalKg = (qty / selectedStock.quantity) * selectedStock.total_kg;
                  }

                  setFormData({
                    ...formData,
                    populasi: qty,
                    total_berat_kg: Number((totalKg || 0).toFixed(3)),
                  });
                }}
              />

              <TextField
                type="number"
                label="Total Berat (kg)"
                value={formData.total_berat_kg}
                inputProps={{ step: '0.001' }}
                onChange={(e) => {
                  const kg = Number(e.target.value || 0);
                  const selectedStock = masterFish.find((m) => m.id === Number(formData.ikan_id));

                  let qty = '';
                  if (selectedStock && selectedStock.total_kg > 0) {
                    qty = Math.round((kg / selectedStock.total_kg) * selectedStock.quantity);
                  }

                  setFormData({ ...formData, total_berat_kg: kg, populasi: qty });
                }}
              />

              <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={formData.tanggal || new Date().toISOString().slice(0, 10)} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} />
            </Stack>
          )}

          {/* ====== PAKAN ====== */}
          {formMode === 'pakan' && (
            <Stack spacing={2} mt={1}>
              <TextField
                select
                label="Mode Pemberian"
                value={feedingMode}
                onChange={(e) => setFeedingMode(e.target.value)}
                helperText={feedingMode === 'manual' ? 'Isi jumlah pakan secara manual' : `Otomatis ${percentFromMode(feedingMode) * 100}% dari biomassa`}
              >
                <MenuItem value="manual">Manual</MenuItem>
                <MenuItem value="auto_3">Otomatis (3% biomassa)</MenuItem>
                <MenuItem value="auto_4">Otomatis (4% biomassa)</MenuItem>
                <MenuItem value="auto_5">Otomatis (5% biomassa)</MenuItem>
              </TextField>

              <TextField select label="Pilih Pakan (bukan vitamin)" value={formData.feed_id} onChange={(e) => setFormData({ ...formData, feed_id: e.target.value })}>
                {pakanList.map((feed) => (
                  <MenuItem key={feed.id} value={feed.id}>
                    {feed.name} ({feed.type || 'pakan'}) — Stok: {feed.quantity_kg ?? feed.quantity ?? 0} kg
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                type="number"
                label="Jumlah Pakan (kg)"
                value={formData.jumlahPakan}
                onChange={(e) => setFormData({ ...formData, jumlahPakan: e.target.value })}
                disabled={Boolean(percentFromMode(feedingMode))}
                helperText={percentFromMode(feedingMode) ? `Otomatis ${percentFromMode(feedingMode) * 100}% dari biomassa` : 'Isi jumlah pakan secara manual'}
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="date"
                    label="Tanggal Pemberian"
                    InputLabelProps={{ shrink: true }}
                    value={formData.tanggal || new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setFormData((p) => ({ ...p, tanggal: e.target.value }))}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="time"
                    label="Waktu"
                    InputLabelProps={{ shrink: true }}
                    value={formData.waktu || new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5)}
                    onChange={(e) => setFormData((p) => ({ ...p, waktu: e.target.value }))}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Stack>
          )}

          {/* ====== VITAMIN ====== */}
          {formMode === 'vitamin' && (
            <Stack spacing={2} mt={1}>
              <TextField select label="Pilih Vitamin" value={formData.feed_id} onChange={(e) => setFormData({ ...formData, feed_id: e.target.value })}>
                {vitaminList.map((feed) => (
                  <MenuItem key={feed.id} value={feed.id}>
                    {feed.name} (vitamin) — Stok: {feed.quantity_kg ?? feed.quantity ?? 0} kg
                  </MenuItem>
                ))}
              </TextField>

              <TextField type="number" label="Jumlah Vitamin (kg)" value={formData.jumlahPakan} onChange={(e) => setFormData({ ...formData, jumlahPakan: e.target.value })} helperText="Vitamin tidak menambah berat ikan" />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="date"
                    label="Tanggal Pemberian"
                    InputLabelProps={{ shrink: true }}
                    value={formData.tanggal || new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setFormData((p) => ({ ...p, tanggal: e.target.value }))}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="time"
                    label="Waktu"
                    InputLabelProps={{ shrink: true }}
                    value={formData.waktu || new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5)}
                    onChange={(e) => setFormData((p) => ({ ...p, waktu: e.target.value }))}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Stack>
          )}

          {formMode === 'mortalitas' && (
            <Stack spacing={2} mt={1}>
              <TextField type="number" label="Jumlah Mati" value={formData.jumlahMati} onChange={(e) => setFormData({ ...formData, jumlahMati: e.target.value })} fullWidth />
              <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} fullWidth />
              <TextField type="time" label="Waktu" InputLabelProps={{ shrink: true }} value={formData.waktu} onChange={(e) => setFormData({ ...formData, waktu: e.target.value })} fullWidth />
              <TextField label="Keterangan" multiline rows={2} value={formData.keterangan} onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })} fullWidth />
            </Stack>
          )}

          {/* ===== Sortir ===== */}
          {formMode === 'sortir' && (
            <Stack spacing={2} mt={1}>
              <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={formData.tanggal || new Date().toISOString().slice(0, 10)} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} fullWidth />

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Tujuan Sortir (dinamis). Pilih ukuran terlebih dahulu, lalu kolam tujuan (harus kosong atau ukuran sama), lalu isi ekor & berat (kg).
                </Typography>

                {movements.map((m, idx) => {
                  const allowedTargets = getAllowedTargetsForRow(m);
                  return (
                    <Grid container spacing={1} alignItems="center" key={idx} sx={{ mb: 1 }}>
                      {/* Ukuran */}
                      <Grid item xs={3}>
                        <TextField key={`size-${idx}`} select size="small" label="Ukuran" value={m.ref_ukuran_id ?? ''} onChange={(e) => updateMovement(idx, 'ref_ukuran_id', e.target.value ? Number(e.target.value) : '')} fullWidth>
                          <MenuItem value="">Pilih ukuran...</MenuItem>
                          {refUkuran.map((u) => (
                            <MenuItem key={u.id} value={u.id}>
                              {composeSizeLabel(u.name, u.ukuran)}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>

                      {/* Kolam tujuan */}
                      <Grid item xs={4}>
                        <TextField
                          key={`target-${idx}-${m.ref_ukuran_id || 'none'}`}
                          select
                          size="small"
                          label="Kolam Tujuan"
                          value={m.to_kolam_id ?? ''}
                          onChange={(e) => updateMovement(idx, 'to_kolam_id', Number(e.target.value))}
                          fullWidth
                          helperText={!m.ref_ukuran_id ? 'Pilih ukuran dulu' : ''}
                          disabled={!m.ref_ukuran_id}
                        >
                          <MenuItem value="">Pilih kolam...</MenuItem>
                          {allowedTargets.map((k) => (
                            <MenuItem key={k.id} value={k.id}>
                              {k.name} — {k.status || '-'} {Array.isArray(kolamFishNames[k.id]) && kolamFishNames[k.id].length > 0 ? `(ikan: ${kolamFishNames[k.id].join(', ')})` : `(ikan: -)`}{' '}
                              {Array.isArray(kolamSizeIndexNama[k.id]) && kolamSizeIndexNama[k.id].length > 0 ? `(kode: ${kolamSizeIndexNama[k.id].join(', ')})` : ``}{' '}
                              {Array.isArray(kolamSizeIndex[k.id]) && kolamSizeIndex[k.id].length > 0 ? ` (ukuran: ${kolamSizeIndex[k.id].map(extractUkuranOnly).join(', ')})` : ' (kosong)'}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>

                      <Grid item xs={2}>
                        <TextField type="number" size="small" label="Ekor" value={m.jumlah_ekor ?? ''} onChange={(e) => updateMovement(idx, 'jumlah_ekor', e.target.value)} fullWidth />
                      </Grid>

                      <Grid item xs={2}>
                        <TextField type="number" size="small" label="Berat (kg)" value={m.berat_kg ?? ''} inputProps={{ step: '0.001' }} onChange={(e) => updateMovement(idx, 'berat_kg', e.target.value)} fullWidth />
                      </Grid>

                      <Grid item xs={1}>
                        <Button onClick={() => removeMovement(idx)} color="error" variant="outlined" size="small">
                          Hapus
                        </Button>
                      </Grid>
                    </Grid>
                  );
                })}

                <Box mt={1}>
                  <Button size="small" onClick={addMovement}>
                    + Tambah Tujuan
                  </Button>
                </Box>

                <Box mt={2} sx={{ p: 2, borderRadius: 2, bgcolor: '#f8f9ff' }}>
                  <Typography variant="subtitle2">Ringkasan Sortir</Typography>
                  <Typography variant="body2">Rasio kolam saat ini: {avgGramPerEkor ? `${avgGramPerEkor.toFixed(2)} g/ekor` : '-'}</Typography>
                  <Typography variant="body2">
                    Dipindah: {movedTotalEkor} ekor, {formatKg(movedTotalKg)}
                  </Typography>
                  <Typography variant="body2">Ekspektasi (dari rasio kolam): {formatKg(movedExpectedKg)}</Typography>
                  <Typography variant="body2">
                    Susut: {movedSusutKg >= 0 ? formatKg(movedSusutKg) : `+${formatKg(Math.abs(movedSusutKg)).replace(' kg', '')} kg`} ({movedSusutPct}%)
                  </Typography>
                  <Typography variant="body2">Sisa ekor di kolam (tidak ubah berat): {Math.max(0, pondTotalEkor - movedTotalEkor)} ekor</Typography>
                </Box>
              </Box>

              <TextField label="Keterangan (opsional)" value={formData.keterangan || ''} onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })} multiline rows={2} fullWidth />
            </Stack>
          )}

          {formMode === 'panen' && (
            <Stack spacing={2} mt={1}>
              <TextField select label="Tipe Panen" value={formData.panen_type} onChange={(e) => setFormData({ ...formData, panen_type: e.target.value })} fullWidth>
                <MenuItem value="penuh">Panen Penuh</MenuItem>
                <MenuItem value="parsial">Panen Parsial</MenuItem>
              </TextField>

              <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={formData.tanggal || new Date().toISOString().slice(0, 10)} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} fullWidth />

              <TextField
                select
                label="Business Partner Pembeli"
                value={formData.vendor_id ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    vendor_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                fullWidth
              >
                <MenuItem value="">Pilih Business Partner...</MenuItem>
                {vendorsRef.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.name}
                  </MenuItem>
                ))}
              </TextField>

              {formData.panen_type === 'parsial' && (
                <TextField
                  type="number"
                  label="Jumlah Ekor"
                  value={formData.jumlah_ekor || ''}
                  onChange={(e) => setFormData({ ...formData, jumlah_ekor: Number(e.target.value || 0) })}
                  fullWidth
                  helperText={`Wajib diisi & tidak boleh mencapai total ekor (${expectedTotals.expectedEkor})`}
                />
              )}

              <TextField
                type="number"
                label="Berat Aktual Ditimbang (kg)"
                value={formData.total_berat_kg || ''}
                onChange={(e) => setFormData({ ...formData, total_berat_kg: Number(e.target.value || 0) })}
                helperText={formData.panen_type === 'penuh' ? `Ekspektasi sistem: ${formatKg(expectedTotals.expectedKg)}` : `Ekspektasi subset: ${formatKg(expectedSubsetKg)} (rasio ± ${avgGramPerEkor.toFixed(2)} g/ekor)`}
                fullWidth
              />

              <TextField type="number" label="Harga Jual (per kg)" value={formData.harga_jual || ''} onChange={(e) => setFormData({ ...formData, harga_jual: Number(e.target.value || 0) })} fullWidth />

              <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8f9ff' }}>
                <Typography variant="subtitle2">Ringkasan Susut & Sisa</Typography>

                {formData.panen_type === 'penuh' ? (
                  <>
                    <Typography variant="body2">
                      Ekspektasi: {expectedTotals.expectedKg.toFixed(3)} kg | Aktual: {Number(formData.total_berat_kg || 0).toFixed(3)} kg
                    </Typography>
                    <Typography variant="body2">
                      Susut:{' '}
                      {expectedTotals.expectedKg - Number(formData.total_berat_kg || 0) >= 0
                        ? (expectedTotals.expectedKg - Number(formData.total_berat_kg || 0)).toFixed(3)
                        : `+${Math.abs(expectedTotals.expectedKg - Number(formData.total_berat_kg || 0)).toFixed(3)}`}{' '}
                      kg
                    </Typography>
                    <Typography variant="body2">Sisa ekor: 0 ekor | Sisa biomassa: 0 kg</Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="body2">
                      Ekspektasi subset: {expectedSubsetKg.toFixed(3)} kg | Aktual: {Number(formData.total_berat_kg || 0).toFixed(3)} kg
                    </Typography>
                    <Typography variant="body2">
                      Susut:{' '}
                      {expectedSubsetKg - Number(formData.total_berat_kg || 0) >= 0 ? (expectedSubsetKg - Number(formData.total_berat_kg || 0)).toFixed(3) : `+${Math.abs(expectedSubsetKg - Number(formData.total_berat_kg || 0)).toFixed(3)}`}{' '}
                      kg
                    </Typography>
                    <Typography variant="body2">Sisa ekor: {Math.max(0, expectedTotals.expectedEkor - Number(formData.jumlah_ekor || 0))} ekor</Typography>
                    <Typography variant="body2">Sisa biomassa (perkiraan): {formatKg(Math.max(0, expectedTotals.expectedKg - Number(formData.total_berat_kg || 0)))}</Typography>
                  </>
                )}
              </Box>

              <TextField label="Keterangan (opsional)" value={formData.keterangan || ''} onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })} multiline rows={2} fullWidth />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={handleFormSubmit}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Edit Pemberian Pakan/Vitamin */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Pemberian {editData._old_jenis === 'vitamin' ? 'Vitamin' : 'Pakan'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              select
              label="Jenis"
              value={editData.jenis}
              onChange={(e) => {
                const val = e.target.value;
                setEditData((p) => ({ ...p, jenis: val, stok_pakan_id: '' }));
              }}
              helperText="Pilih kategori untuk memfilter stok"
              fullWidth
            >
              <MenuItem value="pakan">Pakan</MenuItem>
              <MenuItem value="vitamin">Vitamin</MenuItem>
            </TextField>

            <TextField select label={editData.jenis === 'vitamin' ? 'Pilih Vitamin' : 'Pilih Pakan'} value={editData.stok_pakan_id} onChange={(e) => setEditData((p) => ({ ...p, stok_pakan_id: e.target.value }))} fullWidth>
              {(editData.jenis === 'vitamin' ? vitaminList : pakanList).map((feed) => (
                <MenuItem key={feed.id} value={feed.id}>
                  {feed.name} {editData.jenis === 'vitamin' ? '(vitamin)' : `(${feed.type || 'pakan'})`} — Stok: {feed.quantity_kg ?? feed.quantity ?? 0} kg
                </MenuItem>
              ))}
            </TextField>

            <TextField type="number" label="Jumlah (kg)" value={editData.jumlah_kg} onChange={(e) => setEditData((p) => ({ ...p, jumlah_kg: e.target.value }))} inputProps={{ step: '0.001' }} fullWidth />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  type="date"
                  label="Tanggal Pemberian"
                  InputLabelProps={{ shrink: true }}
                  value={editData.tanggal || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setEditData((p) => ({ ...p, tanggal: e.target.value }))}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField type="time" label="Waktu" InputLabelProps={{ shrink: true }} value={editData.waktu || ''} onChange={(e) => setEditData((p) => ({ ...p, waktu: e.target.value }))} fullWidth />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={handleEditSubmit}>
            Simpan Perubahan
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={alertOpen} autoHideDuration={4000} onClose={handleAlertClose}>
        <Alert onClose={handleAlertClose} severity={alertSeverity}>
          {alertMessage}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
