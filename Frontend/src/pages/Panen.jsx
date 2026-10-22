// src/pages/Panen.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Grid,
  Paper,
  Box,
  TextField,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  MenuItem,
  Snackbar,
  Alert,
  Chip,
  Tooltip,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  LinearProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoIcon from '@mui/icons-material/Info';
import DescriptionIcon from '@mui/icons-material/Description';
import SpeedIcon from '@mui/icons-material/Speed';
import LocalDiningIcon from '@mui/icons-material/LocalDining';
import ScienceIcon from '@mui/icons-material/Science';
import PaidIcon from '@mui/icons-material/Paid';
import PercentIcon from '@mui/icons-material/Percent';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import StorefrontIcon from '@mui/icons-material/Storefront';

import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/** ========================================================================
 * Konstanta & util
 * ======================================================================= */
const API_BASE = 'http://103.103.22.213/api';
const DEFAULT_PER_PAGE = 20;
const MAX_SUMMARY_ROWS = 10000;

const formatRp = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Rp 0';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
};

const formatKg = (v, digits = 3) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatPct = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(2)}%`;
};

const formatDate = (val) => {
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('id-ID');
  } catch {
    return '-';
  }
};

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** ========================================================================
 * Komponen kecil: label + value rapih
 * ======================================================================= */
function KV({ label, value, mono = false }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="subtitle2" sx={{ fontFamily: mono ? 'ui-monospace, Menlo, Monaco, Consolas' : undefined }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Tile metrik kecil (untuk dialog) */
function MetricTile({ icon, label, value, sub, accent = '#5856d6' }) {
  return (
    <Paper
      sx={{
        p: 2,
        borderRadius: 2,
        backgroundColor: '#fff',
        border: '1px solid #f1f1f4',
        position: 'relative',
        overflow: 'hidden',
        '::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 4,
          background: accent,
        },
      }}
      elevation={0}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: '#f7f7ff',
            border: '1px solid #ececff',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.secondary">
              {sub}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

/** ========================================================================
 * Kartu statistik di header halaman
 * ======================================================================= */
function StatCard({ icon, label, value, hint, accent = '#5856d6' }) {
  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 3,
        backgroundColor: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #f1f1f4',
        '::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 6,
          background: `linear-gradient(90deg, ${accent}, #00c9a7)`,
        },
      }}
    >
      <Stack spacing={1.2} alignItems="center" textAlign="center">
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

/** ========================================================================
 * Halaman Panen
 * ======================================================================= */
