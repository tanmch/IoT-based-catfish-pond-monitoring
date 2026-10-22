// src/pages/Kolam.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Grid,
  Paper,
  Box,
  TextField,
  Button,
  MenuItem,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Snackbar,
  Alert,
  Card,
  CardContent,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import OpacityIcon from '@mui/icons-material/Opacity';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ConstructionIcon from '@mui/icons-material/Construction';
import EditIcon from '@mui/icons-material/Edit';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

/* ---------- Kalibrasi Sensor ---------- */
const API_BASE = 'http://103.103.22.213/api';

const DEFAULT_STATUS = 'Kosong';
const STATUS_OPTIONS = ['Kosong', 'Sedang Pemeliharaan'];

/* ---------- Utils waktu ---------- */
const toHHmm = (val) => {
  if (!val) return '';
  const s = String(val);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
};
const toHHmmss = (val) => {
  if (!val) return null;
  const s = String(val);
  if (s.length === 5) return `${s}:00`;
  if (s.length === 8) return s;
  return null;
};

/* ---------- Helper label ukuran ---------- */
const composeSizeLabel = (name, ukuran) => {
  const n = name || '';
  const u = ukuran || '';
  if (!n && !u) return '-';
  if (!n) return u;
  if (!u) return n;
  return `${n} - ${u}`;
};

