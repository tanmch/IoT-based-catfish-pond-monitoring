// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Divider,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Collapse,
  Tooltip,
  CircularProgress,
  Button,
  Alert,
  Grid,
  TableContainer,
  useMediaQuery,
  Card,
  CardContent,
} from '@mui/material';
import Layout from '../components/Layout';
import axios from 'axios';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import TrendingDownOutlinedIcon from '@mui/icons-material/TrendingDownOutlined';
import OpacityOutlinedIcon from '@mui/icons-material/OpacityOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import BubbleChartOutlinedIcon from '@mui/icons-material/BubbleChartOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useTheme } from '@mui/material/styles';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE = 'http://103.103.22.213/api';
const PANEN_MAX_ROWS = 10000; // fallback aggregator (selaras Panen.jsx)

/* ================= Helpers ================= */
const toNum = (v, d = 0) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const formatRp = (v) => (Number.isFinite(Number(v)) ? 'Rp ' + Math.round(Number(v)).toLocaleString('id-ID') : '-');

const parseDate = (s) => {
  try {
    return s ? new Date(s) : null;
  } catch {
    return null;
  }
};

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const lastNMonths = (n) => {
  const arr = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({
      key: monthKey(d),
      label: d.toLocaleString('id-ID', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(-2),
    });
  }
  return arr;
};

