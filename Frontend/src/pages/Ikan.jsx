// src/pages/Ikan.jsx
import { useState, useEffect, useMemo } from 'react';
import { Typography, Grid, Paper, Box, TextField, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, MenuItem, List, ListItem, ListItemText, Divider, Snackbar, Alert, Chip, Tooltip } from '@mui/material';
import OpacityIcon from '@mui/icons-material/Opacity';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import NumbersIcon from '@mui/icons-material/Numbers';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API_BASE = 'http://103.103.22.213/api';
const LOG_STORAGE_KEY = 'ikan_logs_simple';

const formatRp = (v) => (Number.isFinite(Number(v)) ? 'Rp ' + Math.round(Number(v)).toLocaleString('id-ID') : 'Rp 0');

// ===== Helpers referensi (baru) =====
const norm = (s) => (s || '').trim().toLowerCase();
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// Cari referensi berdasarkan UKURAN saja
const findRefBySize = (refs, size) => (refs || []).find((r) => norm(r.ukuran) === norm(size));

// === NEW: gabungkan nama ref + nama input user ===
const buildSpeciesName = (refName, userName) => {
  const r = (refName || '').trim();
  const u = (userName || '').trim();
  if (r && u) return `${r} - ${u}`;
  return r || u || '';
};

// === NEW: tentukan tipe harga dengan PRIORITAS field item (anti mismatch ref)
const computePricingType = (item, refList) => {
  if (item?.price_per_unit != null) return 'ukuran';
  if (item?.price_per_kg != null) return 'berat';
  const ref = findRefBySize(refList, item?.size);
  return ref?.tipe_harga || null;
};

// === NEW: hitung nilai aset item — utamakan field di item, fallback ke ref bila kosong
const computeAssetValue = (item, refList) => {
  if (!item) return 0;
  const tipe = computePricingType(item, refList);

  if (tipe === 'ukuran') {
    const qty = Number(item.quantity || 0);
    const price = Number(item.price_per_unit ?? item.price ?? 0);
    return qty * price;
  }

  if (tipe === 'berat') {
    // gunakan total_kg bila ada; fallback ke avg_weight (legacy) atau 0
    const kg = Number(item.total_kg ?? item.avg_weight ?? 0) || 0;
    const price = Number(item.price_per_kg ?? item.price ?? 0);
    return kg * price;
  }

  // fallback terakhir (jika tipe benar2 tak ada)
  const priceAny = Number(item.price_per_unit ?? item.price_per_kg ?? item.price ?? 0);
  const qty = Number(item.quantity || 0);
  return qty * priceAny;
};

/** Tile statistik kecil */
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

