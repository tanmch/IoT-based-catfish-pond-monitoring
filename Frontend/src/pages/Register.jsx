import axios from 'axios';
import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom'; // ✅ tambahkan useNavigate
import { Container, Box, TextField, Button, Typography, Card, CardContent, Alert, Link } from '@mui/material';
import backgroundImage from '../assets/background.jpg';
import logo from '../assets/logolelelinker.png';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const response = await axios.post('http://103.103.22.213/api/register', {
        username,
        email,
        password,
      });
      setMessage('Registrasi berhasil! Silakan login.');
      setUsername('');
      setEmail('');
      setPassword('');
      // Optional: redirect ke halaman login setelah beberapa detik
      // setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      console.error('Register error:', err);
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Gagal registrasi. Periksa input atau server.');
      }
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh', // full tinggi layar
        width: '100%', // full lebar
        position: 'absolute',
        top: 0,
        left: 0,
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%', p: 2, borderRadius: 3, boxShadow: 3 }}>
        <CardContent>
          <Typography variant="h5" align="center" gutterBottom sx={{ color: '#5856d6' }}>
            Register
          </Typography>

          {message && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleRegister}>
            <TextField label="Username" variant="outlined" fullWidth margin="normal" value={username} onChange={(e) => setUsername(e.target.value)} />
            <TextField label="Email" type="email" variant="outlined" fullWidth margin="normal" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="Password" type="password" variant="outlined" fullWidth margin="normal" value={password} onChange={(e) => setPassword(e.target.value)} />

            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2, py: 1.2, backgroundColor: '#5856d6', '&:hover': { backgroundColor: '#4745c6' } }}>
              Register
            </Button>
          </form>

          <Box mt={2} textAlign="center">
            <Link component={RouterLink} to="/" underline="hover" variant="body2">
              Sudah punya akun? Login
            </Link>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