export default function Panen() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ===== User =====
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('petani');

  // ===== Filters =====
  const [kolams, setKolams] = useState([]);
  const [filterKolamId, setFilterKolamId] = useState(''); // "" artinya semua -> di-translate ke 0
  const [filterTipe, setFilterTipe] = useState(''); // "", "penuh", "parsial"
  const [filterDari, setFilterDari] = useState('');
  const [filterSampai, setFilterSampai] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filterVendorId, setFilterVendorId] = useState('');

  // ===== Paging =====
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  // ===== Data =====
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  // ===== Summary (FE) =====
  const [summary, setSummary] = useState({
    total_transaksi: 0,
    total_berat: 0,
    total_penjualan: 0,
    total_laba_rugi: 0,
    avg_fcr: null,
    avg_harga_jual: null,
  });

  // ===== Detail dialog =====
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  // ===== Vendors (reference) =====
  const [vendorsRef, setVendorsRef] = useState([]);

  // ===== Snackbar =====
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'error',
  });

  /** ======================================================================
   * Boot: validasi token, set default tanggal, fetch kolam + vendor + list + summary
   * ===================================================================== */
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      setRole(payload.role || 'petani');
      setUsername(payload.username || 'User');
    } catch {
      navigate('/');
      return;
    }

    // default: awal bulan -> hari ini
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setFilterDari(`${y}-${m}-01`);
    setFilterSampai(`${y}-${m}-${d}`);

    (async () => {
      await fetchKolams();
      await fetchVendors(); // ⬅️ ambil master vendor
      await refreshList(1, perPage);
      await refreshSummary();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ======================================================================
   * Helpers axios & error mapping
   * ===================================================================== */
  const tokenHeader = useCallback(
    () => ({
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }),
    [],
  );

  const mapApiErrorToString = useCallback((err) => {
    try {
      const d = err?.response?.data?.detail;
      if (!d) return err.message || 'Terjadi error, silakan coba lagi.';
      if (Array.isArray(d)) {
        return d
          .map((e) => {
            if (e?.loc && e?.msg) return `${e.loc.join('.')}: ${e.msg}`;
            if (e?.msg) return e.msg;
            return JSON.stringify(e);
          })
          .join('; ');
      }
      if (typeof d === 'object') {
        if (d.detail) return String(d.detail);
        return JSON.stringify(d);
      }
      return String(d);
    } catch (e) {
      return err.message || 'Terjadi error, silakan coba lagi.';
    }
  }, []);

  /** Backend /panen bentrok, pakai /kolam/kolam/{kolam_id}/panen
   * Untuk 'semua': kirim 0 (karena `if kolam_id:` di backend akan false)
   */
  const buildListUrl = useCallback((kolamIdForList) => {
    const kid = kolamIdForList ? String(kolamIdForList) : '0';
    return `${API_BASE}/kolam/kolam/${kid}/panen`;
  }, []);

  /** ======================================================================
   * Fetchers
   * ===================================================================== */
  const fetchKolams = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/kolam`, tokenHeader());
      setKolams(res.data || []);
    } catch (e) {
      console.error('Gagal ambil kolam:', e);
      setKolams([]);
    }
  }, [tokenHeader]);

  // Ambil master vendor dari beberapa kemungkinan endpoint
  const fetchVendors = useCallback(async () => {
    const paths = [`${API_BASE}/reference/vendor`, `${API_BASE}/reference/vendors`, `${API_BASE}/vendor`, `${API_BASE}/vendors`, `${API_BASE}/ref/vendor`, `${API_BASE}/ref/vendors`];
    try {
      let ok = false;
      let data = [];
      for (const url of paths) {
        try {
          const r = await axios.get(url, tokenHeader());
          if (r.status >= 200 && r.status < 300) {
            data = r.data || [];
            ok = true;
            break;
          }
        } catch (_) {}
      }
      if (!ok) throw new Error('Gagal fetch Business Partner');
      const normalized = (data || [])
        .map((v) => ({
          id: v.id ?? v.vendor_id ?? v.value ?? v.key,
          name: v.name ?? v.nama ?? v.label ?? `Vendor #${v.id ?? ''}`,
        }))
        .filter((v) => v.id);
      setVendorsRef(normalized);
    } catch (e) {
      console.warn('Gagal ambil master Business Partner:', e);
      setVendorsRef([]);
    }
  }, [tokenHeader]);

  const refreshList = useCallback(
    async (nextPage = page, nextPerPage = perPage) => {
      try {
        setFetching(true);

        const params = { page: nextPage, per_page: nextPerPage };
        if (filterTipe) params.tipe = filterTipe;
        if (filterDari) params.dari = filterDari;
        if (filterSampai) params.sampai = filterSampai;

        const url = buildListUrl(filterKolamId);
        const res = await axios.get(url, { ...tokenHeader(), params });

        const payload = res.data || { items: [], total: 0 };
        const normalized = (payload.items || []).map((p) => {
          const total_penjualan = p.total_penjualan ?? safeNumber(p.harga_jual) * safeNumber(p.total_berat_kg);
          let margin_percent = p.margin_percent;
          if ((margin_percent === null || margin_percent === undefined) && total_penjualan > 0 && p.laba_rugi !== null && p.laba_rugi !== undefined) {
            margin_percent = (safeNumber(p.laba_rugi) / total_penjualan) * 100;
          }
          return { ...p, total_penjualan, margin_percent };
        });

        setItems(normalized);
        setTotal(payload.total || 0);
        setPage(nextPage);
        setPerPage(nextPerPage);
      } catch (err) {
        console.error('Gagal ambil list panen:', err);
        setItems([]);
        setTotal(0);
        setSnackbar({
          open: true,
          message: mapApiErrorToString(err),
          severity: 'error',
        });
      } finally {
        setFetching(false);
        setLoading(false);
      }
    },
    [page, perPage, filterTipe, filterDari, filterSampai, filterKolamId, buildListUrl, tokenHeader, mapApiErrorToString],
  );

  // Summary di FE: tarik besar, lalu agregasi
  const refreshSummary = useCallback(async () => {
    try {
      const params = { page: 1, per_page: MAX_SUMMARY_ROWS };
      if (filterTipe) params.tipe = filterTipe;
      if (filterDari) params.dari = filterDari;
      if (filterSampai) params.sampai = filterSampai;

      const url = buildListUrl(filterKolamId);
      const res = await axios.get(url, { ...tokenHeader(), params });
      const rows = (res.data?.items || []).map((p) => ({
        ...p,
        total_penjualan: p.total_penjualan ?? safeNumber(p.harga_jual) * safeNumber(p.total_berat_kg),
      }));

      const total_transaksi = rows.length;
      const total_berat = rows.reduce((a, b) => a + safeNumber(b.total_berat_kg), 0);
      const total_penjualan = rows.reduce((a, b) => a + safeNumber(b.total_penjualan), 0);
      const total_laba_rugi = rows.reduce((a, b) => a + safeNumber(b.laba_rugi), 0);
      const fcrs = rows.map((r) => r.fcr).filter((v) => v !== null && v !== undefined);
      const avg_fcr = fcrs.length ? fcrs.reduce((a, b) => a + safeNumber(b), 0) / fcrs.length : null;
      const hj = rows.map((r) => r.harga_jual).filter((v) => v !== null && v !== undefined);
      const avg_harga_jual = hj.length ? hj.reduce((a, b) => a + safeNumber(b), 0) / hj.length : null;

      setSummary({
        total_transaksi,
        total_berat,
        total_penjualan,
        total_laba_rugi,
        avg_fcr,
        avg_harga_jual,
      });
    } catch (err) {
      console.error('Gagal hitung summary panen (FE):', err);
      setSummary({
        total_transaksi: 0,
        total_berat: 0,
        total_penjualan: 0,
        total_laba_rugi: 0,
        avg_fcr: null,
        avg_harga_jual: null,
      });
    }
  }, [filterTipe, filterDari, filterSampai, filterKolamId, buildListUrl, tokenHeader]);

  /** ======================================================================
   * Detail panen — FOLLOW BACKEND PREFIX: /kolam/panen/{id}
   * ===================================================================== */
  const openDetail = useCallback(
    async (id) => {
      try {
        setDetailOpen(true);
        setDetailLoading(true);
        const res = await axios.get(`${API_BASE}/kolam/panen/${id}`, tokenHeader());
        const found = res.data;
        setDetail(
          found
            ? {
                ...found,
                nilai_aset_diambil: found.nilai_aset_diambil ?? null,
                biaya_pakan_ambil: found.biaya_pakan_ambil ?? null,
                biaya_vitamin_ambil: found.biaya_vitamin_ambil ?? null,
                total_pakan_kg: found.total_pakan_kg ?? null,
              }
            : null,
        );
      } catch (err) {
        console.error('Gagal ambil detail panen:', err);
        setDetail(null);
        setSnackbar({
          open: true,
          message: mapApiErrorToString(err),
          severity: 'error',
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [tokenHeader, mapApiErrorToString],
  );

  /** ======================================================================
   * Filter actions
   * ===================================================================== */
  const onApplyFilter = useCallback(() => {
    refreshList(1, perPage);
    refreshSummary();
  }, [refreshList, refreshSummary, perPage]);

  const onResetFilter = useCallback(() => {
    setFilterKolamId('');
    setFilterTipe('');
    setFilterVendorId('');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setFilterDari(`${y}-${m}-01`);
    setFilterSampai(`${y}-${m}-${d}`);
    setSearchText('');
    refreshList(1, perPage);
    refreshSummary();
  }, [refreshList, refreshSummary, perPage]);

  /** ======================================================================
   * Derived data
   * ===================================================================== */
  const pageCount = useMemo(() => Math.max(1, Math.ceil((total || 0) / (perPage || 1))), [total, perPage]);

  const vendorsById = useMemo(() => {
    const m = {};
    (vendorsRef || []).forEach((v) => (m[Number(v.id)] = v.name));
    return m;
  }, [vendorsRef]);

  const getVendorName = useCallback(
    (rowOrDetail) => {
      if (!rowOrDetail) return '-';
      const name = rowOrDetail.vendor_name || rowOrDetail.vendor?.name || vendorsById[Number(rowOrDetail.vendor_id)];
      return name || '-';
    },
    [vendorsById],
  );

  // Filter lokal: search text + vendor
  const filteredLocal = useMemo(() => {
    const st = (searchText || '').toLowerCase();
    let rows = items;
    if (st) {
      rows = rows.filter((it) => {
        const a = (it.kolam_name || '').toLowerCase();
        const b = String(it.kolam_id || '').toLowerCase();
        const c = (it.tipe_panen || '').toLowerCase();
        const v = (getVendorName(it) || '').toLowerCase();
        return a.includes(st) || b.includes(st) || c.includes(st) || v.includes(st);
      });
    }
    if (filterVendorId) {
      rows = rows.filter((it) => String(it.vendor_id || '') === String(filterVendorId));
    }
    return rows;
  }, [items, searchText, filterVendorId, getVendorName]);

  /** ======================================================================
   * Export handlers
   * ===================================================================== */
  const exportExcel = useCallback(() => {
    const wsData = filteredLocal.map((p) => ({
      ID: p.id,
      Kolam: p.kolam_name || p.kolam_id,
      Vendor: getVendorName(p),
      Tanggal: p.tanggal,
      Tipe: p.tipe_panen,
      Berat_kg: safeNumber(p.total_berat_kg),
      Ekor: p.jumlah_ekor ?? '',
      Harga_per_kg: safeNumber(p.harga_jual),
      Penjualan: safeNumber(p.total_penjualan),
      HPP: p.hpp_total ?? '',
      Laba_Rugi: p.laba_rugi ?? '',
      FCR: p.fcr ?? '',
      Susut_kg: p.susut_kg ?? '',
      Susut_persen: p.susut_percent ?? '',
      CreatedAt: p.created_at || '',
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Panen');
    XLSX.writeFile(wb, 'panen.xlsx');
  }, [filteredLocal, getVendorName]);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text('Riwayat Panen', 14, 15);
    doc.autoTable({
      startY: 20,
      head: [['ID', 'Kolam', 'Business Partner', 'Tanggal', 'Tipe', 'Berat (kg)', 'Harga/kg', 'Penjualan', 'L/R', 'FCR', 'Susut(kg)', 'Susut(%)']],
      body: filteredLocal.map((p) => [
        p.id,
        p.kolam_name || p.kolam_id,
        getVendorName(p),
        p.tanggal,
        p.tipe_panen,
        formatKg(p.total_berat_kg),
        safeNumber(p.harga_jual).toLocaleString('id-ID'),
        safeNumber(p.total_penjualan).toLocaleString('id-ID'),
        safeNumber(p.laba_rugi).toLocaleString('id-ID'),
        p.fcr ?? '-',
        p.susut_kg ?? '-',
        p.susut_percent ?? '-',
      ]),
      styles: { fontSize: 8 },
      theme: 'grid',
    });
    doc.save('panen.pdf');
  }, [filteredLocal, getVendorName]);

  const exportCSV = useCallback(() => {
    const header = ['ID', 'Kolam', 'Business Partner', 'Tanggal', 'Tipe', 'Berat(kg)', 'Ekor', 'Harga/kg', 'Expected(kg)', 'Susut(kg)', 'Susut(%)', 'HPP', 'Penjualan', 'LabaRugi', 'FCR', 'CreatedAt'];
    const rows = filteredLocal.map((p) => [
      p.id,
      p.kolam_name || p.kolam_id,
      getVendorName(p),
      p.tanggal,
      p.tipe_panen,
      safeNumber(p.total_berat_kg),
      p.jumlah_ekor ?? '',
      safeNumber(p.harga_jual),
      p.expected_kg ?? '',
      p.susut_kg ?? '',
      p.susut_percent ?? '',
      p.hpp_total ?? '',
      safeNumber(p.total_penjualan),
      p.laba_rugi ?? '',
      p.fcr ?? '',
      p.created_at || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((x) => (x === null || x === undefined ? '' : String(x))).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'panen.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLocal, getVendorName]);

  /** ======================================================================
   * Loading gate
   * ===================================================================== */
  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  /** ======================================================================
   * Render helpers: Desktop table vs Mobile cards
   * ===================================================================== */
  const renderRowsDesktop = () => (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow sx={{ backgroundColor: '#5856d6' }}>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }}>Tanggal</TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }}>Kolam</TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }}>Business Partner</TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }}>Tipe</TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="right">
              Berat (kg)
            </TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="right">
              Harga/kg
            </TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="right">
              Penjualan
            </TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="right">
              Laba/Rugi
            </TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="right">
              FCR
            </TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="right">
              Susut (%)
            </TableCell>
            <TableCell sx={{ color: '#0a0000', fontWeight: 'bold' }} align="center">
              Aksi
            </TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {filteredLocal.map((row) => {
            const labaRugi = safeNumber(row.laba_rugi);
            const labaColor = labaRugi > 0 ? 'success.main' : labaRugi < 0 ? 'error.main' : 'text.primary';
            return (
              <TableRow key={row.id} hover>
                <TableCell>{formatDate(row.tanggal)}</TableCell>
                <TableCell>{row.kolam_name || row.kolam_id}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <StorefrontIcon fontSize="small" />
                    <span>{getVendorName(row)}</span>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={row.tipe_panen === 'penuh' ? 'Penuh' : 'Parsial'} color={row.tipe_panen === 'penuh' ? 'success' : 'warning'} variant="outlined" />
                </TableCell>
                <TableCell align="right">{formatKg(row.total_berat_kg)}</TableCell>
                <TableCell align="right">{safeNumber(row.harga_jual).toLocaleString('id-ID')}</TableCell>
                <TableCell align="right">{safeNumber(row.total_penjualan).toLocaleString('id-ID')}</TableCell>
                <TableCell align="right" sx={{ color: labaColor, fontWeight: 600 }}>
                  {safeNumber(row.laba_rugi).toLocaleString('id-ID')}
                </TableCell>
                <TableCell align="right">{row.fcr ?? '-'}</TableCell>
                <TableCell align="right">{row.susut_percent !== null && row.susut_percent !== undefined ? formatPct(row.susut_percent) : '-'}</TableCell>
                <TableCell align="center">
                  <Tooltip title="Detail">
                    <IconButton onClick={() => openDetail(row.id)} size="small">
                      <InfoIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );

  const renderRowsMobile = () => (
    <Stack spacing={1}>
      {filteredLocal.map((row) => {
        const labaRugi = safeNumber(row.laba_rugi);
        const labaColor = labaRugi > 0 ? 'success.main' : labaRugi < 0 ? 'error.main' : 'text.primary';
        return (
          <Paper key={row.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  {row.kolam_name || `Kolam ${row.kolam_id}`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(row.tanggal)}
                </Typography>
              </Box>
              <Chip size="small" label={row.tipe_panen === 'penuh' ? 'Penuh' : 'Parsial'} color={row.tipe_panen === 'penuh' ? 'success' : 'warning'} variant="outlined" />
            </Stack>

            <Divider sx={{ my: 1 }} />

            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  Business Partner
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {getVendorName(row)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  Berat (kg)
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatKg(row.total_berat_kg)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  Harga/kg
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {safeNumber(row.harga_jual).toLocaleString('id-ID')}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  Penjualan
                </Typography>
                <Typography variant="body2" fontWeight={700}>
                  {safeNumber(row.total_penjualan).toLocaleString('id-ID')}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  Laba/Rugi
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{ color: labaColor }}>
                  {safeNumber(row.laba_rugi).toLocaleString('id-ID')}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  FCR
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {row.fcr ?? '-'}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary" variant="body2">
                  Susut
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {row.susut_percent !== null && row.susut_percent !== undefined ? formatPct(row.susut_percent) : '-'}
                </Typography>
              </Stack>
            </Stack>

            <Stack direction="row" justifyContent="flex-end" mt={1}>
              <Button size="small" variant="outlined" onClick={() => openDetail(row.id)} startIcon={<InfoIcon />}>
                Detail
              </Button>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );

  /** ======================================================================
   * Render
   * ===================================================================== */
  return (
    <Layout>
      {/* Header */}
      <Box mb={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight="bold">
              Aktivitas Panen 🧺
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Hai, {username} ({role})
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Tooltip title="Export Excel">
              <Button variant="outlined" onClick={exportExcel} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                Excel
              </Button>
            </Tooltip>
            <Tooltip title="Export PDF">
              <Button variant="outlined" onClick={exportPDF} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                PDF
              </Button>
            </Tooltip>
            <Tooltip title="Download CSV">
              <Button variant="outlined" onClick={exportCSV} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                CSV
              </Button>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<EventIcon />} label="Total Transaksi" value={summary.total_transaksi || 0} hint="Jumlah catatan panen pada rentang terpilih" accent="#6c63ff" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<Inventory2Icon />} label="Total Berat (kg)" value={formatKg(summary.total_berat, 3)} hint="Akumulasi berat panen" accent="#00c9a7" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<AttachMoneyIcon />} label="Total Penjualan" value={formatRp(summary.total_penjualan)} hint={`Harga rata²: ${summary.avg_harga_jual ? formatRp(summary.avg_harga_jual) : '-'} / kg`} accent="#ff7a59" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<TrendingUpIcon />} label="Laba / Rugi" value={formatRp(summary.total_laba_rugi)} hint={`FCR rata²: ${summary.avg_fcr ?? '-'}`} accent="#5856d6" />
        </Grid>
      </Grid>

      {/* Filter bar */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 3,
          background: '#fff',
          border: '1px solid #f1f1f4',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <TextField select label="Kolam" value={filterKolamId} onChange={(e) => setFilterKolamId(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 200 } }}>
            <MenuItem value="">Semua Kolam</MenuItem>
            {kolams.map((k) => (
              <MenuItem key={k.id} value={k.id}>
                {k.name || `Kolam #${k.id}`}
              </MenuItem>
            ))}
          </TextField>

          <TextField select label="Tipe Panen" value={filterTipe} onChange={(e) => setFilterTipe(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 160 } }}>
            <MenuItem value="">Semua</MenuItem>
            <MenuItem value="penuh">Penuh</MenuItem>
            <MenuItem value="parsial">Parsial</MenuItem>
          </TextField>

          {/* Filter Business Partner (client-side) */}
          {vendorsRef.length > 0 && (
            <TextField select label="Business Partner" value={filterVendorId} onChange={(e) => setFilterVendorId(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 220 } }}>
              <MenuItem value="">Semua Business Partner</MenuItem>
              {vendorsRef.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField label="Dari" type="date" value={filterDari} onChange={(e) => setFilterDari(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: { xs: '100%', sm: 160 } }} />
          <TextField label="Sampai" type="date" value={filterSampai} onChange={(e) => setFilterSampai(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: { xs: '100%', sm: 160 } }} />

          <TextField label="Cari (nama/tipe/id kolam/Business Partner)" value={searchText} onChange={(e) => setSearchText(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 240 } }} />

          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={onApplyFilter}>
              Terapkan
            </Button>
            <Button variant="outlined" onClick={onResetFilter}>
              Reset
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Data */}
      <Paper
        sx={{
          p: 2,
          borderRadius: 3,
          background: '#fff',
          border: '1px solid #f1f1f4',
        }}
      >
        {fetching && <LinearProgress sx={{ mb: 1, borderRadius: 10 }} />}

        {filteredLocal.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Belum ada data panen untuk filter saat ini.
          </Typography>
        ) : isMobile ? (
          renderRowsMobile()
        ) : (
          renderRowsDesktop()
        )}

        {/* Pagination */}
        <Divider sx={{ my: 2 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select
              label="Rows"
              size="small"
              value={perPage}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPerPage(v);
                refreshList(1, v);
              }}
              sx={{ width: 100 }}
            >
              {[10, 20, 50, 100].map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2" color="text.secondary">
              Halaman {page} / {pageCount} • Total {total}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button size="small" variant="outlined" disabled={page <= 1} onClick={() => refreshList(page - 1, perPage)} sx={{ width: { xs: '50%', sm: 'auto' } }}>
              Prev
            </Button>
            <Button size="small" variant="contained" disabled={page >= pageCount} onClick={() => refreshList(page + 1, perPage)} sx={{ width: { xs: '50%', sm: 'auto' } }}>
              Next
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Detail Dialog (VERSI RAPIH) */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <DescriptionIcon />
            <Typography variant="subtitle1" fontWeight={700}>
              Detail Panen
            </Typography>
            {detail && <Chip size="small" label={`#${detail.id}`} sx={{ ml: 1 }} variant="outlined" color="default" />}
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
              <CircularProgress />
            </Box>
          ) : !detail ? (
            <Typography variant="body2" color="text.secondary">
              Data tidak tersedia.
            </Typography>
          ) : (
            <Stack spacing={2.5}>
              {/* SECTION: Ringkasan */}
              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }} elevation={0}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Ringkasan</Typography>
                  <Chip size="small" label={detail.tipe_panen === 'penuh' ? 'Penuh' : 'Parsial'} color={detail.tipe_panen === 'penuh' ? 'success' : 'warning'} variant="outlined" />
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Tanggal" value={formatDate(detail.tanggal)} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Kolam" value={detail.kolam_name || detail.kolam_id} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Business Partner" value={getVendorName(detail)} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Isi Kolam (Lot)" value={detail.isi_kolam_id ?? '-'} mono />
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Rata Ekor (kg/ekor)" value={detail.berat_rata_ekor ?? '-'} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Berat (kg)" value={formatKg(detail.total_berat_kg)} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Jumlah Ekor" value={detail.jumlah_ekor ?? '-'} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Harga Jual / kg" value={safeNumber(detail.harga_jual).toLocaleString('id-ID')} />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <KV label="Penjualan" value={detail.total_penjualan !== undefined && detail.total_penjualan !== null ? formatRp(detail.total_penjualan) : formatRp(safeNumber(detail.total_berat_kg) * safeNumber(detail.harga_jual))} />
                  </Grid>
                </Grid>
              </Paper>

              {/* SECTION: Keuangan utama */}
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <MetricTile icon={<PaidIcon />} label="HPP Total" value={formatRp(detail.hpp_total)} sub="Total biaya (aset + pakan + vitamin) yang melekat ke panen" accent="#a78bfa" />
                </Grid>
                <Grid item xs={12} md={4}>
                  <MetricTile
                    icon={<AttachMoneyIcon />}
                    label="Laba / Rugi"
                    value={formatRp(detail.laba_rugi)}
                    sub={(() => {
                      const penjualan = detail.total_penjualan !== undefined && detail.total_penjualan !== null ? safeNumber(detail.total_penjualan) : safeNumber(detail.total_berat_kg) * safeNumber(detail.harga_jual);
                      const m = penjualan > 0 && detail.laba_rugi !== null && detail.laba_rugi !== undefined ? (safeNumber(detail.laba_rugi) / penjualan) * 100 : null;
                      return m !== null ? `Margin: ${formatPct(m)}` : 'Margin: -';
                    })()}
                    accent={safeNumber(detail.laba_rugi) >= 0 ? '#22c55e' : '#ef4444'}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <MetricTile icon={<SpeedIcon />} label="FCR" value={detail.fcr ?? '-'} sub={`Pakan diambil: ${formatKg(detail.total_pakan_kg ?? 0)} kg`} accent="#38bdf8" />
                </Grid>
              </Grid>

              {/* SECTION: Komponen biaya */}
              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }} elevation={0}>
                <Typography variant="subtitle2">Komponen Biaya</Typography>
                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <MetricTile
                      icon={<LocalDiningIcon />}
                      label="Biaya Pakan (diambil)"
                      value={detail.biaya_pakan_ambil !== null && detail.biaya_pakan_ambil !== undefined ? formatRp(detail.biaya_pakan_ambil) : '-'}
                      sub="Akumulasi biaya pakan yang melekat pada ikan yang dipanen"
                      accent="#f59e0b"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MetricTile
                      icon={<ScienceIcon />}
                      label="Biaya Vitamin (diambil)"
                      value={detail.biaya_vitamin_ambil !== null && detail.biaya_vitamin_ambil !== undefined ? formatRp(detail.biaya_vitamin_ambil) : '-'}
                      sub="Akumulasi biaya vitamin pada ikan yang dipanen"
                      accent="#06b6d4"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MetricTile
                      icon={<PercentIcon />}
                      label="Nilai Aset Diambil"
                      value={detail.nilai_aset_diambil !== null && detail.nilai_aset_diambil !== undefined ? formatRp(detail.nilai_aset_diambil) : '-'}
                      sub="Nilai stok ikan (snapshot harga) yang diambil"
                      accent="#8b5cf6"
                    />
                  </Grid>
                </Grid>
              </Paper>

              {/* SECTION: Susut */}
              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }} elevation={0}>
                <Typography variant="subtitle2">Susut</Typography>
                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <KV label="Expected (kg)" value={detail.expected_kg !== null && detail.expected_kg !== undefined ? formatKg(detail.expected_kg) : '-'} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <KV label="Susut (kg)" value={detail.susut_kg !== null && detail.susut_kg !== undefined ? formatKg(detail.susut_kg) : '-'} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <KV label="Susut (%)" value={detail.susut_percent !== null && detail.susut_percent !== undefined ? formatPct(detail.susut_percent) : '-'} />
                  </Grid>
                </Grid>
              </Paper>

              {/* SECTION: Meta */}
              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }} elevation={0}>
                <Typography variant="subtitle2">Meta</Typography>
                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CalendarMonthIcon fontSize="small" />
                      <KV label="Dibuat" value={detail.created_at ? new Date(detail.created_at).toLocaleString('id-ID') : '-'} />
                    </Stack>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ReceiptLongIcon fontSize="small" />
                      <KV label="Transaksi Keuangan" value={detail.transaksi_id ?? '-'} mono />
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Tutup</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
