import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Container, Paper, TextField, Button, Typography, Divider, Link, IconButton, InputAdornment, Alert } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import logo from '../assets/logolelelinker.png';
import backgroundImage from '../assets/background.jpg';

const API_BASE = 'http://103.103.22.213/api';

/* ==== decode helpers (sama seperti di Header) ==== */
function base64UrlDecode(input) {
  try {
    const pad = (str) => str + '==='.slice((str.length + 3) % 4);
    const b64 = pad(String(input).replace(/-/g, '+').replace(/_/g, '/'));
    const bin = atob(b64);
    return decodeURIComponent(
      bin
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return null;
  }
}
function decodeJwt(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const json = base64UrlDecode(parts[1]);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function deriveDisplayName(payload) {
  const fromEmail = (em) => (em ? em.split('@')[0] : '');
  return payload?.username || payload?.name || payload?.preferred_username || fromEmail(payload?.email) || (typeof payload?.sub === 'string' && payload.sub.includes('@') ? fromEmail(payload.sub) : payload?.sub) || 'User';
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrMsg('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || 'Login gagal. Periksa email & password.');
      }

      const data = await res.json(); // { access_token, token_type, role }
      const token = data.access_token;
      const role = data.role || 'petani';
      if (!token) throw new Error('Token tidak diterima dari server.');

      localStorage.setItem('token', token);
      localStorage.setItem('token_type', data.token_type || 'bearer');
      localStorage.setItem('role', role);

      // ✅ decode JWT lebih robust
      let usernameToStore = 'User';
      let emailToStore = '';
      const payload = decodeJwt(token);
      if (payload) {
        usernameToStore = deriveDisplayName(payload);
        emailToStore = payload.email || '';
      }
      localStorage.setItem('username', usernameToStore);
      if (emailToStore) localStorage.setItem('email', emailToStore);

      // 🔔 beri tahu seluruh app (termasuk tab yang sama)
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('auth:changed'));

      // ✅ Redirect sesuai role
      const roleRedirect = {
        admin: '/dashboard',
        pemilik: '/dashboard',
        petani: '/kolam',
      };
      navigate(roleRedirect[role] || '/dashboard', { replace: true });
    } catch (err) {
      setErrMsg(err.message || 'Terjadi kesalahan saat login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        width: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <Container maxWidth="xs">
        <Paper elevation={4} sx={{ p: 4, borderRadius: 3 }}>
          <Box textAlign="center" mb={3}>
            <img src={logo} alt="Logo" style={{ width: 80, height: 80 }} />
            <Typography variant="h5" sx={{ mt: 1, fontWeight: 'bold' }}>
              Budidaya Lele
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Silakan login untuk melanjutkan
            </Typography>
          </Box>

          {errMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errMsg}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin}>
            <TextField label="Email" type="email" fullWidth margin="normal" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />

            <TextField
              label="Password"
              type={showPw ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPw((s) => !s)} edge="end">
                      {showPw ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button type="submit" variant="contained" color="primary" fullWidth sx={{ mt: 2, mb: 1 }} disabled={loading}>
              {loading ? 'Memproses...' : 'Login'}
            </Button>

            <Divider sx={{ my: 2 }}>atau</Divider>

            <Box mt={2} display="flex" justifyContent="space-between">
              <Link component={RouterLink} to="/register" underline="hover" variant="body2">
                Register
              </Link>
              <Link href="#" underline="hover" variant="body2">
                Lupa Password?
              </Link>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
