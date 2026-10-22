// src/pages/Finance.jsx  (REPLACE your file with this)
import { useState, useEffect } from 'react';
import {
  Typography,
  Grid,
  Paper,
  Box,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  Stack,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import StoreIcon from '@mui/icons-material/Store';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import OpacityIcon from '@mui/icons-material/Opacity';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';

const API_BASE = 'http://103.103.22.213/api';

const formatRp = (v) => (typeof v === 'number' ? 'Rp ' + Math.round(v).toLocaleString('id-ID') : '-');

function safeNum(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

// Kartu ringkas dengan aksen strip di atas (base putih)
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

export default function Finance() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(true);

  // backend data
  const [summary, setSummary] = useState({
    total_pemasukan: 0,
    total_pengeluaran: 0,
    saldo: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [ikanList, setIkanList] = useState([]); // stok gudang ikan (tetap ditampilkan sebagai aset gudang)
  const [feedList, setFeedList] = useState([]); // stok pakan gudang
  const [refUkuran, setRefUkuran] = useState([]);
  const [kolamList, setKolamList] = useState([]);
  const [feedingLogs, setFeedingLogs] = useState([]);

  // derived
  const [asetPerKolam, setAsetPerKolam] = useState([]); // ===> dihitung seperti di Detail Kolam
  const [asetIkan, setAsetIkan] = useState([]); // stok ikan di gudang (bukan di kolam)
  const [asetPakan, setAsetPakan] = useState([]); // stok pakan di gudang
  const [pengeluaranIkan, setPengeluaranIkan] = useState([]);
  const [pengeluaranPakan, setPengeluaranPakan] = useState([]);
  const [feedSummary, setFeedSummary] = useState({
    feedKg: 0,
    feedCost: 0,
    vitaminKg: 0,
    vitaminCost: 0,
  });

  // UI state
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [snack, setSnack] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showAllFeeding, setShowAllFeeding] = useState(false);
  const [showAllKolam, setShowAllKolam] = useState(false);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [summaryRes, transRes, ikanRes, feedRes, refRes, kolamRes, feedingRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/transaksi/summary`, { headers }),
        axios.get(`${API_BASE}/transaksi`, { headers }),
        axios.get(`${API_BASE}/ikan`, { headers }),
        axios.get(`${API_BASE}/feed`, { headers }),
        axios.get(`${API_BASE}/reference/ukuran-ikan`, { headers }),
        axios.get(`${API_BASE}/kolam`, { headers }),
        // global endpoint mungkin tidak ada -> nanti fallback per-kolam
        axios.get(`${API_BASE}/pemberian-pakan`, { headers }),
      ]);

      if (summaryRes.status === 'fulfilled') {
        setSummary(
          summaryRes.value.data || {
            total_pemasukan: 0,
            total_pengeluaran: 0,
            saldo: 0,
          },
        );
      }
      if (transRes.status === 'fulfilled') {
        setTransactions(transRes.value.data || []);
      }
      if (ikanRes.status === 'fulfilled') setIkanList(ikanRes.value.data || []);
      if (feedRes.status === 'fulfilled') setFeedList(feedRes.value.data || []);
      if (refRes.status === 'fulfilled') setRefUkuran(refRes.value.data || []);
      if (kolamRes.status === 'fulfilled') setKolamList(kolamRes.value.data || []);

      // ==== Feeding logs (untuk ringkasan KG dan estimasi biaya)
      let feedingData = [];
      if (feedingRes.status === 'fulfilled') {
        feedingData = feedingRes.value.data || [];
      } else {
        const kolamArr = kolamRes.status === 'fulfilled' ? kolamRes.value.data || [] : [];
        const perKolamLogs = await Promise.all(
          kolamArr.map((k) =>
            axios
              .get(`${API_BASE}/pemberian-pakan/${k.id}`, { headers })
              .then((r) =>
                (r.data || []).map((lg) => ({
                  ...lg,
                  __kolam_id: k.id,
                  __kolam_name: k.name ?? k.nama,
                })),
              )
              .catch(() => []),
          ),
        );
        feedingData = perKolamLogs.flat();
      }
      setFeedingLogs(feedingData);

      // ==== Aset Pakan (gudang)
      const pakanArr = (feedRes.status === 'fulfilled' ? feedRes.value.data || [] : []).map((f) => {
        const qty = safeNum(f.quantity_kg ?? f.quantity ?? 0);
        const price = safeNum(f.price_per_kg ?? f.price ?? 0);
        return {
          id: f.id,
          jenis: f.name ?? f.jenis ?? '-',
          quantity: qty,
          harga_per_kg: price,
          total: qty * price,
        };
      });
      setAsetPakan(pakanArr);

      // ==== Ringkasan pemakaian pakan/vitamin dari log (KG & estimasi biaya)
      const globalFeedSummary = feedingData.reduce(
        (acc, log) => {
          const qty = safeNum(log.jumlah_kg ?? log.jumlah ?? log.quantity_kg ?? 0);
          const stok = log.stok_pakan ?? null;
          const pricePerKg = safeNum(stok?.price_per_kg ?? stok?.price ?? log.price_per_kg ?? 0);
          const type = String(stok?.type ?? log.type ?? log.jenis ?? '')
            .toLowerCase()
            .trim();
          if (type === 'vitamin') {
            acc.vitaminKg += qty;
            acc.vitaminCost += qty * pricePerKg;
          } else {
            acc.feedKg += qty;
            acc.feedCost += qty * pricePerKg;
          }
          return acc;
        },
        { feedKg: 0, feedCost: 0, vitaminKg: 0, vitaminCost: 0 },
      );
      setFeedSummary(globalFeedSummary);

      // ==== Aset per kolam —> PENTING: samakan dengan KolamDetail
      const kolams = kolamRes.status === 'fulfilled' ? kolamRes.value.data || [] : [];
      const fishPerKolam = await Promise.all(
        kolams.map((k) =>
          axios
            .get(`${API_BASE}/kolam/${k.id}/fish`, { headers })
            .then((r) => ({ kolam: k, fish: r.data || [] }))
            .catch(() => ({ kolam: k, fish: [] })),
        ),
      );

      const asetKolamArr = fishPerKolam.map(({ kolam, fish }) => {
        let fishAsset = 0;
        let feedAccum = 0;
        let vitaminAccum = 0;

        (fish || []).forEach((f) => {
          const qty = safeNum(f.jumlah_ekor ?? 0);
          const totalKg = safeNum(f.total_kg ?? 0);
          const priceKg = safeNum(f.harga_per_kg_snapshot ?? 0);
          const priceUnit = safeNum(f.harga_per_unit_snapshot ?? 0);

          if (priceKg > 0 && totalKg > 0) {
            fishAsset += priceKg * totalKg;
          } else if (priceUnit > 0 && qty > 0) {
            fishAsset += priceUnit * qty;
          }

          feedAccum += safeNum(f.feed_cost_accum ?? 0);
          vitaminAccum += safeNum(f.vitamin_cost_accum ?? 0);
        });

        return {
          id: kolam.id,
          nama: kolam.name ?? kolam.nama ?? `Kolam ${kolam.id}`,
          ikan: fishAsset,
          pakan_terpakai_cost: feedAccum,
          vitamin_terpakai_cost: vitaminAccum,
          total: fishAsset + feedAccum + vitaminAccum,
        };
      });
      setAsetPerKolam(asetKolamArr);

      // ==== Aset ikan (gudang/master)
      const ikans = ikanRes.status === 'fulfilled' ? ikanRes.value.data || [] : [];
      const refs = refRes.status === 'fulfilled' ? refRes.value.data || [] : [];

      const speciesMap = {};
      ikans.forEach((it) => {
        const qty = safeNum(it.quantity ?? 0);
        const avgWeight = safeNum(it.avg_weight ?? 0); // grams (legacy)
        const size = it.size ?? null;
        const refItem = refs.find((r) => r.name === size) || {};
        const tipe = refItem.tipe_harga || (it.price_per_kg ? 'berat' : it.price_per_unit ? 'ukuran' : 'berat');

        let total = 0;
        if (tipe === 'ukuran') {
          const unitPrice = safeNum(it.price_per_unit ?? 0);
          total = qty * unitPrice;
        } else {
          const pricePerKg = safeNum(it.price_per_kg ?? 0);
          const totalKg = (qty * avgWeight) / 1000;
          total = totalKg * pricePerKg;
        }
        const key = it.species ?? 'Unknown';
        if (!speciesMap[key])
          speciesMap[key] = {
            species: key,
            quantity: 0,
            harga_per_kg: it.price_per_kg ?? null,
            total: 0,
          };
        speciesMap[key].quantity += qty;
        speciesMap[key].total += total;
        if (!speciesMap[key].harga_per_kg && it.price_per_kg) speciesMap[key].harga_per_kg = it.price_per_kg;
      });
      setAsetIkan(Object.values(speciesMap));

      // ==== Klasifikasi pengeluaran (heuristik ringan)
      const trans = transRes.status === 'fulfilled' ? transRes.value.data || [] : [];
      const pengeluaranAll = trans.filter(
        (t) =>
          String(t.tipe ?? t.kategori ?? '')
            .toLowerCase()
            .includes('pengeluaran') || String(t.tipe ?? t.kategori ?? '').toLowerCase() === 'debit',
      );
      const pengeluaranIkanArr = pengeluaranAll.filter((t) => /ikan|lele|nila|patin|bandeng/i.test(String(t.keterangan ?? t.deskripsi ?? t.description ?? '')));
      const pengeluaranPakanArr = pengeluaranAll.filter((t) => /pakan|pelet|vitamin/i.test(String(t.keterangan ?? t.deskripsi ?? t.description ?? '')));
      setPengeluaranIkan(pengeluaranIkanArr);
      setPengeluaranPakan(pengeluaranPakanArr);
    } catch (err) {
      console.error('Error refresh finance:', err);
      setSnack({
        open: true,
        message: 'Gagal fetch data finance. Cek console.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Top Up handlers
  const openTopUp = () => {
    setTopUpAmount('');
    setTopUpOpen(true);
  };
  const submitTopUp = async () => {
    const token = localStorage.getItem('token');
    if (!token)
      return setSnack({
        open: true,
        message: 'User not authenticated',
        severity: 'error',
      });
    const amt = safeNum(topUpAmount, 0);
    if (amt <= 0) {
      setSnack({
        open: true,
        message: 'Masukkan angka top up yang valid',
        severity: 'error',
      });
      return;
    }
    try {
      await axios.post(
        `${API_BASE}/transaksi`,
        {
          kategori: 'pemasukan',
          deskripsi: 'Top Up Kas',
          jumlah: amt,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSnack({ open: true, message: 'Top up berhasil', severity: 'success' });
      setTopUpOpen(false);
      await refreshAll();
    } catch (err) {
      console.error('Top up gagal:', err);
      setSnack({ open: true, message: 'Top up gagal', severity: 'error' });
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const txData = transactions.map((t) => ({
      tanggal: t.tanggal ?? t.created_at ?? '',
      kategori: t.kategori ?? t.tipe ?? '',
      deskripsi: t.deskripsi ?? t.description ?? t.keterangan ?? '',
      jumlah: t.jumlah ?? t.amount ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txData), 'Transaksi');

    // Aset Kolam (persis formula KolamDetail)
    const kolamData = asetPerKolam.map((k) => ({
      kolam: k.nama,
      aset_ikan: Math.round(k.ikan),
      biaya_pakan: Math.round(k.pakan_terpakai_cost),
      biaya_vitamin: Math.round(k.vitamin_terpakai_cost),
      total: Math.round(k.total),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kolamData), 'Aset_Kolam');

    const ikanGudang = asetIkan.map((i) => ({
      species: i.species,
      quantity: i.quantity,
      harga_per_kg: i.harga_per_kg ?? '',
      total: Math.round(i.total),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ikanGudang), 'Aset_Ikan_Gudang');

    const pakanData = asetPakan.map((p) => ({
      jenis: p.jenis,
      quantity_kg: p.quantity,
      harga_per_kg: p.harga_per_kg,
      total: Math.round(p.total),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pakanData), 'Aset_Pakan_Gudang');

    XLSX.writeFile(wb, 'laporan_keuangan.xlsx');
  };

  // UI slices
  const txToShow = showAllTransactions ? transactions : transactions.slice(0, 5);
  const feedingToShow = showAllFeeding ? feedingLogs : feedingLogs.slice(0, 5);
  const kolamToShow = showAllKolam ? asetPerKolam : asetPerKolam.slice(0, 6);

  const totalAsetKolam = asetPerKolam.reduce((s, k) => s + (k.total || 0), 0);

  // ---------- Renderers: Tabel ↔ Kartu (mobile) ----------
  const renderIkanGudang = () => {
    if (isMobile) {
      return (
        <Stack spacing={1}>
          {asetIkan.length === 0 ? (
            <Typography color="text.secondary">Tidak ada data ikan</Typography>
          ) : (
            asetIkan.map((i, idx) => (
              <Paper key={idx} sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {i.species}
                </Typography>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Jumlah
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {i.quantity}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Harga/kg
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {i.harga_per_kg ? formatRp(i.harga_per_kg) : '-'}
                  </Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">Total</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {formatRp(i.total)}
                  </Typography>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      );
    }
    return (
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Spesies</TableCell>
              <TableCell align="right">Jumlah</TableCell>
              <TableCell align="right">Harga/kg</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {asetIkan.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>Tidak ada data ikan</TableCell>
              </TableRow>
            ) : (
              asetIkan.map((i, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{i.species}</TableCell>
                  <TableCell align="right">{i.quantity}</TableCell>
                  <TableCell align="right">{i.harga_per_kg ? formatRp(i.harga_per_kg) : '-'}</TableCell>
                  <TableCell align="right">{formatRp(i.total)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    );
  };

  const renderPakanGudang = () => {
    if (isMobile) {
      return (
        <Stack spacing={1}>
          {asetPakan.length === 0 ? (
            <Typography color="text.secondary">Tidak ada data pakan</Typography>
          ) : (
            asetPakan.map((p, idx) => (
              <Paper key={idx} sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {p.jenis}
                </Typography>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Jumlah (kg)
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {p.quantity}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Harga/kg
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatRp(p.harga_per_kg)}
                  </Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">Total</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {formatRp(p.total)}
                  </Typography>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      );
    }
    return (
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Jenis</TableCell>
              <TableCell align="right">Jumlah (kg)</TableCell>
              <TableCell align="right">Harga/kg</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {asetPakan.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>Tidak ada data pakan</TableCell>
              </TableRow>
            ) : (
              asetPakan.map((p, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{p.jenis}</TableCell>
                  <TableCell align="right">{p.quantity}</TableCell>
                  <TableCell align="right">{formatRp(p.harga_per_kg)}</TableCell>
                  <TableCell align="right">{formatRp(p.total)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    );
  };

  const renderFeedingLogs = () => {
    if (isMobile) {
      return (
        <Stack spacing={1}>
          {feedingToShow.length === 0 ? (
            <Typography color="text.secondary">Tidak ada data pemberian pakan</Typography>
          ) : (
            feedingToShow.map((lp, idx) => {
              const qty = safeNum(lp.jumlah_kg ?? lp.jumlah ?? lp.quantity_kg ?? 0);
              const stok = lp.stok_pakan ?? null;
              const price = safeNum(stok?.price_per_kg ?? stok?.price ?? lp.price_per_kg ?? 0);
              const kolamName = lp.__kolam_name ?? lp.kolam_name ?? lp.kolam?.name ?? lp.kolam ?? lp.kolam_id ?? '-';
              return (
                <Paper key={idx} sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {new Date(lp.created_at ?? lp.tanggal ?? Date.now()).toLocaleDateString()}
                  </Typography>
                  <Typography variant="body2">{kolamName}</Typography>
                  <Divider sx={{ my: 1 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary" variant="body2">
                      Jenis
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {stok?.name ?? lp.jenis ?? '-'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary" variant="body2">
                      Jumlah (kg)
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {qty}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary" variant="body2">
                      Estimasi Biaya
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatRp(qty * price)}
                    </Typography>
                  </Stack>
                </Paper>
              );
            })
          )}
        </Stack>
      );
    }
    return (
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Tanggal</TableCell>
              <TableCell>Kolam</TableCell>
              <TableCell>Jenis Pakan</TableCell>
              <TableCell align="right">Jumlah (kg)</TableCell>
              <TableCell align="right">Estimasi Biaya</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {feedingToShow.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>Tidak ada data pemberian pakan</TableCell>
              </TableRow>
            ) : (
              feedingToShow.map((lp, idx) => {
                const qty = safeNum(lp.jumlah_kg ?? lp.jumlah ?? lp.quantity_kg ?? 0);
                const stok = lp.stok_pakan ?? null;
                const price = safeNum(stok?.price_per_kg ?? stok?.price ?? lp.price_per_kg ?? 0);
                const kolamName = lp.__kolam_name ?? lp.kolam_name ?? lp.kolam?.name ?? lp.kolam ?? lp.kolam_id ?? '-';
                return (
                  <TableRow key={idx} hover>
                    <TableCell>{new Date(lp.created_at ?? lp.tanggal ?? Date.now()).toLocaleDateString()}</TableCell>
                    <TableCell>{kolamName}</TableCell>
                    <TableCell>{stok?.name ?? lp.jenis ?? '-'}</TableCell>
                    <TableCell align="right">{qty}</TableCell>
                    <TableCell align="right">{formatRp(qty * price)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Box>
    );
  };

  const renderPengeluaran = (items) => {
    if (isMobile) {
      return (
        <Stack spacing={1}>
          {items.length === 0 ? (
            <Typography color="text.secondary">Tidak ada data tercatat</Typography>
          ) : (
            items.map((it, idx) => (
              <Paper key={idx} sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {it.tanggal ?? it.created_at ?? '-'}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {it.deskripsi ?? it.description ?? it.keterangan ?? '-'}
                </Typography>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Jumlah
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {formatRp(Number(it.jumlah ?? it.amount ?? 0))}
                  </Typography>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      );
    }
    return (
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Tanggal</TableCell>
              <TableCell>Deskripsi</TableCell>
              <TableCell align="right">Jumlah</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>Tidak ada data tercatat</TableCell>
              </TableRow>
            ) : (
              items.map((pi, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{pi.tanggal ?? pi.created_at ?? '-'}</TableCell>
                  <TableCell>{pi.deskripsi ?? pi.description ?? pi.keterangan ?? '-'}</TableCell>
                  <TableCell align="right">{formatRp(Number(pi.jumlah ?? pi.amount ?? pi.jumlah_kg ?? 0))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    );
  };

  const renderTransaksi = () => {
    if (isMobile) {
      return (
        <Stack spacing={1}>
          {txToShow.length === 0 ? (
            <Typography color="text.secondary">Tidak ada transaksi</Typography>
          ) : (
            txToShow.map((t, idx) => (
              <Paper key={idx} sx={{ p: 2, borderRadius: 2, border: '1px solid #f1f1f4' }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle2" fontWeight={700}>
                    {t.kategori ?? t.tipe ?? '-'}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={800}>
                    {formatRp(Number(t.jumlah ?? t.amount ?? 0))}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {t.tanggal ?? t.created_at ?? '-'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {t.deskripsi ?? t.description ?? t.keterangan ?? '-'}
                </Typography>
              </Paper>
            ))
          )}
        </Stack>
      );
    }
    return (
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Tanggal</TableCell>
              <TableCell>Kategori</TableCell>
              <TableCell>Deskripsi</TableCell>
              <TableCell align="right">Jumlah</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {txToShow.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>Tidak ada transaksi</TableCell>
              </TableRow>
            ) : (
              txToShow.map((t, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{t.tanggal ?? t.created_at ?? '-'}</TableCell>
                  <TableCell>{t.kategori ?? t.tipe ?? '-'}</TableCell>
                  <TableCell>{t.deskripsi ?? t.description ?? t.keterangan ?? '-'}</TableCell>
                  <TableCell align="right">{formatRp(Number(t.jumlah ?? t.amount ?? 0))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    );
  };

  return (
    <Layout>
      <Box mb={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight="bold">
              Laporan Keuangan 📊
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ringkasan aset (berdasarkan snapshot kolam), kas, pengeluaran, dan aktivitas operasional
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button startIcon={<AddIcon />} variant="contained" onClick={openTopUp} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Top Up Kas
            </Button>
            <Button startIcon={<RefreshIcon />} variant="outlined" onClick={refreshAll} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Refresh
            </Button>
            <Button variant="contained" color="secondary" onClick={exportToExcel} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Export Excel
            </Button>
          </Stack>
        </Stack>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Summary cards (4 kolom) */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<Inventory2Icon />} label="Total Aset Kolam" value={formatRp(totalAsetKolam)} hint="Aset ikan + biaya pakan & vitamin (akumulasi)" accent="#5856d6" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<AttachMoneyIcon color="success" />} label="Saldo (Cash)" value={formatRp(summary.saldo)} hint={`In: ${formatRp(summary.total_pemasukan)} · Out: ${formatRp(summary.total_pengeluaran)}`} accent="#00c9a7" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<StoreIcon color="error" />} label="Total Pengeluaran" value={formatRp(summary.total_pengeluaran)} accent="#ff7a59" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard icon={<RestaurantIcon color="primary" />} label="Total Pemasukan" value={formatRp(summary.total_pemasukan)} accent="#6c63ff" />
            </Grid>
          </Grid>

          {/* Aset per Kolam */}
          <Paper
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              background: '#fff',
              border: '1px solid #f1f1f4',
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" mb={2} spacing={1}>
              <Typography variant="h6">Aset per Kolam</Typography>
              <Chip label={`Total: ${formatRp(totalAsetKolam)}`} variant="outlined" sx={{ borderColor: '#5856d6', color: '#5856d6' }} />
            </Stack>

            <Grid container spacing={2}>
              {kolamToShow.length === 0 ? (
                <Grid item xs={12}>
                  <Typography color="text.secondary">Tidak ada data kolam atau aset.</Typography>
                </Grid>
              ) : (
                kolamToShow.map((k) => (
                  <Grid item xs={12} sm={6} md={4} key={k.id}>
                    <Paper
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        background: '#fff',
                        border: '1px solid #f1f1f4',
                      }}
                    >
                      <Stack spacing={1.2}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <OpacityIcon />
                          <Typography variant="subtitle1" fontWeight="600">
                            {k.nama}
                          </Typography>
                        </Stack>

                        <Divider sx={{ my: 0.5 }} />

                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">
                            Aset Ikan
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {formatRp(k.ikan)}
                          </Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">
                            Biaya Pakan (akum.)
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {formatRp(k.pakan_terpakai_cost)}
                          </Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">
                            Biaya Vitamin (akum.)
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {formatRp(k.vitamin_terpakai_cost)}
                          </Typography>
                        </Stack>

                        <Divider sx={{ my: 0.5 }} />
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="subtitle2">Total</Typography>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {formatRp(k.total)}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Grid>
                ))
              )}
            </Grid>
            {asetPerKolam.length > 6 && (
              <Box textAlign="center" mt={2}>
                <Button onClick={() => setShowAllKolam(!showAllKolam)}>{showAllKolam ? 'Tampilkan Sedikit' : `Lihat Semua (${asetPerKolam.length})`}</Button>
              </Box>
            )}
          </Paper>

          {/* Aset Ikan Gudang */}
          <Paper
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              background: '#fff',
              border: '1px solid #f1f1f4',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Aset Ikan (Stok Gudang)
            </Typography>
            {renderIkanGudang()}
          </Paper>

          {/* Aset Pakan Gudang + Ringkasan Pemakaian */}
          <Paper
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              background: '#fff',
              border: '1px solid #f1f1f4',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Aset Pakan (Stok Gudang)
            </Typography>
            {renderPakanGudang()}

            <Box mt={2}>
              <Typography variant="subtitle2">Ringkasan Pemakaian Pakan & Vitamin (dari log pemberian)</Typography>
              <Typography>
                Pakan: {(feedSummary.feedKg || 0).toFixed(2)} kg — {formatRp(feedSummary.feedCost || 0)}
              </Typography>
              <Typography>
                Vitamin: {(feedSummary.vitaminKg || 0).toFixed(2)} kg — {formatRp(feedSummary.vitaminCost || 0)}
              </Typography>
            </Box>
          </Paper>

          {/* Log Pemberian Pakan (global) */}
          <Paper
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              background: '#fff',
              border: '1px solid #f1f1f4',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Log Pemberian Pakan (Global)
            </Typography>
            {renderFeedingLogs()}
            {feedingLogs.length > 5 && (
              <Box textAlign="center" mt={1}>
                <Button onClick={() => setShowAllFeeding(!showAllFeeding)}>{showAllFeeding ? 'Tampilkan Sedikit' : `Lihat Semua (${feedingLogs.length})`}</Button>
              </Box>
            )}
          </Paper>

          {/* Breakdown Pengeluaran */}
          <Paper
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              background: '#fff',
              border: '1px solid #f1f1f4',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Breakdown Pengeluaran
            </Typography>

            <Typography variant="subtitle1" sx={{ mt: 2 }}>
              Pengeluaran Ikan
            </Typography>
            {renderPengeluaran(pengeluaranIkan)}

            <Typography variant="subtitle1" sx={{ mt: 3 }}>
              Pengeluaran Pakan
            </Typography>
            {renderPengeluaran(pengeluaranPakan)}
          </Paper>

          {/* Transaksi */}
          <Paper
            sx={{
              p: 3,
              mb: 6,
              borderRadius: 3,
              background: '#fff',
              border: '1px solid #f1f1f4',
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} mb={2} spacing={0.5}>
              <Typography variant="h6">Transaksi</Typography>
              <Typography variant="caption" color="text.secondary">
                Latest transactions
              </Typography>
            </Stack>
            {renderTransaksi()}
            {transactions.length > 5 && (
              <Box textAlign="center" mt={1}>
                <Button onClick={() => setShowAllTransactions(!showAllTransactions)}>{showAllTransactions ? 'Tampilkan Sedikit' : `Lihat Semua (${transactions.length})`}</Button>
              </Box>
            )}
          </Paper>
        </>
      )}

      <Dialog open={topUpOpen} onClose={() => setTopUpOpen(false)}>
        <DialogTitle>Top Up Kas</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Jumlah (angka saja)"
            fullWidth
            margin="dense"
            value={topUpAmount}
            onChange={(e) => {
              const raw = e.target.value.toString().replace(/[^\d.]/g, '');
              setTopUpAmount(raw);
            }}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTopUpOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={submitTopUp}>
            Top Up
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snack.severity} onClose={() => setSnack({ ...snack, open: false })}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
