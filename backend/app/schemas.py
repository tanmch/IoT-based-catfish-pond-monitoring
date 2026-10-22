from pydantic import BaseModel, EmailStr, Field, constr, ConfigDict
from typing import Optional, List
from datetime import datetime, date, time
from typing import Optional, Annotated
from decimal import Decimal

VendorName = Annotated[str, constr(strip_whitespace=True, min_length=1)]

class VendorBase(BaseModel):
    name: VendorName
    Nomor_HP: Optional[str] = None
    alamat: Optional[str] = None
    tanggal_daftar: Optional[date] = None
    bp_code: Optional[str] = Field(None, max_length=10)

class VendorCreate(VendorBase):
    pass

class VendorUpdate(BaseModel):
    name: Optional[VendorName] = None
    Nomor_HP: Optional[str] = None
    alamat: Optional[str] = None
    tanggal_daftar: Optional[date] = None
    bp_code: Optional[str] = Field(None, max_length=10)

class VendorResponse(BaseModel):
    id: int
    name: str
    Nomor_HP: Optional[str] = None
    alamat: Optional[str] = None
    tanggal_daftar: Optional[date] = None
    bp_code: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================
# AUTH SCHEMAS
# ==========================
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    created_at: datetime
    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenWithRole(Token):
    role: str  # tambahan role

class TokenData(BaseModel):
    username: Optional[str] = None

# ==========================
# KOLAM SCHEMAS
# ==========================
class KolamCreate(BaseModel):
    name: str
    size: float = 0
    location: str | None = None
    depth: float = 0
    description: str | None = None
    status: str = "Kosong"

    jenis_kolam: str | None = None
    panjang: float | None = None
    lebar: float | None = None
    tinggi: float | None = None
    diameter: float | None = None

    # === BARU: biaya pembuatan kolam
    biaya_pembuatan: float = 0


class KolamUpdate(BaseModel):
    name: str | None = None
    size: float | None = None
    location: str | None = None
    depth: float | None = None
    description: str | None = None
    status: Optional[str] = None

    jenis_kolam: str | None = None
    panjang: float | None = None
    lebar: float | None = None
    tinggi: float | None = None
    diameter: float | None = None

    # === BARU
    biaya_pembuatan: float | None = None


class KolamResponse(BaseModel):
    id: int
    name: str
    size: float
    location: str | None
    depth: float
    description: str | None
    owner_id: int
    status: str
    petani_ids: List[int] = []

    jenis_kolam: str | None = None
    panjang: float | None = None
    lebar: float | None = None
    tinggi: float | None = None
    diameter: float | None = None

    biaya_pembuatan: float | None = 0

    class Config:
        orm_mode = True


class KolamLogResponse(BaseModel):
    id: int
    kolam_id: int
    action: str
    detail: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True
        

# ==========================
# FISH STOCK SCHEMAS
# ==========================
class FishStockBase(BaseModel):
    species: str
    size: Optional[str] = None
    total_kg: Optional[float] = Field(None, gt=0)
    quantity: int = 0
    price_per_kg: Optional[float] = None
    price_per_unit: Optional[float] = None
    vendor_id: Optional[int] = None  # ✅ NEW

class FishStockCreate(FishStockBase):
    tanggal: Optional[date] = None
    kolam_id: Optional[int] = None

class FishStockUpdate(BaseModel):
    species: Optional[str] = None
    size: Optional[str] = None
    total_kg: Optional[float] = None
    quantity: Optional[int] = None
    price_per_kg: Optional[float] = None
    price_per_unit: Optional[float] = None
    tanggal: Optional[date] = None
    vendor_id: Optional[int] = None  # ✅ NEW

class FishStockResponse(BaseModel):
    id: int
    species: str
    size: Optional[str] = None
    total_kg: Optional[float] = None
    avg_weight: Optional[float] = None
    quantity: int
    price_per_kg: Optional[float] = None
    price_per_unit: Optional[float] = None
    tanggal: Optional[date] = None
    vendor: Optional[VendorResponse] = None 
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================
# SENSOR DATA SCHEMAS
# ==========================
class SensorDataBase(BaseModel):
    temperature: Optional[float] = None
    ph: Optional[float] = None
    dissolved_oxygen: Optional[float] = None

class SensorDataCreate(SensorDataBase):
    kolam_id: int

