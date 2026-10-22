// src/pages/Management.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  TextField,
  Button,
  Tooltip,
  Grid,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  Snackbar,
  Divider,
  useMediaQuery,
  MenuItem,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CloseIcon from '@mui/icons-material/Close';
import Layout from '../components/Layout';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://103.103.22.213/api';

// === helpers ===
const getKolamName = (k) => k?.nama || k?.name || `Kolam #${k?.id || '?'}`;
const safeIncludes = (str, q) =>
  String(str || '')
    .toLowerCase()
    .includes(String(q || '').toLowerCase());

// === StatCard (match Ikan.jsx) ===
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

export default function Management() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // auth (display only)
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('petani');

  // data
  const [petani, setPetani] = useState([]);
  const [kolam, setKolam] = useState([]);

  // search filter (TERPISAH dari form edit!)
  const [searchText, setSearchText] = useState('');
  const [emailText, setEmailText] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    severity: 'success',
    message: '',
  });

  // edit dialog
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedPetani, setSelectedPetani] = useState(null);
  const [form, setForm] = useState({
    uname: '',
    mail: '',
    pwd: '',
    role: 'petani',
  });

  // assign dialog
  const [openAssign, setOpenAssign] = useState(false);
  const [assignState, setAssignState] = useState({});
  const [checkboxLoading, setCheckboxLoading] = useState({});
  const [assignSearch, setAssignSearch] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);

  // delete confirm
  const [openConfirm, setOpenConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // auth bootstrap & initial fetch
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
    (async () => {
      setLoading(true);
      await Promise.all([fetchPetani(), fetchKolam()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // API headers
  const authHeader = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  // API calls
  const fetchPetani = async () => {
    try {
      setTableLoading(true);
      const res = await axios.get(`${API_BASE}/petani`, {
        headers: authHeader(),
      });
      setPetani(res.data || []);
    } catch (e) {
      console.error(e);
      setErrMsg('Gagal mengambil data petani.');
    } finally {
      setTableLoading(false);
    }
  };

  const fetchKolam = async () => {
    try {
      const res = await axios.get(`${API_BASE}/kolam`, {
        headers: authHeader(),
      });
      setKolam(res.data || []);
      return res.data || [];
    } catch (e) {
      console.error(e);
      setErrMsg('Gagal mengambil data kolam.');
      return [];
    }
  };

  // derived
  const filteredPetani = useMemo(() => {
    return (petani || []).filter((p) => safeIncludes(p.username, searchText) && safeIncludes(p.email, emailText));
  }, [petani, searchText, emailText]);

  const totalKolam = kolam.length;
  const totalPetani = petani.length;
  const totalRelasi = kolam.reduce((acc, k) => acc + (k?.petani_ids?.length || 0), 0);

  // === Edit Petani ===
  const handleEditOpen = (p) => {
    // ⛔ TIDAK menyentuh state search sama sekali
    setSelectedPetani(p);
    setForm({
      uname: p?.username || '',
      mail: p?.email || '',
      pwd: '',
      role: p?.role || 'petani',
    });
    setOpenEdit(true);
  };

  const handleEditSave = async () => {
    if (!selectedPetani) return;
    try {
      const payload = {
        username: form.uname,
        email: form.mail,
      };
      if (form.pwd?.trim()) payload.password = form.pwd;

      await axios.put(`${API_BASE}/petani/${selectedPetani.id}`, payload, {
        headers: authHeader(),
      });

      if (form.role !== selectedPetani.role) {
        await axios.patch(
          `${API_BASE}/petani/${selectedPetani.id}/role`,
          { role: form.role },
          {
            headers: authHeader(),
          },
        );
      }

      setOpenEdit(false);
      await fetchPetani();
      setSnackbar({
        open: true,
        severity: 'success',
        message: 'Data user berhasil diperbarui.',
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Gagal update petani.',
      });
    }
  };

  // === Delete Petani ===
  const askDelete = (item) => {
    setDeleteTarget(item);
    setOpenConfirm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      // unassign semua kolam yang terkait dulu
      const assignedKolam = (kolam || []).filter((k) => (k.petani_ids || []).includes(deleteTarget.id));
      await Promise.all(assignedKolam.map((k) => axios.delete(`${API_BASE}/unassign-petani?petani_id=${deleteTarget.id}&kolam_id=${k.id}`, { headers: authHeader() })));
      await axios.delete(`${API_BASE}/petani/${deleteTarget.id}`, {
        headers: authHeader(),
      });
      setOpenConfirm(false);
      setDeleteTarget(null);
      await Promise.all([fetchPetani(), fetchKolam()]);
      setSnackbar({
        open: true,
        severity: 'success',
        message: 'Petani berhasil dihapus.',
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Gagal menghapus petani.',
      });
    }
  };

  // === Assign / Unassign Kolam ===
  const rebuildAssignState = (p, kolamList) => {
    const map = {};
    (kolamList || []).forEach((k) => {
      map[k.id] = (k.petani_ids || []).includes(p.id);
    });
    return map;
  };

  const handleAssignOpen = async (p) => {
    setSelectedPetani(p);
    setAssignSearch('');
    setCheckboxLoading({});
    setBulkWorking(false);
    const freshKolam = await fetchKolam();
    setAssignState(rebuildAssignState(p, freshKolam));
    setOpenAssign(true);
  };

  const handleAssignToggle = async (kolamId) => {
    if (!selectedPetani) return;
    const currentlyAssigned = !!assignState[kolamId];

    // Optimistic UI
    setAssignState((prev) => ({ ...prev, [kolamId]: !currentlyAssigned }));
    setCheckboxLoading((prev) => ({ ...prev, [kolamId]: true }));

    try {
      if (!currentlyAssigned) {
        // Assign one
        await axios.post(`${API_BASE}/assign-petani-multi`, { petani_id: selectedPetani.id, kolam_ids: [kolamId] }, { headers: authHeader() });
      } else {
        // Unassign one
        await axios.delete(`${API_BASE}/unassign-petani?petani_id=${selectedPetani.id}&kolam_id=${kolamId}`, { headers: authHeader() });
      }
      const freshKolam = await fetchKolam();
      setAssignState(rebuildAssignState(selectedPetani, freshKolam));
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Gagal update assignment kolam.',
      });
      // rollback: refresh from server
      const freshKolam = await fetchKolam();
      setAssignState(rebuildAssignState(selectedPetani, freshKolam));
    } finally {
      setCheckboxLoading((prev) => ({ ...prev, [kolamId]: false }));
    }
  };

  const filteredKolamInDialog = useMemo(() => {
    return (kolam || []).filter((k) => safeIncludes(getKolamName(k), assignSearch) || String(k.id).includes(assignSearch));
  }, [kolam, assignSearch]);

  const filteredAssignedCount = filteredKolamInDialog.reduce((acc, k) => acc + (assignState[k.id] ? 1 : 0), 0);

  const handleSelectAllFiltered = async () => {
    if (!selectedPetani) return;
    const idsToAssign = filteredKolamInDialog.filter((k) => !assignState[k.id]).map((k) => k.id);
    if (idsToAssign.length === 0) return;
    setBulkWorking(true);

    // optimistic
    setAssignState((prev) => {
      const next = { ...prev };
      idsToAssign.forEach((id) => (next[id] = true));
      return next;
    });

    try {
      await axios.post(`${API_BASE}/assign-petani-multi`, { petani_id: selectedPetani.id, kolam_ids: idsToAssign }, { headers: authHeader() });
      const freshKolam = await fetchKolam();
      setAssignState(rebuildAssignState(selectedPetani, freshKolam));
      setSnackbar({
        open: true,
        severity: 'success',
        message: `Berhasil assign ${idsToAssign.length} kolam (terfilter).`,
      });
    } catch (e) {
      console.error(e);
      const freshKolam = await fetchKolam();
      setAssignState(rebuildAssignState(selectedPetani, freshKolam));
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Gagal Select All (terfilter).',
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const handleUnselectAllFiltered = async () => {
    if (!selectedPetani) return;
    const idsToRemove = filteredKolamInDialog.filter((k) => !!assignState[k.id]).map((k) => k.id);
    if (idsToRemove.length === 0) return;
    setBulkWorking(true);

    // optimistic
    setAssignState((prev) => {
      const next = { ...prev };
      idsToRemove.forEach((id) => (next[id] = false));
      return next;
    });

    try {
      await Promise.all(idsToRemove.map((id) => axios.delete(`${API_BASE}/unassign-petani?petani_id=${selectedPetani.id}&kolam_id=${id}`, { headers: authHeader() })));
      const freshKolam = await fetchKolam();
      setAssignState(rebuildAssignState(selectedPetani, freshKolam));
      setSnackbar({
        open: true,
        severity: 'success',
        message: `Berhasil unassign ${idsToRemove.length} kolam (terfilter).`,
      });
    } catch (e) {
      console.error(e);
      const freshKolam = await fetchKolam();
      setAssignState(rebuildAssignState(selectedPetani, freshKolam));
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Gagal Unselect All (terfilter).',
      });
    } finally {
      setBulkWorking(false);
    }
  };

  // loading screen
  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <Box mb={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight="bold">
              User Management Petani 👨‍🌾
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Welcome back, {username} ({role})
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Muat ulang">
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchPetani} disabled={tableLoading}>
                {tableLoading ? 'Muat…' : 'Refresh'}
              </Button>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard icon={<GroupAddIcon />} label="Total Petani" value={totalPetani} accent="#6c63ff" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard icon={<CheckCircleIcon />} label="Total Kolam" value={totalKolam} accent="#00c9a7" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard icon={<CheckCircleIcon />} label="Total Relasi" value={totalRelasi} hint="Jumlah pasangan petani—kolam" accent="#5856d6" />
        </Grid>
      </Grid>

      {/* Filter panel — AUTOFILL DIMATIKAN */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 3,
          background: '#fff',
          border: '1px solid #f1f1f4',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            id="mgmt-search-username"
            name="mgmtSearchUsername"
            label="Cari Username"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.6 }} />,
              inputProps: {
                autoComplete: 'off',
                autoCorrect: 'off',
                spellCheck: false,
              },
            }}
          />
          <TextField
            id="mgmt-search-email"
            name="mgmtSearchEmail"
            label="Filter Email"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.6 }} />,
              inputProps: {
                autoComplete: 'off',
                autoCorrect: 'off',
                spellCheck: false,
              },
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => {
                setSearchText('');
                setEmailText('');
              }}
            >
              Reset
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Error global */}
      {errMsg && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)}
        </Alert>
      )}

      {/* LIST — Desktop: Table */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TableContainer
          component={Paper}
          sx={{
            borderRadius: 3,
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
              background: 'linear-gradient(90deg, #5856d6, #00c9a7)',
            },
            '& tbody tr:nth-of-type(odd)': { backgroundColor: '#fafafd' },
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={80}>ID</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Kolam</TableCell>
                <TableCell width={240} align="right">
                  Aksi
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPetani.map((p) => {
                const kolamCount = (kolam || []).filter((k) => (k.petani_ids || []).includes(p.id)).length;
                return (
                  <TableRow key={p.id} hover>
                    <TableCell>{p.id}</TableCell>
                    <TableCell>{p.username}</TableCell>
                    <TableCell>{p.email}</TableCell>
                    <TableCell>
                      <Chip size="small" label={p.role} color={p.role === 'pemilik' ? 'primary' : 'secondary'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={kolamCount ? 'success' : 'default'} label={kolamCount ? `${kolamCount} Kolam` : 'Belum Assign'} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEditOpen(p)} aria-label={`edit-${p.id}`}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Assign Kolam">
                          <IconButton size="small" onClick={() => handleAssignOpen(p)} aria-label={`assign-${p.id}`}>
                            <GroupAddIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Hapus">
                          <IconButton size="small" color="error" onClick={() => askDelete(p)} aria-label={`delete-${p.id}`}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPetani.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    Tidak ada data.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* LIST — Mobile: Cards */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Grid container spacing={2}>
          {filteredPetani.map((p) => {
            const kolamCount = (kolam || []).filter((k) => (k.petani_ids || []).includes(p.id)).length;
            return (
              <Grid item xs={12} key={p.id}>
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
                    <Stack direction="row" justifyContent="space-between">
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {p.username}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {p.email}
                        </Typography>
                        <Stack direction="row" spacing={1} mt={1}>
                          <Chip size="small" label={`ID: ${p.id}`} />
                          <Chip size="small" color={kolamCount ? 'success' : 'default'} icon={kolamCount ? <CheckCircleIcon /> : undefined} label={kolamCount ? `${kolamCount} Kolam` : 'Belum Assign'} />
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit">
                          <IconButton onClick={() => handleEditOpen(p)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Assign Kolam">
                          <IconButton onClick={() => handleAssignOpen(p)}>
                            <GroupAddIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Hapus">
                          <IconButton color="error" onClick={() => askDelete(p)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
          {filteredPetani.length === 0 && (
            <Grid item xs={12}>
              <Paper
                sx={{
                  p: 3,
                  borderRadius: 3,
                  textAlign: 'center',
                  border: '1px solid #f1f1f4',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Tidak ada data.
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>

      {/* === Dialog Edit === */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Petani</DialogTitle>
        <DialogContent sx={{ pt: 1 }} component="form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField id="edit-uname" name="edit_uname" autoComplete="off" autoCorrect="off" spellCheck={false} label="Username" value={form.uname} onChange={(e) => setForm({ ...form, uname: e.target.value })} fullWidth autoFocus />
            <TextField id="edit-mail" name="edit_mail" autoComplete="off" autoCorrect="off" spellCheck={false} type="email" label="Email" value={form.mail} onChange={(e) => setForm({ ...form, mail: e.target.value })} fullWidth />
            <TextField
              id="edit-pwd"
              name="edit_pwd"
              type="password"
              autoComplete="new-password"
              label="Password (opsional)"
              value={form.pwd}
              onChange={(e) => setForm({ ...form, pwd: e.target.value })}
              helperText="Kosongkan jika tidak ingin mengganti password"
              fullWidth
            />
            <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} fullWidth>
              <MenuItem value="petani">Petani</MenuItem>
              <MenuItem value="pemilik">Pemilik</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEdit(false)}>Batal</Button>
          <Button variant="contained" onClick={handleEditSave}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>

      {/* === Dialog Assign === */}
      <Dialog open={openAssign} onClose={() => setOpenAssign(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ pr: 2 }}>Assign Kolam — {selectedPetani?.username}</DialogTitle>
        <DialogContent dividers sx={{ pt: 1 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
              <TextField
                id="assign-kolam-search"
                name="assign_kolam_search"
                label="Cari Kolam"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.6 }} />,
                  inputProps: {
                    autoComplete: 'off',
                    autoCorrect: 'off',
                    spellCheck: false,
                  },
                }}
                fullWidth
              />
              <Stack direction="row" spacing={1} sx={{ minWidth: 280 }}>
                <Button variant="outlined" startIcon={<SelectAllIcon />} onClick={handleSelectAllFiltered} disabled={bulkWorking || filteredKolamInDialog.length === 0}>
                  Pilih Semua
                </Button>
                <Button variant="outlined" color="warning" startIcon={<ClearAllIcon />} onClick={handleUnselectAllFiltered} disabled={bulkWorking || filteredAssignedCount === 0}>
                  Bersihkan
                </Button>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={`Terfilter: ${filteredKolamInDialog.length}`} />
              <Chip size="small" color={filteredAssignedCount ? 'success' : 'default'} label={`Dipilih: ${filteredAssignedCount}`} />
              {bulkWorking && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={16} />
                  <Typography variant="caption" color="text.secondary">
                    Memproses...
                  </Typography>
                </Stack>
              )}
            </Stack>

            <Divider />

            <FormGroup
              sx={{
                maxHeight: isMobile ? 'unset' : 380,
                overflowY: 'auto',
                pr: 1,
              }}
            >
              {filteredKolamInDialog.map((k) => (
                <FormControlLabel key={k.id} control={<Checkbox checked={!!assignState[k.id]} onChange={() => handleAssignToggle(k.id)} disabled={!!checkboxLoading[k.id] || bulkWorking} />} label={getKolamName(k)} />
              ))}
              {filteredKolamInDialog.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Kolam tidak ditemukan.
                </Typography>
              )}
            </FormGroup>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAssign(false)} startIcon={<CloseIcon />}>
            Tutup
          </Button>
        </DialogActions>
      </Dialog>

      {/* === Dialog Konfirmasi Hapus === */}
      <Dialog open={openConfirm} onClose={() => setOpenConfirm(false)} fullWidth maxWidth="xs">
        <DialogTitle>Konfirmasi Hapus</DialogTitle>
        <DialogContent>
          <Typography>
            Yakin ingin menghapus petani <strong>{deleteTarget?.username}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConfirm(false)}>Batal</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Hapus
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3500} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