/* ============== Small stat card ============== */
function StatCard({ icon, title, value, hint, accent = '#7C3AED' }) {
  return (
    <Paper
      sx={{
        p: 2.25,
        borderRadius: 3,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        background: '#fff',
        border: '1px solid #f1f1f4',
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
        position: 'relative',
        overflow: 'hidden',
        '::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          height: 4,
          width: '100%',
          background: `linear-gradient(90deg, ${accent}, #22c1c3)`,
          opacity: 0.6,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(124,58,237,0.06)',
            border: '1px solid #ececff',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h6" fontWeight={700} noWrap>
            {value}
          </Typography>
          {hint ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {hint}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
}

/* ============== Row kolam (expand) - Desktop ============== */
function KolamRow({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow hover>
        <TableCell width={56}>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{row.nama}</TableCell>
        <TableCell align="right">{formatRp(row.ikan)}</TableCell>
        <TableCell align="right">{formatRp(row.pakanCost)}</TableCell>
        <TableCell align="right">{formatRp(row.vitaminCost)}</TableCell>
        <TableCell align="right">
          <Chip size="small" color="primary" label={formatRp(row.total)} />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                bgcolor: 'transparent',
                borderTop: '1px dashed rgba(2,6,23,0.08)',
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Breakdown batch (isi kolam)
              </Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Spesies/Ukuran</TableCell>
                      <TableCell align="right">Ekor</TableCell>
                      <TableCell align="right">Total kg</TableCell>
                      <TableCell align="right">Harga snapshot</TableCell>
                      <TableCell align="right">Aset Ikan</TableCell>
                      <TableCell align="right">Biaya Pakan</TableCell>
                      <TableCell align="right">Biaya Vitamin</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {row.breakdown.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {b.species} — {b.ukuran || '-'}
                        </TableCell>
                        <TableCell align="right">{b.jumlah_ekor}</TableCell>
                        <TableCell align="right">{toNum(b.total_kg, 0).toFixed(2)}</TableCell>
                        <TableCell align="right">{toNum(b.harga_per_kg_snapshot, 0) > 0 ? `${formatRp(b.harga_per_kg_snapshot)}/kg` : toNum(b.harga_per_unit_snapshot, 0) > 0 ? `${formatRp(b.harga_per_unit_snapshot)}/ekor` : '-'}</TableCell>
                        <TableCell align="right">{formatRp(b.aset)}</TableCell>
                        <TableCell align="right">{formatRp(b.feed_cost_accum)}</TableCell>
                        <TableCell align="right">{formatRp(b.vitamin_cost_accum)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/* ============== Kartu kolam (expand) - Mobile ============== */
function KolamCardMobile({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#f1f1f4', background: '#fff' }}>
      <CardContent sx={{ p: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>
            {row.nama}
          </Typography>
          <IconButton size="small" onClick={() => setOpen((o) => !o)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </Stack>

        <Divider sx={{ my: 1 }} />

        <Stack spacing={0.5}>
          <Stack direction="row" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Aset Ikan
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatRp(row.ikan)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Biaya Pakan (akum.)
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatRp(row.pakanCost)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Biaya Vitamin (akum.)
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatRp(row.vitaminCost)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2">Total</Typography>
            <Chip size="small" color="primary" label={formatRp(row.total)} />
          </Stack>
        </Stack>

        <Collapse in={open} timeout="auto" unmountOnExit>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Breakdown batch (isi kolam)
          </Typography>
          <Stack spacing={1} mt={0.5}>
            {row.breakdown.map((b, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1, borderRadius: 1.5, borderColor: '#efeff5' }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">
                    {b.species} — {b.ukuran || '-'}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatRp(b.aset)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary" variant="caption">
                    Ekor / Kg
                  </Typography>
                  <Typography color="text.secondary" variant="caption">
                    {b.jumlah_ekor} / {toNum(b.total_kg, 0).toFixed(2)}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}

/* ===================== Dashboard ===================== */
export default function Dashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data
  const [summary, setSummary] = useState({
    total_pemasukan: 0,
    total_pengeluaran: 0,
    saldo: 0,
  });
  const [kolamList, setKolamList] = useState([]);
  const [perKolamFish, setPerKolamFish] = useState({}); // id -> array isi_kolam
  const [transactions, setTransactions] = useState([]);
  const [panenSummary, setPanenSummary] = useState({
    total_transaksi: 0,
    total_berat: 0,
    total_penjualan: 0,
    total_laba_rugi: 0,
    avg_fcr: null,
    avg_harga_jual: null,
    _source: 'summary', // "summary" | "computed"
  });

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  // ===== util aggregator (selaras Panen.jsx) =====
  const computePanenSummaryFromRows = (rows) => {
    let totalTrans = 0;
    let totalKg = 0;
    let totalPenjualan = 0;
    let totalLabaRugi = 0;
    let sumFcr = 0;
    let cntFcr = 0;

    // Weighted avg harga jual (berdasar kg)
    let wHargaNumer = 0; // Σ(harga_jual * kg)
    let wHargaDenom = 0; // Σ(kg)

    (rows || []).forEach((p) => {
      const kg = toNum(p.total_berat_kg, 0);
      const harga = toNum(p.harga_jual, 0);
      const lr = toNum(p.laba_rugi, 0);
      const total_penjualan = p.total_penjualan !== undefined && p.total_penjualan !== null ? toNum(p.total_penjualan, 0) : kg * harga;

      totalTrans += 1;
      totalKg += kg;
      totalPenjualan += total_penjualan;
      totalLabaRugi += lr;

      const fcrVal = p.fcr !== null && p.fcr !== undefined ? Number(p.fcr) : null;
      if (Number.isFinite(fcrVal)) {
        sumFcr += fcrVal;
        cntFcr += 1;
      }

      if (kg > 0) {
        wHargaNumer += harga * kg;
        wHargaDenom += kg;
      }
    });

    return {
      total_transaksi: totalTrans,
      total_berat: totalKg,
      total_penjualan: totalPenjualan,
      total_laba_rugi: totalLabaRugi,
      avg_fcr: cntFcr > 0 ? sumFcr / cntFcr : null,
      avg_harga_jual: wHargaDenom > 0 ? wHargaNumer / wHargaDenom : null,
      _source: 'computed',
    };
  };

  // ---- Panen summary fallback via list (/kolam/kolam/0/panen) ----
  const fetchPanenSummaryFromList = async () => {
    try {
      // Mengikuti pola Panen.jsx: kolamId "0" = semua
      const url = `${API_BASE}/kolam/kolam/0/panen`;
      const params = { page: 1, per_page: PANEN_MAX_ROWS };
      const res = await axios.get(url, { headers, params });

      const payload = res?.data || {};
      const rows = Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : [];

      const agg = computePanenSummaryFromRows(rows);
      setPanenSummary(agg);
    } catch (err2) {
      setPanenSummary({
        total_transaksi: 0,
        total_berat: 0,
        total_penjualan: 0,
        total_laba_rugi: 0,
        avg_fcr: null,
        avg_harga_jual: null,
        _source: 'computed',
      });
    }
  };

  // ---- Panen summary (dengan fallback robust) ----
  const fetchPanenSummaryWithFallback = async () => {
    try {
      const res = await axios.get(`${API_BASE}/kolam/panen/summary`, {
        headers,
      });
      const data = res.data || {};
      const normalized = {
        total_transaksi: toNum(data.total_transaksi, 0),
        total_berat: toNum(data.total_berat, 0),
        total_penjualan: toNum(data.total_penjualan, 0),
        total_laba_rugi: toNum(data.total_laba_rugi, 0),
        avg_fcr: data.avg_fcr !== null && data.avg_fcr !== undefined ? Number(data.avg_fcr) : null,
        avg_harga_jual: data.avg_harga_jual !== null && data.avg_harga_jual !== undefined ? Number(data.avg_harga_jual) : null,
        _source: 'summary',
      };

      const invalidSummary =
        normalized.total_transaksi === 0 &&
        normalized.total_berat === 0 &&
        normalized.total_penjualan === 0 &&
        normalized.total_laba_rugi === 0 &&
        (normalized.avg_fcr === null || Number.isNaN(normalized.avg_fcr)) &&
        (normalized.avg_harga_jual === null || Number.isNaN(normalized.avg_harga_jual));

      if (invalidSummary) {
        await fetchPanenSummaryFromList();
      } else {
        setPanenSummary(normalized);
      }
    } catch {
      await fetchPanenSummaryFromList();
    }
  };

  // ---- Fetch all ----
  const fetchAll = async () => {
    if (!token) {
      setError('Belum login. Silakan login dulu.');
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [sumRes, txRes, kolamRes] = await Promise.all([axios.get(`${API_BASE}/transaksi/summary`, { headers }), axios.get(`${API_BASE}/transaksi`, { headers }), axios.get(`${API_BASE}/kolam`, { headers })]);

      setSummary(sumRes.data || { total_pemasukan: 0, total_pengeluaran: 0, saldo: 0 });
      const txList = Array.isArray(txRes.data) ? txRes.data : [];
      setTransactions(txList);

      const kList = Array.isArray(kolamRes.data) ? kolamRes.data : [];
      setKolamList(kList);

      // Ambil isi kolam per kolam (untuk aset/top-5)
      const fishPairs = await Promise.all(
        kList.map((k) =>
          axios
            .get(`${API_BASE}/kolam/${k.id}/fish`, { headers })
            .then((r) => [k.id, r.data || []])
            .catch(() => [k.id, []]),
        ),
      );
      const map = {};
      fishPairs.forEach(([id, fish]) => (map[id] = fish));
      setPerKolamFish(map);

      // Panen summary (summary -> fallback ke list aggregator)
      await fetchPanenSummaryWithFallback();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.detail ? `Gagal memuat data: ${e.response.data.detail}` : 'Gagal memuat data dashboard. Cek koneksi/console.');
      try {
        await fetchPanenSummaryWithFallback();
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============ Derived KPI ============ */
  const totalKolam = kolamList.length;

  const { totalBiomassaKg, totalEkor, avgBeratGram } = useMemo(() => {
    let kg = 0;
    let ekor = 0;
    Object.values(perKolamFish).forEach((arr) => {
      (arr || []).forEach((f) => {
        kg += toNum(f.total_kg, 0);
        ekor += toNum(f.jumlah_ekor, 0);
      });
    });
    const avg = ekor > 0 ? (kg / ekor) * 1000 : 0;
    return { totalBiomassaKg: kg, totalEkor: ekor, avgBeratGram: avg };
  }, [perKolamFish]);

  /* ============ Aset per kolam + top 5 ============ */
  const asetPerKolam = useMemo(() => {
    return (kolamList || []).map((k) => {
      const fishArr = perKolamFish[k.id] || [];
      let ikan = 0;
      let pakanCost = 0;
      let vitaminCost = 0;

      const breakdown = fishArr.map((f) => {
        const qty = toNum(f.jumlah_ekor, 0);
        const totalKg = toNum(f.total_kg, 0);
        const pk = toNum(f.harga_per_kg_snapshot, 0);
        const pu = toNum(f.harga_per_unit_snapshot, 0);

        let aset = 0;
        if (pk > 0 && totalKg > 0) aset = pk * totalKg;
        else if (pu > 0 && qty > 0) aset = pu * qty;

        const feedC = toNum(f.feed_cost_accum, 0);
        const vitC = toNum(f.vitamin_cost_accum, 0);

        ikan += aset;
        pakanCost += feedC;
        vitaminCost += vitC;

        return {
          species: f?.ikan?.species || 'Ikan',
          ukuran: f.ukuran_ikan_snapshot || null,
          jumlah_ekor: qty,
          total_kg: totalKg,
          harga_per_kg_snapshot: pk,
          harga_per_unit_snapshot: pu,
          aset,
          feed_cost_accum: feedC,
          vitamin_cost_accum: vitC,
        };
      });

      return {
        id: k.id,
        nama: k.name || k.nama || `Kolam ${k.id}`,
        ikan,
        pakanCost,
        vitaminCost,
        total: ikan + pakanCost + vitaminCost,
        breakdown,
      };
    });
  }, [kolamList, perKolamFish]);

  const top5Kolam = useMemo(() => [...asetPerKolam].sort((a, b) => b.total - a.total).slice(0, 5), [asetPerKolam]);

  const totalAsetKolam = useMemo(() => asetPerKolam.reduce((s, k) => s + (k.total || 0), 0), [asetPerKolam]);

  /* ============ Monthly (Income vs Expense) ============ */
  const monthlyBar = useMemo(() => {
    const base = Object.fromEntries(lastNMonths(8).map((m) => [m.key, { month: m.label, pemasukan: 0, pengeluaran: 0 }]));

    (transactions || []).forEach((t) => {
      const d = parseDate(t.tanggal || t.created_at);
      if (!d) return;
      const key = monthKey(d);
      if (!base[key]) return;

      const jumlah = toNum(t.jumlah ?? t.amount, 0);
      const kategori = String(t.kategori ?? t.tipe ?? '').toLowerCase();

      if (kategori === 'pemasukan' || kategori.includes('pemasukan')) {
        base[key].pemasukan += jumlah;
      } else if (kategori === 'pengeluaran' || kategori.includes('pengeluaran')) {
        base[key].pengeluaran += jumlah;
      }
    });

    return Object.keys(base).map((k) => base[k]);
  }, [transactions]);

  /* ====================== UI ====================== */
  return (
    <Layout>
      <Box sx={{ width: '100%', mx: 0, my: 2, px: { xs: 1.25, sm: 2, md: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.25} sx={{ mb: { xs: 1.5, sm: 2 } }}>
          <Typography variant="h5" fontWeight={800} sx={{ fontSize: { xs: 20, sm: 24 } }}>
            Dashboard
          </Typography>
          <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button startIcon={<RefreshIcon />} size="small" variant="outlined" onClick={fetchAll} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Box sx={{ mb: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', height: 400 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* =================== KPI =================== */}
            <Paper
              sx={{
                p: { xs: 1.25, sm: 2 },
                mb: { xs: 2, sm: 3 },
                borderRadius: 3,
                backgroundColor: '#fff',
                border: '1px solid #f1f1f4',
                boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
              }}
            >
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.25 }}>
                Ringkasan Cepat
              </Typography>
              <Grid container spacing={1.5} alignItems="stretch">
                <Grid item xs={12} sm={6} md={3}>
                  <StatCard icon={<PaidOutlinedIcon />} title="Saldo (Cash)" value={formatRp(summary.saldo)} hint={`In: ${formatRp(summary.total_pemasukan)} · Out: ${formatRp(summary.total_pengeluaran)}`} accent="#7C3AED" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <StatCard icon={<OpacityOutlinedIcon />} title="Jumlah Kolam Aktif" value={String(totalKolam)} hint={`Total biomassa: ${Math.round(totalBiomassaKg)} kg`} accent="#06B6D4" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <StatCard icon={<BubbleChartOutlinedIcon />} title="Populasi Ikan" value={`${(totalEkor || 0).toLocaleString('id-ID')} ekor`} hint={`Berat rata-rata: ${Math.round(avgBeratGram)} g/ekor`} accent="#22C55E" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <StatCard
                    icon={<RestaurantOutlinedIcon />}
                    title="Avg FCR Panen"
                    value={panenSummary?.avg_fcr && Number.isFinite(panenSummary.avg_fcr) ? panenSummary.avg_fcr.toFixed(2) : '-'}
                    hint={`Harga jual rata-rata: ${panenSummary?.avg_harga_jual && Number.isFinite(panenSummary.avg_harga_jual) ? formatRp(panenSummary.avg_harga_jual) : '-'}${panenSummary._source === 'computed' ? ' ' : ''}`}
                    accent="#F97316"
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* =================== KONTEN UTAMA =================== */}
            <Paper
              sx={{
                p: { xs: 1.25, sm: 2 },
                mb: { xs: 2, sm: 3 },
                borderRadius: 3,
                backgroundColor: '#fff',
                border: '1px solid #f1f1f4',
                boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
              }}
            >
              <Grid container spacing={2}>
                {/* LEFT COLUMN */}
                <Grid item xs={12} lg={8} xl={9} sx={{ minWidth: 0 }}>
                  {/* Analytics */}
                  <Paper
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 3,
                      mb: 2,
                      background: 'transparent',
                      border: '1px solid transparent',
                      boxShadow: 'none',
                    }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Analytics (8 bulan terakhir)
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5, columnGap: 0.5 }}>
                        <Chip size="small" icon={<TrendingUpOutlinedIcon />} label="Pemasukan" />
                        <Chip size="small" icon={<TrendingDownOutlinedIcon />} label="Pengeluaran" color="default" />
                      </Stack>
                    </Stack>
                    <Divider sx={{ mb: 2 }} />
                    <Box sx={{ width: '100%', height: { xs: 220, sm: 280, md: 320 } }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyBar}>
                          <CartesianGrid stroke="#eee" vertical={false} />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <RTooltip formatter={(v) => formatRp(v)} />
                          <Legend />
                          <Bar dataKey="pemasukan" name="Pemasukan" radius={[4, 4, 0, 0]} fill="#22C55E" />
                          <Bar dataKey="pengeluaran" name="Pengeluaran" radius={[4, 4, 0, 0]} fill="#EF4444" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </Paper>

                  {/* TOP 5 KOLAM */}
                  <Paper
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 3,
                      background: 'transparent',
                      border: '1px solid transparent',
                      boxShadow: 'none',
                    }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Top 5 Kolam Paling Mahal
                      </Typography>
                      <Chip
                        variant="outlined"
                        label={`Total Nilai Aset Kolam: ${formatRp(totalAsetKolam)}`}
                        sx={{
                          borderColor: 'rgba(124,58,237,0.35)',
                          color: '#7C3AED',
                          bgcolor: 'transparent',
                        }}
                      />
                    </Stack>
                    <Divider sx={{ mb: 1.5 }} />

                    {top5Kolam.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Belum ada data
                      </Typography>
                    ) : isMobile ? (
                      <Stack spacing={1.25}>
                        {top5Kolam.map((row) => (
                          <KolamCardMobile key={row.id} row={row} />
                        ))}
                      </Stack>
                    ) : (
                      <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 760 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell />
                              <TableCell>Kolam</TableCell>
                              <TableCell align="right">Aset Ikan</TableCell>
                              <TableCell align="right">Biaya Pakan (akum.)</TableCell>
                              <TableCell align="right">Biaya Vitamin (akum.)</TableCell>
                              <TableCell align="right">Total</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {top5Kolam.map((row) => (
                              <KolamRow key={row.id} row={row} />
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Paper>
                </Grid>

                {/* RIGHT SIDEBAR */}
                <Grid item xs={12} lg={4} xl={3} sx={{ minWidth: 0 }}>
                  {/* Ringkasan Kas */}
                  <Paper
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 3,
                      mb: 2,
                      background: '#fff',
                      border: '1px solid #f1f1f4',
                      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary">
                      Ringkasan Kas
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
                      {formatRp(summary.saldo)}
                    </Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between">
                        <Tooltip title="Total pemasukan seluruh transaksi">
                          <Typography variant="body2">Pemasukan</Typography>
                        </Tooltip>
                        <Typography variant="body2" fontWeight={700}>
                          {formatRp(summary.total_pemasukan)}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Tooltip title="Total pengeluaran seluruh transaksi">
                          <Typography variant="body2">Pengeluaran</Typography>
                        </Tooltip>
                        <Typography variant="body2" fontWeight={700}>
                          {formatRp(summary.total_pengeluaran)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Paper>

                  {/* Snapshot Panen */}
                  <Paper
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 3,
                      mb: 2,
                      background: '#fff',
                      border: '1px solid #f1f1f4',
                      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary">
                      Snapshot Panen
                      {panenSummary._source === 'computed' ? ' (computed)' : ''}
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2">Transaksi Panen</Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {panenSummary.total_transaksi || 0}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2">Total Berat</Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {toNum(panenSummary.total_berat, 0).toLocaleString('id-ID')} kg
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2">Total Penjualan</Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {formatRp(panenSummary.total_penjualan || 0)}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2">Total Laba/Rugi</Typography>
                        <Typography variant="body2" fontWeight={700} color={toNum(panenSummary.total_laba_rugi, 0) >= 0 ? 'success.main' : 'error.main'}>
                          {formatRp(panenSummary.total_laba_rugi || 0)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Paper>

                  {/* Catatan */}
                  <Paper
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 3,
                      background: '#fff',
                      border: '1px solid #f1f1f4',
                      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Catatan
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      • <b>Biaya Pakan/Vitamin</b> adalah akumulasi yang ikut pindah saat sortir.
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Paper>

            {/* =================== TRANSAKSI =================== */}
            <Paper
              sx={{
                p: { xs: 1.25, sm: 2.5 },
                borderRadius: 3,
                backgroundColor: '#fff',
                border: '1px solid #f1f1f4',
                boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
              }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Transaksi Terbaru
                </Typography>
                <Chip icon={<ListAltOutlinedIcon />} size="small" label={`${transactions.length} data`} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
              </Stack>
              <Divider sx={{ mb: 1.5 }} />

              {isMobile ? (
                <Stack spacing={1}>
                  {(transactions || []).slice(0, 8).map((t, i) => {
                    const jumlah = toNum(t.jumlah ?? t.amount, 0);
                    const isOut = String(t.kategori ?? t.tipe ?? '')
                      .toLowerCase()
                      .includes('pengeluaran');
                    return (
                      <Paper key={i} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2" fontWeight={700}>
                            {String(t.tanggal ?? t.created_at ?? '-')}
                          </Typography>
                          <Chip size="small" label={t.kategori ?? t.tipe ?? '-'} color={isOut ? 'warning' : 'success'} variant="outlined" />
                        </Stack>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {t.deskripsi ?? t.description ?? t.keterangan ?? '-'}
                        </Typography>
                        <Stack direction="row" justifyContent="flex-end">
                          <Typography variant="subtitle2" fontWeight={800}>
                            {formatRp(jumlah)}
                          </Typography>
                        </Stack>
                      </Paper>
                    );
                  })}
                  {(transactions || []).length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Belum ada transaksi
                    </Typography>
                  )}
                </Stack>
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 560 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Tanggal</TableCell>
                        <TableCell>Kategori</TableCell>
                        <TableCell>Deskripsi</TableCell>
                        <TableCell align="right">Jumlah</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(transactions || []).slice(0, 8).map((t, i) => (
                        <TableRow key={i}>
                          <TableCell>{String(t.tanggal ?? t.created_at ?? '-')}</TableCell>
                          <TableCell>{t.kategori ?? t.tipe ?? '-'}</TableCell>
                          <TableCell>{t.deskripsi ?? t.description ?? t.keterangan ?? '-'}</TableCell>
                          <TableCell align="right">{formatRp(toNum(t.jumlah ?? t.amount, 0))}</TableCell>
                        </TableRow>
                      ))}
                      {(transactions || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4}>Belum ada transaksi</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </>
        )}
      </Box>
    </Layout>
  );
}