class SensorDataResponse(SensorDataBase):
    id: int
    kolam_id: int
    created_at: datetime
    class Config:
        from_attributes = True

# ==========================
# KONTROL AKTUATOR MONITORING
# ==========================
class DeviceControlBase(BaseModel):
    pompa: int
    valve: int

class DeviceControlCreate(DeviceControlBase):
    pompa: int
    valve: int

class DeviceControlResponse(DeviceControlBase):
    id: int
    kolam_id: int

    class Config:
        from_attributes = True

# ==========================
# FEED STOCK SCHEMAS
# ==========================
class FeedBase(BaseModel):
    name: str
    type: str
    quantity_kg: float
    price_per_kg: float
    vendor_id: Optional[int] = None  # ✅ Tambahkan

# User boleh kirim tanggal backdated (DATE saja)
class FeedCreate(FeedBase):
    created_at: Optional[datetime] = None   # ⬅️ baru

class FeedUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    quantity_kg: Optional[float] = None
    price_per_kg: Optional[float] = None
    vendor_id: Optional[int] = None  # ✅ Bisa diubah
    created_at: Optional[datetime] = None   # ⬅️ baru

class FeedOut(FeedBase):
    id: int
    owner_id: int
    created_at: datetime
    vendor: Optional["VendorResponse"] = None  # ✅ ikut return nama vendor

    model_config = ConfigDict(from_attributes=True)

# ==========================
# SENSOR CALIBRATION
# ==========================
class SensorDataCalibrationCreate(BaseModel):
    kolam_id: int
    temperature: float
    ph: float
    dissolved_oxygen: float
    voltage: float   # 🔥 TAMBAH
# ==========================
# FEED LOG SCHEMAS
# ==========================
class FeedLogBase(BaseModel):
    amount_kg: float

class FeedLogCreate(FeedLogBase):
    kolam_id: int
    feed_id: int
    # NEW (opsional): input tanggal & waktu dari FE
    tanggal: Optional[date] = None
    waktu: Optional[time] = None
    # NEW (opsional): "manual" | "auto_3" | "auto_4"
    feeding_mode: Optional[str] = "manual"

class FeedLogResponse(BaseModel):
    id: int
    kolam_id: Optional[int]  # bisa None
    feed_id: int
    amount_kg: float

    # NEW: ikut di-return agar FE bisa render filter/riwayat
    tanggal: Optional[date] = None
    waktu: Optional[time] = None
    feeding_mode: str

    # tetap jaga alias lama (kompatibel FE sekarang)
    date_given: datetime = Field(..., alias="created_at")

    class Config:
        orm_mode = True
        allow_population_by_field_name = True

# ==========================
# FINANCE SCHEMAS
# ==========================
class TransaksiBase(BaseModel):
    kategori: str        # "pemasukan" atau "pengeluaran"
    deskripsi: Optional[str] = None
    jumlah: float
    tanggal: Optional[date] = None

class TransaksiCreate(TransaksiBase):
    pass

