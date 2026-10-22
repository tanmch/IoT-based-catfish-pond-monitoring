import { Navigate, Outlet } from 'react-router-dom';

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

const PrivateRoute = ({ allowedRoles }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/" replace />;
  }

  // 🔥 CEK EXPIRED
  const payload = decodeJwt(token);

  if (!payload || payload.exp * 1000 < Date.now()) {
    localStorage.clear();

    // 🔥 TANPA useNavigate
    window.location.href = '/';
    return null;
  }

  // 🔐 CEK ROLE
  if (allowedRoles && !allowedRoles.includes(role)) {
    const roleRedirect = {
      admin: '/dashboard',
      pemilik: '/dashboard',
      petani: '/kolam',
    };
    return <Navigate to={roleRedirect[role] || '/'} replace />;
  }

  return <Outlet />;
};

export default PrivateRoute;
