// src/pages/Feed.jsx
import { useState, useEffect, useMemo } from 'react';
import { Typography, Grid, Paper, Box, Button, TextField, Stack, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, MenuItem, LinearProgress, List, ListItem, ListItemText, Divider, Chip } from '@mui/material';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const API_BASE = 'http://103.103.22.213/api';
const LOG_STORAGE_KEY = 'feed_logs_simple';

// 100% progress = kapasitas stok (KG)
const STOCK_CAPACITY_KG = 120;

// ===== Utils =====
const safeNum = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const formatRp = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(safeNum(value));

const formatDateId = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Circular progress menampilkan KG — size responsif (xs lebih kecil)
function CircularProgressWithKg({ value, max, sx }) {
  const val = Number(value) || 0;
  const capacity = Math.max(Number(max) || 1, 1);
  const percent = Math.min((val / capacity) * 100, 100);

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        width: { xs: 80, sm: 96, md: 110 },
        height: { xs: 80, sm: 96, md: 110 },
        ...sx,
      }}
    >
      {/* Background ring */}
      <CircularProgress variant="determinate" value={100} size="100%" thickness={5} sx={{ color: (theme) => theme.palette.grey[200] }} />
      {/* Foreground ring */}
      <CircularProgress variant="determinate" value={percent} size="100%" thickness={5} sx={{ position: 'absolute' }} />
      {/* Text tengah */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1 }}>
          {val.toFixed(0)} kg
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {percent.toFixed(0)}%
        </Typography>
      </Box>
    </Box>
  );
}

