// src/routes/AppRoutes.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Dashboard from "../pages/Dashboard";
import Kolam from "../pages/Kolam";
import KolamDetail from "../pages/KolamDetail";
import Feed from "../pages/Feed";
import Vitamin from "../pages/Vitamin";
import Management from "../pages/Management";
import Ikan from "../pages/Ikan";
import Finance from "../pages/Finance";
import MasterDataReference from "../pages/MasterDataReference";
import Panen from "../pages/Panen";
import Profile from "../pages/Profile";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Semua Role */}
        <Route element={<PrivateRoute allowedRoles={["admin", "pemilik", "petani"]} />}>
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Dashboard untuk admin & pemilik */}
        <Route element={<PrivateRoute allowedRoles={["admin", "pemilik"]} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/management" element={<Management />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/master-data-reference" element={<MasterDataReference />} />
        </Route>

        {/* Kolam + Panen (semua role) */}
        <Route element={<PrivateRoute allowedRoles={["admin", "pemilik", "petani"]} />}>
          <Route path="/kolam" element={<Kolam />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/ikan" element={<Ikan />} />
          <Route path="/vitamin" element={<Vitamin />} />
          <Route path="/kolam/:id" element={<KolamDetail />} />
          <Route path="/panen" element={<Panen />} /> {/* ⬅️ TAMBAH ROUTE PANEN */}
        </Route>

        {/* Fallback supaya gak blank */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}


