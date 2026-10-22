// src/pages/MasterDataReference.jsx
import { useState, useEffect } from 'react';
import { Typography, Grid, Paper, Box, Avatar, TextField, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, List, ListItem, ListItemText, Divider, MenuItem, Snackbar, Alert } from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import StoreIcon from '@mui/icons-material/Store';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API_BASE = 'http://103.103.22.213/api';
const LOG_STORAGE_KEY = 'reference_logs';

const refOptions = [
  { label: 'Jenis Kolam', value: 'jenis-kolam' },
  { label: 'Ukuran Ikan', value: 'ukuran-ikan' },
  { label: 'Business Partner', value: 'vendor' },
];

const pricingOptions = [
  { label: 'Ekor', value: 'ekor' },
  { label: 'Kilogram', value: 'kg' },
];

function getEmptyFormData(refType) {
  if (refType === 'ukuran-ikan') {
    return { name: 'Lele', ukuran: '', description: '', tipe_harga: 'ekor' };
  }
  if (refType === 'vendor') {
    return {
      name: '',
      Nomor_HP: '',
      alamat: '',
      tanggal_daftar: '',
      bp_code: '',
    };
  }
  return { name: '', description: '' };
}

function buildPayload(refType, formData) {
  if (refType === 'ukuran-ikan') {
    const { name, ukuran, description, tipe_harga } = formData;
    return { name, ukuran, description, tipe_harga: tipe_harga || null };
  }
  if (refType === 'vendor') {
    const { name, Nomor_HP, alamat, tanggal_daftar, bp_code } = formData;
    return {
      name,
      Nomor_HP: Nomor_HP || null,
      alamat: alamat || null,
      tanggal_daftar: tanggal_daftar || null,
      bp_code: bp_code || null,
    };
  }
  const { name, description } = formData;
  return { name, description };
}

