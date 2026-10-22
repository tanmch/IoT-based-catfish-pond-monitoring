import { useState, useEffect, useCallback } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Box,
  Menu,
  MenuItem,
  Tooltip,
  Badge,
  Divider,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Chip,
} from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsIcon from "@mui/icons-material/Notifications";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useNavigate } from "react-router-dom";

/* ===== Helpers: robust JWT decode (URL-safe) ===== */
function base64UrlDecode(input) {
  try {
    const pad = (str) => str + "===".slice((str.length + 3) % 4);
    const b64 = pad(String(input).replace(/-/g, "+").replace(/_/g, "/"));
    const bin = atob(b64);
    // decodeURIComponent untuk unicode safety
    return decodeURIComponent(
      bin.split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
  } catch {
    return null;
  }
}

function decodeJwt(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const json = base64UrlDecode(parts[1]);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/* Ambil display name dari payload/localStorage */
function deriveDisplayName(payload, storedName) {
  const fromEmail = (em) => (em ? em.split("@")[0] : "");
  // Urutan prioritas nama
  return (
    payload?.username ||
    payload?.name ||
    payload?.preferred_username ||
    storedName ||
    fromEmail(payload?.email) ||
    (typeof payload?.sub === "string" && payload.sub.includes("@") ? fromEmail(payload.sub) : payload?.sub) ||
    "User"
  );
}

function getInitials(nameOrEmail = "U") {
  const s = String(nameOrEmail).trim();
  if (!s) return "U";
  if (s.includes(" ")) {
    const [a, b] = s.split(/\s+/);
    return ((a?.[0] || "U") + (b?.[0] || "")).toUpperCase();
  }
  const core = s.includes("@") ? s.split("@")[0] : s;
  return (core?.[0] || "U").toUpperCase();
}

export default function Header({ onToggleSidebar, isSidebarOpen }) {
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [username, setUsername] = useState("User");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(localStorage.getItem("role") || "petani");

  const loadIdentity = useCallback(() => {
    const token = localStorage.getItem("token");
    const storedName = localStorage.getItem("username") || "";
    const storedRole = localStorage.getItem("role") || "petani";

    let name = storedName;
    let mail = "";

    if (token) {
      const payload = decodeJwt(token);
      if (payload) {
        name = deriveDisplayName(payload, storedName);
        mail = payload.email || "";
        // kalau role ada di token & mau dipakai, bisa tambahkan: payload.role
      }
    }

    setUsername(name || "User");
    setEmail(mail);
    setRole(storedRole);
  }, []);

  useEffect(() => {
    loadIdentity();
    const onStorage = () => loadIdentity();
    const onAuthChanged = () => loadIdentity();
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth:changed", onAuthChanged); // custom event supaya update di tab yang sama
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth:changed", onAuthChanged);
    };
  }, [loadIdentity]);

  const handleMenu = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const doLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("token_type");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    // trigger update ke seluruh app (termasuk tab yang sama)
    window.dispatchEvent(new Event("auth:changed"));
    setConfirmOpen(false);
    handleMenuClose();
    navigate("/", { replace: true });
  };

  return (
    <AppBar
      position="fixed"
      sx={{
        zIndex: (t) => t.zIndex.drawer + 1,
        backgroundColor: "#5856d6",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      }}
    >
      <Toolbar>
        <IconButton
          color="inherit"
          edge="start"
          onClick={onToggleSidebar}
          sx={{ mr: 1 }}
          aria-label={isSidebarOpen ? "Tutup sidebar" : "Buka sidebar"}
        >
          <MenuRoundedIcon />
        </IconButton>

        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Budidaya Lele
        </Typography>

        <Box>
          <Tooltip title="Akun">
            <IconButton onClick={handleMenu} color="inherit" sx={{ p: 0 }}>
              <Avatar
                sx={{
                  bgcolor: "#6b7785",
                  width: 36,
                  height: 36,
                  mr: 1,
                  border: "2px solid rgba(255,255,255,0.35)",
                }}
              >
                {getInitials(username || email)}
              </Avatar>
              <Typography variant="body1" sx={{ display: { xs: "none", sm: "block" } }}>
                {username}
              </Typography>
              <Chip
                size="small"
                label={role}
                color={role === "admin" ? "error" : role === "pemilik" ? "primary" : "default"}
                sx={{ ml: 1, display: { xs: "none", md: "inline-flex" } }}
              />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            PaperProps={{ elevation: 4, sx: { minWidth: 260, borderRadius: 2 } }}
          >
            <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Signed in as
              </Typography>
              <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                {username}
              </Typography>
              {email ? (
                <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                  {email}
                </Typography>
              ) : null}
            </Box>

            <Divider />

            <MenuItem disabled>
              <ListItemIcon>
                <AdminPanelSettingsIcon fontSize="small" />
              </ListItemIcon>
              Role: {role}
            </MenuItem>

            <MenuItem onClick={() => { handleMenuClose(); navigate("/profile"); }}>
              <ListItemIcon>
                <AccountCircleIcon fontSize="small" />
              </ListItemIcon>
              Profil
            </MenuItem>

            <Divider />

            <MenuItem onClick={() => setConfirmOpen(true)}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>

      {/* Dialog konfirmasi logout */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Keluar dari akun?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Kamu akan keluar dari sesi saat ini. Lanjutkan logout?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Batal</Button>
          <Button variant="contained" color="error" onClick={doLogout}>
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </AppBar>
  );
}
