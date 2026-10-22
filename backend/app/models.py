# app/models.py
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Enum, Date, Numeric, Time, func, Index
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime
import pytz
jakarta = pytz.timezone("Asia/Jakarta")
# ============ USER ============
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="user")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relasi
    kolams = relationship("Kolam", back_populates="owner", cascade="all, delete-orphan")
    transaksi_keuangan = relationship("TransaksiKeuangan", back_populates="user")
    feeds = relationship("FeedStock", back_populates="owner", cascade="all, delete-orphan")

# ============ KOLAM ============
# ============ KOLAM ============
class Kolam(Base):
    __tablename__ = "kolam"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    size = Column(Float, default=0)
    location = Column(String(255), nullable=True)
    depth = Column(Float, default=0)
    description = Column(String(255), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum('Kosong','Sedang Pemeliharaan','Siap Panen','Gagal Panen', name="kolam_status"), nullable=False, default='Kosong')

    # === Tambahan dimensi & jenis
    jenis_kolam = Column(String(100), nullable=True)
    panjang = Column(Float, nullable=True)
    lebar = Column(Float, nullable=True)
    tinggi = Column(Float, nullable=True)
    diameter = Column(Float, nullable=True)

    # === Tambahan biaya pembuatan kolam (BARU)
    biaya_pembuatan = Column(Float, default=0)

    isi_kolam = relationship("IsiKolam", back_populates="kolam", cascade="all, delete-orphan")

    owner = relationship("User", back_populates="kolams")
    logs = relationship("KolamLog", back_populates="kolam", cascade="all, delete-orphan")
    feed_logs = relationship("FeedLog", back_populates="kolam", cascade="all, delete-orphan")

    petani_assignments = relationship(
        "PemilikPetaniKolam",
        back_populates="kolam",
        cascade="all, delete-orphan"
    )

    
# ============ KOLAM LOG ============
class KolamLog(Base):
    __tablename__ = "kolam_log"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(
        Integer,
        ForeignKey("kolam.id", ondelete="SET NULL"),  # kalau kolam dihapus → jadi NULL
        nullable=True  # kolam_id boleh kosong
    )
    action = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    kolam = relationship("Kolam", back_populates="logs", passive_deletes=True)

# ============ FISH STOCK ============
class FishStock(Base):
    __tablename__ = "fish_stock"
    id = Column(Integer, primary_key=True, index=True)
    species = Column(String(100), nullable=False)
    size = Column(String(50), nullable=True)
    avg_weight = Column(Float, nullable=True)
    total_kg = Column(Float, nullable=True)
    price_per_kg = Column(Float, nullable=True)
    price_per_unit = Column(Float, nullable=True)
    quantity = Column(Integer, default=0)
    tanggal = Column(Date, nullable=True)

    vendor_id = Column(Integer, ForeignKey("ref_vendor.id"), nullable=True, index=True)  # ✅ NEW
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", lazy="joined")


# ============ FEED STOCK ============
class FeedStock(Base):
    __tablename__ = "feed_stock"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50))
    quantity_kg = Column(Float, nullable=False)
    price_per_kg = Column(Float, nullable=False)

    vendor_id = Column(Integer, ForeignKey("ref_vendor.id"), nullable=True, index=True)  # ✅ NEW
    created_at = Column(DateTime, default=datetime.utcnow)

    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="feeds")

    vendor = relationship("Vendor", lazy="joined")  # ✅ supaya otomatis ikut di-load
    feed_logs = relationship("FeedLog", back_populates="feed", cascade="all, delete-orphan")


# ============ FEED LOG ============
class FeedLog(Base):
    __tablename__ = "feed_logs"
    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id"))
    feed_id = Column(Integer, ForeignKey("feed_stock.id"))
    amount_kg = Column(Float, nullable=False)

    # NEW: input dari user
    tanggal = Column(Date, nullable=True)
    waktu = Column(Time, nullable=True)
    feeding_mode = Column(
        Enum('manual', 'auto_3', 'auto_4', name="feeding_mode_enum"),
        nullable=False,
        default='manual'
    )

    # histori server (tetap dipakai untuk log/urut waktu)
    created_at = Column(DateTime, default=datetime.utcnow)

    kolam = relationship("Kolam", back_populates="feed_logs")
    feed = relationship("FeedStock", back_populates="feed_logs")
    