class TransaksiResponse(TransaksiBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ==========================
# User Management
# ==========================

class AssignPetaniBase(BaseModel):
    petani_id: int
    kolam_id: int

class AssignPetaniCreate(AssignPetaniBase):
    pass

class AssignPetaniResponse(AssignPetaniBase):
    id: int
    pemilik_id: int
    created_at: datetime

    class Config:
        orm_mode = True

class UserUpdate(BaseModel):
    username: Optional[str]
    email: Optional[str]
    password: Optional[str]

    class Config:
        from_attributes = True


class IsiKolamBase(BaseModel):
    kolam_id: int
    ikan_id: int
    tanggal_masuk: date
    jumlah_ekor: int
    total_kg: float | None = None
    feed_kg_accum: float = 0          # ✅ default 0
    vitamin_kg_accum: float = 0       # ✅ default 0


class IsiKolamCreate(IsiKolamBase):
    pass

# class IsiKolamResponse(IsiKolamBase):
#     id: int
#     created_at: datetime
#     ikan: FishStockResponse

#     class Config:
#         orm_mode = True


class IsiKolamResponse(IsiKolamBase):
    id: int
    created_at: datetime
    harga_per_kg_snapshot: float | None = None
    harga_per_unit_snapshot: float | None = None
    ukuran_ikan_snapshot: str | None = None
    vendor_name_snapshot: str | None = None

    # ✅ NEW: akumulasi biaya yang melekat pada batch
    feed_cost_accum: float = 0
    vitamin_cost_accum: float = 0

    # ✅ NEW: akumulasi fisik (kg)
    feed_kg_accum: float = 0
    vitamin_kg_accum: float = 0

    ikan: FishStockResponse

    class Config:
        orm_mode = True

class SortirMovement(BaseModel):
    to_kolam_id: int
    jumlah_ekor: int
    berat_kg: float
    # opsional, kalau kamu mau tandai ukuran tujuan
    ref_ukuran_id: Optional[int] = None

class SortirPayload(BaseModel):
    movements: List[SortirMovement]
    tanggal: Optional[str] = None
    keterangan: Optional[str] = None


class PemberianPakanCreate(BaseModel):
    kolam_id: int
    stok_pakan_id: int
    jumlah_kg: float
    tanggal: Optional[date] = None
    waktu: Optional[time] = None          # ⬅️ tambahkan
    isi_kolam_id: Optional[int] = None

class PemberianPakanUpdate(BaseModel):
    stok_pakan_id: Optional[int] = None
    jumlah_kg: Optional[float] = None
    tanggal: Optional[date] = None
    waktu: Optional[time] = None          # ⬅️ tambahkan
    isi_kolam_id: Optional[int] = None

class PemberianPakanResponse(PemberianPakanCreate):
    id: int
    created_at: datetime
    class Config:
        orm_mode = True


class StokPakanResponse(BaseModel):
    id: int
    nama_pakan: str = Field(..., alias="name")
    jenis: str | None = Field(None, alias="type")
    jumlah_kg: float = Field(..., alias="quantity_kg")
    harga_per_kg: float = Field(..., alias="price_per_kg")

    class Config:
        orm_mode = True
        allow_population_by_field_name = True

# sertakan 'waktu' di response detail
class PemberianPakanDetailResponse(PemberianPakanResponse):
    stok_pakan: StokPakanResponse | None = None
    isi_kolam: IsiKolamResponse | None = None


class UpdateBeratRequest(BaseModel):
    kolam_id: int
    beratRata: float

class UpdateBeratRequest(BaseModel):
    kolam_id: int
    beratRata: float  # gram

# app/schemas.py
class GrowthLogBase(BaseModel):
    isi_kolam_id: int
    kolam_id: int
    berat_rata_ekor: float | None = None
    total_kg: float | None = None    # ✅ tambahkan

class GrowthLogCreate(GrowthLogBase):
    pass

class GrowthLog(GrowthLogBase):
    id: int
    tanggal: datetime
    class Config:
        orm_mode = True

class MortalityCreate(BaseModel):
    kolam_id: int
    isi_kolam_id: Optional[int] = None
    tanggal: date
    waktu: Optional[time] = None
    jumlah_mati: int
    keterangan: Optional[str] = None   # ✅ tambahkan

class MortalityUpdate(BaseModel):
    jumlah_mati: Optional[int] = None
    tanggal: Optional[date] = None
    waktu: Optional[time] = None
    isi_kolam_id: Optional[int] = None
    keterangan: Optional[str] = None   # ✅ tambahkan

class MortalityResponse(BaseModel):
    id: int
    kolam_id: int
    isi_kolam_id: Optional[int] = None
    tanggal: date
    waktu: Optional[time] = None
    jumlah_mati: int
    keterangan: Optional[str] = None   # ✅ tambahkan
    created_at: datetime

    class Config:
        orm_mode = True


# ========================== #
#           PANEN            #
# ========================== #

from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel

class PanenRequest(BaseModel):
    kolam_id: int
    isi_kolam_id: Optional[int] = None
    tipe_panen: str = "penuh"  # penuh | parsial
    tanggal: str
    total_berat_kg: float
    jumlah_ekor: Optional[int] = None
    harga_jual: float
    expected_kg: Optional[float] = None
    susut_kg: Optional[float] = None
    susut_percent: Optional[float] = None
    keterangan: Optional[str] = None
    # ✅ NEW: vendor pembeli panen (ambil dari reference ref_vendor)
    vendor_id: Optional[int] = None

class PanenResponse(BaseModel):
    id: int
    kolam_id: int
    total_berat_kg: float
    harga_jual: float
    laba_rugi: Optional[float]
    fcr: Optional[float]
    # ✅ NEW: kembalikan info vendor
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None

    class Config:
        orm_mode = True

class PanenListItem(BaseModel):
    id: int
    kolam_id: int
    kolam_name: Optional[str] = None
    isi_kolam_id: Optional[int] = None

    tanggal: date
    tipe_panen: str  # "penuh" | "parsial"

    total_berat_kg: float
    jumlah_ekor: Optional[int] = None
    berat_rata_ekor: Optional[float] = None

    harga_jual: float
    expected_kg: Optional[float] = None
    susut_kg: Optional[float] = None
    susut_percent: Optional[float] = None

    hpp_total: Optional[float] = None
    laba_rugi: Optional[float] = None
    total_pakan_kg: Optional[float] = None
    fcr: Optional[float] = None

    created_at: datetime

    # computed (buat tampilan)
    total_penjualan: Optional[float] = None
    margin_percent: Optional[float] = None

    # ✅ NEW: info vendor
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None

    class Config:
        orm_mode = True

class PanenListResponse(BaseModel):
    items: List[PanenListItem]
    total: int
    page: int
    per_page: int

class PanenDetail(PanenListItem):
    nilai_aset_diambil: Optional[float] = None
    biaya_pakan_ambil: Optional[float] = None
    biaya_vitamin_ambil: Optional[float] = None
    transaksi_id: Optional[int] = None


# ==================== SCHEMAS ====================
# ================== JENIS KOLAM ==================
class JenisKolamBase(BaseModel):
    name: str
    description: Optional[str] = None

class JenisKolamCreate(JenisKolamBase):
    pass

class JenisKolamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class JenisKolamResponse(JenisKolamBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

# ================== UKURAN IKAN ==================
class UkuranIkanBase(BaseModel):
    name: str                          # "Lele" | "Nila"
    ukuran: Optional[str] = None       # <— NEW
    tipe_harga: str                    # "ekor" | "kg" (atau "ukuran"/"berat" utk kompatibel)
    description: Optional[str] = None

class UkuranIkanResponse(UkuranIkanBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class UkuranIkanCreate(UkuranIkanBase):
    pass

class UkuranIkanUpdate(BaseModel):
    name: Optional[str] = None
    ukuran: Optional[str] = None       # <— NEW
    tipe_harga: Optional[str] = None
    description: Optional[str] = None

# ================== AKTIVITAS KOLAM ==================
from typing import Optional, Any, Dict, List

class AktivitasKolamBase(BaseModel):
    name: str
    description: Optional[str] = None

class AktivitasKolamCreate(AktivitasKolamBase):
    pass

class AktivitasKolamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class AktivitasKolamResponse(AktivitasKolamBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

# ================== STATUS KOLAM / IKAN ==================
class StatusKolamIkanBase(BaseModel):
    name: str
    description: Optional[str] = None

class StatusKolamIkanCreate(StatusKolamIkanBase):
    pass

class StatusKolamIkanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class StatusKolamIkanResponse(StatusKolamIkanBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


class AktivitasBase(BaseModel):
    waktu: datetime
    jenis: str
    aksi: str
    deskripsi: Optional[str] = None

    kolam_id: Optional[int] = None
    isi_kolam_id: Optional[int] = None
    ikan_id: Optional[int] = None
    feed_id: Optional[int] = None
    panen_id: Optional[int] = None
    transaksi_id: Optional[int] = None
    vendor_id: Optional[int] = None
    ref_ukuran_id: Optional[int] = None
    from_kolam_id: Optional[int] = None
    to_kolam_id: Optional[int] = None

    qty_ekor: Optional[int] = None
    berat_kg: Optional[float] = None
    amount_kg: Optional[float] = None
    harga_per_kg: Optional[float] = None
    biaya: Optional[float] = None
    pendapatan: Optional[float] = None
    saldo_delta: Optional[float] = None

    user_id: Optional[int] = None
    username_snap: Optional[str] = None
    role_snap: Optional[str] = None

    meta: Optional[dict] = None

class AktivitasResponse(AktivitasBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True  # Pydantic v2
        orm_mode = True         # Jika masih pakai v1

class AktivitasListResponse(BaseModel):
    items: List[AktivitasResponse]
    total: int
    page: int
    per_page: int