/* ---------- Small stat card ---------- */
function StatCard({ icon, label, value, hint, gradient = 'linear-gradient(90deg, #5856d6, #00c9a7)' }) {
  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 3,
        backgroundColor: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        border: '1px solid #f1f1f4',
        position: 'relative',
        overflow: 'hidden',
        '::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 6,
          background: gradient,
        },
      }}
    >
      <Stack spacing={1.25} alignItems="center" textAlign="center">
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: '#f7f7ff',
            border: '1px solid #ececff',
          }}
        >
          {icon}
        </Box>
        <Typography variant="subtitle2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700}>
          {value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

/* ---------- Log card untuk mobile ---------- */
function LogCard({ log, onEdit }) {
  const chipProps = log.jenis === 'Vitamin' ? { color: 'warning', variant: 'filled' } : log.jenis === 'Mortalitas' ? { color: 'error', variant: 'filled' } : { color: 'default', variant: 'outlined' };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#f1f1f4' }}>
      <CardContent sx={{ p: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>
            {log.tanggal} · {log.waktu}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={log.jenis} {...chipProps} />
            {onEdit && (log.jenis === 'Pakan' || log.jenis === 'Vitamin') && (
              <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => onEdit(log)}>
                Edit
              </Button>
            )}
          </Stack>
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={0.5}>
          <Stack direction="row" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Nama
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {log.nama}
            </Typography>
          </Stack>

          <Stack direction="row" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Qty (ekor)
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {log.qty_ekor != null && log.qty_ekor !== 0 ? `${log.qty_ekor} ekor` : '-'}
            </Typography>
          </Stack>

          <Stack direction="row" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Berat (kg)
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {log.berat_kg != null && log.berat_kg !== 0 ? `${Number(log.berat_kg).toFixed(3)} kg` : '-'}
            </Typography>
          </Stack>

          {log.keterangan && log.keterangan !== '-' && (
            <Typography variant="body2" color="text.secondary">
              {log.keterangan}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Kolam() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ====== STATE (semua top-level) ======
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('petani');
  const [kolamData, setKolamData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState({
    nama_kolam: '',
    panjang: '',
    lebar: '',
    // === Tambahan dimensi baru ===
    tinggi: '',
    diameter: '',
    // ==============================
    jenis_kolam: '',
    status: DEFAULT_STATUS,
    // === BARU: biaya pembuatan kolam ===
    biaya_pembuatan: '',
  });
  const [selectedKolamId, setSelectedKolamId] = useState(null);

  // Reference data untuk aktivitas
  const [feeds, setFeeds] = useState([]); // pakan + vitamin
  const [fishStocks, setFishStocks] = useState([]); // master ikan
  const [ukuranRef, setUkuranRef] = useState([]); // reference ukuran
  const [jenisKolamRef, setJenisKolamRef] = useState([]); // reference jenis kolam
  const [isiKolam, setIsiKolam] = useState([]); // isi kolam terpilih

  // master vendor pembeli panen
  const [vendorsRef, setVendorsRef] = useState([]);

  // Sortir: daftar kolam tujuan & index ukuran
  const [allKolams, setAllKolams] = useState([]);
  const [kolamSizeIndex, setKolamSizeIndex] = useState({}); // { [kolamId]: [ukuranName,...] }

  // Activity tool (shortcut)
  const [activity, setActivity] = useState({
    kolamId: '',
    type: '', // add_fish | pakan | vitamin | mortalitas | sortir | panen
    // add_fish
    ikanId: '',
    populasi: '',
    totalBeratKg: '',
    tanggal: new Date().toISOString().split('T')[0],
    // pakan/vitamin
    feedingMode: 'manual', // manual | auto_3 | auto_4 | auto_5
    feedId: '',
    jumlahPakan: '',
    // mortalitas
    jumlahMati: '',
    waktu: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
    keterangan: '',
    // sortir
    movements: [], // [{ refUkuranId, toKolamId, jumlahEkor, beratKg }]
    tanggalSortir: new Date().toISOString().split('T')[0],
    // panen
    panenType: 'penuh',
    panenTanggal: new Date().toISOString().split('T')[0],
    panenJumlahEkor: '',
    panenTotalKg: '',
    hargaJual: '',
    panenKeterangan: '',
    panenVendorId: '',
  });

  const [activeKolamId, setActiveKolamId] = useState(null);
  const [pompaNyala, setPompaNyala] = useState(false);
  const [valveTerbuka, setValveTerbuka] = useState(false);

  useEffect(() => {
    if (kolamData.length > 0) {
      setActiveKolamId(kolamData[0].id); // ambil kolam pertama
    }
  }, [kolamData]);

  /* ---------- Kalibrasi Sensor ---------- */
  const [sensorCalibrationData, setSensorCalibrationData] = useState(null);
  const [loadingSensorCalibration, setLoadingSensorCalibration] = useState(false);
  const [calibration, setCalibrationData] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(null);

  const fetchCalibration = async () => {
    try {
      const res = await axios.get(`${API_BASE}/calibration/ph`);
      console.log('Calibration:', res.data);
      setCalibrationData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSensorCalibrationESP = async () => {
    try {
      setLoadingSensorCalibration(true);

      const res = await axios.get(`${API_BASE}/sensor-calibration-ESP/latest`);

      setSensorCalibrationData(res.data);
    } catch (err) {
      console.error('Gagal ambil sensor:', err);
      setSensorCalibrationData(null);
    } finally {
      setLoadingSensorCalibration(false);
    }
  };

  useEffect(() => {
    fetchSensorCalibrationESP();

    const interval = setInterval(() => {
      fetchSensorCalibrationESP();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const sendControlUniversal = async (pompa, valve) => {
    const token = localStorage.getItem('token');

    for (const kolam of kolamData) {
      await fetch(`${API_BASE}/kolam/control/${kolam.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pompa: pompa ? 1 : 0,
          valve: valve ? 1 : 0,
        }),
      });
    }
  };

  const fetchControlStatus = async () => {
    if (!kolamData.length) return;

    const token = localStorage.getItem('token');

    const res = await fetch(`${API_BASE}/kolam/control/${kolamData[0].id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    setPompaNyala(data.pompa === 1);
    setValveTerbuka(data.valve === 1);
  };

  useEffect(() => {
    fetchControlStatus();
  }, [kolamData]);

  // Notifikasi
  const [notif, setNotif] = useState({ open: false, message: '', severity: 'success' });
  const showNotif = (message, severity = 'success') => setNotif({ open: true, message, severity });
  const handleCloseNotif = () => setNotif((s) => ({ ...s, open: false }));

  // Log aktivitas
  const [feedingLogs, setFeedingLogs] = useState([]);
  const [deathLogs, setDeathLogs] = useState([]);
  const [aktivitasLogs, setAktivitasLogs] = useState([]); // sortir, tambah ikan, panen

  // === Edit log Pakan/Vitamin ===
  const [editOpen, setEditOpen] = useState(false);
  const [editLog, setEditLog] = useState({
    id: null,
    kolam_id: null,
    jenis: 'pakan', // "pakan" | "vitamin" (untuk filter stok)
    stok_pakan_id: '',
    jumlah_kg: '',
    tanggal: new Date().toISOString().slice(0, 10),
    waktu: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
    isi_kolam_id: null,
    _old_jumlah_kg: 0,
    _old_jenis: 'pakan',
  });

  // Filter/sort list kolam
  const [searchTerm, setSearchTerm] = useState(localStorage.getItem('kolam:search') || '');
  const [sortOrder, setSortOrder] = useState(localStorage.getItem('kolam:sort') || 'asc');
  const [filterStatus, setFilterStatus] = useState(localStorage.getItem('kolam:status') || '');
  const [showAll, setShowAll] = useState(localStorage.getItem('kolam:showAll') === '1');
  const MAX_CARDS = 6;

  // ====== EFFECTS ======
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setRole(payload.role);
      setUsername(payload.username || 'User');
      // fetch awal
      fetchKolam(token, payload.role);
      fetchFeeds();
      fetchFishStocks();
      fetchUkuranRef();
      fetchJenisKolamRef();
      fetchVendors();
    } catch (err) {
      console.error('Token invalid:', err);
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    if (activity.kolamId) {
      fetchIsiKolam(activity.kolamId);
      fetchFeedingLogs(activity.kolamId);
      fetchDeathLogs(activity.kolamId);
      fetchAktivitasLogs(activity.kolamId);
      fetchAllKolamsForSortir(activity.kolamId);
    } else {
      setIsiKolam([]);
      setFeedingLogs([]);
      setDeathLogs([]);
      setAktivitasLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.kolamId]);

  // persist preferensi filter/sort
  useEffect(() => {
    localStorage.setItem('kolam:search', searchTerm);
  }, [searchTerm]);
  useEffect(() => {
    localStorage.setItem('kolam:sort', sortOrder);
  }, [sortOrder]);
  useEffect(() => {
    localStorage.setItem('kolam:status', filterStatus);
  }, [filterStatus]);
  useEffect(() => {
    localStorage.setItem('kolam:showAll', showAll ? '1' : '0');
  }, [showAll]);

  // ====== FETCHERS ======
  const fetchKolam = async (token, userRole) => {
    try {
      setLoading(true);
      const endpoint = userRole === 'pemilik' ? '/kolam' : '/kolam-petani';
      const res = await axios.get(`${API_BASE}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setKolamData(res.data || []);
    } catch (error) {
      console.error('Gagal ambil data kolam:', error);
      setKolamData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeeds = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/feed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeeds(res.data || []);
    } catch (err) {
      console.error('Gagal ambil data feed:', err);
      setFeeds([]);
    }
  };

  const fetchFishStocks = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/ikan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFishStocks(res.data || []);
    } catch (err) {
      console.error('Gagal ambil data ikan:', err);
      setFishStocks([]);
    }
  };

  const fetchUkuranRef = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/reference/ukuran-ikan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUkuranRef(res.data || []);
    } catch (err) {
      console.error('Gagal ambil reference ukuran:', err);
      setUkuranRef([]);
    }
  };

  const fetchJenisKolamRef = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/reference/jenis-kolam`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setJenisKolamRef(res.data || []);
    } catch (err) {
      console.error('Gagal ambil reference jenis kolam:', err);
      setJenisKolamRef([]);
    }
  };

  // master vendor (multi-endpoint fallback)
  const fetchVendors = async () => {
    const token = localStorage.getItem('token');
    const paths = [`${API_BASE}/reference/vendor`, `${API_BASE}/reference/vendors`, `${API_BASE}/vendor`, `${API_BASE}/vendors`, `${API_BASE}/ref/vendor`, `${API_BASE}/ref/vendors`];
    try {
      let data = [];
      let ok = false;
      for (const url of paths) {
        try {
          const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
          if (r.status >= 200 && r.status < 300) {
            data = r.data || [];
            ok = true;
            break;
          }
        } catch (_) {}
      }
      if (!ok) throw new Error('Gagal ambil daftar vendor');
      const normalized = (data || [])
        .map((v) => ({
          id: v.id ?? v.vendor_id ?? v.value ?? v.key,
          name: v.name ?? v.nama ?? v.label ?? `Vendor #${v.id ?? ''}`,
        }))
        .filter((v) => v.id);
      setVendorsRef(normalized);
    } catch (err) {
      console.error('Gagal ambil Business Partner:', err);
      setVendorsRef([]);
    }
  };

  const fetchIsiKolam = async (kolamId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/kolam/${kolamId}/fish`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsiKolam(res.data || []);
    } catch (err) {
      console.error('Gagal ambil isi kolam:', err);
      setIsiKolam([]);
    }
  };

  // FEEDING LOGS: ambil lengkap agar bisa EDIT
  const fetchFeedingLogs = async (kolamId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/pemberian-pakan/${kolamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data || [];
      const mapped = data.map((log) => {
        // Nama2 field mentah dari server
        const typeRaw = (log.stok_pakan?.jenis || log.stok_pakan?.type || '').toLowerCase();
        const isVitamin = typeRaw === 'vitamin';
        const dt = log.created_at ? new Date(log.created_at) : null;
        const tanggalStr = log.tanggal ? new Date(log.tanggal).toLocaleDateString() : dt ? dt.toLocaleDateString() : '-';
        const waktuStr = dt
          ? dt.toLocaleString('id-ID', {
              day: 'numeric',
              month: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })
          : '-';

        const jumlahKg = Number(log.jumlah_kg || 0);

        return {
          id: log.id, // <= penting utk edit
          kolam_id: log.kolam_id ?? kolamId,
          ts: log.created_at ? new Date(log.created_at).getTime() : Date.now(),
          tanggal: tanggalStr,
          waktu: waktuStr,
          jenis: isVitamin ? 'Vitamin' : 'Pakan',
          nama: log.stok_pakan?.nama_pakan || log.stok_pakan?.name || '-',
          // jumlah utama (kg) — dipakai editor lama
          jumlah: jumlahKg,
          // field baru utk tabel
          qty_ekor: null,
          berat_kg: jumlahKg,
          keterangan: '-',
          // raw utk edit dialog:
          stok_pakan_id: log.stok_pakan?.id ?? log.stok_pakan_id,
          isi_kolam_id: log.isi_kolam?.id ?? log.isi_kolam_id ?? null,
          _type_raw: typeRaw || '-', // "vitamin"|"pakan"
          _tanggal_raw: log.tanggal || null,
          _waktu_raw: log.waktu || null,
        };
      });
      setFeedingLogs(mapped);
    } catch (err) {
      console.error('Gagal ambil log pakan/vitamin:', err);
      setFeedingLogs([]);
    }
  };

  const fetchDeathLogs = async (kolamId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/fish_mortality/${kolamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data || [];
      const mapped = data.map((log) => {
        const tanggal = log.tanggal ? new Date(log.tanggal) : null;
        const waktu = log.waktu ? `1970-01-01T${log.waktu}` : null;
        const ts = tanggal ? new Date(tanggal.toISOString().slice(0, 10) + 'T' + (log.waktu || '00:00')).getTime() : Date.now();
        const qty = Number(log.jumlah_mati || 0);
        const dtFull = tanggal && log.waktu ? new Date(tanggal.toISOString().slice(0, 10) + 'T' + log.waktu) : null;
        return {
          ts,
          tanggal: tanggal ? tanggal.toLocaleDateString() : '-',
          waktu: dtFull
            ? dtFull.toLocaleString('id-ID', {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })
            : '-',
          jenis: 'Mortalitas',
          nama: '-',
          // untuk kompat editor lama:
          jumlah: qty,
          // field baru:
          qty_ekor: qty,
          berat_kg: null,
          keterangan: log.keterangan || '-',
        };
      });
      setDeathLogs(mapped);
    } catch (err) {
      console.error('Gagal ambil log mortalitas:', err);
      setDeathLogs([]);
    }
  };

  // Log aktivitas umum (tambah ikan, sortir, panen) dari tabel `aktivitas`
  const fetchAktivitasLogs = async (kolamId) => {
    const token = localStorage.getItem('token');
    try {
      // asumsi endpoint: /aktivitas/kolam/{kolamId}
      const res = await axios.get(`${API_BASE}/aktivitas/kolam/${kolamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data || [];

      const mapped = data
        // kita cuma ambil jenis yang memang mau tampil di tabel ini
        .filter((a) => ['ikan', 'sortir', 'panen'].includes(a.jenis))
        .map((a) => {
          const rawDate = a.waktu || a.created_at;
          const dt = rawDate ? new Date(rawDate) : null;
          const tanggalStr = dt ? dt.toLocaleDateString() : '-';
          const waktuStr = dt
            ? dt
                .toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
                .replace(':', '.')
            : '-';

          let jenisLabel = 'Aktivitas';
          if (a.jenis === 'ikan') jenisLabel = 'Tambah Ikan';
          else if (a.jenis === 'sortir') jenisLabel = 'Sortir';
          else if (a.jenis === 'panen') jenisLabel = 'Panen';

          const qtyEkor = a.qty_ekor != null ? Number(a.qty_ekor) : null;
          const beratKg = a.berat_kg != null ? Number(a.berat_kg) : a.amount_kg != null ? Number(a.amount_kg) : null;

          return {
            id: a.id,
            kolam_id: a.kolam_id ?? kolamId,
            ts: dt ? dt.getTime() : Date.now(),
            tanggal: tanggalStr,
            waktu: waktuStr,
            jenis: jenisLabel,
            nama: a.deskripsi || jenisLabel,
            qty_ekor: qtyEkor,
            berat_kg: beratKg,
            keterangan: a.deskripsi || '-',
          };
        });

      setAktivitasLogs(mapped);
    } catch (err) {
      console.error('Gagal ambil log aktivitas umum:', err);
      setAktivitasLogs([]);
    }
  };

  const fetchAllKolamsForSortir = async (currentKolamId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API_BASE}/kolam`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all = (res.data || []).filter((k) => Number(k.id) !== Number(currentKolamId));
      setAllKolams(all);

      const entries = await Promise.all(
        all.map(async (k) => {
          try {
            const r = await axios.get(`${API_BASE}/kolam/${k.id}/fish`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const fishes = r.data || [];
            const sizes = Array.from(new Set(fishes.map((it) => it.ukuran_ikan_snapshot || it.ikan?.size).filter(Boolean)));
            return [k.id, sizes];
          } catch {
            return [k.id, []];
          }
        }),
      );
      const idx = {};
      entries.forEach(([kid, sizes]) => (idx[kid] = sizes));
      setKolamSizeIndex(idx);
    } catch (err) {
      console.error('Gagal ambil daftar kolam sortir:', err);
      setAllKolams([]);
      setKolamSizeIndex({});
    }
  };

  // ====== MEMO ======
  const pondTotalKg = useMemo(() => (isiKolam || []).reduce((s, f) => s + Number(f.total_kg || 0), 0), [isiKolam]);
  const pondTotalEkor = useMemo(() => (isiKolam || []).reduce((s, f) => s + Number(f.quantity ?? f.jumlah_ekor ?? 0), 0), [isiKolam]);
  const avgGramPerEkor = pondTotalEkor > 0 ? (pondTotalKg * 1000) / pondTotalEkor : 0;

  const ukuranById = useMemo(() => {
    const m = {};
    (ukuranRef || []).forEach((u) => {
      m[Number(u.id)] = composeSizeLabel(u.name || u.label, u.ukuran);
    });
    return m;
  }, [ukuranRef]);

  const combinedLogs = useMemo(() => {
    const all = [...(feedingLogs || []), ...(deathLogs || []), ...(aktivitasLogs || [])];
    return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [feedingLogs, deathLogs, aktivitasLogs]);

  // ====== EARLY RETURN (loading) ======
  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  // ====== DERIVED (non-hook) ======
  let displayedKolam = (kolamData || [])
    .filter((k) => (k.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((k) => (filterStatus ? k.status === filterStatus : true))
    .sort((a, b) => (sortOrder === 'asc' ? (a.name || '').localeCompare(b.name || '') : (b.name || '').localeCompare(a.name || '')));
  const totalKolam = (kolamData || []).length;
  const totalKosong = (kolamData || []).filter((k) => k.status === 'Kosong').length;
  const totalPemeliharaan = (kolamData || []).filter((k) => k.status === 'Sedang Pemeliharaan').length;
  const visibleKolam = showAll ? displayedKolam : displayedKolam.slice(0, MAX_CARDS);

  // status kolam terpilih untuk aturan aktivitas
  const selectedKolamForActivity = kolamData.find((k) => String(k.id) === String(activity.kolamId));
  const isKolamKosong = selectedKolamForActivity?.status === 'Kosong';
  const isKolamPemeliharaan = selectedKolamForActivity?.status === 'Sedang Pemeliharaan';

  // helper non-hook
  const allowedTargetsForRow = (row) => {
    if (!row?.refUkuranId) return [];
    const sizeName = ukuranById[Number(row.refUkuranId)];
    if (!sizeName) return [];
    return (allKolams || []).filter((k) => {
      const sizes = kolamSizeIndex[k.id] || [];
      const isKosong = k.status === 'Kosong' || sizes.length === 0;
      const isMatch = sizes.includes(sizeName);
      return isKosong || isMatch;
    });
  };

  // ====== HELPERS ======
  const percentFromMode = (mode) => {
    if (mode === 'auto_3') return 0.03;
    if (mode === 'auto_4') return 0.04;
    if (mode === 'auto_5') return 0.05;
    return null;
  };

  // ====== ACTIONS ======
  const handleActivitySubmit = async () => {
    const token = localStorage.getItem('token');
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    try {
      if (!activity.kolamId && activity.type !== 'add_fish') {
        showNotif('Pilih kolam terlebih dahulu.', 'warning');
        return;
      }
      const selectedKolam = kolamData.find((k) => String(k.id) === String(activity.kolamId));
      const isKosong = selectedKolam?.status === 'Kosong';
      const isPemeliharaan = selectedKolam?.status === 'Sedang Pemeliharaan';

      // aturan status kolam
      if (activity.type === 'add_fish' && isPemeliharaan) {
        showNotif('Kolam sedang dalam pemeliharaan. Tidak bisa menambah ikan.', 'warning');
        return;
      }
      if (activity.type !== 'add_fish' && isKosong) {
        showNotif('Kolam masih kosong. Tambah ikan dulu.', 'warning');
        return;
      }

      if (activity.type === 'add_fish') {
        if (!activity.kolamId) return showNotif('Pilih kolam untuk menambah ikan.', 'warning');
        const ikanId = Number(activity.ikanId);
        const qty = Number(activity.populasi || 0);
        const totalKg = Number(activity.totalBeratKg || 0);
        if (!ikanId) return showNotif('Pilih stok ikan dulu.', 'warning');
        if (!(qty > 0)) return showNotif('Jumlah ekor harus > 0.', 'warning');

        const payload = {
          ikan_id: ikanId,
          jumlah_ekor: qty,
          total_kg: totalKg,
        };
        await axios.post(`${API_BASE}/kolam/${activity.kolamId}/add_fish`, payload, auth);
        showNotif('Berhasil menambahkan ikan ke kolam!', 'success');
      }

      if (activity.type === 'pakan') {
        if (isKosong) return showNotif('Kolam masih kosong. Tambah ikan dulu.', 'warning');
        const feedId = Number(activity.feedId);
        const selectedFeed = feeds.find((f) => Number(f.id) === feedId);
        if (!feedId || !selectedFeed) return showNotif('Pilih pakan terlebih dulu.', 'warning');
        if ((selectedFeed.type || '').toLowerCase() === 'vitamin') {
          return showNotif('Item terpilih adalah vitamin. Gunakan menu Vitamin.', 'warning');
        }

        const perc = percentFromMode(activity.feedingMode);
        const amount = perc ? Number((pondTotalKg * perc).toFixed(3)) : Number(activity.jumlahPakan || 0);
        if (!(amount > 0)) return showNotif('Jumlah pakan harus > 0.', 'warning');

        await axios.post(
          `${API_BASE}/pemberian-pakan`,
          {
            kolam_id: Number(activity.kolamId),
            stok_pakan_id: feedId,
            jumlah_kg: amount,
            tanggal: activity.tanggal || new Date().toISOString().split('T')[0],
            waktu:
              toHHmmss(activity.waktu) ||
              new Date().toLocaleTimeString('en-GB', {
                hour12: false,
              }),
            isi_kolam_id: null,
          },
          auth,
        );
        await axios.post(`${API_BASE}/kolam/${activity.kolamId}/tambah_berat`, { tambahan_kg: amount }, auth);
        showNotif('Pakan diberikan & biomassa bertambah!', 'success');
      }

      if (activity.type === 'vitamin') {
        if (isKosong) return showNotif('Kolam masih kosong. Tambah ikan dulu.', 'warning');
        const feedId = Number(activity.feedId);
        const selectedFeed = feeds.find((f) => Number(f.id) === feedId);
        if (!feedId || !selectedFeed) return showNotif('Pilih vitamin terlebih dulu.', 'warning');
        if ((selectedFeed.type || '').toLowerCase() !== 'vitamin') {
          return showNotif('Item terpilih bukan vitamin.', 'warning');
        }
        const amount = Number(activity.jumlahPakan || 0);
        if (!(amount > 0)) return showNotif('Jumlah vitamin harus > 0.', 'warning');

        await axios.post(
          `${API_BASE}/pemberian-pakan`,
          {
            kolam_id: Number(activity.kolamId),
            stok_pakan_id: feedId,
            jumlah_kg: amount,
            tanggal: activity.tanggal || new Date().toISOString().split('T')[0],
            waktu:
              toHHmmss(activity.waktu) ||
              new Date().toLocaleTimeString('en-GB', {
                hour12: false,
              }),
            isi_kolam_id: null,
          },
          auth,
        );
        showNotif('Vitamin berhasil dicatat (tanpa menambah berat).', 'success');
      }

      if (activity.type === 'mortalitas') {
        if (isKosong) return showNotif('Kolam masih kosong. Tambah ikan dulu.', 'warning');
        const jumlah = Number(activity.jumlahMati || 0);
        if (!(jumlah > 0)) return showNotif('Jumlah mati harus > 0.', 'warning');
        await axios.post(
          `${API_BASE}/mortality`,
          {
            kolam_id: Number(activity.kolamId),
            jumlah_mati: jumlah,
            tanggal: activity.tanggal || new Date().toISOString().split('T')[0],
            waktu:
              activity.waktu ||
              new Date().toLocaleTimeString('en-GB', {
                hour12: false,
              }),
            keterangan: activity.keterangan || '',
          },
          auth,
        );
        showNotif('Mortalitas berhasil dicatat!', 'success');
      }

      if (activity.type === 'sortir') {
        if (isKosong) return showNotif('Kolam masih kosong. Tambah ikan dulu.', 'warning');
        if (!activity.movements || activity.movements.length === 0) {
          return showNotif('Tambah minimal satu baris tujuan sortir.', 'warning');
        }
        for (let i = 0; i < activity.movements.length; i++) {
          const m = activity.movements[i];
          if (!Number(m.refUkuranId)) return showNotif(`Pilih ukuran pada baris ${i + 1}.`, 'warning');
          if (!Number(m.toKolamId)) return showNotif(`Pilih kolam tujuan pada baris ${i + 1}.`, 'warning');
          if (!(Number(m.jumlahEkor) > 0)) return showNotif(`Jumlah ekor harus > 0 pada baris ${i + 1}.`, 'warning');
          if (!(Number(m.beratKg) > 0)) return showNotif(`Berat (kg) harus > 0 pada baris ${i + 1}.`, 'warning');

          const sizeName = ukuranRef.find((u) => Number(u.id) === Number(m.refUkuranId))?.name || '';
          const sizes = kolamSizeIndex[m.toKolamId] || [];
          const targetKolam = allKolams.find((k) => k.id === m.toKolamId);
          const targetKosong = targetKolam?.status === 'Kosong' || sizes.length === 0;
          const isMatch = sizeName && sizes.includes(sizeName);
          if (!(targetKosong || isMatch)) {
            return showNotif(`Kolam tujuan baris ${i + 1} harus kosong atau ukuran sama (${sizeName}).`, 'warning');
          }
        }

        const movedTotalEkor = activity.movements.reduce((s, m) => s + Number(m.jumlahEkor || 0), 0);
        const movedTotalKg = activity.movements.reduce((s, m) => s + Number(m.beratKg || 0), 0);
        if (movedTotalEkor > pondTotalEkor) {
          return showNotif(`Total ekor dipindah (${movedTotalEkor}) melebihi jumlah kolam (${pondTotalEkor}).`, 'warning');
        }

        const movedExpectedKg = (avgGramPerEkor / 1000) * movedTotalEkor;
        const susutKg = Number((movedExpectedKg - movedTotalKg).toFixed(3));
        const susutPct = movedExpectedKg > 0 ? Number(((susutKg / movedExpectedKg) * 100).toFixed(2)) : 0;

        const payload = {
          tanggal: activity.tanggalSortir || new Date().toISOString().split('T')[0],
          keterangan: activity.keterangan || '',
          movements: activity.movements.map((m) => ({
            to_kolam_id: Number(m.toKolamId),
            jumlah_ekor: Number(m.jumlahEkor),
            berat_kg: Number(m.beratKg),
            ref_ukuran_id: Number(m.refUkuranId),
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
            susut_kg: susutKg,
            susut_percent: susutPct,
          },
        };

        await axios.post(`${API_BASE}/kolam/${activity.kolamId}/sortir`, payload, auth);
        showNotif('Sortir berhasil diproses!', 'success');
      }

      if (activity.type === 'panen') {
        if (isKosong) return showNotif('Kolam masih kosong. Tambah ikan dulu.', 'warning');
        const type = activity.panenType;
        const actualKg = Number(activity.panenTotalKg || 0);
        const harga = Number(activity.hargaJual || 0);
        const vendorId = Number(activity.panenVendorId || 0);
        if (!(actualKg > 0)) return showNotif('Berat aktual (kg) wajib diisi.', 'warning');
        if (!(harga > 0)) return showNotif('Harga jual / kg wajib diisi.', 'warning');
        if (!vendorId) return showNotif('Pilih Business Partner pembeli panen terlebih dahulu.', 'warning');

        let expected = pondTotalKg;
        if (type === 'parsial') {
          const ekor = Number(activity.panenJumlahEkor || 0);
          if (!(ekor > 0)) return showNotif('Jumlah ekor wajib diisi untuk panen parsial.', 'warning');
          if (ekor >= pondTotalEkor) return showNotif('Panen parsial tidak boleh menghabiskan semua ekor.', 'warning');
          expected = Number(((avgGramPerEkor / 1000) * ekor).toFixed(3));
        }
        const susutKg = Number((expected - actualKg).toFixed(3));
        const susutPct = expected > 0 ? Number(((susutKg / expected) * 100).toFixed(2)) : 0;

        const payload = {
          kolam_id: Number(activity.kolamId),
          tipe_panen: type,
          total_berat_kg: actualKg,
          harga_jual: harga,
          tanggal: activity.panenTanggal || new Date().toISOString().split('T')[0],
          expected_kg: Number((expected || 0).toFixed(3)),
          susut_kg: susutKg,
          susut_percent: susutPct,
          vendor_id: vendorId,
        };
        if (type === 'parsial') payload.jumlah_ekor = Number(activity.panenJumlahEkor || 0);

        await axios.post(`${API_BASE}/kolam/panen`, payload);
        showNotif(`Panen ${type} berhasil dicatat.`, 'success');
      }

      const t = localStorage.getItem('token');
      fetchKolam(t, role);
      if (activity.kolamId) {
        fetchIsiKolam(activity.kolamId);
        fetchFeedingLogs(activity.kolamId);
        fetchDeathLogs(activity.kolamId);
        fetchAktivitasLogs(activity.kolamId);
        fetchAllKolamsForSortir(activity.kolamId);
      }
      fetchFeeds();
      fetchFishStocks();
      fetchVendors();

      setActivity((prev) => ({
        ...prev,
        type: '',
        ikanId: '',
        populasi: '',
        totalBeratKg: '',
        tanggal: new Date().toISOString().split('T')[0],
        feedingMode: 'manual',
        feedId: '',
        jumlahPakan: '',
        jumlahMati: '',
        waktu: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
        keterangan: '',
        movements: [],
        tanggalSortir: new Date().toISOString().split('T')[0],
        panenType: 'penuh',
        panenTanggal: new Date().toISOString().split('T')[0],
        panenJumlahEkor: '',
        panenTotalKg: '',
        hargaJual: '',
        panenKeterangan: '',
        panenVendorId: '',
      }));
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.detail || err?.message || 'Gagal submit aktivitas';
      showNotif(msg, 'error');
    }
  };

  // === Helper: aturan dimensi berdasarkan jenis kolam ===
  const isBulat = (formData.jenis_kolam || '').toLowerCase().includes('bulat');
  const isKotak = (formData.jenis_kolam || '').toLowerCase().includes('kotak');

  const handleFormSubmit = async () => {
    if (!formData.nama_kolam.trim()) {
      showNotif('Nama kolam wajib diisi.', 'warning');
      return;
    }

    // Validasi aturan berdasarkan jenis kolam
    if (isBulat) {
      const diam = parseFloat(formData.diameter);
      const t = parseFloat(formData.tinggi);
      if (!(diam > 0) || !(t > 0)) {
        showNotif('Kolam bulat wajib isi DIAMETER dan TINGGI (> 0).', 'warning');
        return;
      }
    } else if (isKotak) {
      const p = parseFloat(formData.panjang);
      const l = parseFloat(formData.lebar);
      const t = parseFloat(formData.tinggi);
      if (!(p > 0) || !(l > 0) || !(t > 0)) {
        showNotif('Kolam kotak wajib isi PANJANG, LEBAR, dan TINGGI (> 0).', 'warning');
        return;
      }
    }

    // Legacy field (size/depth/description/location) tetap dikirim untuk kompatibilitas lama
    const legacySize = parseFloat(formData.panjang) || 0;
    const legacyDepth = parseFloat(formData.lebar) || 0;
    const jenisText = formData.jenis_kolam || '-';

    // Normalisasi nilai dimensi sesuai aturan
    const panjangVal = isBulat ? null : formData.panjang !== '' ? parseFloat(formData.panjang) : null;
    const lebarVal = isBulat ? null : formData.lebar !== '' ? parseFloat(formData.lebar) : null;
    const tinggiVal = formData.tinggi !== '' ? parseFloat(formData.tinggi) : null;
    const diameterVal = isKotak ? null : formData.diameter !== '' ? parseFloat(formData.diameter) : null;

    // === BARU: normalisasi biaya pembuatan kolam ===
    const costNumber = parseFloat(formData.biaya_pembuatan);
    const biayaVal = !isNaN(costNumber) && costNumber > 0 ? costNumber : 0;

    const payloadBase = {
      name: formData.nama_kolam,
      size: legacySize,
      location: jenisText,
      depth: legacyDepth,
      description: jenisText,

      // === Field backend baru ===
      jenis_kolam: formData.jenis_kolam || null,
      panjang: panjangVal,
      lebar: lebarVal,
      tinggi: tinggiVal,
      diameter: diameterVal,
      biaya_pembuatan: biayaVal,
    };

    const payload = formMode === 'add' ? { ...payloadBase, status: DEFAULT_STATUS } : { ...payloadBase };

    try {
      const token = localStorage.getItem('token');
      if (formMode === 'add') {
        const res = await axios.post(`${API_BASE}/kolam`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setKolamData([...(kolamData || []), res.data]);
        showNotif('Kolam berhasil dibuat.', 'success');
      } else if (formMode === 'edit' && selectedKolamId) {
        // Backend menggunakan PUT untuk update
        const res = await axios.put(`${API_BASE}/kolam/${selectedKolamId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setKolamData((kolamData || []).map((k) => (k.id === selectedKolamId ? res.data : k)));
        showNotif('Perubahan kolam tersimpan.', 'success');
      }
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.detail || err?.message || 'Gagal menyimpan data kolam.';
      showNotif(msg, 'error');
    }

    setFormData({
      nama_kolam: '',
      panjang: '',
      lebar: '',
      tinggi: '',
      diameter: '',
      jenis_kolam: '',
      status: DEFAULT_STATUS,
      biaya_pembuatan: '',
    });
    setFormOpen(false);
    setSelectedKolamId(null);
  };

  const handleCalibration = async (ph) => {
    setIsCalibrating(true);
    setCalibrationStep(ph);

    try {
      // ⏳ Tunggu sensor stabil (misal 3 detik)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // 🔄 Ambil data terbaru dari sensor
      const res = await axios.get(`${API_BASE}/sensor-calibration-ESP/latest`);
      const latest = res.data;

      if (!latest?.voltage) {
        alert('Voltage tidak tersedia!');
        return;
      }

      // 🚀 Kirim ke backend
      await axios.post(`${API_BASE}/calibration/ph`, {
        ph: ph,
        voltage: latest.voltage,
      });

      alert(`Kalibrasi pH ${ph} berhasil`);

      // 🔄 Refresh data kalibrasi
      fetchCalibration();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCalibrating(false);
      setCalibrationStep(null);
    }
  };

  const handleDeleteKolam = async () => {
    if (!selectedKolamId) return;
    if (formData.status !== 'Kosong') {
      alert('Kolam hanya bisa dihapus jika status Kosong');
      return;
    }
    const ok = window.confirm('Yakin ingin menghapus kolam ini? Tindakan tidak bisa dibatalkan.');
    if (!ok) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE}/kolam/${selectedKolamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setKolamData((kolamData || []).filter((k) => k.id !== selectedKolamId));
      setFormOpen(false);
      setSelectedKolamId(null);
      showNotif('Kolam berhasil dihapus.', 'success');
    } catch (err) {
      console.error(err);
      showNotif('Gagal menghapus kolam.', 'error');
    }
  };

  const handleEditKolam = (kolam) => {
    setFormMode('edit');
    setSelectedKolamId(kolam.id);
    setFormData({
      nama_kolam: kolam.name,
      // fallback ke legacy jika kolom baru belum ada
      panjang: kolam.panjang ?? kolam.size ?? '',
      lebar: kolam.lebar ?? kolam.depth ?? '',
      tinggi: kolam.tinggi ?? '',
      diameter: kolam.diameter ?? '',
      jenis_kolam: kolam.jenis_kolam ?? kolam.description ?? '',
      status: kolam.status || DEFAULT_STATUS,
      biaya_pembuatan: kolam.biaya_pembuatan ?? '',
    });
    setFormOpen(true);
  };

  // export CSV untuk log aktivitas kolam terpilih
  const exportLogsCSV = () => {
    const header = ['Tanggal', 'Waktu', 'Jenis', 'Nama', 'Qty (ekor)', 'Berat (kg)', 'Keterangan'];
    const rows = combinedLogs.map((l) => [l.tanggal, l.waktu, l.jenis, l.nama, l.qty_ekor != null ? l.qty_ekor : '', l.berat_kg != null ? Number(l.berat_kg).toFixed(3) : '', l.keterangan || '-']);
    const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `log_kolam_${activity.kolamId || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ====== EDIT LOG (open & submit) ======
  const openEditLog = (row) => {
    if (!row || (row.jenis !== 'Pakan' && row.jenis !== 'Vitamin')) return;
    setEditLog({
      id: row.id,
      kolam_id: row.kolam_id ?? activity.kolamId ?? null,
      jenis: row.jenis === 'Vitamin' ? 'vitamin' : 'pakan',
      stok_pakan_id: row.stok_pakan_id || '',
      jumlah_kg: row.jumlah || row.berat_kg || '',
      tanggal: row._tanggal_raw ? String(row._tanggal_raw) : new Date().toISOString().slice(0, 10),
      waktu: toHHmm(row._waktu_raw) || new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
      isi_kolam_id: row.isi_kolam_id ?? null,
      _old_jumlah_kg: Number(row.jumlah || row.berat_kg || 0),
      _old_jenis: row.jenis === 'Vitamin' ? 'vitamin' : 'pakan',
    });
    setEditOpen(true);
  };

  const submitEditLog = async () => {
    const token = localStorage.getItem('token');
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    try {
      if (!editLog.id) return showNotif('ID log tidak ditemukan.', 'error');
      if (!Number(editLog.stok_pakan_id)) return showNotif('Pilih item pakan/vitamin.', 'warning');
      if (!(Number(editLog.jumlah_kg) > 0)) return showNotif('Jumlah (kg) harus > 0.', 'warning');

      // tentukan jenis baru dari stok
      const picked = feeds.find((f) => Number(f.id) === Number(editLog.stok_pakan_id));
      const newJenis = (picked?.type || '').toLowerCase() === 'vitamin' ? 'vitamin' : 'pakan';

      // PATCH ke API
      await axios.patch(
        `${API_BASE}/pemberian-pakan/${editLog.id}`,
        {
          stok_pakan_id: Number(editLog.stok_pakan_id),
          jumlah_kg: Number(editLog.jumlah_kg),
          tanggal: editLog.tanggal || new Date().toISOString().slice(0, 10),
          waktu: toHHmmss(editLog.waktu) || null,
          isi_kolam_id: editLog.isi_kolam_id ?? null,
        },
        auth,
      );

      // Hitung delta biomassa
      // pakan→pakan: new - old
      // pakan→vitamin: -old
      // vitamin→pakan: +new
      // vitamin→vitamin: 0
      const oldJumlah = Number(editLog._old_jumlah_kg || 0);
      const newJumlah = Number(editLog.jumlah_kg || 0);
      let deltaKg = 0;
      if (editLog._old_jenis === 'pakan' && newJenis === 'pakan') {
        deltaKg = newJumlah - oldJumlah;
      } else if (editLog._old_jenis === 'pakan' && newJenis === 'vitamin') {
        deltaKg = -oldJumlah;
      } else if (editLog._old_jenis === 'vitamin' && newJenis === 'pakan') {
        deltaKg = newJumlah;
      } else {
        deltaKg = 0;
      }

      if (deltaKg !== 0 && editLog.kolam_id) {
        try {
          await axios.post(`${API_BASE}/kolam/${editLog.kolam_id}/tambah_berat`, { tambahan_kg: Number(deltaKg.toFixed(3)) }, auth);
        } catch (e) {
          console.warn('Gagal update biomassa kolam:', e?.response?.data || e.message);
        }
      }

      showNotif('Log berhasil diupdate.', 'success');
      setEditOpen(false);

      if (activity.kolamId) {
        fetchFeedingLogs(activity.kolamId);
        fetchIsiKolam(activity.kolamId); // refresh biomassa snapshot
        fetchAktivitasLogs(activity.kolamId);
      }
      fetchFeeds();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.detail || err?.message || 'Gagal mengupdate log';
      showNotif(msg, 'error');
    }
  };

  // ====== RENDER ======
  return (
    <Layout>
      {/* Header */}
      <Box mb={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box sx={{ borderLeft: (t) => `4px solid ${t.palette.primary.main}`, pl: 2 }}>
            <Typography variant="h5" fontWeight="bold">
              Status Kolam
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Welcome back, {username} ({role})
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard icon={<Inventory2Icon />} label="Total Kolam" value={totalKolam} hint="Seluruh kolam terdaftar" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard icon={<ConstructionIcon />} label="Pemeliharaan" value={totalPemeliharaan} hint="Dalam masa perawatan" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard icon={<OpacityIcon />} label="Kosong" value={totalKosong} hint="Belum terisi" />
        </Grid>
      </Grid>

      <Box mb={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box sx={{ borderLeft: (t) => `4px solid ${t.palette.primary.main}`, pl: 2 }}>
            <Typography variant="h5" fontWeight="bold">
              Alat Monitoring
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Lakukan Kalibrasi Setiap Akan Memakai Sensor
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/*Kalibrasi Sensor*/}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12}>
          <Paper
            sx={{
              p: 2.5,
              borderRadius: 3,
              backgroundColor: '#fff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
              border: '1px solid #f1f1f4',
            }}
          >
            <Typography variant="h6" fontWeight="bold" mb={2}>
              Kalibrasi Sensor
            </Typography>

            {/*Sensor Calibration*/}
            {loadingSensorCalibration ? (
              <CircularProgress size={24} />
            ) : sensorCalibrationData ? (
              <Grid container spacing={3}>
                <Grid item xs={4}>
                  <Typography color="text.secondary">pH</Typography>
                  <Typography variant="h6">{sensorCalibrationData.ph}</Typography>
                </Grid>

                <Grid item xs={4}>
                  <Typography color="text.secondary">Voltage</Typography>
                  <Typography variant="h6">{sensorCalibrationData?.voltage ?? '-'} V</Typography>
                </Grid>

                <Grid item xs={4}>
                  <Typography color="text.secondary">Suhu</Typography>
                  <Typography variant="h6">{sensorCalibrationData.suhu} °C</Typography>
                </Grid>
              </Grid>
            ) : (
              <Typography color="text.secondary">Tidak ada data sensor</Typography>
            )}

            {/* Data Kalibrasi */}
            {calibration && (
              <Box mt={3}>
                <Typography fontWeight="bold">Data Voltage Kalibrasi</Typography>

                <Typography>pH 4 : {calibration.ph4 ?? '-'}</Typography>
                <Typography>pH 7 : {calibration.ph7 ?? '-'}</Typography>
                <Typography>pH 9 : {calibration.ph9 ?? '-'}</Typography>
              </Box>
            )}

            {/*Tombol Kalibrasi*/}
            <Grid container spacing={2} mt={2}>
              <Grid item>
                <Button variant="contained" disabled={isCalibrating} onClick={() => handleCalibration(4)}>
                  {isCalibrating && calibrationStep === 4 ? 'Mengambil data...' : 'Kalibrasi pH 4'}
                </Button>
              </Grid>

              <Grid item>
                <Button variant="contained" disabled={isCalibrating} onClick={() => handleCalibration(7)}>
                  {isCalibrating && calibrationStep === 7 ? 'Mengambil data...' : 'Kalibrasi pH 7'}
                </Button>
              </Grid>

              <Grid item>
                <Button variant="contained" disabled={isCalibrating} onClick={() => handleCalibration(9)}>
                  {isCalibrating && calibrationStep === 9 ? 'Mengambil data...' : 'Kalibrasi pH 9'}
                </Button>
              </Grid>
            </Grid>

            <Typography variant="h6" fontWeight="bold" mb={2} mt={4}>
              Kontrol Pompa
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                color={pompaNyala ? 'success' : 'error'}
                onClick={() => {
                  const newState = !pompaNyala;
                  setPompaNyala(newState);
                  sendControlUniversal(newState, valveTerbuka);
                }}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  fontWeight: 'bold',
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
                  sendControlUniversal(pompaNyala, newState);
                }}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  fontWeight: 'bold',
                }}
              >
                {valveTerbuka ? 'Valve Terbuka' : 'Valve Tertutup'}
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          mt: 3,
          borderRadius: 3,
          background: '#fff',
          border: '1px solid #f1f1f4',
        }}
      >
        {/* 🔹 FILTER */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField label="Cari Kolam" variant="outlined" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} fullWidth />

          <TextField select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: { sm: 220 } }}>
            <MenuItem value="">Semua</MenuItem>
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField select label="Urutan" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} sx={{ minWidth: { sm: 160 } }}>
            <MenuItem value="asc">A → Z</MenuItem>
            <MenuItem value="desc">Z → A</MenuItem>
          </TextField>
        </Stack>

        {/* 🔥 BUTTON DI BAWAH */}
        {role === 'pemilik' && (
          <Box mt={2} textAlign="left">
            <Button
              variant="contained"
              onClick={() => {
                setFormMode('add');
                setFormData({
                  nama_kolam: '',
                  panjang: '',
                  lebar: '',
                  tinggi: '',
                  diameter: '',
                  jenis_kolam: '',
                  status: DEFAULT_STATUS,
                  biaya_pembuatan: '',
                });
                setFormOpen(true);
              }}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Tambah Kolam
            </Button>
          </Box>
        )}
      </Paper>

      {/* Grid Kolam */}
      {displayedKolam.length === 0 ? (
        <Box textAlign="center" mt={5}>
          <Typography variant="h6" color="text.secondary">
            Belum ada data kolam
          </Typography>
          {role === 'pemilik' && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              Klik tombol <b>Tambah Kolam</b> untuk membuat kolam baru.
            </Typography>
          )}
        </Box>
      ) : (
        <>
          <Grid container spacing={2}>
            {visibleKolam.map((kolam) => {
              const statusColor = kolam.status === 'Sedang Pemeliharaan' ? 'warning' : kolam.status === 'Kosong' ? 'default' : 'default';

              const jenisText = kolam.jenis_kolam ?? kolam.description ?? '-';

              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={kolam.id}>
                  <Paper
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      background: '#fff',
                      border: '1px solid #f1f1f4',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      '::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: 6,
                        background: 'linear-gradient(90deg, #5856d6, #00c9a7)',
                      },
                      transition: 'transform .12s ease',
                      '&:hover': { transform: 'translateY(-2px)' },
                    }}
                    onClick={() => handleEditKolam(kolam)}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#f7f7ff', border: '1px solid #ececff' }}>
                          <OpacityIcon />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" fontWeight={700}>
                            {kolam.name}
                          </Typography>
                          <Chip size="small" color={statusColor} variant={statusColor === 'default' ? 'outlined' : 'filled'} label={kolam.status || '-'} sx={{ height: 22 }} />
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 1 }} />

                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Jenis
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {jenisText}
                        </Typography>
                      </Stack>

                      {/* Legacy tampilan lama (dipertahankan) */}
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Panjang (m)
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {kolam.panjang ?? kolam.size ?? '-'}
                        </Typography>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Lebar (m)
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {kolam.lebar ?? kolam.depth ?? '-'}
                        </Typography>
                      </Stack>

                      {/* Tambahan tampilan dimensi baru */}
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Tinggi (m)
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {kolam.tinggi ?? '-'}
                        </Typography>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Diameter (m)
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {kolam.diameter ?? '-'}
                        </Typography>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Biaya Pembuatan
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {kolam.biaya_pembuatan ? `Rp ${Number(kolam.biaya_pembuatan).toLocaleString('id-ID')}` : '-'}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1} mt={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditKolam(kolam);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/kolam/${kolam.id}`);
                          }}
                        >
                          Detail
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          {displayedKolam.length > MAX_CARDS && (
            <Box textAlign="center" mt={2}>
              <Button variant="text" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show Less' : `View More (${displayedKolam.length - MAX_CARDS})`}
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Activity Shortcut */}
      <Box mt={4}>
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, background: '#fff', border: '1px solid #f1f1f4', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
            Catat Aktivitas Kolam (Shortcut)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pilih kolam dan jenis aktivitas. Opsi dan perhitungannya disamakan dengan halaman <b>Detail Kolam</b>.
          </Typography>

          {/* Snapshot kolam terpilih */}
          {activity.kolamId && (
            <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: '#fafafe', border: '1px dashed #E0E0F0' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Typography variant="caption" color="text.secondary">
                  Biomassa: <b>{pondTotalKg.toFixed(3)} kg</b>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Populasi: <b>{pondTotalEkor} ekor</b>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Rata-rata: <b>{avgGramPerEkor.toFixed(2)} g/ekor</b>
                </Typography>
              </Stack>
            </Box>
          )}

          <Grid container spacing={2} alignItems="center">
            {/* Pilih Kolam */}
            <Grid item xs={12} sm={3}>
              <TextField select label="Pilih Kolam" value={activity.kolamId} onChange={(e) => setActivity((prev) => ({ ...prev, kolamId: e.target.value }))} fullWidth sx={{ minWidth: 300 }}>
                {kolamData.map((k) => (
                  <MenuItem key={k.id} value={k.id}>
                    {k.name} {k.status ? `(${k.status})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Jenis Aktivitas */}
            <Grid item xs={12} sm={3}>
              <TextField select label="Jenis Aktivitas" value={activity.type} onChange={(e) => setActivity((prev) => ({ ...prev, type: e.target.value }))} fullWidth sx={{ minWidth: 300 }}>
                <MenuItem value="add_fish" disabled={isKolamPemeliharaan}>
                  Tambah Ikan
                </MenuItem>
                <MenuItem value="pakan" disabled={isKolamKosong}>
                  Tambah Pakan
                </MenuItem>
                <MenuItem value="vitamin" disabled={isKolamKosong}>
                  Tambah Vitamin
                </MenuItem>
                <MenuItem value="mortalitas" disabled={isKolamKosong}>
                  Mortalitas
                </MenuItem>
                <MenuItem value="sortir" disabled={isKolamKosong}>
                  Sortir
                </MenuItem>
                <MenuItem value="panen" disabled={isKolamKosong}>
                  Panen
                </MenuItem>
              </TextField>
            </Grid>

            {/* === Dinamis per aktivitas === */}

            {/* Tambah Ikan */}
            {activity.type === 'add_fish' && (
              <>
                <Grid item xs={12} sm={4}>
                  <TextField
                    select
                    label="Stok Ikan (gudang)"
                    value={activity.ikanId}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        ikanId: e.target.value,
                        populasi: '',
                        totalBeratKg: '',
                      }))
                    }
                    fullWidth
                    sx={{ minWidth: 300 }}
                  >
                    {fishStocks.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.species} — Ukuran: {m.size || '-'} — Business Partner: {m.vendor?.name || '-'} — Stok: {m.quantity ?? 0} ekor, {m.total_kg ?? '-'} kg
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField
                    type="number"
                    label="Jumlah Ekor"
                    value={activity.populasi}
                    onChange={(e) => {
                      const qty = Number(e.target.value || 0);
                      const selected = fishStocks.find((x) => Number(x.id) === Number(activity.ikanId));
                      let kg = activity.totalBeratKg;
                      if (selected && selected.quantity > 0 && selected.total_kg > 0) {
                        kg = Number(((qty / selected.quantity) * selected.total_kg).toFixed(3));
                      }
                      setActivity((p) => ({
                        ...p,
                        populasi: qty,
                        totalBeratKg: kg,
                      }));
                    }}
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField
                    type="number"
                    label="Total Berat (kg)"
                    value={activity.totalBeratKg}
                    inputProps={{ step: '0.001' }}
                    onChange={(e) => {
                      const kg = Number(e.target.value || 0);
                      const selected = fishStocks.find((x) => Number(x.id) === Number(activity.ikanId));
                      let qty = '';
                      if (selected && selected.total_kg > 0) {
                        qty = Math.round((kg / selected.total_kg) * selected.quantity);
                      }
                      setActivity((p) => ({
                        ...p,
                        totalBeratKg: kg,
                        populasi: qty,
                      }));
                    }}
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={activity.tanggal} onChange={(e) => setActivity((p) => ({ ...p, tanggal: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
              </>
            )}

            {/* Tambah Pakan */}
            {activity.type === 'pakan' && (
              <>
                <Grid item xs={12} sm={3}>
                  <TextField
                    select
                    label="Mode Pemberian"
                    value={activity.feedingMode}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        feedingMode: e.target.value,
                      }))
                    }
                    helperText={activity.feedingMode === 'manual' ? 'Isi jumlah pakan manual' : `Otomatis ${percentFromMode(activity.feedingMode) * 100}% biomassa`}
                    fullWidth
                    sx={{ minWidth: 300 }}
                  >
                    <MenuItem value="manual">Manual</MenuItem>
                    <MenuItem value="auto_3">Otomatis (3%)</MenuItem>
                    <MenuItem value="auto_4">Otomatis (4%)</MenuItem>
                    <MenuItem value="auto_5">Otomatis (5%)</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField select label="Pilih Pakan (bukan vitamin)" value={activity.feedId} onChange={(e) => setActivity((p) => ({ ...p, feedId: e.target.value }))} fullWidth sx={{ minWidth: 300 }}>
                    {feeds
                      .filter((f) => (f.type || '').toLowerCase() !== 'vitamin')
                      .map((feed) => (
                        <MenuItem key={feed.id} value={feed.id}>
                          {feed.name} ({feed.type || 'pakan'}) — Stok: {feed.quantity_kg ?? feed.quantity ?? 0} kg
                        </MenuItem>
                      ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={2}>
                  <TextField
                    type="number"
                    label="Jumlah (kg)"
                    value={percentFromMode(activity.feedingMode) ? Number((pondTotalKg * percentFromMode(activity.feedingMode)).toFixed(3)) : activity.jumlahPakan}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        jumlahPakan: e.target.value,
                      }))
                    }
                    disabled={Boolean(percentFromMode(activity.feedingMode))}
                    helperText={percentFromMode(activity.feedingMode) ? `Auto ${percentFromMode(activity.feedingMode) * 100}% biomassa` : ''}
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={activity.tanggal} onChange={(e) => setActivity((p) => ({ ...p, tanggal: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="time" label="Waktu" InputLabelProps={{ shrink: true }} value={activity.waktu} onChange={(e) => setActivity((p) => ({ ...p, waktu: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f8f9ff', minWidth: 300 }}>
                    <Typography variant="caption" color="text.secondary">
                      Biomassa saat ini: {pondTotalKg.toFixed(3)} kg
                    </Typography>
                  </Box>
                </Grid>
              </>
            )}

            {/* Vitamin */}
            {activity.type === 'vitamin' && (
              <>
                <Grid item xs={12} sm={5}>
                  <TextField select label="Pilih Vitamin" value={activity.feedId} onChange={(e) => setActivity((p) => ({ ...p, feedId: e.target.value }))} fullWidth sx={{ minWidth: 300 }}>
                    {feeds
                      .filter((f) => (f.type || '').toLowerCase() === 'vitamin')
                      .map((feed) => (
                        <MenuItem key={feed.id} value={feed.id}>
                          {feed.name} (vitamin) — Stok: {feed.quantity_kg ?? feed.quantity ?? 0} kg
                        </MenuItem>
                      ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="number"
                    label="Jumlah (kg)"
                    value={activity.jumlahPakan}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        jumlahPakan: e.target.value,
                      }))
                    }
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
                <Grid item xs={12} sm={2}>
                  <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={activity.tanggal} onChange={(e) => setActivity((p) => ({ ...p, tanggal: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
                <Grid item xs={12} sm={2}>
                  <TextField type="time" label="Waktu" InputLabelProps={{ shrink: true }} value={activity.waktu} onChange={(e) => setActivity((p) => ({ ...p, waktu: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
              </>
            )}

            {/* Mortalitas */}
            {activity.type === 'mortalitas' && (
              <>
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="number"
                    label="Jumlah Mati"
                    value={activity.jumlahMati}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        jumlahMati: e.target.value,
                      }))
                    }
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={activity.tanggal} onChange={(e) => setActivity((p) => ({ ...p, tanggal: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="time" label="Waktu" InputLabelProps={{ shrink: true }} value={activity.waktu} onChange={(e) => setActivity((p) => ({ ...p, waktu: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    label="Keterangan"
                    value={activity.keterangan}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        keterangan: e.target.value,
                      }))
                    }
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
              </>
            )}

            {/* Sortir */}
            {activity.type === 'sortir' && (
              <>
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="date"
                    label="Tanggal Sortir"
                    InputLabelProps={{ shrink: true }}
                    value={activity.tanggalSortir}
                    onChange={(e) =>
                      setActivity((p) => ({
                        ...p,
                        tanggalSortir: e.target.value,
                      }))
                    }
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#fafafe', border: '1px dashed #E0E0F0' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Tujuan Sortir: pilih ukuran → kolam tujuan (kosong/ukuran sama) → isi ekor & berat (kg).
                    </Typography>

                    {(activity.movements || []).map((m, idx) => {
                      const allowed = allowedTargetsForRow(m);
                      return (
                        <Grid container spacing={1} alignItems="center" key={idx} sx={{ mb: 1 }}>
                          <Grid item xs={12} sm={3}>
                            <TextField
                              select
                              size="small"
                              label="Ukuran"
                              value={m.refUkuranId || ''}
                              onChange={(e) => {
                                const v = e.target.value ? Number(e.target.value) : '';
                                const rows = [...activity.movements];
                                const next = { ...(rows[idx] || {}), refUkuranId: v };
                                if (next.toKolamId) {
                                  const sizeName = ukuranById[Number(v)];
                                  const sizes = kolamSizeIndex[next.toKolamId] || [];
                                  const targetKolam = allKolams.find((k) => k.id === next.toKolamId);
                                  const targetKosong = targetKolam?.status === 'Kosong' || sizes.length === 0;
                                  const isMatch = sizeName && sizes.includes(sizeName);
                                  if (!(targetKosong || isMatch)) next.toKolamId = '';
                                }
                                rows[idx] = next;
                                setActivity((p) => ({
                                  ...p,
                                  movements: rows,
                                }));
                              }}
                              fullWidth
                              sx={{ minWidth: 300 }}
                            >
                              <MenuItem value="">Pilih ukuran...</MenuItem>
                              {ukuranRef.map((u) => (
                                <MenuItem key={u.id} value={u.id}>
                                  {composeSizeLabel(u.name || u.label, u.ukuran)}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>

                          <Grid item xs={12} sm={4}>
                            <TextField
                              select
                              size="small"
                              label="Kolam Tujuan"
                              value={m.toKolamId || ''}
                              onChange={(e) => {
                                const rows = [...activity.movements];
                                rows[idx] = {
                                  ...(rows[idx] || {}),
                                  toKolamId: Number(e.target.value),
                                };
                                setActivity((p) => ({
                                  ...p,
                                  movements: rows,
                                }));
                              }}
                              disabled={!m.refUkuranId}
                              helperText={!m.refUkuranId ? 'Pilih ukuran dulu' : ''}
                              fullWidth
                              sx={{ minWidth: 300 }}
                            >
                              <MenuItem value="">Pilih kolam...</MenuItem>
                              {allowed.map((k) => (
                                <MenuItem key={k.id} value={k.id}>
                                  {k.name} — {k.status || '-'}
                                  {Array.isArray(kolamSizeIndex[k.id]) && kolamSizeIndex[k.id].length > 0 ? ` (ukuran: ${kolamSizeIndex[k.id].join(', ')})` : ' (kosong)'}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>

                          <Grid item xs={6} sm={2}>
                            <TextField
                              size="small"
                              type="number"
                              label="Ekor"
                              value={m.jumlahEkor || ''}
                              onChange={(e) => {
                                const rows = [...activity.movements];
                                rows[idx] = {
                                  ...(rows[idx] || {}),
                                  jumlahEkor: e.target.value,
                                };
                                setActivity((p) => ({
                                  ...p,
                                  movements: rows,
                                }));
                              }}
                              fullWidth
                              sx={{ minWidth: 300 }}
                            />
                          </Grid>
                          <Grid item xs={6} sm={2}>
                            <TextField
                              size="small"
                              type="number"
                              label="Berat (kg)"
                              value={m.beratKg || ''}
                              inputProps={{ step: '0.001' }}
                              onChange={(e) => {
                                const rows = [...activity.movements];
                                rows[idx] = {
                                  ...(rows[idx] || {}),
                                  beratKg: e.target.value,
                                };
                                setActivity((p) => ({
                                  ...p,
                                  movements: rows,
                                }));
                              }}
                              fullWidth
                              sx={{ minWidth: 300 }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={1}>
                            <Button
                              onClick={() => {
                                const rows = (activity.movements || []).filter((_, i) => i !== idx);
                                setActivity((p) => ({
                                  ...p,
                                  movements: rows,
                                }));
                              }}
                              color="error"
                              variant="outlined"
                              size="small"
                            >
                              Hapus
                            </Button>
                          </Grid>
                        </Grid>
                      );
                    })}

                    <Box>
                      <Button
                        size="small"
                        onClick={() =>
                          setActivity((p) => ({
                            ...p,
                            movements: [
                              ...(p.movements || []),
                              {
                                refUkuranId: '',
                                toKolamId: '',
                                jumlahEkor: '',
                                beratKg: '',
                              },
                            ],
                          }))
                        }
                      >
                        + Tambah Tujuan
                      </Button>
                    </Box>

                    <Box mt={1} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f8f9ff' }}>
                      <Typography variant="subtitle2">Ringkasan Sortir</Typography>
                      <Typography variant="body2">Rasio kolam: {avgGramPerEkor ? `${avgGramPerEkor.toFixed(2)} g/ekor` : '-'}</Typography>
                      <Typography variant="body2">
                        Dipindah: {(activity.movements || []).reduce((s, m) => s + Number(m.jumlahEkor || 0), 0)} ekor, {Number((activity.movements || []).reduce((s, m) => s + Number(m.beratKg || 0), 0)).toFixed(3)} kg
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </>
            )}

            {/* Panen */}
            {activity.type === 'panen' && (
              <>
                <Grid item xs={12} sm={3}>
                  <TextField select label="Tipe Panen" value={activity.panenType} onChange={(e) => setActivity((p) => ({ ...p, panenType: e.target.value }))} fullWidth sx={{ minWidth: 300 }}>
                    <MenuItem value="penuh">Panen Penuh</MenuItem>
                    <MenuItem value="parsial">Panen Parsial</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="date" label="Tanggal" InputLabelProps={{ shrink: true }} value={activity.panenTanggal} onChange={(e) => setActivity((p) => ({ ...p, panenTanggal: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>

                {/* Vendor pembeli */}
                <Grid item xs={12} sm={3}>
                  <TextField select label="Business Partner Pembeli" value={activity.panenVendorId} onChange={(e) => setActivity((p) => ({ ...p, panenVendorId: e.target.value }))} helperText="Wajib dipilih" fullWidth sx={{ minWidth: 300 }}>
                    <MenuItem value="">Pilih Business Partner...</MenuItem>
                    {vendorsRef.map((v) => (
                      <MenuItem key={v.id} value={v.id}>
                        {v.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                {activity.panenType === 'parsial' && (
                  <Grid item xs={12} sm={3}>
                    <TextField
                      type="number"
                      label="Jumlah Ekor"
                      value={activity.panenJumlahEkor}
                      onChange={(e) => setActivity((p) => ({ ...p, panenJumlahEkor: e.target.value }))}
                      helperText={`Tidak boleh mencapai total ekor (${pondTotalEkor})`}
                      fullWidth
                      sx={{ minWidth: 300 }}
                    />
                  </Grid>
                )}
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="number"
                    label="Berat Aktual (kg)"
                    value={activity.panenTotalKg}
                    onChange={(e) => setActivity((p) => ({ ...p, panenTotalKg: e.target.value }))}
                    helperText={activity.panenType === 'penuh' ? `Ekspektasi: ${pondTotalKg.toFixed(3)} kg` : `Ekspektasi subset: ${((avgGramPerEkor / 1000) * Number(activity.panenJumlahEkor || 0) || 0).toFixed(3)} kg`}
                    fullWidth
                    sx={{ minWidth: 300 }}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField type="number" label="Harga Jual/kg" value={activity.hargaJual} onChange={(e) => setActivity((p) => ({ ...p, hargaJual: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
                <Grid item xs={12} sm={9}>
                  <TextField label="Keterangan (opsional)" value={activity.panenKeterangan} onChange={(e) => setActivity((p) => ({ ...p, panenKeterangan: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
                </Grid>
              </>
            )}

            {/* Tombol Aksi */}
            <Grid item xs={12}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() =>
                    setActivity({
                      kolamId: '',
                      type: '',
                      ikanId: '',
                      populasi: '',
                      totalBeratKg: '',
                      tanggal: new Date().toISOString().split('T')[0],
                      feedingMode: 'manual',
                      feedId: '',
                      jumlahPakan: '',
                      jumlahMati: '',
                      waktu: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
                      keterangan: '',
                      movements: [],
                      tanggalSortir: new Date().toISOString().split('T')[0],
                      panenType: 'penuh',
                      panenTanggal: new Date().toISOString().split('T')[0],
                      panenJumlahEkor: '',
                      panenTotalKg: '',
                      hargaJual: '',
                      panenKeterangan: '',
                      panenVendorId: '',
                    })
                  }
                >
                  Reset
                </Button>
                <Button variant="contained" onClick={handleActivitySubmit}>
                  Simpan
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* Log Aktivitas */}
      <Box mt={2}>
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, background: '#fff', border: '1px solid #f1f1f4', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }} spacing={1}>
            <Typography variant="h6" fontWeight="bold">
              Log Aktivitas {activity.kolamId ? `— Kolam #${activity.kolamId}` : ''}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  if (activity.kolamId) {
                    fetchFeedingLogs(activity.kolamId);
                    fetchDeathLogs(activity.kolamId);
                    fetchAktivitasLogs(activity.kolamId);
                    fetchIsiKolam(activity.kolamId);
                  }
                }}
                disabled={!activity.kolamId}
              >
                Refresh
              </Button>
              <Button variant="outlined" size="small" onClick={exportLogsCSV} disabled={combinedLogs.length === 0}>
                Export CSV
              </Button>
            </Stack>
          </Stack>

          {!activity.kolamId ? (
            <Typography variant="body2" color="text.secondary">
              Pilih kolam pada panel <b>Catat Aktivitas Kolam</b> untuk melihat log aktivitas.
            </Typography>
          ) : combinedLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Belum ada log aktivitas untuk kolam ini.
            </Typography>
          ) : isMobile ? (
            <Stack spacing={1}>
              {combinedLogs.map((log, i) => (
                <LogCard key={i} log={log} onEdit={log.jenis === 'Pakan' || log.jenis === 'Vitamin' ? openEditLog : undefined} />
              ))}
            </Stack>
          ) : (
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#5856d6' }}>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Waktu</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Jenis</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Nama</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Qty (ekor)</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Berat (kg)</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Keterangan</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 'bold' }} align="right">
                      Aksi
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {combinedLogs.map((log, i) => (
                    <TableRow key={i}>
                      <TableCell>{log.waktu}</TableCell>
                      <TableCell>
                        <Chip size="small" label={log.jenis} color={log.jenis === 'Vitamin' ? 'warning' : log.jenis === 'Mortalitas' ? 'error' : 'default'} variant={log.jenis === 'Pakan' ? 'outlined' : 'filled'} />
                      </TableCell>
                      <TableCell>{log.nama}</TableCell>
                      <TableCell>{log.qty_ekor != null && log.qty_ekor !== 0 ? `${log.qty_ekor} ekor` : '-'}</TableCell>
                      <TableCell>{log.berat_kg != null && log.berat_kg !== 0 ? `${Number(log.berat_kg).toFixed(3)} kg` : '-'}</TableCell>
                      <TableCell>{log.keterangan || '-'}</TableCell>
                      <TableCell align="right">
                        {(log.jenis === 'Pakan' || log.jenis === 'Vitamin') && (
                          <Button size="small" variant="outlined" onClick={() => openEditLog(log)}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>

      {/* Modal Tambah/Edit Kolam */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{formMode === 'add' ? 'Tambah Kolam' : 'Edit Kolam'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Nama Kolam"
            value={formData.nama_kolam}
            onChange={(e) => setFormData({ ...formData, nama_kolam: e.target.value })}
            fullWidth
            margin="dense"
            disabled={role !== 'pemilik' && formMode === 'add'}
            sx={{ minWidth: 300 }}
          />

          {/* Jenis Kolam dari reference */}
          <TextField
            select
            label="Jenis Kolam"
            value={formData.jenis_kolam}
            onChange={(e) => {
              const val = e.target.value;
              // saat ganti jenis, kosongkan field yang tidak relevan agar tidak terkirim
              const next = { ...formData, jenis_kolam: val };
              const bulat = (val || '').toLowerCase().includes('bulat');
              const kotak = (val || '').toLowerCase().includes('kotak');
              if (bulat) {
                next.panjang = '';
                next.lebar = '';
              }
              if (kotak) {
                next.diameter = '';
              }
              setFormData(next);
            }}
            fullWidth
            margin="dense"
            sx={{ minWidth: 300 }}
          >
            {jenisKolamRef.map((j) => (
              <MenuItem key={j.id} value={j.name}>
                {j.name}
              </MenuItem>
            ))}
          </TextField>

          {/* Dimensi dinamis */}
          {/* Kolam KOTAK: Panjang, Lebar, Tinggi */}
          {(isKotak || (!isBulat && !isKotak)) && (
            <>
              <TextField
                label="Panjang (m)"
                type="number"
                value={formData.panjang}
                onChange={(e) => setFormData({ ...formData, panjang: e.target.value })}
                fullWidth
                margin="dense"
                disabled={isBulat || (role !== 'pemilik' && formMode === 'add')}
                sx={{ minWidth: 300 }}
              />
              <TextField
                label="Lebar (m)"
                type="number"
                value={formData.lebar}
                onChange={(e) => setFormData({ ...formData, lebar: e.target.value })}
                fullWidth
                margin="dense"
                disabled={isBulat || (role !== 'pemilik' && formMode === 'add')}
                sx={{ minWidth: 300 }}
              />
            </>
          )}

          {/* Tinggi untuk kedua kasus */}
          <TextField
            label="Tinggi (m)"
            type="number"
            value={formData.tinggi}
            onChange={(e) => setFormData({ ...formData, tinggi: e.target.value })}
            fullWidth
            margin="dense"
            disabled={role !== 'pemilik' && formMode === 'add'}
            sx={{ minWidth: 300 }}
          />

          {/* Kolam BULAT: Diameter */}
          {(isBulat || (!isBulat && !isKotak)) && (
            <TextField
              label="Diameter (m)"
              type="number"
              value={formData.diameter}
              onChange={(e) => setFormData({ ...formData, diameter: e.target.value })}
              fullWidth
              margin="dense"
              disabled={isKotak || (role !== 'pemilik' && formMode === 'add')}
              sx={{ minWidth: 300 }}
            />
          )}

          {/* === BARU: Biaya pembuatan kolam === */}
          <TextField
            label="Biaya Pembuatan Kolam (Rp)"
            type="number"
            value={formData.biaya_pembuatan}
            onChange={(e) => setFormData({ ...formData, biaya_pembuatan: e.target.value })}
            fullWidth
            margin="dense"
            disabled={role !== 'pemilik' && formMode === 'add'}
            helperText="Opsional. Jika diisi, akan tercatat sebagai pengeluaran dan mengurangi saldo kas."
            sx={{ minWidth: 300 }}
          />

          {formMode === 'edit' && <TextField label="Status (read-only)" value={formData.status} fullWidth margin="dense" InputProps={{ readOnly: true }} helperText="Status tidak bisa diubah dari sini" sx={{ minWidth: 300 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Batal</Button>
          {role === 'pemilik' && formMode === 'edit' && selectedKolamId && (
            <>
              <Button variant="outlined" color="primary" onClick={() => navigate(`/kolam/${selectedKolamId}`)}>
                Detail
              </Button>
              <Button variant="contained" color="error" onClick={handleDeleteKolam} disabled={formData.status !== 'Kosong'} title={formData.status !== 'Kosong' ? 'Kolam hanya bisa dihapus jika status Kosong' : ''}>
                Hapus
              </Button>
            </>
          )}
          {(role === 'pemilik' || role === 'petani') && (
            <Button variant="contained" onClick={handleFormSubmit} disabled={role !== 'pemilik' && formMode === 'add'}>
              Simpan
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog Edit Pemberian Pakan/Vitamin */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Pemberian {editLog._old_jenis === 'vitamin' ? 'Vitamin' : 'Pakan'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              select
              label="Jenis"
              value={editLog.jenis}
              onChange={(e) =>
                setEditLog((p) => ({
                  ...p,
                  jenis: e.target.value,
                  stok_pakan_id: '',
                }))
              }
              helperText="Pilih kategori untuk memfilter stok"
              fullWidth
              sx={{ minWidth: 300 }}
            >
              <MenuItem value="pakan">Pakan</MenuItem>
              <MenuItem value="vitamin">Vitamin</MenuItem>
            </TextField>

            <TextField
              select
              label={editLog.jenis === 'vitamin' ? 'Pilih Vitamin' : 'Pilih Pakan'}
              value={editLog.stok_pakan_id}
              onChange={(e) => setEditLog((p) => ({ ...p, stok_pakan_id: e.target.value }))}
              fullWidth
              sx={{ minWidth: 300 }}
            >
              {(editLog.jenis === 'vitamin' ? feeds.filter((f) => (f.type || '').toLowerCase() === 'vitamin') : feeds.filter((f) => (f.type || '').toLowerCase() !== 'vitamin')).map((feed) => (
                <MenuItem key={feed.id} value={feed.id}>
                  {feed.name} {editLog.jenis === 'vitamin' ? '(vitamin)' : `(${feed.type || 'pakan'})`} — Stok: {feed.quantity_kg ?? feed.quantity ?? 0} kg
                </MenuItem>
              ))}
            </TextField>

            <TextField type="number" label="Jumlah (kg)" value={editLog.jumlah_kg} onChange={(e) => setEditLog((p) => ({ ...p, jumlah_kg: e.target.value }))} inputProps={{ step: '0.001' }} fullWidth sx={{ minWidth: 300 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField type="date" label="Tanggal Pemberian" InputLabelProps={{ shrink: true }} value={editLog.tanggal} onChange={(e) => setEditLog((p) => ({ ...p, tanggal: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField type="time" label="Waktu" InputLabelProps={{ shrink: true }} value={editLog.waktu} onChange={(e) => setEditLog((p) => ({ ...p, waktu: e.target.value }))} fullWidth sx={{ minWidth: 300 }} />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={submitEditLog}>
            Simpan Perubahan
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={notif.open} autoHideDuration={4000} onClose={handleCloseNotif} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={handleCloseNotif} severity={notif.severity} sx={{ width: '100%' }}>
          {notif.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