// fallback lokal (dipakai kalau endpoint next-code gagal)
function localGenerateBP(existing = []) {
  let max = 0;
  existing.forEach((v) => {
    const code = v?.bp_code || '';
    const m = /^BP(\d+)$/.exec(String(code).trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  const next = (max + 1).toString().padStart(4, '0');
  return `BP${next}`;
}

export default function MasterDataReference() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('petani');

  const [refType, setRefType] = useState('jenis-kolam');
  const [dataRef, setDataRef] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(getEmptyFormData(refType));
  const [selectedId, setSelectedId] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [logs, setLogs] = useState([]);
  const [showAllLogs, setShowAllLogs] = useState(false);

  // === New: UI feedback states ===
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifSeverity, setNotifSeverity] = useState('info'); // "success" | "error" | "warning" | "info"
  const [notifMessage, setNotifMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Helper: show notification
  const notify = (severity, message) => {
    setNotifSeverity(severity);
    setNotifMessage(message);
    setNotifOpen(true);
  };

  // Helper: parse axios error to readable message + status
  const parseAxiosError = (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message || 'Terjadi kesalahan tak terduga.';
    return { status, detail: String(detail) };
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setRole(payload.role || 'petani');
      setUsername(payload.username || 'User');
    } catch (err) {
      console.error('Token decode failed', err);
      navigate('/');
      return;
    }
    loadLogsFromStorage();
  }, []);

  useEffect(() => {
    setFormData(getEmptyFormData(refType));
    fetchDataRef();
  }, [refType]);

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

  const addLog = (action, oldData = null, newData = null) => {
    let detail = '';
    if (action === 'Create' && newData) {
      detail = `Reference "${newData.name}" (${refType}) berhasil ditambahkan.`;
      if (refType === 'ukuran-ikan') {
        const tipeUi = newData.tipe_harga === 'berat' ? 'kg' : newData.tipe_harga === 'ukuran' ? 'ekor' : newData.tipe_harga || '-';
        detail += ` Ukuran: ${newData.ukuran || '-'} | Tipe harga: ${tipeUi || '-'}`;
      }
      if (refType === 'vendor') {
        detail += ` BP Code: ${newData.bp_code || '-'}${newData.Nomor_HP ? ` | HP: ${newData.Nomor_HP}` : ''}${newData.alamat ? ` | Alamat: ${newData.alamat}` : ''}${newData.tanggal_daftar ? ` | Tgl Join: ${newData.tanggal_daftar}` : ''}`;
      }
    } else if (action === 'Update' && oldData && newData) {
      const changes = [];
      if ((oldData.name || '') !== (newData.name || '')) changes.push(`Nama: ${oldData.name || '-'} → ${newData.name || '-'}`);
      if (refType !== 'vendor' && (oldData.description || '') !== (newData.description || '')) {
        changes.push(`Deskripsi: ${oldData.description || '-'} → ${newData.description || '-'}`);
      }
      if (refType === 'ukuran-ikan' && (oldData.ukuran || '') !== (newData.ukuran || '')) {
        changes.push(`Ukuran: ${oldData.ukuran || '-'} → ${newData.ukuran || '-'}`);
      }
      if (refType === 'ukuran-ikan' && (oldData.tipe_harga || '') !== (newData.tipe_harga || '')) {
        const oldUi = oldData.tipe_harga === 'berat' ? 'kg' : oldData.tipe_harga === 'ukuran' ? 'ekor' : oldData.tipe_harga || '-';
        const newUi = newData.tipe_harga === 'berat' ? 'kg' : newData.tipe_harga === 'ukuran' ? 'ekor' : newData.tipe_harga || '-';
        changes.push(`Tipe harga: ${oldUi} → ${newUi}`);
      }
      if (refType === 'vendor') {
        if ((oldData.bp_code || '') !== (newData.bp_code || '')) changes.push(`BP Code: ${oldData.bp_code || '-'} → ${newData.bp_code || '-'}`);
        if ((oldData.Nomor_HP || '') !== (newData.Nomor_HP || '')) changes.push(`Nomor HP: ${oldData.Nomor_HP || '-'} → ${newData.Nomor_HP || '-'}`);
        if ((oldData.alamat || '') !== (newData.alamat || '')) changes.push(`Alamat: ${oldData.alamat || '-'} → ${newData.alamat || '-'}`);
        if ((oldData.tanggal_daftar || '') !== (newData.tanggal_daftar || '')) changes.push(`Tgl Join: ${oldData.tanggal_daftar || '-'} → ${newData.tanggal_daftar || '-'}`);
      }
      detail = `Reference (id:${newData.id}, ${refType}) diperbarui: ${changes.join(', ') || 'tanpa perubahan bermakna'}`;
    } else if (action === 'Delete' && oldData) {
      detail = `Reference "${oldData.name}" (${refType}) berhasil dihapus.`;
    }

    const item = { action, detail, timestamp: new Date().toISOString() };
    const next = [item, ...logs].slice(0, 50);
    setLogs(next);
    saveLogsToStorage(next);
  };

  const fetchDataRef = async () => {
    const endpoint = `${API_BASE}/reference/${refType}`;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      console.groupCollapsed(`[REF][GET] ${endpoint}`);
      console.log('Headers:', { Authorization: `Bearer ${token?.slice(0, 16)}...` });
      const res = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Response status:', res.status);
      console.log('Response data:', res.data);
      console.groupEnd();

      setDataRef(res.data || []);
    } catch (err) {
      console.groupCollapsed(`[REF][GET][ERROR] ${endpoint}`);
      console.error('Error:', err?.response?.data || err.message);
      console.groupEnd();
      setDataRef([]);
      const { status, detail } = parseAxiosError(err);
      notify('error', `[${status || 'ERR'}] Gagal memuat data: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // === Ambil next BP code dari backend ===
  const fetchNextBPCode = async () => {
    const url = `${API_BASE}/reference/vendor/next-code`;
    try {
      const token = localStorage.getItem('token');
      console.groupCollapsed(`[REF][GET] ${url}`);
      console.log('Headers:', { Authorization: `Bearer ${token?.slice(0, 16)}...` });
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      console.log('Response status:', res.status);
      console.log('Response data:', res.data);
      console.groupEnd();
      return res?.data?.next_bp_code || localGenerateBP(dataRef);
    } catch (err) {
      console.groupCollapsed(`[REF][GET][ERROR] ${url}`);
      console.error('Error:', err?.response?.data || err.message);
      console.groupEnd();
      const { status, detail } = parseAxiosError(err);
      notify('warning', `[${status || 'WARN'}] Gagal ambil BP Code otomatis: ${detail}. Dipakai generator lokal.`);
      return localGenerateBP(dataRef);
    }
  };

  const openAddForm = async () => {
    setFormMode('add');
    setSelectedId(null);
    const base = getEmptyFormData(refType);

    if (refType === 'vendor') {
      // panggil backend agar pasti lanjut dari BP terakhir di DB
      base.bp_code = await fetchNextBPCode();
    }

    setFormData(base);
    setFormOpen(true);
  };

  const openEditForm = (ref) => {
    setFormMode('edit');
    setSelectedId(ref.id);
    if (refType === 'ukuran-ikan') {
      const tipeUi = ref.tipe_harga === 'berat' ? 'kg' : ref.tipe_harga === 'ukuran' ? 'ekor' : ref.tipe_harga || '';
      const allowed = ['Lele', 'Nila'];
      const safeName = allowed.includes(ref.name) ? ref.name : 'Lele';
      setFormData({
        name: safeName,
        ukuran: ref.ukuran || '',
        description: ref.description || '',
        tipe_harga: tipeUi,
      });
    } else if (refType === 'vendor') {
      setFormData({
        name: ref.name || '',
        Nomor_HP: ref.Nomor_HP || '',
        alamat: ref.alamat || '',
        tanggal_daftar: ref.tanggal_daftar || '',
        bp_code: ref.bp_code || '',
      });
    } else {
      setFormData({
        name: ref.name,
        description: ref.description || '',
      });
    }
    setFormOpen(true);
  };

  // Helper: submit POST/PUT dengan retry khusus 409 saat ADD vendor
  const doSubmit = async (url, method, payload, headers, options = {}) => {
    const { isVendorAdd, onRetryBPRefresh } = options;
    try {
      if (method === 'POST') {
        return await axios.post(url, payload, { headers });
      }
      if (method === 'PUT') {
        return await axios.put(url, payload, { headers });
      }
      throw new Error('Unsupported method');
    } catch (err) {
      const { status, detail } = parseAxiosError(err);

      // Penanganan khusus saat tambah vendor dan 409 conflict
      if (isVendorAdd && status === 409 && typeof onRetryBPRefresh === 'function') {
        // Refresh next BP dan retry sekali
        notify('warning', '[409] BP Code bentrok, mencoba sinkron ulang kode…');
        const nextCode = await fetchNextBPCode();
        // Jangan kirim bp_code (tetap biarkan backend), tetapi tampilkan di form agar user lihat
        setFormData((p) => ({ ...p, bp_code: nextCode }));
        return await axios.post(url, { ...payload, bp_code: undefined }, { headers });
      }

      // Lempar lagi ke caller untuk handling umum
      err._parsed = { status, detail };
      throw err;
    }
  };

  const handleFormSubmit = async () => {
    if (submitting) return;
    const token = localStorage.getItem('token');
    const endpoint = `/reference/${refType}`;
    try {
      if (!formData.name?.trim()) {
        notify('warning', 'Nama wajib diisi!');
        return;
      }

      setSubmitting(true);

      const payload = buildPayload(refType, formData);

      if (refType === 'ukuran-ikan' && payload.tipe_harga) {
        const t = String(payload.tipe_harga).toLowerCase();
        payload.tipe_harga = t === 'kg' ? 'berat' : 'ukuran';
      }

      // ⛔ Saat TAMBAH vendor, jangan sertakan bp_code. Backend yang finalisasi.
      if (refType === 'vendor' && formMode === 'add') {
        delete payload.bp_code;
      }

      if (refModeIsAdd()) {
        console.groupCollapsed(`[REF][POST] ${API_BASE}${endpoint}`);
        console.log('Method:', 'POST');
        console.log('Headers:', { Authorization: `Bearer ${token?.slice(0, 16)}...` });
        console.log('Payload:', payload);
        const res = await doSubmit(
          `${API_BASE}${endpoint}`,
          'POST',
          payload,
          { Authorization: `Bearer ${token}` },
          {
            isVendorAdd: refType === 'vendor',
            onRetryBPRefresh: true,
          },
        );
        console.log('Response status:', res.status);
        console.log('Response data:', res.data);
        console.groupEnd();

        // refresh list dari server agar state sinkron (dan next-code ikut naik)
        await fetchDataRef();
        addLog('Create', null, res.data);
        notify('success', 'Data berhasil ditambahkan.');
      } else if (formMode === 'edit' && selectedId) {
        console.groupCollapsed(`[REF][PUT] ${API_BASE}${endpoint}/${selectedId}`);
        console.log('Method:', 'PUT');
        console.log('Headers:', { Authorization: `Bearer ${token?.slice(0, 16)}...` });
        console.log('Payload:', payload);
        const oldData = dataRef.find((i) => i.id === selectedId);
        const res = await doSubmit(`${API_BASE}${endpoint}/${selectedId}`, 'PUT', payload, { Authorization: `Bearer ${token}` });
        console.log('Response status:', res.status);
        console.log('Response data:', res.data);
        console.groupEnd();

        await fetchDataRef();
        addLog('Update', oldData, res.data);
        notify('success', 'Perubahan tersimpan.');
      }
      setFormOpen(false);
      setSelectedId(null);
      setFormData(getEmptyFormData(refType));
    } catch (err) {
      console.groupCollapsed(`[REF][${formMode === 'add' ? 'POST' : 'PUT'}][ERROR] ${API_BASE}${endpoint}${formMode === 'edit' ? `/${selectedId}` : ''}`);
      console.error('Error:', err?.response?.data || err.message);
      console.groupEnd();

      const parsed = err?._parsed || parseAxiosError(err);
      notify('error', `[${parsed.status || 'ERR'}] ${parsed.detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  const refModeIsAdd = () => formMode === 'add';

  const handleDelete = async () => {
    if (deleting) return;
    if (!selectedId) return;
    const token = localStorage.getItem('token');
    const endpoint = `/reference/${refType}`;
    const oldData = dataRef.find((i) => i.id === selectedId);
    try {
      setDeleting(true);
      console.groupCollapsed(`[REF][DELETE] ${API_BASE}${endpoint}/${selectedId}`);
      console.log('Method:', 'DELETE');
      console.log('Headers:', { Authorization: `Bearer ${token?.slice(0, 16)}...` });
      const res = await axios.delete(`${API_BASE}${endpoint}/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Response status:', res.status);
      console.log('Response data:', res.data);
      console.groupEnd();

      await fetchDataRef();
      addLog('Delete', oldData);
      notify('success', 'Data berhasil dihapus.');
    } catch (err) {
      console.groupCollapsed(`[REF][DELETE][ERROR] ${API_BASE}${endpoint}/${selectedId}`);
      console.error('Error:', err?.response?.data || err.message);
      console.groupEnd();
      const { status, detail } = parseAxiosError(err);
      notify('error', `[${status || 'ERR'}] Gagal hapus: ${detail}`);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setSelectedId(null);
      setFormData(getEmptyFormData(refType));
    }
  };

  const exportExcel = () => {
    const common = (i) => ({ Nama: i.name, Deskripsi: i.description || '-' });

    let wsData = dataRef.map((i) => common(i));
    if (refType === 'ukuran-ikan') {
      const tipeUi = (v) => (v === 'berat' ? 'kg' : v === 'ukuran' ? 'ekor' : v || '-');
      wsData = dataRef.map((i) => ({
        ...common(i),
        Ukuran: i.ukuran || '-',
        'Tipe Harga': tipeUi(i.tipe_harga),
      }));
    } else if (refType === 'vendor') {
      wsData = dataRef.map((i) => ({
        ID: i.id,
        'BP Code': i.bp_code || '-',
        Nama: i.name,
        Alamat: i.alamat || '-',
        'Tgl Join': i.tanggal_daftar || '-',
        'No HP': i.Nomor_HP || '-',
      }));
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reference');
    XLSX.writeFile(wb, `master_data_${refType}.xlsx`);
    notify('success', 'Export Excel berhasil.');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const title = `Master Data ${refOptions.find((r) => r.value === refType)?.label || refType}`;
    doc.text(title, 14, 15);

    let head = ['Nama', 'Deskripsi'];
    let body = dataRef.map((i) => [i.name, i.description || '-']);
    if (refType === 'ukuran-ikan') {
      head = ['Nama', 'Ukuran', 'Tipe Harga', 'Deskripsi'];
      body = dataRef.map((i) => {
        const tipeUi = i.tipe_harga === 'berat' ? 'kg' : i.tipe_harga === 'ukuran' ? 'ekor' : i.tipe_harga || '-';
        return [i.name, i.ukuran || '-', tipeUi, i.description || '-'];
      });
    } else if (refType === 'vendor') {
      head = ['ID', 'BP Code', 'Nama', 'Alamat', 'Tgl Join', 'No HP'];
      body = dataRef.map((i) => [i.id, i.bp_code || '-', i.name, i.alamat || '-', i.tanggal_daftar || '-', i.Nomor_HP || '-']);
    }

    doc.autoTable({ startY: 20, head: [head], body });
    doc.save(`master_data_${refType}.pdf`);
    notify('success', 'Export PDF berhasil.');
  };

  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  const CardIcon = refType === 'vendor' ? StoreIcon : CategoryIcon;

  return (
    <Layout>
      <Box mb={2}>
        <Box
          sx={{
            borderLeft: (theme) => `4px solid ${theme.palette.primary.main}`,
            pl: 2,
          }}
        >
          <Typography variant="h5" fontWeight="bold" sx={{ color: 'text.primary' }}>
            Master Data Reference
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Welcome back, {username} ({role})
          </Typography>
        </Box>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          backgroundColor: '#fff',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          {refOptions.map((opt) => (
            <Button key={opt.value} variant={refType === opt.value ? 'contained' : 'outlined'} onClick={() => setRefType(opt.value)} sx={{ textTransform: 'none', borderRadius: 10 }}>
              {opt.label}
            </Button>
          ))}
          <Box sx={{ flexGrow: 1 }} />
          {role === 'pemilik' && (
            <Button variant="contained" onClick={openAddForm} sx={{ textTransform: 'none', borderRadius: 10 }}>
              {refType === 'vendor' ? 'Tambah Business Partner' : 'Tambah Reference'}
            </Button>
          )}
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        {dataRef.map((ref) => (
          <Grid item xs={12} sm={6} md={3} key={ref.id}>
            <Paper
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                borderRadius: 2,
                minHeight: 190,
                backgroundColor: '#fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                border: '1px solid',
                borderColor: 'divider',
                borderTop: (theme) => `4px solid ${theme.palette.primary.main}`,
              }}
            >
              <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56, mb: 1 }}>
                <CardIcon fontSize="large" />
              </Avatar>
              <Typography variant="subtitle1" fontWeight="medium" sx={{ textAlign: 'center' }}>
                {ref.name}
              </Typography>

              {refType !== 'vendor' && (
                <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                  {ref.description || '-'}
                </Typography>
              )}

              {refType === 'ukuran-ikan' && (
                <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary', mt: 0.5 }}>
                  Ukuran: {ref.ukuran || '-'} • Tipe: {ref.tipe_harga === 'berat' ? 'kg' : ref.tipe_harga === 'ukuran' ? 'ekor' : '-'}
                </Typography>
              )}

              {refType === 'vendor' && (
                <Box sx={{ mt: 0.5, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    BP Code: {ref.bp_code || '-'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Alamat: {ref.alamat || '-'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Tgl Join: {ref.tanggal_daftar || '-'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No HP: {ref.Nomor_HP || '-'}
                  </Typography>
                </Box>
              )}

              <Stack direction="row" spacing={1} mt={1}>
                {role === 'pemilik' && (
                  <Button variant="outlined" size="small" onClick={() => openEditForm(ref)} sx={{ textTransform: 'none', borderRadius: 10 }}>
                    Edit
                  </Button>
                )}
                {role === 'pemilik' && (
                  <Button
                    variant="contained"
                    color="error"
                    size="small"
                    onClick={() => {
                      setSelectedId(ref.id);
                      setConfirmOpen(true);
                    }}
                    sx={{ textTransform: 'none', borderRadius: 10 }}
                  >
                    Hapus
                  </Button>
                )}
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Dialog open={formOpen} onClose={() => (submitting ? null : setFormOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>{formMode === 'add' ? (refType === 'vendor' ? 'Tambah Business Partner' : 'Tambah Reference') : refType === 'vendor' ? 'Edit Business Partner' : 'Edit Reference'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {refType === 'ukuran-ikan' ? (
              <TextField select label="Nama (Species)" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} fullWidth>
                {['Lele', 'Nila'].map((sp) => (
                  <MenuItem key={sp} value={sp}>
                    {sp}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField label={refType === 'vendor' ? 'Nama Business Partner' : 'Nama'} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} fullWidth />
            )}

            {refType !== 'vendor' && <TextField label="Deskripsi" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} fullWidth multiline rows={3} />}

            {refType === 'ukuran-ikan' && (
              <>
                <TextField label="Ukuran (free text)" placeholder="contoh: 2–3 cm / 7–8 cm / LBG" value={formData.ukuran || ''} onChange={(e) => setFormData({ ...formData, ukuran: e.target.value })} fullWidth />
                <TextField select label="Tipe Harga" value={formData.tipe_harga} onChange={(e) => setFormData({ ...formData, tipe_harga: e.target.value })} fullWidth>
                  {pricingOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}

            {refType === 'vendor' && (
              <>
                <TextField label="BP Code (Auto)" value={formData.bp_code} fullWidth InputProps={{ readOnly: true }} helperText="BP Code dihasilkan otomatis saat tambah data." />
                <TextField label="Alamat" value={formData.alamat} onChange={(e) => setFormData({ ...formData, alamat: e.target.value })} fullWidth multiline />
                <TextField label="Tanggal Join" type="date" value={formData.tanggal_daftar || ''} onChange={(e) => setFormData({ ...formData, tanggal_daftar: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
                <TextField label="Nomor HP" value={formData.Nomor_HP} onChange={(e) => setFormData({ ...formData, Nomor_HP: e.target.value })} fullWidth placeholder="+62… / 08…" />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={submitting} onClick={() => setFormOpen(false)} sx={{ textTransform: 'none' }}>
            Batal
          </Button>
          {formMode === 'edit' && role === 'pemilik' && (
            <Button variant="contained" color="error" disabled={submitting} onClick={() => setConfirmOpen(true)} sx={{ textTransform: 'none' }}>
              Hapus
            </Button>
          )}
          <Button variant="contained" onClick={handleFormSubmit} disabled={submitting} sx={{ textTransform: 'none' }}>
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => (deleting ? null : setConfirmOpen(false))} fullWidth maxWidth="xs">
        <DialogTitle>Konfirmasi Hapus</DialogTitle>
        <DialogContent>
          <Typography>Apakah kamu yakin ingin menghapus reference ini?</Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={deleting} onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none' }}>
            Batal
          </Button>
          <Button variant="contained" color="error" disabled={deleting} onClick={handleDelete} sx={{ textTransform: 'none' }}>
            {deleting ? 'Menghapus…' : 'Hapus'}
          </Button>
        </DialogActions>
      </Dialog>

      <Box mt={4}>
        <Typography variant="h6" mb={2}>
          Riwayat Perubahan
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2}>
          <Button variant="contained" onClick={exportExcel} sx={{ textTransform: 'none' }}>
            Export Excel
          </Button>
          <Button variant="contained" onClick={exportPDF} sx={{ textTransform: 'none' }}>
            Export PDF
          </Button>
        </Stack>
        <Paper sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
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
                <Button onClick={() => setShowAllLogs(!showAllLogs)} sx={{ mt: 1, textTransform: 'none' }}>
                  {showAllLogs ? 'Show Less' : `Show All (${logs.length})`}
                </Button>
              )}
            </>
          )}
        </Paper>
      </Box>

      {/* Global Snackbar for success/error/warning/info */}
      <Snackbar
        open={notifOpen}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setNotifOpen(false);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setNotifOpen(false)} severity={notifSeverity} variant="filled" sx={{ width: '100%' }}>
          {notifMessage}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