# ============ FINANCE ============
class TransaksiKeuangan(Base):
    __tablename__ = "transaksi_keuangan"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kategori = Column(Enum("pemasukan", "pengeluaran", name="kategori_enum"), nullable=False)
    deskripsi = Column(String(255))
    jumlah = Column(Float, nullable=False)
    tanggal = Column(Date, nullable=False, default=datetime.utcnow().date())
    panen_id = Column(Integer, ForeignKey("panen.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="transaksi_keuangan")
    panen = relationship("Panen")


# ============ PANEN ============
class Panen(Base):
    __tablename__ = "panen"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"), nullable=False)
    isi_kolam_id = Column(Integer, ForeignKey("isi_kolam.id", ondelete="SET NULL"), nullable=True)

    tanggal = Column(Date, nullable=False)
    tipe_panen = Column(Enum("penuh","parsial", name="panen_type_enum"), default="penuh")

    total_berat_kg = Column(Numeric(10, 3), nullable=False)
    jumlah_ekor = Column(Integer, nullable=True)
    berat_rata_ekor = Column(Numeric(10, 2), nullable=True)

    harga_jual = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Susut
    expected_kg = Column(Numeric(10, 3), nullable=True)
    susut_kg = Column(Numeric(10, 3), nullable=True)
    susut_percent = Column(Numeric(5, 2), nullable=True)

    # HPP
    nilai_aset_diambil = Column(Numeric(14, 2), nullable=True)
    biaya_pakan_ambil = Column(Numeric(14, 2), nullable=True)
    biaya_vitamin_ambil = Column(Numeric(14, 2), nullable=True)
    hpp_total = Column(Numeric(14, 2), nullable=True)

    # Laba Rugi
    laba_rugi = Column(Numeric(14, 2), nullable=True)

    # FCR
    total_pakan_kg = Column(Numeric(10, 3), nullable=True)
    fcr = Column(Numeric(10, 3), nullable=True)

    # ✅ Vendor tujuan panen (siapa pembelinya)
    vendor_id = Column(Integer, ForeignKey("ref_vendor.id"), nullable=True)
    vendor = relationship("Vendor", back_populates="panen_list")

    kolam = relationship("Kolam")
    isi_kolam = relationship("IsiKolam")


# ========== USER MANAGEMENT ===============
class PemilikPetaniKolam(Base):
    __tablename__ = "pemilik_petani_kolam"
    
    id = Column(Integer, primary_key=True, index=True)
    pemilik_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    petani_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kolam_id = Column(Integer, ForeignKey("kolam.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    pemilik = relationship("User", foreign_keys=[pemilik_id])
    petani = relationship("User", foreign_keys=[petani_id])
    kolam = relationship("Kolam", back_populates="petani_assignments")


class IsiKolam(Base):
    __tablename__ = "isi_kolam"
    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"))
    ikan_id = Column(Integer, ForeignKey("fish_stock.id", ondelete="CASCADE"))
    tanggal_masuk = Column(Date, nullable=False)
    jumlah_ekor = Column(Integer, nullable=False)
    total_kg = Column(Numeric(10,3), nullable=True)

    harga_per_kg_snapshot = Column(Numeric(12,2), nullable=True)
    harga_per_unit_snapshot = Column(Numeric(12,2), nullable=True)

    ukuran_ikan_snapshot = Column(String(50), nullable=True)
    vendor_name_snapshot = Column(String(100), nullable=True)

    feed_cost_accum = Column(Numeric(14,2), nullable=False, default=0)     
    vitamin_cost_accum = Column(Numeric(14,2), nullable=False, default=0)  

    feed_kg_accum = Column(Numeric(12,3), nullable=False, default=0)
    vitamin_kg_accum = Column(Numeric(12,3), nullable=False, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

    kolam = relationship("Kolam", back_populates="isi_kolam")
    ikan = relationship("FishStock")
    growth_logs = relationship("GrowthLog", back_populates="isi_kolam", cascade="all, delete-orphan")


class FishMortality(Base):
    __tablename__ = "fish_mortality"
    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"), nullable=False)
    tanggal = Column(Date, nullable=False)
    waktu = Column(Time, nullable=True)
    jumlah_mati = Column(Integer, nullable=False)
    isi_kolam_id = Column(Integer, ForeignKey("isi_kolam.id", ondelete="CASCADE"), nullable=True)
    keterangan = Column(Text, nullable=True)   # ✅ tambahkan ini
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relasi
    kolam = relationship("Kolam", backref="fish_mortalities")
    isi_kolam = relationship("IsiKolam", backref="fish_mortalities")

# ========== Sensor ===============
from datetime import datetime, timezone
import pytz

jakarta = pytz.timezone("Asia/Jakarta")

def now_wib():
    return datetime.now(jakarta)

class SensorData(Base):
    __tablename__ = "sensor_data"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"))

    suhu = Column(Float, nullable=True)        # ✅ TAMBAH INI
    ph = Column(Float, nullable=True)
    oksigen = Column(Float, nullable=True)     # ✅ TAMBAH INI

    waktu = Column(DateTime, default=now_wib)

    kolam = relationship("Kolam")

# ========== KALIBRASI SENSOR ===============
class SensorCalibrationData(Base):
    __tablename__ = "sensor_calibration_data"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer)
    suhu = Column(Float)
    ph = Column(Float)
    oksigen = Column(Float)

    voltage = Column(Float)   # 🔥 TAMBAHAN INI

    waktu = Column(DateTime, default=datetime.utcnow)

class CalibrationPH(Base):
    __tablename__ = "calibration_ph"

    id = Column(Integer, primary_key=True, index=True)
    ph4 = Column(Float)
    ph7 = Column(Float)
    ph9 = Column(Float)
    m1 = Column(Float)
    b1 = Column(Float)
    m2 = Column(Float)
    b2 = Column(Float)
    updated_at = Column(DateTime, default=datetime.utcnow)

# ========== KONTROL AKTUATOR ===============
class DeviceControl(Base):
    __tablename__ = "device_control"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"))

    pompa = Column(Integer, default=0)  # 0 mati, 1 nyala
    valve = Column(Integer, default=0)

    updated_at = Column(DateTime, default=datetime.utcnow)

class PemberianPakan(Base):
    __tablename__ = "pemberian_pakan"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"), nullable=False)
    stok_pakan_id = Column(Integer, ForeignKey("feed_stock.id", ondelete="CASCADE"), nullable=False)
    tanggal = Column(Date, nullable=False)
    waktu = Column(Time, nullable=True)  # ⬅️ TAMBAHAN
    jumlah_kg = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    isi_kolam_id = Column(Integer, ForeignKey("isi_kolam.id", ondelete="CASCADE"), nullable=True)

    # Relasi
    stok_pakan = relationship("FeedStock", backref="pemberian_pakan")
    kolam = relationship("Kolam", backref="pemberian_pakan")
    isi_kolam = relationship("IsiKolam", backref="pemberian_pakan")

# ========== MONITORING LOG ===============
class MonitoringLog(Base):
    __tablename__ = "monitoring_log"

    id = Column(Integer, primary_key=True, index=True)
    kolam_id = Column(Integer, ForeignKey("kolam.id"))

    type = Column(String(50))  # "ph", "suhu", "pompa", "valve"
    value = Column(Float)      # nilai (misal ph=7.2, pompa=1)
    
    created_at = Column(DateTime, default=datetime.utcnow)

class GrowthLog(Base):
    __tablename__ = "growth_log"
    id = Column(Integer, primary_key=True, index=True)
    isi_kolam_id = Column(Integer, ForeignKey("isi_kolam.id", ondelete="CASCADE"))
    kolam_id = Column(Integer, ForeignKey("kolam.id", ondelete="CASCADE"))

    # berat rata lama (gram)
    berat_rata_ekor = Column(Numeric(10, 2), nullable=True)

    # kolom baru: snapshot total kg biomassa kolam
    total_kg = Column(Float, nullable=True)

    tanggal = Column(DateTime, default=datetime.utcnow)

    isi_kolam = relationship("IsiKolam", back_populates="growth_logs")
    kolam = relationship("Kolam")


# ============ REFERENCE: JENIS KOLAM ============
class ReferenceJenisKolam(Base):
    __tablename__ = "reference_jenis_kolam"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ============ REFERENCE: UKURAN IKAN ============
class ReferenceUkuranIkan(Base):
    __tablename__ = "reference_ukuran_ikan"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)   # Lele | Nila
    ukuran = Column(String(100), nullable=True)  # <— NEW
    tipe_harga = Column(Enum('ukuran','berat', name="ukuran_ikan_pricing_type"), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ============ REFERENCE: AKTIVITAS ============
class ReferenceAktivitasKolam(Base):
    __tablename__ = "reference_aktivitas_kolam"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # contoh: "Pemberian Pakan", "Masukkan Ikan"
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ============ REFERENCE: STATUS ============
class ReferenceStatusKolamIkan(Base):
    __tablename__ = "reference_status_kolam_ikan"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)  # contoh: "Aktif", "Kosong", "Maintenance"
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ============ REFERENCE: VENDOR ============
class Vendor(Base):
    __tablename__ = "ref_vendor"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    alamat = Column(String(255), nullable=True)
    tanggal_daftar = Column(Date, nullable=True)

    # Wajib isi & unik
    bp_code = Column(String(10), unique=True, nullable=False, index=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    Nomor_HP = Column(String(32), unique=True, nullable=True, index=True)

    panen_list = relationship("Panen", back_populates="vendor")

    def __repr__(self):
        return f"<Vendor(name={self.name}, bp_code={self.bp_code})>"

# ============ REFERENCE: Aktivitas ============
try:
    from sqlalchemy.dialects.mysql import JSON as MySQLJSON
    JSONType = MySQLJSON
except Exception:
    # fallback aman untuk MariaDB; JSON hanya alias longtext
    from sqlalchemy import Text as JSONType

jakarta = pytz.timezone("Asia/Jakarta")

def now_wib():
    return datetime.now(jakarta)

class Aktivitas(Base):
    __tablename__ = "aktivitas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    waktu = Column(DateTime, default=now_wib, nullable=False)  # set dari app: get_now_wib()

    user_id = Column(Integer, nullable=True)
    username_snap = Column(String(100), nullable=True)
    role_snap = Column(String(20), nullable=True)

    kolam_id = Column(Integer, nullable=True)
    isi_kolam_id = Column(Integer, nullable=True)
    ikan_id = Column(Integer, nullable=True)
    feed_id = Column(Integer, nullable=True)
    panen_id = Column(Integer, nullable=True)
    transaksi_id = Column(Integer, nullable=True)
    vendor_id = Column(Integer, nullable=True)
    ref_ukuran_id = Column(Integer, nullable=True)
    from_kolam_id = Column(Integer, nullable=True)
    to_kolam_id = Column(Integer, nullable=True)

    jenis = Column(String(30), nullable=False)
    aksi  = Column(String(40), nullable=False)
    deskripsi = Column(Text, nullable=True)

    qty_ekor     = Column(Integer, nullable=True)
    berat_kg     = Column(Numeric(12,3), nullable=True)
    amount_kg    = Column(Numeric(12,3), nullable=True)
    harga_per_kg = Column(Numeric(12,2), nullable=True)
    biaya        = Column(Numeric(14,2), nullable=True)
    pendapatan   = Column(Numeric(14,2), nullable=True)
    saldo_delta  = Column(Numeric(14,2), nullable=True)

    meta = Column(JSONType, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_ak_kolam_waktu", "kolam_id", "waktu"),
        Index("idx_ak_user_waktu", "user_id", "waktu"),
        Index("idx_ak_aksi", "aksi"),
        Index("idx_ak_panen", "panen_id"),
        Index("idx_ak_isi", "isi_kolam_id"),
    )