export default function Ikan() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('petani');
  const [ikanData, setIkanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [refUkuran, setRefUkuran] = useState([]);

  // master vendor
  const [vendors, setVendors] = useState([]);

  // form states
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add'); // add | edit | add_stock | reduce_stock
  const [formData, setFormData] = useState({
    nama_ikan: '', // opsional (informasi)
    ukuran: '', // kunci ke referensi ukuran-ikan
    quantity_per_kg: '', // ekor per kg
    total_kg: '', // berat total kg
    computed_quantity: 0, // ekor (OTOMATIS)
    price: '', // harga per ekor / per kg (ikut tipe dari ukuran)
    tanggal: new Date().toISOString().slice(0, 10),
    vendor_id: '',
  });
  const [selectedIkanId, setSelectedIkanId] = useState(null);

  // search / sort / filter
  const [searchText, setSearchText] = useState('');
  const [sortField, setSortField] = useState('nama_ikan');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterSize, setFilterSize] = useState('');

  // logs & snackbar
  const [logs, setLogs] = useState([]);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'error',
  });

  const [confirmIkanName, setConfirmIkanName] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    } catch (err) {
      console.error('Token decode failed', err);
      navigate('/');
      return;
    }
    loadLogsFromStorage();
    fetchVendors();
    fetchIkan();
    fetchRefUkuran();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // logs localStorage
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

  // helper: ambil nama vendor dari nested atau daftar vendor
  const getVendorName = (item) => {
    if (item?.vendor?.name) return item.vendor.name;
    if (item?.vendor_id && vendors.length) {
      const v = vendors.find((x) => Number(x.id) === Number(item.vendor_id));
      return v?.name || '-';
    }
    return '-';
  };

  const addLog = (action, oldData = null, newData = null, quantityChange = null) => {
    let detail = '';

    if (action === 'Create' && newData) {
      const vname = getVendorName(newData);
      detail = `${newData.nama_ikan || newData.species || '-'} ukuran ${newData.size || newData.ukuran || '-'} berhasil ditambahkan. Jumlah: ${newData.quantity || 0} ekor, Berat total: ${newData.total_kg ?? '-'} kg, Harga: Rp ${
        newData.price_per_unit ?? newData.price_per_kg ?? newData.price ?? '-'
      }, Vendor: ${vname}`;
    } else if (action === 'Update' && oldData && newData) {
      const changes = [];
      if (oldData.nama_ikan !== newData.nama_ikan) changes.push(`Nama: ${oldData.nama_ikan || '-'} → ${newData.nama_ikan || '-'}`);
      if ((oldData.size || oldData.ukuran) !== (newData.size || newData.ukuran)) changes.push(`Ukuran: ${oldData.size || oldData.ukuran || '-'} → ${newData.size || newData.ukuran || '-'}`);
      if (oldData.quantity !== newData.quantity) changes.push(`Jumlah: ${oldData.quantity || 0} → ${newData.quantity || 0}`);
      const oldVendor = getVendorName(oldData);
      const newVendor = getVendorName(newData);
      if (oldVendor !== newVendor) changes.push(`Vendor: ${oldVendor} → ${newVendor}`);
      const nama = newData.nama_ikan || newData.species || 'Unknown';
      detail = `${nama} (id:${newData.id}) diperbarui: ${changes.length ? changes.join(', ') : 'tidak ada perubahan field penting'}`;
    } else if ((action === 'AddStock' || action === 'ReduceStock') && oldData && quantityChange !== null) {
      const sign = action === 'AddStock' ? '+' : '-';
      detail = `${oldData.nama_ikan || oldData.species || 'Unknown'} (id:${oldData.id}) stok ${sign}${Math.abs(quantityChange)}. Jumlah: ${oldData.quantity} → ${oldData.quantity + quantityChange}`;
    } else if (action === 'Delete' && oldData) {
      detail = `${oldData.nama_ikan || oldData.species || '-'} ukuran ${oldData.ukuran || oldData.size || '-'} berhasil dihapus.`;
    }

    const item = { action, detail, timestamp: new Date().toISOString() };
    const next = [item, ...logs].slice(0, 50);
    setLogs(next);
    saveLogsToStorage(next);
  };

  const fetchVendors = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get(`${API_BASE}/reference/vendor`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVendors(res.data || []);
    } catch (e) {
      console.error('Gagal ambil Business Partner:', e);
      setVendors([]);
    }
  };

  // fetch reference sizes
  const fetchRefUkuran = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE}/reference/ukuran-ikan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRefUkuran(res.data || []);
    } catch (err) {
      console.error('Gagal ambil reference ukuran ikan:', err);
    }
  };

  const fetchIkan = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE}/ikan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // normalisasi: pastikan setiap item punya total_kg (fallback ke avg_weight bila data lama)
      const normalized = (res.data || []).map((it) => {
        const total_kg = it.total_kg ?? it.avg_weight ?? null;
        return { ...it, total_kg };
      });
      setIkanData(normalized);
    } catch (err) {
      console.error('Gagal ambil data ikan:', err);
      setIkanData([]);
    } finally {
      setLoading(false);
    }
  };

  // helpers
  const safeParseFloat = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const safeParseInt = (v) => {
    if (v === '' || v === null || v === undefined) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  // ====== Derived helpers (baru) ======
  // Opsi ukuran untuk FILTER bar & FORM: semua ukuran unik dari master
  const filterSizeOptions = useMemo(() => uniq((refUkuran || []).map((r) => r.ukuran)), [refUkuran]);
  const formSizeOptions = filterSizeOptions;

  // ref ukuran terpilih: berdasarkan UKURAN saja
  const selectedRefUkuran = useMemo(() => findRefBySize(refUkuran, formData.ukuran), [refUkuran, formData.ukuran]);

  // backend enum: 'ukuran' (per ekor) | 'berat' (per kg)
  const tipeHarga = selectedRefUkuran?.tipe_harga;

  // === NEW: Preview nama final yang akan disimpan ===
  const finalSpeciesPreview = useMemo(() => buildSpeciesName(selectedRefUkuran?.name, formData.nama_ikan), [selectedRefUkuran?.name, formData.nama_ikan]);

  // compute computed_quantity whenever quantity_per_kg / total_kg change
  useEffect(() => {
    const qpk = parseFloat(formData.quantity_per_kg) || 0;
    const tkg = parseFloat(formData.total_kg) || 0;
    const computed = Math.round(qpk * tkg);
    setFormData((prev) => ({ ...prev, computed_quantity: computed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.quantity_per_kg, formData.total_kg]);

  // total aset (pakai computeAssetValue yang sudah aman)
  const totalAsset = useMemo(() => ikanData.reduce((sum, ikan) => sum + computeAssetValue(ikan, refUkuran), 0), [ikanData, refUkuran]);

  const totalQty = ikanData.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalKg = ikanData.reduce((s, i) => s + Number(i.total_kg || 0), 0);

  // open forms
  const openAddForm = () => {
    setFormMode('add');
    setSelectedIkanId(null);
    setFormData({
      nama_ikan: '', // opsional
      ukuran: '',
      quantity_per_kg: '',
      total_kg: '',
      computed_quantity: 0,
      price: '',
      tanggal: new Date().toISOString().slice(0, 10),
      vendor_id: '',
    });
    setFormOpen(true);
    setErrorMessage('');
  };

  const openEditForm = (ikan) => {
    setFormMode('edit');
    setSelectedIkanId(ikan.id);
    const qty = ikan.quantity ?? 0;
    const totalKgFromIkan = ikan.total_kg ?? ikan.avg_weight ?? '';
    const perKg = totalKgFromIkan && Number(totalKgFromIkan) > 0 ? Math.round(qty / parseFloat(totalKgFromIkan)) : '';
    const priceGeneric = ikan.price_per_unit ?? ikan.price_per_kg ?? ikan.price ?? '';
    setFormData({
      nama_ikan: '',
      ukuran: ikan.size || ikan.ukuran || '',
      quantity_per_kg: perKg || '',
      total_kg: totalKgFromIkan || '',
      computed_quantity: qty,
      price: priceGeneric,
      tanggal: ikan.tanggal || new Date().toISOString().slice(0, 10),
      vendor_id: ikan.vendor?.id ?? ikan.vendor_id ?? '',
    });
    setFormOpen(true);
    setErrorMessage('');
  };

  const openAddStockForm = (ikan) => {
    setFormMode('add_stock');
    setSelectedIkanId(ikan.id);
    setFormData({
      nama_ikan: ikan.species || ikan.nama_ikan || '',
      ukuran: ikan.size || ikan.ukuran || '',
      quantity_per_kg: '',
      total_kg: '',
      computed_quantity: 0,
      price: ikan.price_per_unit ?? ikan.price_per_kg ?? ikan.price ?? '',
      tanggal: new Date().toISOString().slice(0, 10),
      vendor_id: ikan.vendor?.id ?? ikan.vendor_id ?? '',
    });
    setFormOpen(true);
    setErrorMessage('');
  };

  const openReduceStockForm = (ikan) => {
    setFormMode('reduce_stock');
    setSelectedIkanId(ikan.id);
    setFormData({
      nama_ikan: ikan.species || ikan.nama_ikan || '',
      ukuran: ikan.size || ikan.ukuran || '',
      quantity_per_kg: '',
      total_kg: '',
      computed_quantity: 0,
      price: ikan.price_per_unit ?? ikan.price_per_kg ?? ikan.price ?? '',
      tanggal: new Date().toISOString().slice(0, 10),
      vendor_id: ikan.vendor?.id ?? ikan.vendor_id ?? '',
    });
    setFormOpen(true);
    setErrorMessage('');
  };

  // export helpers
  const exportExcel = () => {
    const wsData = ikanData.map((i) => ({
      Nama: i.species,
      Ukuran: i.size,
      Berat_total_kg: i.total_kg ?? '-',
      Jumlah_ekor: i.quantity,
      Harga_per_ekor: i.price_per_unit ?? '',
      Harga_per_kg: i.price_per_kg ?? '',
      Vendor: getVendorName(i),
      Tanggal: i.tanggal,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ikan');
    XLSX.writeFile(wb, 'data_ikan.xlsx');
  };
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('Data Ikan', 14, 15);
    doc.autoTable({
      startY: 20,
      head: [['Nama', 'Ukuran', 'Total Kg', 'Jumlah', 'Harga/Ekor', 'Harga/Kg', 'Vendor', 'Tanggal']],
      body: ikanData.map((i) => [i.species, i.size, i.total_kg ?? '-', i.quantity, i.price_per_unit ?? '-', i.price_per_kg ?? '-', getVendorName(i), i.tanggal]),
      styles: { fontSize: 9 },
      theme: 'grid',
    });
    doc.save('data_ikan.pdf');
  };

  // map API error ke string
  const mapApiErrorToString = (err) => {
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
  };

  // submit handler
  const handleFormSubmit = async () => {
    const token = localStorage.getItem('token');
    setErrorMessage('');

    try {
      // ADD
      if (formMode === 'add') {
        const qpk = safeParseFloat(formData.quantity_per_kg);
        const tkg = safeParseFloat(formData.total_kg);
        const computedQty = Math.round((qpk || 0) * (tkg || 0));

        if (!formData.ukuran || !qpk || !tkg || computedQty <= 0) {
          setErrorMessage('Isi: Ukuran, jumlah ekor/kg, jumlah kg (total) — sehingga jumlah ekor > 0.');
          return;
        }

        // referensi dari UKURAN
        const ref = findRefBySize(refUkuran, formData.ukuran);
        if (!ref) {
          setErrorMessage('Ukuran tidak ditemukan di master data ukuran.');
          return;
        }

        if (!safeParseFloat(formData.price)) {
          setErrorMessage('Isi harga.');
          return;
        }

        // === NEW: species gabungan RefName - InputUser ===
        const speciesFinal = buildSpeciesName(ref?.name, formData.nama_ikan);

        const payload = {
          species: speciesFinal, // <-- disimpan sebagai gabungan
          size: formData.ukuran,
          quantity: computedQty,
          total_kg: Number(tkg),
          tanggal: formData.tanggal,
          vendor_id: formData.vendor_id ? Number(formData.vendor_id) : null,
        };

        if (ref.tipe_harga === 'berat') {
          payload.price_per_kg = safeParseFloat(formData.price);
          payload.price_per_unit = null;
          payload.price = null;
        } else {
          // 'ukuran' = per ekor
          payload.price_per_unit = safeParseFloat(formData.price);
          payload.price_per_kg = null;
          payload.price = null;
        }

        const res = await axios.post(`${API_BASE}/ikan`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const newItem = {
          ...res.data,
          total_kg: res.data.total_kg ?? res.data.avg_weight ?? null,
        };
        setIkanData((prev) => [...prev, newItem]);
        addLog('Create', null, newItem);

        // transaksi: pengeluaran awal (PAKAI cost yang dihitung)
        try {
          let cost = 0;
          if (ref.tipe_harga === 'ukuran' && payload.price_per_unit) {
            cost = payload.quantity * payload.price_per_unit;
          } else if (ref.tipe_harga === 'berat' && payload.price_per_kg) {
            cost = Number(payload.total_kg || 0) * payload.price_per_kg;
          }
          if (cost > 0) {
            const deskripsi =
              ref.tipe_harga === 'ukuran' ? `Pembelian ikan ${payload.species || '-'} ukuran ${payload.size} (${payload.quantity} ekor)` : `Pembelian ikan ${payload.species || '-'} ukuran ${payload.size} (${payload.total_kg} kg)`;

            await axios.post(
              `${API_BASE}/transaksi`,
              {
                kategori: 'pengeluaran',
                deskripsi,
                jumlah: Math.round(cost),
                tanggal: payload.tanggal || new Date().toISOString().slice(0, 10),
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );
          }
        } catch (financeErr) {
          console.warn('Gagal catat transaksi (pengeluaran) untuk penambahan ikan:', financeErr?.response?.data || financeErr.message || financeErr);
        }

        // EDIT
      } else if (formMode === 'edit' && selectedIkanId) {
        const oldData = ikanData.find((i) => i.id === selectedIkanId);

        const qpk = safeParseFloat(formData.quantity_per_kg);
        const tkg = safeParseFloat(formData.total_kg);
        const computedQty = Math.round((qpk || 0) * (tkg || 0));
        const finalQuantity = computedQty > 0 ? computedQty : oldData.quantity;
        const finalTotalKg = computedQty > 0 ? tkg : (oldData.total_kg ?? null);

        const ref = findRefBySize(refUkuran, formData.ukuran);
        if (!ref) {
          setErrorMessage('Ukuran tidak ditemukan di master data ukuran.');
          return;
        }

        if (!safeParseFloat(formData.price)) {
          setErrorMessage('Isi harga.');
          return;
        }

        // === NEW: species gabungan RefName - InputUser ===
        const speciesFinal = buildSpeciesName(ref?.name, formData.nama_ikan);

        const payload = {
          species: speciesFinal, // <-- disimpan sebagai gabungan
          size: formData.ukuran,
          quantity: finalQuantity,
          total_kg: finalTotalKg,
          tanggal: formData.tanggal,
          vendor_id: formData.vendor_id ? Number(formData.vendor_id) : null,
        };

        if (ref.tipe_harga === 'berat') {
          payload.price_per_kg = safeParseFloat(formData.price);
          payload.price_per_unit = null;
          payload.price = null;
        } else {
          payload.price_per_unit = safeParseFloat(formData.price);
          payload.price_per_kg = null;
          payload.price = null;
        }

        // --- Finance: capture nilai aset sebelum edit
        const oldAsset = computeAssetValue(oldData, refUkuran);

        const res = await axios.put(`${API_BASE}/ikan/${selectedIkanId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const updated = {
          ...res.data,
          total_kg: res.data.total_kg ?? res.data.avg_weight ?? null,
        };
        setIkanData((prev) => prev.map((i) => (i.id === selectedIkanId ? updated : i)));
        addLog('Update', oldData, updated);

        // --- Finance: hitung delta setelah edit → buat transaksi penyesuaian
        try {
          const newAsset = computeAssetValue(updated, refUkuran);
          const delta = Math.round(newAsset - oldAsset); // pembulatan ke rupiah

          if (delta !== 0) {
            const kategori = delta > 0 ? 'pengeluaran' : 'pemasukan';
            await axios.post(
              `${API_BASE}/transaksi`,
              {
                kategori,
                deskripsi: `Penyesuaian nilai stok ikan ${updated.species || '-'} (edit data)`,
                jumlah: Math.abs(delta),
                tanggal: updated.tanggal || new Date().toISOString().slice(0, 10),
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );
          }
        } catch (financeErr) {
          console.warn('Gagal catat transaksi (penyesuaian edit):', financeErr?.response?.data || financeErr.message || financeErr);
        }

        // ADD / REDUCE STOCK
      } else if ((formMode === 'add_stock' || formMode === 'reduce_stock') && selectedIkanId) {
        const oldData = ikanData.find((i) => i.id === selectedIkanId);

        let change = 0;
        if (formData.quantity_per_kg && formData.total_kg) {
          change = Math.round((safeParseFloat(formData.quantity_per_kg) || 0) * (safeParseFloat(formData.total_kg) || 0));
        } else {
          change = safeParseInt(formData.computed_quantity || formData.quantity_per_kg || 0);
        }
        change = formMode === 'add_stock' ? Math.abs(change) : -Math.abs(change);

        if ((oldData.quantity || 0) + change < 0) {
          setErrorMessage('Stok tidak boleh kurang dari 0!');
          return;
        }

        // ====== HITUNG usedKg SEKALI (khusus tipe 'berat') ======
        const tipe = oldData.price_per_unit != null ? 'ukuran' : oldData.price_per_kg != null ? 'berat' : computePricingType(oldData, refUkuran);

        let usedKg = 0;
        if (tipe === 'berat') {
          if (safeParseFloat(formData.total_kg)) {
            usedKg = safeParseFloat(formData.total_kg);
          } else if (safeParseFloat(formData.quantity_per_kg) && Math.abs(change) > 0) {
            const qpk = safeParseFloat(formData.quantity_per_kg);
            usedKg = qpk ? Math.abs(change) / qpk : 0;
          } else if (oldData.total_kg && oldData.quantity) {
            const ratio = Math.abs(change) / oldData.quantity;
            usedKg = ratio * (oldData.total_kg || 0);
          } else if (oldData.avg_weight) {
            usedKg = Number(oldData.avg_weight || 0);
          } else {
            usedKg = 0;
          }
          // rapikan angka kg (3 desimal cukup)
          usedKg = Math.max(0, Math.round(usedKg * 1000) / 1000);
        }

        // ====== 1) UPDATE QUANTITY ======
        const payloadQty = { quantity_change: change };
        const resQty = await axios.put(`${API_BASE}/ikan/${selectedIkanId}/quantity`, payloadQty, { headers: { Authorization: `Bearer ${token}` } });

        // update qty di state dulu
        setIkanData((prev) => prev.map((i) => (i.id === selectedIkanId ? { ...i, quantity: resQty.data.quantity } : i)));
        addLog(formMode === 'add_stock' ? 'AddStock' : 'ReduceStock', oldData, { ...oldData, quantity: resQty.data.quantity }, change);

        // ====== 2) JIKA TIPE 'BERAT': UPDATE total_kg DI BACKEND JUGA ======
        if (tipe === 'berat' && usedKg > 0) {
          const sign = formMode === 'add_stock' ? 1 : -1;
          const currKg = Number(oldData.total_kg || 0);
          const newKg = Math.max(0, Math.round((currKg + sign * usedKg) * 1000) / 1000);

          try {
            const resKg = await axios.put(
              `${API_BASE}/ikan/${selectedIkanId}`,
              { total_kg: newKg }, // partial update cukup total_kg saja
              { headers: { Authorization: `Bearer ${token}` } },
            );

            // sinkronkan total_kg di state dengan hasil backend
            setIkanData((prev) => prev.map((i) => (i.id === selectedIkanId ? { ...i, total_kg: resKg.data.total_kg ?? resKg.data.avg_weight ?? null } : i)));
          } catch (e) {
            console.warn('Gagal update total_kg di backend:', e?.response?.data || e.message || e);
          }
        }

        // ====== 3) CATAT TRANSAKSI NOMINAL ======
        try {
          let nominal = 0;
          if (tipe === 'ukuran') {
            const priceUnit = oldData.price_per_unit ?? oldData.price ?? 0;
            nominal = Math.abs(change) * Number(priceUnit || 0);
          } else if (tipe === 'berat') {
            const priceKg = oldData.price_per_kg ?? oldData.price ?? 0;
            nominal = usedKg * Number(priceKg || 0);
          }

          if (nominal > 0) {
            const kategori = formMode === 'add_stock' ? 'pengeluaran' : 'pemasukan';
            const deskripsi =
              formMode === 'add_stock'
                ? tipe === 'berat'
                  ? `Pembelian tambahan ikan ${oldData.species || '-'} ukuran ${oldData.size} (${usedKg} kg)`
                  : `Pembelian tambahan ikan ${oldData.species || '-'} ukuran ${oldData.size} (${Math.abs(change)} ekor)`
                : tipe === 'berat'
                  ? `Pengurangan Stok ikan ${oldData.species || '-'} ukuran ${oldData.size} (${usedKg} kg)`
                  : `Pengurangan Stok ikan ${oldData.species || '-'} ukuran ${oldData.size} (${Math.abs(change)} ekor)`;

            await axios.post(
              `${API_BASE}/transaksi`,
              {
                kategori,
                deskripsi,
                jumlah: Number(Math.round(nominal)),
                tanggal: formData.tanggal || new Date().toISOString().slice(0, 10),
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );
          }
        } catch (financeErr) {
          console.warn('Gagal catat transaksi (stok):', financeErr?.response?.data || financeErr.message || financeErr);
        }
      }

      setSnackbar({ open: true, message: 'Ikan berhasil disimpan!', severity: 'success' });
      setFormOpen(false);
    } catch (err) {
      console.error('Error submit ikan:', err);
      const msg = mapApiErrorToString(err);
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  const handleDeleteIkan = async () => {
    if (!selectedIkanId) return;
    const token = localStorage.getItem('token');
    const oldData = ikanData.find((i) => i.id === selectedIkanId);
    setErrorMessage('');
    try {
      // --- Finance: hitung nilai aset sebelum dihapus (pakai prioritas field item)
      const oldAsset = computeAssetValue(oldData, refUkuran);

      await axios.delete(`${API_BASE}/ikan/${selectedIkanId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIkanData((prev) => prev.filter((i) => i.id !== selectedIkanId));
      addLog('Delete', oldData, null);

      // --- Finance: catat write-off (pengeluaran) sebesar nilai aset yang dihapus
      try {
        if (oldAsset > 0) {
          await axios.post(
            `${API_BASE}/transaksi`,
            {
              kategori: 'pengeluaran',
              deskripsi: `Write-off penghapusan stok ikan ${oldData.species || '-'} ukuran ${oldData.size || '-'}`,
              jumlah: Math.round(oldAsset),
              tanggal: new Date().toISOString().slice(0, 10),
            },
            { headers: { Authorization: `Bearer ${token}` } }, // <- diperbaiki kurungnya
          );
        }
      } catch (financeErr) {
        console.warn('Gagal catat transaksi (write-off delete):', financeErr?.response?.data || financeErr.message || financeErr);
      }

      setConfirmOpen(false);
      setSnackbar({ open: true, message: 'Ikan berhasil dihapus.', severity: 'success' });
    } catch (err) {
      console.error('Gagal hapus:', err);
      const msg = err.response?.data?.detail || 'Gagal hapus ikan, silakan coba lagi.';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  // UI derived
  const filteredData = ikanData
    .filter((i) => (i.species || '').toLowerCase().includes(searchText.toLowerCase()))
    .filter((i) => (filterSize ? (i.size || '') === filterSize : true))
    .sort((a, b) => {
      if (sortField === 'nama_ikan') return sortOrder === 'asc' ? (a.species || '').localeCompare(b.species || '') : (b.species || '').localeCompare(a.species || '');
      if (sortField === 'harga_per_kg') return sortOrder === 'asc' ? (a.price_per_kg || a.price || 0) - (b.price_per_kg || b.price || 0) : (b.price_per_kg || b.price || 0) - (a.price_per_kg || a.price || 0);
      if (sortField === 'avg_weight')
        // map ke total_kg
        return sortOrder === 'asc' ? (a.total_kg || 0) - (b.total_kg || 0) : (b.total_kg || 0) - (a.total_kg || 0);
      return 0;
    });

  // helper untuk tampilkan harga (nilai + unit) — PRIORITAS field item
  const getPriceInfo = (ikan) => {
    const tipe = computePricingType(ikan, refUkuran);
    if (tipe === 'ukuran') {
      return { value: ikan.price_per_unit ?? ikan.price ?? null, unit: '/ekor', mode: 'ukuran' };
    }
    if (tipe === 'berat') {
      return { value: ikan.price_per_kg ?? ikan.price ?? null, unit: '/kg', mode: 'berat' };
    }
    // fallback
    const any = ikan.price_per_unit ?? ikan.price_per_kg ?? ikan.price ?? null;
    // pilih unit berdasarkan field mana yang tidak null (kalau ada)
    const unit = ikan.price_per_unit != null ? '/ekor' : ikan.price_per_kg != null ? '/kg' : '';
    return { value: any, unit, mode: unit === '/kg' ? 'berat' : unit === '/ekor' ? 'ukuran' : null };
  };

  if (loading)
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );

  return (
    <Layout>
      {/* Header */}
      <Box mb={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} flexWrap="wrap" rowGap={1}>
          <Box>
            <Typography variant="h5" fontWeight="bold">
              Master Data Ikan 🐟
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Hai, {username} ({role})
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<AttachMoneyIcon />} label="Total Aset" value={formatRp(totalAsset)} hint="Nilai stok gudang (berdasarkan tipe harga)" accent="#6c63ff" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<Inventory2Icon />} label="Total Jenis" value={ikanData.length} hint="Jumlah item ikan unik" accent="#00c9a7" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<NumbersIcon />} label="Total Stok (ekor)" value={(totalQty || 0).toLocaleString('id-ID')} accent="#ff7a59" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<MonitorWeightIcon />} label="Total Berat (kg)" value={(Math.round(totalKg * 100) / 100).toLocaleString('id-ID')} accent="#5856d6" />
        </Grid>
      </Grid>

      {/* Filter & Controls */}
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
          <TextField label="Cari Nama Ikan" value={searchText} onChange={(e) => setSearchText(e.target.value)} fullWidth sx={{ minWidth: { xs: '100%', sm: 200 } }} />
          <TextField select label="Ukuran" value={filterSize} onChange={(e) => setFilterSize(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 150 } }}>
            <MenuItem value="">Semua</MenuItem>
            {filterSizeOptions.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Sort Field" value={sortField} onChange={(e) => setSortField(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 150 } }}>
            <MenuItem value="nama_ikan">Nama Ikan</MenuItem>
            <MenuItem value="harga_per_kg">Harga/kg</MenuItem>
            <MenuItem value="avg_weight">Total Kg</MenuItem>
          </TextField>
          <TextField select label="Order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 150 } }}>
            <MenuItem value="asc">A → Z / Rendah → Tinggi</MenuItem>
            <MenuItem value="desc">Z → A / Tinggi → Rendah</MenuItem>
          </TextField>
          <Stack direction="row" spacing={1} sx={{ mt: { xs: 1, sm: 0 } }}>
            {role === 'pemilik' && (
              <Button variant="contained" onClick={openAddForm}>
                Tambah Ikan
              </Button>
            )}
            <Tooltip title="Export Excel">
              <Button variant="outlined" onClick={exportExcel}>
                Excel
              </Button>
            </Tooltip>
            <Tooltip title="Export PDF">
              <Button variant="outlined" onClick={exportPDF}>
                PDF
              </Button>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {/* Ikan Grid */}
      <Grid container spacing={2}>
        {filteredData.map((ikan) => {
          const { value: priceValue, unit: priceUnit, mode } = getPriceInfo(ikan);

          // hitung nilai aset (aman, utamakan field item)
          const aset = computeAssetValue(ikan, refUkuran);

          const tipeChip = mode === 'ukuran' ? 'Harga/Ekor' : mode === 'berat' ? 'Harga/Kg' : 'Harga';

          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={ikan.id}>
              <Paper
                sx={{
                  p: 2,
                  borderRadius: 3,
                  background: '#fff',
                  border: '1px solid #f1f1f4',
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
                    background: 'linear-gradient(90deg, #5856d6, #00c9a7)',
                  },
                }}
              >
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: '#f7f7ff',
                        border: '1px solid #ececff',
                      }}
                    >
                      <OpacityIcon />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {ikan.species}
                      </Typography>
                      <Stack direction="row" spacing={1} mt={0.5}>
                        <Chip size="small" label={ikan.size || '-'} />
                        <Chip size="small" label={tipeChip} variant="outlined" />
                      </Stack>
                    </Box>
                  </Stack>

                  <Divider sx={{ my: 1 }} />

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Harga
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatRp(priceValue)}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {priceUnit}
                      </Typography>
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Jumlah (ekor)
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {(ikan.quantity ?? 0).toLocaleString('id-ID')}
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Total berat (kg)
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {Number(ikan.total_kg ?? 0).toLocaleString('id-ID')}
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Business Partner
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {getVendorName(ikan)}
                    </Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Tanggal
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {ikan.tanggal || '-'}
                    </Typography>
                  </Stack>

                  <Divider sx={{ my: 1 }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">Nilai Aset</Typography>
                    <Typography variant="subtitle2" fontWeight={800}>
                      {formatRp(aset)}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1} mt={1}>
                    <Button variant="outlined" size="small" onClick={() => openEditForm(ikan)}>
                      Edit
                    </Button>
                    <Button variant="contained" size="small" onClick={() => openAddStockForm(ikan)}>
                      + Stok
                    </Button>
                    <Button variant="contained" color="error" size="small" onClick={() => openReduceStockForm(ikan)}>
                      − Stok
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Form Dialog */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{formMode === 'add' ? 'Tambah Ikan' : formMode === 'edit' ? 'Edit Data Ikan' : formMode === 'add_stock' ? 'Tambah Stok' : 'Kurangi Stok'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {(formMode === 'add' || formMode === 'edit') && (
              <>
                <TextField label="Nama Ikan (opsional)" placeholder="cth: Lele Jumbo / Nila Merah (hanya informasi tambahan)" value={formData.nama_ikan} onChange={(e) => setFormData({ ...formData, nama_ikan: e.target.value })} fullWidth />

                {/* Ukuran (master) — berdasarkan master ukuran-ikan */}
                <TextField
                  select
                  label="Ukuran (master)"
                  value={formData.ukuran}
                  onChange={(e) => {
                    const ukuran = e.target.value;
                    setFormData((prev) => ({ ...prev, ukuran }));
                  }}
                  fullWidth
                >
                  {formSizeOptions.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>

                {/* NEW: Preview nama final yang akan disimpan */}
                <TextField
                  label="Nama Final (tersimpan)"
                  value={finalSpeciesPreview}
                  InputProps={{ readOnly: true }}
                  helperText="Format: <Nama dari referensi> - <Nama input user>. Kosong salah satunya tetap tersimpan yang terisi."
                  fullWidth
                />

                {/* Vendor (single) */}
                <TextField select label="Business Partner" value={formData.vendor_id} onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })} fullWidth helperText="Pilih satu Business Partner dari master data">
                  <MenuItem value="">— Tanpa Business Partner —</MenuItem>
                  {vendors.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.name}
                      {v.Nomor_HP ? ` — ${v.Nomor_HP}` : ''}
                    </MenuItem>
                  ))}
                </TextField>

                {/* Jumlah ekor/kg & total kg */}
                <TextField
                  label="Jumlah ekor/kg (ekor per 1 kg)"
                  type="number"
                  value={formData.quantity_per_kg}
                  onChange={(e) => setFormData({ ...formData, quantity_per_kg: e.target.value })}
                  helperText="Masukkan berapa ekor per 1 kg (mis. 10)"
                  fullWidth
                />

                <TextField label="Jumlah kg (total berat, kg)" type="number" value={formData.total_kg} onChange={(e) => setFormData({ ...formData, total_kg: e.target.value })} helperText="Total berat batch (dalam kg)" fullWidth />

                <TextField label="Jumlah ekor (terhitung)" value={formData.computed_quantity ?? 0} InputProps={{ readOnly: true }} helperText="Jumlah ekor dihitung otomatis: ekor/kg × kg" fullWidth />

                {/* Harga single field */}
                <TextField
                  label={`Harga ${tipeHarga === 'berat' ? '(per kg)' : tipeHarga === 'ukuran' ? '(per ekor)' : ''}`}
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  helperText={tipeHarga === 'berat' ? 'Masukkan harga per kg' : tipeHarga === 'ukuran' ? 'Masukkan harga per ekor' : 'Pilih ukuran dulu agar tipe harga diketahui'}
                  fullWidth
                />

                {/* Preview total nominal */}
                <Typography variant="body2" color="text.secondary">
                  Perkiraan Harga Total:{' '}
                  {(() => {
                    const q = formData.computed_quantity || 0;
                    const tkg = safeParseFloat(formData.total_kg) || 0;
                    const price = safeParseFloat(formData.price) || 0;
                    if (tipeHarga === 'ukuran') {
                      const total = q * price;
                      return `Rp ${Number(total || 0).toLocaleString('id-ID')}`;
                    } else if (tipeHarga === 'berat') {
                      const total = tkg * price;
                      return `Rp ${Number(total || 0).toLocaleString('id-ID')}`;
                    } else {
                      const total = q * price;
                      return `Rp ${Number(total || 0).toLocaleString('id-ID')}`;
                    }
                  })()}
                </Typography>

                <TextField label="Tanggal" type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
              </>
            )}

            {/* add_stock / reduce_stock */}
            {(formMode === 'add_stock' || formMode === 'reduce_stock') && (
              <>
                <Typography variant="body2">Masukkan penambahan/pengurangan stok. Kamu bisa pakai "Jumlah ekor/kg" + "Jumlah kg" atau masukkan langsung jumlah ekor pada field "Jumlah ekor (terhitung)".</Typography>
                <TextField label="Jumlah ekor/kg (opsional)" type="number" value={formData.quantity_per_kg} onChange={(e) => setFormData({ ...formData, quantity_per_kg: e.target.value })} fullWidth />
                <TextField label="Jumlah kg (opsional)" type="number" value={formData.total_kg} onChange={(e) => setFormData({ ...formData, total_kg: e.target.value })} fullWidth />
                <TextField
                  label="Jumlah ekor (terhitung / langsung)"
                  type="number"
                  value={formData.computed_quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      computed_quantity: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  helperText="Jika pakai field ini, sistem akan gunakan nilai ini sebagai jumlah ekor untuk change stok"
                  fullWidth
                />
                <TextField label="Tanggal" type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
              </>
            )}

            {errorMessage && (
              <Typography color="error" variant="body2">
                {errorMessage}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Batal</Button>
          {formMode === 'edit' && (
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                setConfirmIkanName(formData.nama_ikan || '');
                setConfirmOpen(true);
              }}
            >
              Hapus
            </Button>
          )}
          <Button variant="contained" onClick={handleFormSubmit}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Konfirmasi Hapus</DialogTitle>
        <DialogContent>
          <Typography>Apakah kamu yakin ingin menghapus ikan "{confirmIkanName || '-'}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Batal</Button>
          <Button variant="contained" color="error" onClick={handleDeleteIkan}>
            Hapus
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logs */}
      <Box mt={4}>
        <Typography variant="h6">Riwayat Perubahan</Typography>
        <Paper sx={{ mt: 2, p: 2, borderRadius: 3, border: '1px solid #f1f1f4' }}>
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Belum ada aktivitas.
            </Typography>
          ) : (
            <>
              <List dense>
                {(showAllLogs ? logs : logs.slice(0, 5)).map((l, idx) => (
                  <div key={idx}>
                    <ListItem>
                      <ListItemText primary={`${l.action} — ${l.detail}`} secondary={new Date(l.timestamp).toLocaleString()} />
                    </ListItem>
                    {idx < (showAllLogs ? logs.length : Math.min(5, logs.length)) - 1 && <Divider component="li" />}
                  </div>
                ))}
              </List>
              {logs.length > 5 && (
                <Box textAlign="center" mt={1}>
                  <Button onClick={() => setShowAllLogs(!showAllLogs)}>{showAllLogs ? 'Show Less' : `Show All (${logs.length})`}</Button>
                </Box>
              )}
            </>
          )}
        </Paper>
      </Box>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