export default function Feed() {
  const navigate = useNavigate();

  // default tanggal & jam untuk form create/edit
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"

  // ===== State =====
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  // Vendor master reference
  const [vendors, setVendors] = useState([]);

  // Form create/edit
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Pakan',
    quantity_kg: '',
    price_per_kg: '', // HARGA PER KG (otomatis, hasil perhitungan)
    total_price: '', // TOTAL PEMBELIAN (input user)
    vendor_id: '',
    created_at: todayStr, // tanggal
    created_time: nowTimeStr, // jam
  });
  const [selectedFeedId, setSelectedFeedId] = useState(null);

  // Add stock
  const [addStockDialog, setAddStockDialog] = useState(false);
  const [addStockQty, setAddStockQty] = useState('');
  const [addStockDate, setAddStockDate] = useState(todayStr);
  const [addStockTime, setAddStockTime] = useState('08:00'); // default dummy, di-set ulang saat klik tombol

  // Delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [feedToDelete, setFeedToDelete] = useState(null);

  // Logs (local)
  const [logs, setLogs] = useState([]);
  const [showAllLogs, setShowAllLogs] = useState(false);

  // Filters UI
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterVendorId, setFilterVendorId] = useState('');

  // ===== Derived =====
  const totalAsset = useMemo(() => feeds.reduce((sum, f) => sum + safeNum(f.quantity_kg) * safeNum(f.price_per_kg), 0), [feeds]);

  // 100% = kapasitas fixed
  const maxStock = STOCK_CAPACITY_KG;

  useEffect(() => {
    loadLogsFromStorage();
    fetchVendors();
    fetchFeeds();
  }, []);

  // ===== Local logs =====
  const loadLogsFromStorage = () => {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      if (raw) setLogs(JSON.parse(raw));
    } catch (e) {
      console.error('Gagal load logs:', e);
    }
  };

  const saveLogsToStorage = (nextLogs) => {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(nextLogs));
    } catch (e) {
      console.error('Gagal simpan logs:', e);
    }
  };

  const addLog = (action, oldData = null, newData = null, quantityChange = null, customTimestamp = null) => {
    let detail = '';
    if (action === 'Create' && newData) {
      const vendorName = getVendorName(newData);
      detail = `${newData.name} berhasil ditambahkan. Jumlah: ${newData.quantity_kg} kg, Harga/kg: ${newData.price_per_kg}, Vendor: ${vendorName}`;
    } else if (action === 'Update' && oldData && newData) {
      const changes = [];
      if (oldData.name !== newData.name) changes.push(`Nama: ${oldData.name} → ${newData.name}`);
      if (oldData.type !== newData.type) changes.push(`Jenis: ${oldData.type} → ${newData.type}`);
      if (oldData.quantity_kg !== newData.quantity_kg) changes.push(`Jumlah: ${oldData.quantity_kg} → ${newData.quantity_kg}`);
      if (oldData.price_per_kg !== newData.price_per_kg) changes.push(`Harga/kg: ${oldData.price_per_kg} → ${newData.price_per_kg}`);
      const oldVendor = getVendorName(oldData);
      const newVendor = getVendorName(newData);
      if (oldVendor !== newVendor) changes.push(`Vendor: ${oldVendor} → ${newVendor}`);
      detail = `${newData.name} diperbarui: ${changes.join(', ')}`;
    } else if (action === 'AddStock' && oldData && quantityChange !== null) {
      detail = `${oldData.name} stok +${quantityChange} kg. Total: ${oldData.quantity_kg} → ${Number(oldData.quantity_kg || 0) + Number(quantityChange || 0)} kg`;
    } else if (action === 'Delete' && oldData) {
      detail = `${oldData.name} berhasil dihapus.`;
    }

    // meta untuk filter log
    const feedName = newData?.name || oldData?.name || '';
    const vendorId = newData?.vendor?.id ?? newData?.vendor_id ?? oldData?.vendor?.id ?? oldData?.vendor_id ?? null;
    const vendorName = getVendorName(newData || oldData || {}) || '';

    const timestamp = customTimestamp || new Date().toISOString();
    const item = { action, detail, timestamp, feedName, vendorId, vendorName };
    const next = [item, ...logs].slice(0, 50);
    setLogs(next);
    saveLogsToStorage(next);
  };

  // ===== Fetchers =====
  const tokenHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  const fetchVendors = async () => {
    const candidates = [`${API_BASE}/reference/vendor`, `${API_BASE}/reference/vendors`, `${API_BASE}/vendor`, `${API_BASE}/vendors`, `${API_BASE}/ref/vendor`, `${API_BASE}/ref/vendors`];
    try {
      const token = localStorage.getItem('token');
      if (!token) return setVendors([]);

      let data = [];
      let ok = false;
      for (const url of candidates) {
        try {
          const r = await axios.get(url, tokenHeader());
          if (r.status >= 200 && r.status < 300) {
            data = r.data || [];
            ok = true;
            break;
          }
        } catch (_) {}
      }
      if (!ok) throw new Error('No Business Partner endpoint');
      const normalized = (data || [])
        .map((v) => ({
          id: v.id ?? v.vendor_id ?? v.value ?? v.key,
          name: v.name ?? v.nama ?? v.label ?? `Vendor #${v.id ?? ''}`,
          phone: v.Nomor_HP ?? v.phone ?? v.tel ?? '',
        }))
        .filter((v) => v.id);
      setVendors(normalized);
    } catch (e) {
      console.warn('Gagal ambil Business Partner:', e);
      setVendors([]);
    }
  };

  const fetchFeeds = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/');
        return;
      }
      setFetching(true);
      const res = await axios.get(`${API_BASE}/feed`, tokenHeader());
      const onlyPakan = (res.data || []).filter((f) => String(f.type || '').toLowerCase() === 'pakan');
      setFeeds(onlyPakan);
    } catch (err) {
      console.error('Gagal ambil feed:', err);
      setFeeds([]);
    } finally {
      setFetching(false);
      setLoading(false);
    }
  };

  // helper: cari nama vendor kalau response belum nested vendor
  const getVendorName = (feed) => {
    if (feed?.vendor?.name) return feed.vendor.name;
    if (feed?.vendor_id && vendors.length) {
      const v = vendors.find((x) => Number(x.id) === Number(feed.vendor_id));
      return v?.name || '-';
    }
    return '-';
  };

  // ===== Helpers untuk hitung price_per_kg dari qty & total =====
  const recomputePricePerKg = (rawQty, rawTotal) => {
    const qtyNum = safeNum(rawQty);
    const totalNum = safeNum(rawTotal);
    if (qtyNum <= 0 || totalNum <= 0) return '';
    const unit = totalNum / qtyNum;
    // biar rapi tanpa koma
    return unit.toFixed(0);
  };

  // ===== CRUD =====
  const handleFormSubmit = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const headers = tokenHeader();
    const qty = safeNum(formData.quantity_kg);
    const totalPrice = safeNum(formData.total_price);
    // kalau user nggak isi total, fallback ke price_per_kg yg udah ada
    let pricePerKg = safeNum(formData.price_per_kg);

    // kalau total dan qty valid, paksa ulang hitung harga per kg
    if (qty > 0 && totalPrice > 0) {
      pricePerKg = totalPrice / qty;
    }

    const vendorId = formData.vendor_id ? Number(formData.vendor_id) : null;

    // gabungkan tanggal + jam jadi satu datetime
    let createdAtISO = null;
    if (formData.created_at || formData.created_time) {
      const dStr = formData.created_at || todayStr;
      const tStr = formData.created_time || '00:00';
      const d = new Date(`${dStr}T${tStr}:00`);
      if (!Number.isNaN(d.getTime())) {
        createdAtISO = d.toISOString();
      }
    }

    const payload = {
      name: String(formData.name || '').trim(),
      type: 'Pakan',
      quantity_kg: qty,
      price_per_kg: pricePerKg, // ⬅️ yang dikirim ke server HARGA PER KG
      vendor_id: vendorId,
      created_at: createdAtISO,
    };

    try {
      setFetching(true);
      if (selectedFeedId) {
        // update
        const oldData = feeds.find((f) => f.id === selectedFeedId);
        const res = await axios.put(`${API_BASE}/feed/${selectedFeedId}`, payload, headers);
        setFeeds((prev) => prev.map((f) => (f.id === selectedFeedId ? res.data : f)));

        const logTimestamp = createdAtISO || res.data.created_at || new Date().toISOString();
        addLog('Update', oldData, res.data, null, logTimestamp);
      } else {
        // create
        const res = await axios.post(`${API_BASE}/feed`, payload, headers);
        setFeeds((prev) => [res.data, ...prev]);

        const logTimestamp = createdAtISO || res.data.created_at || new Date().toISOString();
        addLog('Create', null, res.data, null, logTimestamp);

        // finance: record initial purchase as pengeluaran
        try {
          // amount = total pembelian, bukan qty * "total lagi"
          const amount = totalPrice > 0 ? totalPrice : qty * pricePerKg;
          if (amount > 0) {
            await axios.post(
              `${API_BASE}/transaksi`,
              {
                kategori: 'pengeluaran',
                deskripsi: `Pembelian awal pakan ${res.data.name} (${qty} kg)`,
                jumlah: amount,
                tanggal: formData.created_at || todayStr,
              },
              headers,
            );
          }
        } catch (financeErr) {
          console.warn('Gagal catat transaksi (finance) saat create feed:', financeErr);
        }
      }
    } catch (err) {
      console.error('Gagal simpan feed:', err);
    } finally {
      setFetching(false);
      setFormData({
        name: '',
        type: 'Pakan',
        quantity_kg: '',
        price_per_kg: '',
        total_price: '',
        vendor_id: '',
        created_at: todayStr,
        created_time: nowTimeStr,
      });
      setSelectedFeedId(null);
      setFormOpen(false);
    }
  };

  const handleEdit = (feed) => {
    let createdAtStr = todayStr;
    let createdTimeStr = nowTimeStr;

    if (feed.created_at) {
      try {
        const dt = new Date(feed.created_at);
        if (!Number.isNaN(dt.getTime())) {
          createdAtStr = dt.toISOString().split('T')[0];
          createdTimeStr = dt.toTimeString().slice(0, 5);
        }
      } catch {
        createdAtStr = todayStr;
        createdTimeStr = nowTimeStr;
      }
    }

    const qty = safeNum(feed.quantity_kg);
    const unitPrice = safeNum(feed.price_per_kg);
    const totalPrice = qty > 0 && unitPrice > 0 ? qty * unitPrice : 0;

    setFormData({
      name: feed.name,
      type: 'Pakan',
      quantity_kg: qty.toString(),
      price_per_kg: unitPrice ? unitPrice.toString() : '',
      total_price: totalPrice ? totalPrice.toString() : '',
      vendor_id: feed.vendor?.id ?? feed.vendor_id ?? '',
      created_at: createdAtStr,
      created_time: createdTimeStr,
    });
    setSelectedFeedId(feed.id);
    setFormOpen(true);
  };

  const handleDelete = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const oldData = feeds.find((f) => f.id === id);
    try {
      setFetching(true);
      await axios.delete(`${API_BASE}/feed/${id}`, tokenHeader());
      setFeeds((prev) => prev.filter((f) => f.id !== id));
      addLog('Delete', oldData);
      if (selectedFeedId === id) setSelectedFeedId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  const handleAddStock = async () => {
    if (!selectedFeedId) return;
    const qtyChange = safeNum(addStockQty);
    if (qtyChange <= 0) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    // gabungkan tanggal + jam input user jadi 1 timestamp
    const eventDateStr = addStockDate || todayStr;
    const eventTimeStr = addStockTime || '08:00';
    const eventISO = new Date(`${eventDateStr}T${eventTimeStr}:00`).toISOString();

    try {
      setFetching(true);
      const feed = feeds.find((f) => f.id === selectedFeedId);
      if (!feed) throw new Error('Feed tidak ditemukan.');

      const totalQty = safeNum(feed.quantity_kg) + qtyChange;

      // update stok pakan di backend
      const resFeed = await axios.put(
        `${API_BASE}/feed/${selectedFeedId}`,
        {
          ...feed,
          quantity_kg: totalQty,
          vendor_id: feed.vendor?.id ?? feed.vendor_id ?? null,
          type: 'Pakan',
          created_at: feed.created_at ?? null,
        },
        tokenHeader(),
      );
      setFeeds((prev) => prev.map((f) => (f.id === selectedFeedId ? resFeed.data : f)));

      // log dengan timestamp sesuai tanggal+jam yang diinput user
      addLog('AddStock', feed, null, qtyChange, eventISO);

      // finance: catat pembelian stok sebagai pengeluaran (tanggal pakai tanggal transaksi)
      try {
        const pricePerKg = safeNum(feed.price_per_kg);
        const amount = qtyChange * pricePerKg;
        if (amount > 0) {
          await axios.post(
            `${API_BASE}/transaksi`,
            {
              kategori: 'pengeluaran',
              deskripsi: `Tambah stok pakan ${feed.name} (${qtyChange} kg)`,
              jumlah: amount,
              tanggal: eventDateStr,
            },
            tokenHeader(),
          );
        }
      } catch (financeErr) {
        console.warn('Gagal catat transaksi (finance) saat tambah stok:', financeErr);
      }

      // reset ui
      setAddStockQty('');
      setAddStockDate(todayStr);
      setAddStockTime('08:00');
      setAddStockDialog(false);
      setSelectedFeedId(null);
    } catch (err) {
      console.error('Gagal tambah stok:', err);
    } finally {
      setFetching(false);
    }
  };

  // ===== Filter/Search/Sort (client) =====
  const filteredFeeds = useMemo(() => {
    let rows = feeds;
    if (filterVendorId) {
      rows = rows.filter((f) => String(f.vendor_id || '') === String(filterVendorId));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter((f) => {
        const vn = getVendorName(f).toLowerCase();
        return (f.name || '').toLowerCase().includes(q) || vn.includes(q);
      });
    }
    const sorted = [...rows].sort((a, b) => {
      const A = a[sortKey];
      const B = b[sortKey];
      if (sortOrder === 'asc') return A > B ? 1 : A < B ? -1 : 0;
      return A < B ? 1 : A > B ? -1 : 0;
    });
    return sorted;
  }, [feeds, searchTerm, sortKey, sortOrder, filterVendorId]);

  // Logs ikut filter (by vendor & search)
  const filteredLogs = useMemo(() => {
    let items = logs;

    if (filterVendorId) {
      items = items.filter((l) => String(l.vendorId || '') === String(filterVendorId));
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter((l) => {
        const fn = (l.feedName || '').toLowerCase();
        const vn = (l.vendorName || '').toLowerCase();
        return fn.includes(q) || vn.includes(q);
      });
    }

    return items;
  }, [logs, filterVendorId, searchTerm]);

  // Kalau lagi pakai filter, tampilkan semua log yang match filter.
  // Show Less/More cuma berlaku saat tidak ada filter.
  const displayedLogs = showAllLogs || filterVendorId || searchTerm ? filteredLogs : filteredLogs.slice(0, 5);

  // ===== Export logs =====
  const handleExportExcel = () => {
    const wsData = filteredLogs.map((l) => ({
      Action: l.action,
      Detail: l.detail,
      Timestamp: l.timestamp,
      Feed: l.feedName || '',
      Vendor: l.vendorName || '',
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Logs');
    XLSX.writeFile(wb, 'feed_logs.xlsx');
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text('Feed Logs', 10, 10);
    filteredLogs.forEach((l, idx) => {
      doc.text(`${idx + 1}. ${l.action} — ${l.detail} (${new Date(l.timestamp).toLocaleString('id-ID')})`, 10, 20 + idx * 8);
    });
    doc.save('feed_logs.pdf');
  };

  // ===== Loading gate =====
  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  // ===== Render =====
  return (
    <Layout>
      {/* Header */}
      <Box mb={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
          <Box>
            <Typography variant="h5" fontWeight="bold">
              Stok Pakan
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Kelola gudang pakan & aktivitasnya
            </Typography>
          </Box>
          <Chip label={`Total Aset: ${formatRp(totalAsset)}`} color="primary" variant="outlined" sx={{ fontWeight: 600, px: 1 }} />
        </Stack>
      </Box>

      {/* Search / Filter / Sort */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 3,
          border: '1px solid #f1f1f4',
          background: '#fff',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField label="Cari Pakan / Business Partner" placeholder="Ketik nama pakan atau vendor…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} fullWidth sx={{ minWidth: { xs: '100%', md: 260 } }} />

          <TextField select label="Business Partner" value={filterVendorId} onChange={(e) => setFilterVendorId(e.target.value)} sx={{ minWidth: { xs: '100%', md: 220 } }}>
            <MenuItem value="">Semua Business Partner</MenuItem>
            {vendors.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name} {v.phone ? `— ${v.phone}` : ''}
              </MenuItem>
            ))}
          </TextField>

          <TextField select label="Urutkan" value={sortKey} onChange={(e) => setSortKey(e.target.value)} sx={{ minWidth: { xs: '100%', md: 180 } }}>
            <MenuItem value="name">Nama</MenuItem>
            <MenuItem value="quantity_kg">Jumlah</MenuItem>
            <MenuItem value="price_per_kg">Harga/kg</MenuItem>
          </TextField>

          <TextField select label="Arah" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} sx={{ minWidth: { xs: '100%', md: 140 } }}>
            <MenuItem value="asc">Naik</MenuItem>
            <MenuItem value="desc">Turun</MenuItem>
          </TextField>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="contained"
            onClick={() => {
              const nowLocal = new Date();
              const dStr = nowLocal.toISOString().split('T')[0];
              const tStr = nowLocal.toTimeString().slice(0, 5);

              setFormOpen(true);
              setSelectedFeedId(null);
              setFormData({
                name: '',
                type: 'Pakan',
                quantity_kg: '',
                price_per_kg: '',
                total_price: '',
                vendor_id: '',
                created_at: dStr,
                created_time: tStr,
              });
            }}
            sx={{ minWidth: { xs: '100%', md: 180 } }}
          >
            Tambah Pakan
          </Button>
        </Stack>
      </Paper>

      {/* Fetching bar */}
      {fetching && <LinearProgress sx={{ mb: 2, borderRadius: 10 }} />}

      {/* Blank state */}
      {feeds.length === 0 && (
        <Box textAlign="center" mt={5}>
          <Typography variant="h6" color="text.secondary">
            Belum ada data pakan
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Klik tombol <b>Tambah Pakan</b> untuk mengelola stok Anda.
          </Typography>
        </Box>
      )}

      {/* Cards Grid */}
      <Grid container spacing={2}>
        {filteredFeeds.map((feed) => {
          const total = safeNum(feed.quantity_kg) * safeNum(feed.price_per_kg);
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={feed.id}>
              <Paper
                sx={{
                  p: { xs: 1.75, sm: 2.25 },
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minHeight: { xs: 240, sm: 280 },
                  borderRadius: 3,
                  border: '1px solid #f1f1f4',
                  background: '#fff',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                  position: 'relative',
                  overflow: 'hidden',
                  '::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: 6,
                    background: (t) => `linear-gradient(90deg, ${t.palette.primary.main}, #00c9a7)`,
                  },
                }}
                elevation={0}
              >
                <Typography variant="subtitle1" fontWeight="700" align="center" sx={{ mt: 0.5, px: 1, wordBreak: 'break-word' }}>
                  {feed.name}
                </Typography>

                <CircularProgressWithKg value={feed.quantity_kg} max={maxStock} sx={{ mt: 1.25, mb: 0.5 }} />

                <Stack spacing={0.25} alignItems="center" sx={{ width: '100%' }}>
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.5,
                      display: 'flex',
                      gap: 0.5,
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                    }}
                  >
                    Harga/kg: <b>{formatRp(feed.price_per_kg)}</b>
                  </Typography>

                  {/* Vendor name (wrap on small screens) */}
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.25,
                      display: 'flex',
                      gap: 0.5,
                      alignItems: 'baseline',
                      maxWidth: '100%',
                      wordBreak: 'break-word',
                      textAlign: 'center',
                    }}
                  >
                    Business Partner: <b>{getVendorName(feed)}</b>
                  </Typography>

                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                    Dibuat: {formatDateId(feed.created_at)}
                  </Typography>

                  <Typography variant="body2" fontWeight="bold" color="primary" sx={{ mt: 0.5 }}>
                    Total: {formatRp(total)}
                  </Typography>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={{ xs: 1.5, sm: 2 }} sx={{ width: '100%' }}>
                  <Button fullWidth size="small" variant="outlined" onClick={() => handleEdit(feed)} sx={{ textTransform: 'none' }}>
                    Edit
                  </Button>
                  <Button
                    fullWidth
                    size="small"
                    variant="contained"
                    onClick={() => {
                      const nowLocal = new Date();
                      const dStr = nowLocal.toISOString().split('T')[0];
                      const tStr = nowLocal.toTimeString().slice(0, 5);

                      setSelectedFeedId(feed.id);
                      setAddStockQty('');
                      setAddStockDate(dStr);
                      setAddStockTime(tStr);
                      setAddStockDialog(true);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Tambah Stok
                  </Button>
                  <Button
                    fullWidth
                    size="small"
                    color="error"
                    variant="outlined"
                    onClick={() => {
                      setFeedToDelete(feed.id);
                      setDeleteConfirmOpen(true);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Hapus
                  </Button>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Logs */}
      <Box mt={4}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1} mb={1}>
          <Typography variant="h6">Riwayat Perubahan</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" onClick={handleExportExcel}>
              Export Excel
            </Button>
            <Button variant="outlined" size="small" onClick={handleExportPDF}>
              Export PDF
            </Button>
          </Stack>
        </Stack>

        <Paper sx={{ mt: 1, p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }} elevation={0}>
          {filteredLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Belum ada aktivitas untuk filter ini.
            </Typography>
          ) : (
            <>
              <Box sx={{ overflowX: 'auto' }}>
                <List dense>
                  {displayedLogs.map((l, idx) => (
                    <div key={idx}>
                      <ListItem sx={{ py: 0.75 }}>
                        <ListItemText primaryTypographyProps={{ variant: 'body2' }} secondaryTypographyProps={{ variant: 'caption' }} primary={`${l.action} — ${l.detail}`} secondary={new Date(l.timestamp).toLocaleString('id-ID')} />
                      </ListItem>
                      {idx < displayedLogs.length - 1 && <Divider component="li" />}
                    </div>
                  ))}
                </List>
              </Box>
              {filteredLogs.length > 5 && !filterVendorId && !searchTerm && (
                <Button size="small" onClick={() => setShowAllLogs(!showAllLogs)}>
                  {showAllLogs ? 'Show Less' : 'Show More'}
                </Button>
              )}
            </>
          )}
        </Paper>
      </Box>

      {/* FORM DIALOG */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{selectedFeedId ? 'Edit Pakan' : 'Tambah Pakan'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            <TextField label="Nama" fullWidth value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Tanggal dibuat" type="date" fullWidth value={formData.created_at} onChange={(e) => setFormData({ ...formData, created_at: e.target.value })} InputLabelProps={{ shrink: true }} />
              <TextField label="Jam dibuat" type="time" fullWidth value={formData.created_time} onChange={(e) => setFormData({ ...formData, created_time: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Jumlah (kg)"
                fullWidth
                type="number"
                value={formData.quantity_kg}
                onChange={(e) => {
                  const newQty = e.target.value;
                  const newUnit = recomputePricePerKg(newQty, formData.total_price);
                  setFormData((prev) => ({
                    ...prev,
                    quantity_kg: newQty,
                    price_per_kg: newUnit,
                  }));
                }}
              />
              <TextField
                label="Total harga pembelian"
                fullWidth
                type="number"
                value={formData.total_price}
                onChange={(e) => {
                  const newTotal = e.target.value;
                  const newUnit = recomputePricePerKg(formData.quantity_kg, newTotal);
                  setFormData((prev) => ({
                    ...prev,
                    total_price: newTotal,
                    price_per_kg: newUnit,
                  }));
                }}
                helperText="Masukkan total nilai pembelian pakan"
              />
            </Stack>
            <TextField label="Harga/kg (otomatis)" fullWidth type="number" value={formData.price_per_kg} InputProps={{ readOnly: true }} helperText="Dihitung otomatis dari total / kg" />
            <TextField select label="Business Partner" fullWidth value={formData.vendor_id} onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })} helperText="Pilih satu Business Partner dari master data">
              <MenuItem value="">— Tanpa Business Partner —</MenuItem>
              {vendors.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                  {v.phone ? ` — ${v.phone}` : ''}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFormOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={handleFormSubmit}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>

      {/* ADD STOCK DIALOG */}
      <Dialog open={addStockDialog} onClose={() => setAddStockDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Tambah Stok</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={0.5}>
            <TextField label="Tanggal transaksi" type="date" fullWidth value={addStockDate} onChange={(e) => setAddStockDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Jam transaksi" type="time" fullWidth value={addStockTime} onChange={(e) => setAddStockTime(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Jumlah (kg)" type="number" fullWidth autoFocus value={addStockQty} onChange={(e) => setAddStockQty(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAddStockDialog(false)}>Batal</Button>
          <Button variant="contained" onClick={handleAddStock}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRM */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Hapus Pakan</DialogTitle>
        <DialogContent>
          <Typography>Apakah Anda yakin ingin menghapus pakan ini?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Batal</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              handleDelete(feedToDelete);
              setDeleteConfirmOpen(false);
            }}
          >
            Hapus
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
