# app/main.py
from fastapi import FastAPI, Depends, HTTPException, status, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from fastapi.security import OAuth2PasswordBearer
from app.models import User, Kolam, FishStock, KolamLog, FeedStock, FeedLog, PemilikPetaniKolam
import logging
from fastapi import Path
from decimal import Decimal
from datetime import date, datetime
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

from app.database import Base, engine, get_db
from app import models, schemas
from app.schemas import UpdateBeratRequest
from app.models import IsiKolam, GrowthLog, FishMortality
from sqlalchemy import func
from datetime import datetime
from zoneinfo import ZoneInfo
from app.models import DeviceControl

Base.metadata.create_all(bind=engine)

def get_now_wib():
    return datetime.now(ZoneInfo("Asia/Jakarta"))

class AssignPetaniMultiCreate(BaseModel):
    petani_id: int
    kolam_ids: List[int]

class CalibrationRequest(BaseModel):
    ph: int
    voltage: float

def capture_activity(
    db: Session,
    current_user: models.User | None,
    *,
    jenis: str,
    aksi: str,
    deskripsi: str | None = None,
    kolam_id: int | None = None,
    isi_kolam_id: int | None = None,
    ikan_id: int | None = None,
    feed_id: int | None = None,
    panen_id: int | None = None,
    transaksi_id: int | None = None,
    vendor_id: int | None = None,
    ref_ukuran_id: int | None = None,
    from_kolam_id: int | None = None,
    to_kolam_id: int | None = None,
    qty_ekor: int | None = None,
    berat_kg: float | None = None,
    amount_kg: float | None = None,
    harga_per_kg: float | None = None,
    biaya: float | None = None,
    pendapatan: float | None = None,
    saldo_delta: float | None = None,
    meta: dict | None = None,
    waktu: datetime | None = None,
):
    act = models.Aktivitas(
        waktu=waktu or get_now_wib(),
        user_id=(current_user.id if current_user else None),
        username_snap=(current_user.username if current_user else None),
        role_snap=(current_user.role if current_user else None),
        jenis=jenis,
        aksi=aksi,
        deskripsi=deskripsi,
        kolam_id=kolam_id,
        isi_kolam_id=isi_kolam_id,
        ikan_id=ikan_id,
        feed_id=feed_id,
        panen_id=panen_id,
        transaksi_id=transaksi_id,
        vendor_id=vendor_id,
        ref_ukuran_id=ref_ukuran_id,
        from_kolam_id=from_kolam_id,
        to_kolam_id=to_kolam_id,
        qty_ekor=qty_ekor,
        berat_kg=berat_kg,
        amount_kg=amount_kg,
        harga_per_kg=harga_per_kg,
        biaya=biaya,
        pendapatan=pendapatan,
        saldo_delta=saldo_delta,
        meta=meta,
    )
    db.add(act)
    # TIDAK db.commit() di sini → biar ikut transaksi endpoint
    return act

# ==========================
# INIT & DB
# ==========================
Base.metadata.create_all(bind=engine)

router = APIRouter()

app = FastAPI(title="Budidaya Lele API (All-in-One)")

# Konfigurasi logging sederhana
logging.basicConfig(
    filename="activity.log",       # log disimpan di file activity.log
    level=logging.INFO,
    format="%(asctime)s | user: %(user)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M"
)

class FishQuantityUpdate(BaseModel):
    quantity_change: int  # bisa positif atau negatif

# Custom logging dengan user context
def log_action(user: str, action: str, detail: str):
    logging.info(f"{action} | {detail}", extra={"user": user})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================
# AUTH UTILS (hash & JWT)
# ==========================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "supersecretkey"  # ganti di env prod!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token tidak valid",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# ==========================
# AUTH ENDPOINTS
# ==========================
@app.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email sudah digunakan")
    new_user = models.User(
        username=user.username,
        email=user.email,
        password=hash_password(user.password),
        role="petani",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login", response_model=schemas.TokenWithRole)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    
    token = create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,         # <-- tambahkan koma
        "username": user.username
    }

# ==========================
# KOLAM ENDPOINTS
# ==========================

def _apply_dimension_rules(payload_dict: dict) -> dict:
    """
    Terapkan aturan dimensi berdasar jenis_kolam:
    - mengandung "bulat"  -> wajib diameter & tinggi, kosongkan panjang/lebar
    - mengandung "kotak"  -> wajib panjang & lebar & tinggi, kosongkan diameter
    """
    jk = (payload_dict.get("jenis_kolam") or "").lower()

    # Normalisasi angka: ubah '' ke None jika ada
    for key in ("panjang", "lebar", "tinggi", "diameter"):
        if key in payload_dict and payload_dict[key] == "":
            payload_dict[key] = None

    if "bulat" in jk:
        # Validasi
        if payload_dict.get("diameter") in (None, 0) or payload_dict.get("tinggi") in (None, 0):
            raise HTTPException(
                status_code=422,
                detail="Kolam bulat wajib memiliki diameter dan tinggi ( > 0 )."
            )
        # Kosongkan yang tidak relevan
        payload_dict["panjang"] = None
        payload_dict["lebar"] = None

    elif "kotak" in jk:
        if payload_dict.get("panjang") in (None, 0) or payload_dict.get("lebar") in (None, 0) or payload_dict.get("tinggi") in (None, 0):
            raise HTTPException(
                status_code=422,
                detail="Kolam kotak wajib memiliki panjang, lebar, dan tinggi ( > 0 )."
            )
        payload_dict["diameter"] = None

    # Jika tidak mengandung bulat/kotak → tidak ada kewajiban khusus
    return payload_dict


@app.post("/kolam", response_model=schemas.KolamResponse)
def create_kolam(payload: schemas.KolamCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa membuat kolam")
    
    data = payload.dict()
    data = _apply_dimension_rules(data)

    new_kolam = models.Kolam(
        name=data["name"],
        size=data["size"],
        location=data.get("location"),
        depth=data["depth"],
        description=data.get("description"),
        status=data["status"],
        owner_id=current_user.id,
        jenis_kolam=data.get("jenis_kolam"),
        panjang=data.get("panjang"),
        lebar=data.get("lebar"),
        tinggi=data.get("tinggi"),
        diameter=data.get("diameter"),
        biaya_pembuatan=data.get("biaya_pembuatan", 0),
    )

    db.add(new_kolam)
    db.commit()
    db.refresh(new_kolam)

    # === CATAT sebagai pengeluaran (BARU)
    if new_kolam.biaya_pembuatan > 0:
        transaksi = models.TransaksiKeuangan(
            user_id=current_user.id,
            kategori="pengeluaran",
            deskripsi=f"Pembuatan kolam: {new_kolam.name}",
            jumlah=new_kolam.biaya_pembuatan,
            tanggal=datetime.utcnow().date()
        )
        db.add(transaksi)
        db.commit()

    log_action(current_user.username, "create kolam", f"{new_kolam.name}")
    return new_kolam


@app.put("/kolam/{kolam_id}", response_model=schemas.KolamResponse)
def update_kolam(
    kolam_id: int,
    payload: schemas.KolamUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    kolam = db.query(models.Kolam).filter(
        models.Kolam.id == kolam_id,
        models.Kolam.owner_id == current_user.id
    ).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # Ambil payload (hanya yang dikirim)
    data = payload.dict(exclude_unset=True)

    # SIMPAN BIAYA LAMA (dipakai untuk hitung selisih)
    old_cost = kolam.biaya_pembuatan or 0
    new_cost = data.get("biaya_pembuatan", old_cost)

    # Merge field kolam ke temp buat validasi _apply_dimension_rules
    temp = {
        "name": kolam.name,
        "size": kolam.size,
        "location": kolam.location,
        "depth": kolam.depth,
        "description": kolam.description,
        "status": kolam.status,
        "jenis_kolam": kolam.jenis_kolam,
        "panjang": kolam.panjang,
        "lebar": kolam.lebar,
        "tinggi": kolam.tinggi,
        "diameter": kolam.diameter,
        "biaya_pembuatan": new_cost,
    }
    temp.update(data)

    # Validasi dimensi (aturan lo sebelumnya)
    temp = _apply_dimension_rules(temp)

    # APPLY KE OBJEK
    for field, value in temp.items():
        if hasattr(kolam, field):
            setattr(kolam, field, value)

    db.commit()
    db.refresh(kolam)

# ============================
#  🔥 Kalibrasi Sensor
# ============================
@app.get("/calibration/ph/esp")
def get_calibration_for_esp(db: Session = Depends(get_db)):
    calibration = db.query(models.CalibrationPH).first()

    if not calibration:
        return {
            "m1": None,
            "b1": None,
            "m2": None,
            "b2": None
        }

    return {
        "m1": calibration.m1,
        "b1": calibration.b1,
        "m2": calibration.m2,
        "b2": calibration.b2
    }
@app.get("/sensor-calibration-ESP/latest")
def get_sensor_calibration_latest(db: Session = Depends(get_db)):
    data = db.query(models.SensorCalibrationData)\
        .order_by(models.SensorCalibrationData.waktu.desc())\
        .first()

    if not data:
        return {
            "ph": None,
            "suhu": None,
            "voltage": None,
            "created_at": None
        }

    return {
        "ph": data.ph,
        "suhu": data.suhu,
        "voltage": data.voltage,
        "created_at": data.waktu
    }

@app.post("/sensor-calibration-ESP")
def insert_sensor_calibration(data: dict, db: Session = Depends(get_db)):
    new_data = models.SensorCalibrationData(
        ph=data.get("ph"),
        suhu=data.get("suhu"),
        oksigen=data.get("oksigen"),
        voltage=data.get("voltage")
    )

    db.add(new_data)
    db.commit()
    db.refresh(new_data)

    return new_data


@app.post("/calibration/ph")
def calibrate_ph(payload: CalibrationRequest, db: Session = Depends(get_db)):
    ph = payload.ph
    voltage = payload.voltage

    # ✅ validasi input
    if voltage is None:
        raise HTTPException(status_code=400, detail="Voltage wajib diisi")

    if ph not in [4, 7, 9]:
        raise HTTPException(status_code=400, detail="pH harus 4, 7, atau 9")

    # ambil / buat data calibration global
    calibration = db.query(models.CalibrationPH).first()

    if not calibration:
        calibration = models.CalibrationPH()
        db.add(calibration)
        db.commit()
        db.refresh(calibration)

    # ✅ simpan titik kalibrasi
    if ph == 4:
        calibration.ph4 = voltage
    elif ph == 7:
        calibration.ph7 = voltage
    elif ph == 9:
        calibration.ph9 = voltage

    # ✅ kalau sudah lengkap → hitung
    if (
        calibration.ph4 is not None and
        calibration.ph7 is not None and
        calibration.ph9 is not None
    ):
        v4 = calibration.ph4
        v7 = calibration.ph7
        v9 = calibration.ph9

        # 🔥 ANTI ERROR WAJIB
        if v7 == v4 or v9 == v7:
            raise HTTPException(
                status_code=400,
                detail="Voltage tidak valid (tidak boleh sama)"
            )

        # ✅ hitung kalibrasi
        m1 = (7 - 4) / (v7 - v4)
        b1 = 7 - (m1 * v7)

        m2 = (9 - 7) / (v9 - v7)
        b2 = 7 - (m2 * v7)

        # simpan
        calibration.m1 = m1
        calibration.b1 = b1
        calibration.m2 = m2
        calibration.b2 = b2
        calibration.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(calibration)

    # ✅ response lebih clean & informatif
    return {
        "ph4": calibration.ph4,
        "ph7": calibration.ph7,
        "ph9": calibration.ph9,
        "m1": calibration.m1,
        "b1": calibration.b1,
        "m2": calibration.m2,
        "b2": calibration.b2,
        "is_calibrated": all([
            calibration.ph4 is not None,
            calibration.ph7 is not None,
            calibration.ph9 is not None
        ]),
        "updated_at": calibration.updated_at
    }

@app.get("/calibration/ph")
def get_calibration(db: Session = Depends(get_db)):
    calibration = db.query(models.CalibrationPH).first()

    if not calibration:
        return {
            "ph4": None,
            "ph7": None,
            "ph9": None,
            "m1": None,
            "b1": None,
            "m2": None,
            "b2": None
        }

    return {
        "ph4": calibration.ph4,
        "ph7": calibration.ph7,
        "ph9": calibration.ph9,
        "m1": calibration.m1,
        "b1": calibration.b1,
        "m2": calibration.m2,
        "b2": calibration.b2,
        "updated_at": calibration.updated_at
    }


    # ============================
    #  🔥 KOREKSI FINANCIAL LOGIC
    # ============================

    selisih = new_cost - old_cost

    if selisih != 0:
        # Keterangan transaksi
        if selisih > 0:
            kategori = "pengeluaran"
            deskripsi = f"Koreksi biaya pembuatan kolam (tambah): {kolam.name}"
        else:
            kategori = "pemasukan"
            deskripsi = f"Koreksi biaya pembuatan kolam (refund): {kolam.name}"

        transaksi = models.TransaksiKeuangan(
            user_id=current_user.id,
            kategori=kategori,
            deskripsi=deskripsi,
            jumlah=abs(selisih),
            tanggal=datetime.utcnow().date()
        )
        db.add(transaksi)
        db.commit()

    log_action(current_user.username, "update kolam", f"{kolam.name}")
    return kolam

@app.get("/kolam", response_model=List[schemas.KolamResponse])
def get_kolam(current_user: models.User = Depends(get_current_user),
              db: Session = Depends(get_db)):

    if current_user.role == "pemilik":
        kolams = (
            db.query(models.Kolam)
            .filter(models.Kolam.owner_id == current_user.id)
            .all()
        )

    elif current_user.role == "petani":
        kolams = (
            db.query(models.Kolam)
            .join(models.PemilikPetaniKolam)
            .filter(models.PemilikPetaniKolam.petani_id == current_user.id)
            .all()
        )

    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    for k in kolams:
        k.petani_ids = [ppk.petani_id for ppk in k.petani_assignments]

    return kolams


@app.delete("/kolam/{kolam_id}")
def delete_kolam(kolam_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    kolam = db.query(models.Kolam).filter(
        models.Kolam.id == kolam_id,
        models.Kolam.owner_id == current_user.id
    ).first()

    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # === buat refund pemasukan (BARU)
    if kolam.biaya_pembuatan and kolam.biaya_pembuatan > 0:
        refund = models.TransaksiKeuangan(
            user_id=current_user.id,
            kategori="pemasukan",
            deskripsi=f"Refund pembatalan kolam: {kolam.name}",
            jumlah=kolam.biaya_pembuatan,
            tanggal=datetime.utcnow().date()
        )
        db.add(refund)

    db.add(models.KolamLog(kolam_id=kolam.id, action=f"Kolam dihapus: {kolam.name}"))
    db.delete(kolam)
    db.commit()
    
    return {"message": f"Kolam {kolam.name} berhasil dihapus dan biaya dikembalikan"}


@app.get("/kolam-log/{kolam_id}", response_model=List[schemas.KolamLogResponse])
def get_kolam_logs(kolam_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    print(f"[LOG] Request log kolam {kolam_id} oleh user {current_user.username}")
    kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id, models.Kolam.owner_id == current_user.id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")
    logs = db.query(models.KolamLog).filter(models.KolamLog.kolam_id == kolam_id).order_by(models.KolamLog.created_at.desc()).all()
    print(f"[LOG] Ditemukan {len(logs)} log")
    return logs


@app.get("/kolam/{kolam_id}", response_model=schemas.KolamResponse)
def get_kolam_detail(kolam_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # Optional: check role
    if current_user.role == "petani":
        assigned = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.kolam_id == kolam_id,
            models.PemilikPetaniKolam.petani_id == current_user.id
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Forbidden")

    kolam.petani_ids = [ppk.petani_id for ppk in kolam.petani_assignments]  # jika relation ada
    return kolam

# ==========================
# FISH STOCK ENDPOINTS
# ==========================
def calculate_fish_value(isi_kolam, fish: models.FishStock):
    """
    isi_kolam expected to have:
      - jumlah_ekor (int)
      - total_kg (float)  <-- prefer this
    fish has price_per_unit or price_per_kg
    """
    if fish is None:
        return 0
    tipe = None
    # assume fish.price_per_unit => ukuran, fish.price_per_kg => berat
    if fish.price_per_unit is not None:
        tipe = "ukuran"
    elif fish.price_per_kg is not None:
        tipe = "berat"

    if tipe == "ukuran":
        return (isi_kolam.jumlah_ekor or 0) * (fish.price_per_unit or 0)
    elif tipe == "berat":
        # prefer isi_kolam.total_kg if provided; fallback to proportion using fish.total_kg or fish.avg_weight (legacy)
        total_kg = getattr(isi_kolam, "total_kg", None)
        if total_kg is None:
            # try best-effort: if isi_kolam.jumlah_ekor and fish.total_kg exist, derive proportion
            if fish.total_kg:
                # proportionate: (jumlah_ekor moved / fish.quantity) * fish.total_kg
                if isi_kolam.jumlah_ekor and fish.quantity:
                    ratio = (isi_kolam.jumlah_ekor / fish.quantity)
                    total_kg = ratio * (fish.total_kg or 0)
                else:
                    total_kg = 0
            else:
                # legacy fallback: if fish.avg_weight was previously used as per-row total_kg alias, use it
                total_kg = fish.avg_weight or 0
        return (total_kg or 0) * (fish.price_per_kg or 0)
    else:
        return 0

# CREATE fish
@app.post("/ikan", response_model=schemas.FishStockResponse)
def create_fish_endpoint(payload: schemas.FishStockCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    if payload.price_per_kg is None and payload.price_per_unit is None:
        raise HTTPException(status_code=400, detail="Harga harus diisi, per kg atau per unit.")
    new_fish = models.FishStock(
        species=payload.species,
        size=payload.size,
        total_kg=payload.total_kg,
        avg_weight=None,
        quantity=payload.quantity,
        price_per_kg=payload.price_per_kg,
        price_per_unit=payload.price_per_unit,
        tanggal=payload.tanggal,
        vendor_id=payload.vendor_id,  # ✅ simpan vendor
        created_at=get_now_wib()
    )
    db.add(new_fish)
    db.commit()
    db.refresh(new_fish)
    return new_fish

@app.put("/ikan/{fish_id}", response_model=schemas.FishStockResponse)
def update_fish_endpoint(fish_id: int, payload: schemas.FishStockUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    fish = db.query(models.FishStock).filter(models.FishStock.id == fish_id).first()
    if not fish:
        raise HTTPException(status_code=404, detail="Ikan tidak ditemukan")
    data = payload.dict(exclude_unset=True)
    if "total_kg" in data:
        fish.total_kg = data.pop("total_kg")
        fish.avg_weight = None
    for field, value in data.items():
        setattr(fish, field, value)
    db.commit()
    db.refresh(fish)
    return fish

# GET all
@app.get("/ikan", response_model=List[schemas.FishStockResponse])
def get_all_ikan(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    fishes = db.query(models.FishStock).all()
    return fishes

# QUANTITY update (stock +/-)
from pydantic import BaseModel
class FishQuantityUpdate(BaseModel):
    quantity_change: int

@app.put("/ikan/{fish_id}/quantity", response_model=schemas.FishStockResponse)
def update_fish_quantity(fish_id: int, payload: FishQuantityUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    fish = db.query(models.FishStock).filter(models.FishStock.id == fish_id).first()
    if not fish:
        raise HTTPException(status_code=404, detail="Ikan tidak ditemukan")

    new_quantity = (fish.quantity or 0) + payload.quantity_change
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity tidak boleh negatif")

    # Optionally: update total_kg proportionally if fish.total_kg present and payload is reduction/addition with known kg
    # Here we do NOT change total_kg automatically; transfer ops should provide explicit total_kg if needed
    fish.quantity = new_quantity

    db.commit()
    db.refresh(fish)
    log_action(current_user.username, "update quantity ikan", f"{fish.species} baru qty: {fish.quantity}")
    return fish

# @app.get("/fish/{kolam_id}", response_model=List[schemas.IsiKolamResponse])
# def get_fish_in_kolam(kolam_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
#     kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id, models.Kolam.owner_id == current_user.id).first()
#     if not kolam:
#         raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")
#     return db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam_id).all()

# ==========================
# FEED & FEED LOG ENDPOINTS
# ==========================

from zoneinfo import ZoneInfo
WIB = ZoneInfo("Asia/Jakarta")

@app.post("/feed", response_model=schemas.FeedOut)
def add_feed(
    feed: schemas.FeedCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Normalisasi tanggal dari user (DATE) → DATETIME
    today = get_now_wib().date()
    if feed.created_at:
        ct = feed.created_at.astimezone(WIB)
        if ct.date() > get_now_wib().date():
            raise HTTPException(status_code=400, detail="created_at tidak boleh di masa depan")
        effective_created_at = ct
    else:
        effective_created_at = get_now_wib()

    new_feed = models.FeedStock(
        name=feed.name,
        type=feed.type,
        quantity_kg=feed.quantity_kg,
        price_per_kg=feed.price_per_kg,
        vendor_id=feed.vendor_id,
        owner_id=current_user.id,
        created_at=effective_created_at,
    )

    db.add(new_feed)
    db.commit()
    db.refresh(new_feed)

    # LOG: pakai waktu backdated juga
    capture_activity(
        db, current_user,
        jenis="pakan", aksi="FEED_STOCK_IN",
        deskripsi=f"Tambah stok {new_feed.name}",
        feed_id=new_feed.id,
        amount_kg=float(new_feed.quantity_kg or 0),
        harga_per_kg=float(new_feed.price_per_kg or 0),
        biaya=float((new_feed.quantity_kg or 0) * (new_feed.price_per_kg or 0)),
        saldo_delta=-float((new_feed.quantity_kg or 0) * (new_feed.price_per_kg or 0)),
        waktu=new_feed.created_at,
    )

    return new_feed


@app.get("/feed", response_model=List[schemas.FeedOut])
def get_all_feeds(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # frontend akan handle search, filter, sort
    return db.query(models.FeedStock).filter(models.FeedStock.owner_id == current_user.id).all()

@app.delete("/feed/{feed_id}")
def delete_feed(
    feed_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    feed = (
        db.query(models.FeedStock)
        .filter(
            models.FeedStock.id == feed_id,
            models.FeedStock.owner_id == current_user.id,
        )
        .first()
    )
    if not feed:
        raise HTTPException(status_code=404, detail="Stok pakan tidak ditemukan")

    used_in_pp = (
        db.query(models.PemberianPakan)
        .filter(models.PemberianPakan.stok_pakan_id == feed_id)
        .count()
    )
    used_in_log = (
        db.query(models.FeedLog)
        .filter(models.FeedLog.feed_id == feed_id)
        .count()
    )

    if used_in_pp or used_in_log:
        raise HTTPException(
            status_code=409,
            detail="Stok pakan tidak bisa dihapus karena sudah dipakai di log pemberian/riwayat.",
        )

    # hitung biaya pembelian stok ini
    biaya = float((feed.quantity_kg or 0) * (feed.price_per_kg or 0))

    # 1) ACTIVITY: batal beli → saldo_delta positif
    capture_activity(
        db,
        current_user,
        jenis="pakan",
        aksi="FEED_STOCK_DELETE",
        feed_id=feed.id,
        deskripsi=f"Hapus stok {feed.name} (batal beli)",
        biaya=-biaya,
        saldo_delta=+biaya,
        waktu=feed.created_at,
    )

    # 2) FINANCE: buat transaksi reversal supaya dashboard kas ikut kebaca
    if biaya > 0:
        reversal = models.TransaksiKeuangan(
            user_id=current_user.id,
            kategori="pemasukan",   # kebalikan dari pengeluaran
            deskripsi=f"Reversal pembelian pakan {feed.name} (batal beli)",
            jumlah=biaya,
            tanggal=feed.created_at.date() if hasattr(feed.created_at, "date") else feed.created_at,
        )
        db.add(reversal)

    db.delete(feed)
    db.commit()
    return {"message": f"Stok pakan {feed.name} berhasil dihapus"}


@app.put("/feed/{feed_id}", response_model=schemas.FeedOut)
def update_feed(
    feed_id: int,
    payload: schemas.FeedUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    feed = db.query(models.FeedStock).filter(
        models.FeedStock.id == feed_id,
        models.FeedStock.owner_id == current_user.id
    ).first()

    if not feed:
        raise HTTPException(status_code=404, detail="Stok pakan tidak ditemukan")

    data = payload.dict(exclude_unset=True)

    # --- Normalisasi created_at (datetime full) ---
    if "created_at" in data and data["created_at"]:
        dt = data["created_at"]

        # pastikan timezone
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=WIB)
        else:
            dt = dt.astimezone(WIB)

        # validasi masa depan
        if dt > get_now_wib():
            raise HTTPException(
                status_code=400,
                detail="created_at tidak boleh di masa depan"
            )

        data["created_at"] = dt

    # --- Apply update ---
    for field, value in data.items():
        setattr(feed, field, value)

    db.commit()
    db.refresh(feed)

    # --- Log update ---
    capture_activity(
        db,
        current_user,
        jenis="pakan",
        aksi="FEED_STOCK_UPDATE",
        feed_id=feed.id,
        deskripsi=f"Update stok {feed.name}",
        waktu=feed.created_at,   # ikut backdate
    )

    return feed

from sqlalchemy.orm import joinedload

@app.get("/feed-log/kolam/{kolam_id}")
def get_feed_logs_by_kolam(
    kolam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # validasi akses (pemilik/petani) mirip endpoint lain
    kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    if current_user.role == "petani":
        assigned = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.kolam_id == kolam_id,
            models.PemilikPetaniKolam.petani_id == current_user.id
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Forbidden")

    logs = (
        db.query(models.FeedLog)
        .options(joinedload(models.FeedLog.feed))   # pastikan relationship FeedLog.feed ada di model
        .filter(models.FeedLog.kolam_id == kolam_id)
        .order_by(models.FeedLog.created_at.desc())
        .all()
    )

    out = []
    for l in logs:
        # samakan dengan struktur PemberianPakan agar frontend bisa map:
        created_at = getattr(l, "created_at", None)
        if not created_at:
            # fallback dari tanggal/waktu jika ada
            try:
                if getattr(l, "tanggal", None) and getattr(l, "waktu", None):
                    created_at = datetime.combine(l.tanggal, l.waktu)
                elif getattr(l, "tanggal", None):
                    created_at = datetime.combine(l.tanggal, datetime.min.time())
            except Exception:
                created_at = None

        out.append({
            "id": l.id,
            "kolam_id": l.kolam_id,
            "jumlah_kg": float(getattr(l, "amount_kg", 0) or 0),  # biar sama nama fieldnya
            "created_at": created_at.isoformat() if created_at else None,
            "stok_pakan": {
                "id": l.feed.id if getattr(l, "feed", None) else None,
                "name": l.feed.name if getattr(l, "feed", None) else None,
                "type": l.feed.type if getattr(l, "feed", None) else None,
                "price_per_kg": float(l.feed.price_per_kg or 0) if getattr(l, "feed", None) else None,
            },
            "feeding_mode": getattr(l, "feeding_mode", None),
            "tanggal": l.tanggal.isoformat() if getattr(l, "tanggal", None) else None,
            "waktu": l.waktu.isoformat() if getattr(l, "waktu", None) else None,
        })
    return out


# ==========================
# FINANCE ENDPOINTS
# ==========================
@app.post("/transaksi", response_model=schemas.TransaksiResponse)
def add_transaksi(payload: schemas.TransaksiCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    transaksi = models.TransaksiKeuangan(
        user_id=current_user.id,
        kategori=payload.kategori,
        deskripsi=payload.deskripsi,
        jumlah=payload.jumlah,
        tanggal=payload.tanggal or datetime.utcnow().date(),
    )
    db.add(transaksi)
    db.commit()
    db.refresh(transaksi)
    return transaksi


@app.get("/transaksi", response_model=List[schemas.TransaksiResponse])
def get_transaksi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.TransaksiKeuangan).filter(models.TransaksiKeuangan.user_id == current_user.id).order_by(models.TransaksiKeuangan.tanggal.desc()).all()


@app.get("/transaksi/summary")
def get_summary(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pemasukan = db.query(func.sum(models.TransaksiKeuangan.jumlah)).filter(
        models.TransaksiKeuangan.user_id == current_user.id,
        models.TransaksiKeuangan.kategori == "pemasukan"
    ).scalar() or 0

    pengeluaran = db.query(func.sum(models.TransaksiKeuangan.jumlah)).filter(
        models.TransaksiKeuangan.user_id == current_user.id,
        models.TransaksiKeuangan.kategori == "pengeluaran"
    ).scalar() or 0

    return {
        "total_pemasukan": pemasukan,
        "total_pengeluaran": pengeluaran,
        "saldo": pemasukan - pengeluaran
    }
# ==========================
# Sensor
# ==========================
@app.get("/sensor/{kolam_id}", response_model=List[schemas.SensorDataResponse])
def get_sensor_data(
    kolam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        data = db.query(models.SensorData)\
            .filter(models.SensorData.kolam_id == kolam_id)\
            .order_by(models.SensorData.waktu.desc())\
            .limit(24)\
            .all()

        # 🔥 DEBUG DI SINI
        print("========== SENSOR DEBUG ==========")
        for d in data:
            print("OBJECT:", d)
            print("DICT:", d.__dict__)
        print("==================================")

        return [
            {
                "id": d.id,
                "kolam_id": d.kolam_id,
                "temperature": d.suhu,
                "ph": d.ph,
                "dissolved_oxygen": d.oksigen,
                "created_at": d.waktu
            }
            for d in data
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

# ==========================
# Sensor ESP
# ==========================
from app.models import MonitoringLog
@app.post("/sensor/esp")
def create_sensor_esp(data: schemas.SensorDataCreate, db: Session = Depends(get_db)):
    new_data = models.SensorData(
        kolam_id=data.kolam_id,
        suhu=data.temperature,
        ph=data.ph,
        oksigen=data.dissolved_oxygen
    )
    

    db.add(new_data)
    db.add(MonitoringLog(
        kolam_id=data.kolam_id,
        type="ph",
        value=data.ph
    ))

    db.add(MonitoringLog(
        kolam_id=data.kolam_id,
        type="suhu",
        value=data.temperature
    ))
    db.commit()
    db.refresh(new_data)

    return {"message": "Data masuk", "id": new_data.id}

@router.get("/monitoring-log/{kolam_id}")
def get_logs(kolam_id: int, db: Session = Depends(get_db)):
    logs = db.query(MonitoringLog)\
        .filter(MonitoringLog.kolam_id == kolam_id)\
        .order_by(MonitoringLog.created_at.desc())\
        .limit(50)\
        .all()

    return logs

# ==========================
# Aktuator ESP
# ==========================
from app.schemas import DeviceControlCreate

# ==========================
# POST: Update Control
# ==========================
@router.post("/kolam/control/{kolam_id}")
def update_control(kolam_id: int, data: DeviceControlCreate, db: Session = Depends(get_db)):
    control = db.query(DeviceControl).filter(DeviceControl.kolam_id == kolam_id).first()

    if not control:
        control = DeviceControl(
            kolam_id=kolam_id,
            pompa=0,
            valve=0
        )

    control.pompa = data.pompa
    control.valve = data.valve
        # 🔥 TAMBAH LOG
    log_pompa = MonitoringLog(
        kolam_id=kolam_id,
        type="pompa",
        value=control.pompa
    )

    log_valve = MonitoringLog(
        kolam_id=kolam_id,
        type="valve",
        value=control.valve
    )

    db.add(log_pompa)
    db.add(log_valve)

    db.add(control)
    db.commit()
    db.refresh(control)

    return {
        "message": "updated",
        "data": {
            "kolam_id": kolam_id,
            "pompa": control.pompa,
            "valve": control.valve
        }
    }

# ==========================
# GET: Ambil Control (buat ESP)
# ==========================
@router.get("/kolam/control/{kolam_id}")
def get_control(kolam_id: int, db: Session = Depends(get_db)):
    control = db.query(DeviceControl).filter(DeviceControl.kolam_id == kolam_id).first()

    if not control:
        return {
            "kolam_id": kolam_id,
            "pompa": 0,
            "valve": 0
        }

    return {
        "kolam_id": kolam_id,
        "pompa": control.pompa,
        "valve": control.valve
    }
# ==========================
# Petani
# ==========================
@app.post("/assign-petani", response_model=schemas.AssignPetaniResponse)
def assign_petani(payload: schemas.AssignPetaniCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # pastikan current_user adalah pemilik
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa assign petani")
    
    # cek kolam milik pemilik
    kolam = db.query(models.Kolam).filter(models.Kolam.id == payload.kolam_id, models.Kolam.owner_id == current_user.id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # cek petani exist
    petani = db.query(models.User).filter(models.User.id == payload.petani_id, models.User.role == "petani").first()
    if not petani:
        raise HTTPException(status_code=404, detail="Petani tidak ditemukan")

    # jika sudah ada, update timestamp saja
    existing = db.query(models.PemilikPetaniKolam).filter(
        models.PemilikPetaniKolam.petani_id == payload.petani_id,
        models.PemilikPetaniKolam.kolam_id == payload.kolam_id
    ).first()

    if existing:
        existing.created_at = get_now_wib()
        db.commit()
        db.refresh(existing)
        return existing

    assign = models.PemilikPetaniKolam(
        pemilik_id=current_user.id,
        petani_id=payload.petani_id,
        kolam_id=payload.kolam_id
    )
    db.add(assign)
    db.commit()
    db.refresh(assign)
    return assign

@app.get("/kolam-petani", response_model=List[schemas.KolamResponse])
def get_kolam_petani(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "petani":
        raise HTTPException(status_code=403, detail="Hanya petani yang bisa mengakses endpoint ini")
    
    # ambil kolam yang diassign ke petani
    assigned_kolams = (
        db.query(models.Kolam)
        .join(models.PemilikPetaniKolam, models.PemilikPetaniKolam.kolam_id == models.Kolam.id)
        .filter(models.PemilikPetaniKolam.petani_id == current_user.id)
        .all()
    )
    return assigned_kolams

@app.get("/petani", response_model=List[schemas.UserResponse])
def get_all_petani(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa mengakses")
    return db.query(models.User).filter(models.User.role == "petani").all()

@app.delete("/unassign-petani")
def unassign_petani(kolam_id: int, petani_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa mengakses")
    record = db.query(models.PemilikPetaniKolam).filter(
        models.PemilikPetaniKolam.kolam_id == kolam_id,
        models.PemilikPetaniKolam.petani_id == petani_id,
        models.PemilikPetaniKolam.pemilik_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Assignment tidak ditemukan")
    db.delete(record)
    db.commit()
    return {"message": "Petani berhasil di-unassign"}

@app.put("/petani/{petani_id}", response_model=schemas.UserResponse)
def update_petani(petani_id: int, payload: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa mengupdate")
    petani = db.query(models.User).filter(models.User.id == petani_id, models.User.role == "petani").first()
    if not petani:
        raise HTTPException(status_code=404, detail="Petani tidak ditemukan")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(petani, field, value)
    db.commit()
    db.refresh(petani)
    return petani

@app.post("/assign-petani-multi", response_model=List[schemas.AssignPetaniResponse])
def assign_petani_multi(payload: AssignPetaniMultiCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa assign petani")
    
    petani = db.query(models.User).filter(models.User.id == payload.petani_id, models.User.role == "petani").first()
    if not petani:
        raise HTTPException(status_code=404, detail="Petani tidak ditemukan")

    results = []
    for kolam_id in payload.kolam_ids:
        kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id, models.Kolam.owner_id == current_user.id).first()
        if not kolam:
            continue  # skip kalau kolam bukan milik current_user
        existing = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.petani_id == payload.petani_id,
            models.PemilikPetaniKolam.kolam_id == kolam_id
        ).first()
        if existing:
            existing.created_at = get_now_wib()
            db.commit()
            db.refresh(existing)
            results.append(existing)
        else:
            assign = models.PemilikPetaniKolam(
                pemilik_id=current_user.id,
                petani_id=payload.petani_id,
                kolam_id=kolam_id
            )
            db.add(assign)
            db.commit()
            db.refresh(assign)
            results.append(assign)
    return results

# ==========================
#           Panen
# ==========================
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import and_
from typing import Optional
from datetime import date
import io, csv
from fastapi import Query, Response
from pydantic import BaseModel

# ====== HELPER: hapus semua log per kolam (tanpa menyentuh data Panen/Transaksi) ======
def _clear_all_kolam_logs(db: Session, kolam_id: int) -> None:
    """
    Hapus SEMUA log yang menempel ke kolam:
    - PemberianPakan
    - GrowthLog
    - FishMortality
    - KolamLog
    - FeedLog (jika ada kolom kolam_id)
    - SensorData (opsional: kalau kamu anggap data sensor juga perlu reset per siklus)
    Tidak menghapus Panen atau TransaksiKeuangan.
    """
    # Hapus aman—abaikan jika tabelnya tidak ada/field tak cocok
    try:
        db.query(models.PemberianPakan).filter(models.PemberianPakan.kolam_id == kolam_id).delete(synchronize_session=False)
    except Exception:
        pass
    try:
        db.query(models.GrowthLog).filter(models.GrowthLog.kolam_id == kolam_id).delete(synchronize_session=False)
    except Exception:
        pass
    try:
        db.query(models.FishMortality).filter(models.FishMortality.kolam_id == kolam_id).delete(synchronize_session=False)
    except Exception:
        pass
    try:
        db.query(models.KolamLog).filter(models.KolamLog.kolam_id == kolam_id).delete(synchronize_session=False)
    except Exception:
        pass
    try:
        db.query(models.FeedLog).filter(models.FeedLog.kolam_id == kolam_id).delete(synchronize_session=False)
    except Exception:
        pass
    try:
        db.query(models.SensorData).filter(models.SensorData.kolam_id == kolam_id).delete(synchronize_session=False)
    except Exception:
        pass

def _d(x) -> Decimal:
    # helper konversi Decimal yang aman
    if x is None:
        return Decimal("0")
    return x if isinstance(x, Decimal) else Decimal(str(x))

# ✅ NEW: helper aman untuk memastikan tipe date
def _as_date(d) -> date:
    if isinstance(d, date):
        return d
    if isinstance(d, str):
        try:
            return date.fromisoformat(d)
        except Exception:
            return date.today()
    return date.today()

def _sum_pakan_kolam_non_vitamin(db: Session, kolam_id: int, sampai_tanggal: date | None) -> Decimal:
    """
    Jumlah pakan (kg) di kolam (exclude vitamin) sampai tanggal panen.
    """
    q = db.query(models.PemberianPakan).join(
        models.FeedStock, models.FeedStock.id == models.PemberianPakan.stok_pakan_id
    ).filter(
        models.PemberianPakan.kolam_id == kolam_id,
        (models.FeedStock.type.is_(None)) | (models.FeedStock.type != "vitamin")
    )
    if sampai_tanggal:
        q = q.filter(models.PemberianPakan.tanggal <= sampai_tanggal)
    total = sum(_d(p.jumlah_kg) for p in q.all())
    return total

def _sum_pakan_batch_non_vitamin(db: Session, isi_kolam_id: int, sampai_tanggal: date | None) -> Decimal:
    """
    Jika ada log per-batch (isi_kolam_id terisi), gunakan ini (exclude vitamin).
    """
    q = db.query(models.PemberianPakan).join(
        models.FeedStock, models.FeedStock.id == models.PemberianPakan.stok_pakan_id
    ).filter(
        models.PemberianPakan.isi_kolam_id == isi_kolam_id,
        (models.FeedStock.type.is_(None)) | (models.FeedStock.type != "vitamin")
    )
    if sampai_tanggal:
        q = q.filter(models.PemberianPakan.tanggal <= sampai_tanggal)
    total = sum(_d(p.jumlah_kg) for p in q.all())
    return total

def _harga_aset_snapshot(lot: models.IsiKolam, ambil_kg: Decimal, ambil_ekor: int) -> Decimal:
    """
    Nilai aset diambil mengikuti snapshot:
    - jika ada harga_per_kg_snapshot -> ambil_kg * harga_per_kg
    - jika tidak, tapi ada harga_per_unit_snapshot -> ambil_ekor * harga_per_unit
    - jika keduanya ada, prioritize per kg (umumnya grading/penjualan pakai kg)
    """
    if lot.harga_per_kg_snapshot:
        return _d(ambil_kg) * _d(lot.harga_per_kg_snapshot)
    if lot.harga_per_unit_snapshot:
        return _d(ambil_ekor) * _d(lot.harga_per_unit_snapshot)
    return Decimal("0")

@router.post("/panen", response_model=schemas.PanenResponse)
def catat_panen(
    payload: schemas.PanenRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # -------- Validasi kolam -------
    kolam = db.query(models.Kolam).filter(models.Kolam.id == payload.kolam_id).first()

    print("=== PAYLOAD PANEN ===", flush=True)
    print(payload.dict(), flush=True)
    print("=====================", flush=True)

    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # ✅ gunakan helper agar aman untuk tipe date
    tanggal_panen: date = _as_date(payload.tanggal) if payload.tanggal else date.today()
    tipe: str = (payload.tipe_panen or "penuh").lower()
    if tipe not in ("penuh", "parsial"):
        raise HTTPException(status_code=422, detail="tipe_panen hanya 'penuh' atau 'parsial'")

    # ✅ Validasi vendor (jika diisi)
    vendor_obj = None
    if payload.vendor_id is not None:
        vendor_obj = db.query(models.Vendor).filter(models.Vendor.id == payload.vendor_id).first()
        if not vendor_obj:
            raise HTTPException(status_code=404, detail="Vendor tidak ditemukan")

    # -------- Ambil lots target -------
    lots_all = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam.id).all()
    if not lots_all:
        raise HTTPException(status_code=400, detail="Kolam kosong")

    if payload.isi_kolam_id:
        lot = db.query(models.IsiKolam).filter(
            and_(models.IsiKolam.id == payload.isi_kolam_id, models.IsiKolam.kolam_id == kolam.id)
        ).first()
        if not lot:
            raise HTTPException(status_code=404, detail="Isi kolam tidak ditemukan pada kolam ini")
        target_lots = [lot]
    else:
        target_lots = list(lots_all)

    # --- total biomassa kolam (sebelum panen) untuk proporsi ---
    total_kg_kolam = sum(_d(l.total_kg) for l in lots_all)
    total_ekor_kolam = sum(int(l.jumlah_ekor or 0) for l in lots_all)
    if total_kg_kolam <= 0:
        raise HTTPException(status_code=400, detail="Data total_kg kolam tidak valid")

    # --- input berat panen (kg) ---
    berat_panen_input = _d(payload.total_berat_kg or 0)
    if tipe == "parsial" and berat_panen_input >= total_kg_kolam:
        raise HTTPException(status_code=400, detail="Gunakan panen penuh jika ingin menghabiskan semua ikan")

    # --- agregat hasil perhitungan ---
    agg_ambil_kg = Decimal("0")
    agg_ambil_ekor = 0
    agg_nilai_aset = Decimal("0")
    agg_biaya_pakan = Decimal("0")
    agg_biaya_vit = Decimal("0")

    # --- Tentukan proporsi pakan (kg) dari log ---
    total_pakan_kg_kolam = _sum_pakan_kolam_non_vitamin(db, kolam.id, tanggal_panen)

    # ------------- MODE 1: PENUH -------------
    if tipe == "penuh":
        sum_kg_targets = sum(_d(l.total_kg) for l in target_lots)
        sum_ekor_targets = sum(int(l.jumlah_ekor or 0) for l in target_lots)

        for l in target_lots:
            lot_kg = _d(l.total_kg)
            lot_ekor = int(l.jumlah_ekor or 0)

            nilai_aset = _harga_aset_snapshot(l, lot_kg, lot_ekor)
            agg_nilai_aset += nilai_aset
            agg_biaya_pakan += _d(l.feed_cost_accum or 0)
            agg_biaya_vit   += _d(l.vitamin_cost_accum or 0)
            agg_ambil_kg    += lot_kg
            agg_ambil_ekor  += lot_ekor

            # Hapus/zero-kan lot
            has_mortality = db.query(models.FishMortality).filter(models.FishMortality.isi_kolam_id == l.id).count() > 0
            if has_mortality:
                l.jumlah_ekor = 0
                l.total_kg = 0
                l.feed_cost_accum = Decimal("0")
                l.vitamin_cost_accum = Decimal("0")
                l.feed_kg_accum = Decimal("0")
                l.vitamin_kg_accum = Decimal("0")
                db.add(l)
            else:
                db.delete(l)

        # total_pakan_kg untuk FCR:
        if payload.isi_kolam_id:
            lot = target_lots[0]
            batch_feed = _sum_pakan_batch_non_vitamin(db, lot.id, tanggal_panen)
            total_pakan_kg = batch_feed if batch_feed > 0 else (total_pakan_kg_kolam * (agg_ambil_kg / total_kg_kolam) if total_kg_kolam > 0 else Decimal("0"))
        else:
            total_pakan_kg = total_pakan_kg_kolam

        # Setelah penuh, set kolam kosong (status akan difinalkan di bawah)
        kolam.status = "Kosong"

        total_berat_jual = berat_panen_input if berat_panen_input > 0 else agg_ambil_kg

    # ------------- MODE 2: PARSIAL -------------
    else:
        if payload.isi_kolam_id:
            l = target_lots[0]
            lot_kg = _d(l.total_kg)
            lot_ekor = int(l.jumlah_ekor or 0)
            if lot_kg <= 0 or lot_ekor < 0:
                raise HTTPException(status_code=400, detail="Data lot tidak valid")

            ambil_kg = min(berat_panen_input, lot_kg)
            ratio = (ambil_kg / lot_kg) if lot_kg > 0 else Decimal("0")

            ambil_ekor = int((Decimal(lot_ekor) * ratio).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if payload.jumlah_ekor is None else int(payload.jumlah_ekor)

            nilai_aset = _harga_aset_snapshot(l, ambil_kg, ambil_ekor)
            biaya_pakan = _d(l.feed_cost_accum or 0) * ratio
            biaya_vit   = _d(l.vitamin_cost_accum or 0) * ratio

            feed_kg_take = _d(getattr(l, "feed_kg_accum", 0) or 0) * ratio
            vit_kg_take  = _d(getattr(l, "vitamin_kg_accum", 0) or 0) * ratio

            l.total_kg = max(Decimal("0"), lot_kg - ambil_kg)
            l.jumlah_ekor = max(0, lot_ekor - ambil_ekor)
            l.feed_cost_accum = max(Decimal("0"), _d(l.feed_cost_accum or 0) - biaya_pakan)
            l.vitamin_cost_accum = max(Decimal("0"), _d(l.vitamin_cost_accum or 0) - biaya_vit)
            l.feed_kg_accum    = max(Decimal("0"), _d(getattr(l, "feed_kg_accum", 0) or 0) - feed_kg_take)
            l.vitamin_kg_accum = max(Decimal("0"), _d(getattr(l, "vitamin_kg_accum", 0) or 0) - vit_kg_take)
            db.add(l)

            agg_ambil_kg   += ambil_kg
            agg_ambil_ekor += ambil_ekor
            agg_nilai_aset += nilai_aset
            agg_biaya_pakan += biaya_pakan
            agg_biaya_vit   += biaya_vit

            batch_feed = _sum_pakan_batch_non_vitamin(db, l.id, tanggal_panen)
            total_pakan_kg = batch_feed * ratio if batch_feed > 0 else (total_pakan_kg_kolam * (ambil_kg / total_kg_kolam) if total_kg_kolam > 0 else Decimal("0"))
            total_berat_jual = ambil_kg

        else:
            r = (berat_panen_input / total_kg_kolam) if total_kg_kolam > 0 else Decimal("0")
            for l in target_lots:
                lot_kg = _d(l.total_kg)
                lot_ekor = int(l.jumlah_ekor or 0)
                if lot_kg <= 0:
                    continue
                ambil_kg = (lot_kg * r)
                ambil_ekor = int((Decimal(lot_ekor) * r).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

                nilai_aset = _harga_aset_snapshot(l, ambil_kg, ambil_ekor)
                biaya_pakan = _d(l.feed_cost_accum or 0) * r
                biaya_vit   = _d(l.vitamin_cost_accum or 0) * r
                feed_kg_take = _d(getattr(l, "feed_kg_accum", 0) or 0) * r
                vit_kg_take  = _d(getattr(l, "vitamin_kg_accum", 0) or 0) * r

                l.total_kg = max(Decimal("0"), lot_kg - ambil_kg)
                l.jumlah_ekor = max(0, lot_ekor - ambil_ekor)
                l.feed_cost_accum    = max(Decimal("0"), _d(l.feed_cost_accum or 0) - biaya_pakan)
                l.vitamin_cost_accum = max(Decimal("0"), _d(l.vitamin_cost_accum or 0) - biaya_vit)
                l.feed_kg_accum    = max(Decimal("0"), _d(getattr(l, "feed_kg_accum", 0) or 0) - feed_kg_take)
                l.vitamin_kg_accum = max(Decimal("0"), _d(getattr(l, "vitamin_kg_accum", 0) or 0) - vit_kg_take)
                db.add(l)

                agg_ambil_kg   += ambil_kg
                agg_ambil_ekor += ambil_ekor
                agg_nilai_aset += nilai_aset
                agg_biaya_pakan += biaya_pakan
                agg_biaya_vit   += biaya_vit

            total_berat_jual = berat_panen_input
            total_pakan_kg = total_pakan_kg_kolam * r

    # ------------- Final hitung HPP / Laba / FCR / Susut -------------
    hpp_total = agg_nilai_aset + agg_biaya_pakan + agg_biaya_vit
    total_penjualan = _d(payload.harga_jual) * _d(total_berat_jual)
    laba_rugi = total_penjualan - hpp_total
    fcr = (total_pakan_kg / _d(total_berat_jual)) if _d(total_berat_jual) > 0 else None

    if payload.expected_kg:
        susut_kg = _d(payload.expected_kg) - _d(total_berat_jual)
        susut_percent = (susut_kg / _d(payload.expected_kg) * Decimal("100")) if _d(payload.expected_kg) > 0 else None
    else:
        susut_kg = payload.susut_kg
        susut_percent = payload.susut_percent

    berat_rata_ekor = (_d(total_berat_jual) / _d(agg_ambil_ekor)) if agg_ambil_ekor and _d(agg_ambil_ekor) > 0 else None

    # jika setelah panen tidak ada lot tersisa -> status Kosong
    sisa_count = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam.id).count()
    if sisa_count == 0 and kolam.status != "Kosong":
        kolam.status = "Kosong"
    db.add(kolam)

    # ------------- Simpan PANEN dulu -------------
    panen = models.Panen(
        kolam_id=kolam.id,
        isi_kolam_id=payload.isi_kolam_id if payload.isi_kolam_id else None,
        tanggal=tanggal_panen,
        tipe_panen=tipe,
        total_berat_kg=_d(total_berat_jual),
        jumlah_ekor=int(agg_ambil_ekor) if agg_ambil_ekor else None,
        berat_rata_ekor=berat_rata_ekor,
        harga_jual=_d(payload.harga_jual),
        expected_kg=_d(payload.expected_kg) if payload.expected_kg else None,
        susut_kg=_d(susut_kg) if susut_kg is not None else None,
        susut_percent=_d(susut_percent) if susut_percent is not None else None,
        nilai_aset_diambil=agg_nilai_aset,
        biaya_pakan_ambil=agg_biaya_pakan,
        biaya_vitamin_ambil=agg_biaya_vit,
        hpp_total=hpp_total,
        laba_rugi=laba_rugi,
        total_pakan_kg=total_pakan_kg,
        fcr=fcr,
        created_at=get_now_wib(),
        # ✅ NEW: simpan vendor pembeli (boleh null)
        vendor_id=payload.vendor_id if payload.vendor_id is not None else None,
    )
    db.add(panen)
    db.commit()
    db.refresh(panen)

    # ------------- Transaksi keuangan -------------
    transaksi = models.TransaksiKeuangan(
        user_id=current_user.id,
        kategori="pemasukan",
        jumlah=total_penjualan,
        deskripsi=f"Panen {kolam.name} ({tipe})",
        tanggal=tanggal_panen,
        panen_id=panen.id
    )
    db.add(transaksi)

    # log aktivitas kolam (akan ikut kehapus jika kolam kosong)
    if hasattr(models, "KolamLog"):
        db.add(models.KolamLog(kolam_id=kolam.id, action=f"panen-{tipe}"))

    db.commit()
    db.refresh(panen)

    capture_activity(
        db, current_user,
        jenis="panen", aksi=("PANEN_PENUH" if tipe=="penuh" else "PANEN_PARSIAL"),
        deskripsi=f"Panen {kolam.name} ({tipe})",
        kolam_id=kolam.id,
        panen_id=panen.id,
        berat_kg=float(total_berat_jual or 0),
        qty_ekor=int(agg_ambil_ekor or 0) if agg_ambil_ekor else None,
        pendapatan=float(total_penjualan or 0),
        biaya=float(hpp_total or 0),
        saldo_delta=float(total_penjualan or 0),  # pemasukan
        meta={"fcr": float(fcr) if fcr is not None else None, "hpp_total": float(hpp_total or 0)}
    )
    db.commit()

    # ------------- BERSIHKAN SEMUA LOG kalau kolam kosong -------------
    # if db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam.id).count() == 0:
    #     _clear_all_kolam_logs(db, kolam.id)
    #     db.commit()

    # ✅ response_model PanenResponse butuh vendor info
    return schemas.PanenResponse(
        id=panen.id,
        kolam_id=panen.kolam_id,
        total_berat_kg=float(panen.total_berat_kg),
        harga_jual=float(panen.harga_jual),
        laba_rugi=float(panen.laba_rugi) if panen.laba_rugi is not None else None,
        fcr=float(panen.fcr) if panen.fcr is not None else None,
        vendor_id=panen.vendor_id,
        vendor_name=(panen.vendor.name if getattr(panen, "vendor", None) else None),
    )


@router.get("/panen", response_model=schemas.PanenListResponse)
def list_panen(
    kolam_id: Optional[int] = None,
    dari: Optional[date] = Query(None, description="Tanggal mulai (YYYY-MM-DD)"),
    sampai: Optional[date] = Query(None, description="Tanggal akhir (YYYY-MM-DD)"),
    tipe: Optional[str] = Query(None, regex="^(penuh|parsial)$"),
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Panen).join(models.Kolam)

    if kolam_id:
        q = q.filter(models.Panen.kolam_id == kolam_id)
    if dari:
        q = q.filter(models.Panen.tanggal >= dari)
    if sampai:
        q = q.filter(models.Panen.tanggal <= sampai)
    if tipe:
        q = q.filter(models.Panen.tipe_panen == tipe)

    total = q.count()
    items = (
        q.order_by(models.Panen.tanggal.desc(), models.Panen.id.desc()))
    items = items.offset(max(0, (page - 1) * per_page)).limit(per_page).all()

    out_items = []
    for p in items:
        total_penjualan = float(_d(p.harga_jual) * _d(p.total_berat_kg))
        margin_percent = float((_d(p.laba_rugi) / _d(total_penjualan) * Decimal("100"))) \
            if total_penjualan > 0 and p.laba_rugi is not None else None

        out_items.append(
            schemas.PanenListItem(
                id=p.id,
                kolam_id=p.kolam_id,
                kolam_name=p.kolam.name if p.kolam else None,
                isi_kolam_id=p.isi_kolam_id,
                tanggal=p.tanggal,
                tipe_panen=p.tipe_panen,
                total_berat_kg=float(p.total_berat_kg),
                jumlah_ekor=p.jumlah_ekor,
                berat_rata_ekor=float(p.berat_rata_ekor) if p.berat_rata_ekor is not None else None,
                harga_jual=float(p.harga_jual),
                expected_kg=float(p.expected_kg) if p.expected_kg is not None else None,
                susut_kg=float(p.susut_kg) if p.susut_kg is not None else None,
                susut_percent=float(p.susut_percent) if p.susut_percent is not None else None,
                hpp_total=float(p.hpp_total) if p.hpp_total is not None else None,
                laba_rugi=float(p.laba_rugi) if p.laba_rugi is not None else None,
                total_pakan_kg=float(p.total_pakan_kg) if p.total_pakan_kg is not None else None,
                fcr=float(p.fcr) if p.fcr is not None else None,
                created_at=p.created_at,
                total_penjualan=total_penjualan,
                margin_percent=margin_percent,
                # ✅ NEW
                vendor_id=p.vendor_id,
                vendor_name=(p.vendor.name if getattr(p, "vendor", None) else None),
            )
        )

    return schemas.PanenListResponse(items=out_items, total=total, page=page, per_page=per_page)


@router.get("/kolam/{kolam_id}/panen", response_model=schemas.PanenListResponse)

def list_panen_per_kolam(
    kolam_id: int,
    page: int = 1,
    per_page: int = 20,
    dari: Optional[date] = None,
    sampai: Optional[date] = None,
    tipe: Optional[str] = Query(None, regex="^(penuh|parsial)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    
    return list_panen(
        kolam_id=kolam_id,
        dari=dari,
        sampai=sampai,
        tipe=tipe,
        page=page,
        per_page=per_page,
        db=db,
        current_user=current_user,
    )


@router.get("/panen/{panen_id}", response_model=schemas.PanenDetail)
def get_panen_detail(
    panen_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    p = db.query(models.Panen).filter(models.Panen.id == panen_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Panen tidak ditemukan")

    total_penjualan = float(_d(p.harga_jual) * _d(p.total_berat_kg))
    margin_percent = float((_d(p.laba_rugi) / _d(total_penjualan) * Decimal("100"))) \
        if total_penjualan > 0 and p.laba_rugi is not None else None

    transaksi_id = None
    try:
        tx = (
            db.query(models.TransaksiKeuangan)
              .filter(models.TransaksiKeuangan.panen_id == p.id)
              .order_by(models.TransaksiKeuangan.id.desc())
              .first()
        )
        transaksi_id = tx.id if tx else None
    except Exception:
        transaksi_id = None

    return schemas.PanenDetail(
        id=p.id,
        kolam_id=p.kolam_id,
        kolam_name=p.kolam.name if p.kolam else None,
        isi_kolam_id=p.isi_kolam_id,
        tanggal=p.tanggal,
        tipe_panen=p.tipe_panen,
        total_berat_kg=float(p.total_berat_kg),
        jumlah_ekor=p.jumlah_ekor,
        berat_rata_ekor=float(p.berat_rata_ekor) if p.berat_rata_ekor is not None else None,
        harga_jual=float(p.harga_jual),
        expected_kg=float(p.expected_kg) if p.expected_kg is not None else None,
        susut_kg=float(p.susut_kg) if p.susut_kg is not None else None,
        susut_percent=float(p.susut_percent) if p.susut_percent is not None else None,
        nilai_aset_diambil=float(p.nilai_aset_diambil) if p.nilai_aset_diambil is not None else None,
        biaya_pakan_ambil=float(p.biaya_pakan_ambil) if p.biaya_pakan_ambil is not None else None,
        biaya_vitamin_ambil=float(p.biaya_vitamin_ambil) if p.biaya_vitamin_ambil is not None else None,
        hpp_total=float(p.hpp_total) if p.hpp_total is not None else None,
        laba_rugi=float(p.laba_rugi) if p.laba_rugi is not None else None,
        total_pakan_kg=float(p.total_pakan_kg) if p.total_pakan_kg is not None else None,
        fcr=float(p.fcr) if p.fcr is not None else None,
        created_at=p.created_at,
        total_penjualan=total_penjualan,
        margin_percent=margin_percent,
        transaksi_id=transaksi_id,
        # ✅ NEW
        vendor_id=p.vendor_id,
        vendor_name=(p.vendor.name if getattr(p, "vendor", None) else None),
    )


# ---------- Summary untuk header ----------
class PanenSummaryResponse(BaseModel):
    total_transaksi: int
    total_berat: float
    total_penjualan: float
    total_laba_rugi: float
    avg_fcr: Optional[float] = None
    avg_harga_jual: Optional[float] = None

@router.get("/panen/summary", response_model=PanenSummaryResponse)
def panen_summary(
    kolam_id: Optional[int] = None,
    dari: Optional[date] = None,
    sampai: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Panen)
    if kolam_id: q = q.filter(models.Panen.kolam_id == kolam_id)
    if dari: q = q.filter(models.Panen.tanggal >= dari)
    if sampai: q = q.filter(models.Panen.tanggal <= sampai)

    rows = q.all()
    total_transaksi = len(rows)
    total_berat = float(sum(_d(r.total_berat_kg) for r in rows))
    total_penjualan = float(sum(_d(r.total_berat_kg) * _d(r.harga_jual) for r in rows))
    total_laba_rugi = float(sum(_d(r.laba_rugi or 0) for r in rows))

    # rata2 FCR & harga jual (hanya yang punya nilai)
    fcr_vals = [float(r.fcr) for r in rows if r.fcr is not None]
    avg_fcr = (sum(fcr_vals) / len(fcr_vals)) if fcr_vals else None

    hj_vals = [float(r.harga_jual) for r in rows if r.harga_jual is not None]
    avg_harga_jual = (sum(hj_vals) / len(hj_vals)) if hj_vals else None

    return PanenSummaryResponse(
        total_transaksi=total_transaksi,
        total_berat=total_berat,
        total_penjualan=total_penjualan,
        total_laba_rugi=total_laba_rugi,
        avg_fcr=avg_fcr,
        avg_harga_jual=avg_harga_jual,
    )


# ---------- Export CSV ----------
@router.get("/panen/export.csv")
def export_panen_csv(
    kolam_id: Optional[int] = None,
    dari: Optional[date] = None,
    sampai: Optional[date] = None,
    tipe: Optional[str] = Query(None, regex="^(penuh|parsial)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Panen).join(models.Kolam)
    if kolam_id: q = q.filter(models.Panen.kolam_id == kolam_id)
    if dari: q = q.filter(models.Panen.tanggal >= dari)
    if sampai: q = q.filter(models.Panen.tanggal <= sampai)
    if tipe: q = q.filter(models.Panen.tipe_panen == tipe)

    rows = q.order_by(models.Panen.tanggal.desc(), models.Panen.id.desc()).all()

    sio = io.StringIO()
    w = csv.writer(sio)
    w.writerow([
        "ID","Kolam","Vendor","Tanggal","Tipe","Berat(kg)","Ekor","Harga/kg",
        "Expected(kg)","Susut(kg)","Susut(%)",
        "HPP","Penjualan","LabaRugi","FCR","CreatedAt"
    ])
    for p in rows:
        total_penjualan = float(_d(p.harga_jual) * _d(p.total_berat_kg))
        w.writerow([
            p.id,
            (p.kolam.name if p.kolam else p.kolam_id),
            # ✅ NEW: tampilkan nama vendor atau kosong
            (p.vendor.name if getattr(p, "vendor", None) else ""),
            p.tanggal.isoformat(),
            p.tipe_panen,
            float(p.total_berat_kg),
            p.jumlah_ekor or "",
            float(p.harga_jual),
            float(p.expected_kg) if p.expected_kg is not None else "",
            float(p.susut_kg) if p.susut_kg is not None else "",
            float(p.susut_percent) if p.susut_percent is not None else "",
            float(p.hpp_total) if p.hpp_total is not None else "",
            total_penjualan,
            float(p.laba_rugi) if p.laba_rugi is not None else "",
            float(p.fcr) if p.fcr is not None else "",
            p.created_at.isoformat() if p.created_at else "",
        ])

    return Response(
        content=sio.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=panen.csv"},
    )


# ==========================
# Add fish to kolam
# ==========================
class AddFishToKolam(BaseModel):
    ikan_id: int
    jumlah_ekor: int
    total_kg: float | None = None

from sqlalchemy import inspect


import traceback

@app.post("/kolam/{kolam_id}/add_fish", response_model=schemas.IsiKolamResponse)
def add_fish_to_kolam_alias(
    kolam_id: int,
    payload: AddFishToKolam,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        print("🚀 MASUK ADD FISH")

        kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
        if not kolam:
            raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

        if current_user.role == "petani":
            assigned = db.query(models.PemilikPetaniKolam).filter(
                models.PemilikPetaniKolam.kolam_id == kolam_id,
                models.PemilikPetaniKolam.petani_id == current_user.id
            ).first()
            if not assigned:
                raise HTTPException(status_code=403, detail="Forbidden")

        master_ikan = db.query(models.FishStock)\
            .options(joinedload(models.FishStock.vendor))\
            .filter(
                models.FishStock.id == payload.ikan_id,
                models.FishStock.quantity >= payload.jumlah_ekor
            ).first()

        if not master_ikan:
            raise HTTPException(status_code=404, detail="Stock ikan tidak cukup atau tidak ditemukan")

        total_kg = payload.total_kg
        if total_kg is None:
            if master_ikan.total_kg and master_ikan.quantity:
                total_kg = (payload.jumlah_ekor / master_ikan.quantity) * float(master_ikan.total_kg)
            else:
                total_kg = 0

        # kurangi stok
        master_ikan.quantity -= payload.jumlah_ekor
        if master_ikan.total_kg:
            master_ikan.total_kg = max(0, float(master_ikan.total_kg) - float(total_kg or 0))

        db.commit()
        db.refresh(master_ikan)

        existing = db.query(models.IsiKolam).filter(
            models.IsiKolam.kolam_id == kolam_id,
            models.IsiKolam.ikan_id == payload.ikan_id
        ).first()

        vendor_name = master_ikan.vendor.name if master_ikan.vendor else None

        if existing:
            existing.jumlah_ekor = (existing.jumlah_ekor or 0) + payload.jumlah_ekor
            existing.total_kg = float(existing.total_kg or 0) + float(total_kg or 0)
            db.commit()
            db.refresh(existing)
        else:
            new_entry = models.IsiKolam(
                kolam_id=kolam_id,
                ikan_id=payload.ikan_id,
                tanggal_masuk=get_now_wib(),
                jumlah_ekor=payload.jumlah_ekor,
                total_kg=total_kg,
                harga_per_kg_snapshot=master_ikan.price_per_kg,
                harga_per_unit_snapshot=master_ikan.price_per_unit,
                ukuran_ikan_snapshot=master_ikan.size,
                vendor_name_snapshot=vendor_name,
                feed_kg_accum=0,
                vitamin_kg_accum=0,
            )
            db.add(new_entry)
            db.commit()
            db.refresh(new_entry)
            existing = new_entry

        if kolam.status != "Sedang Pemeliharaan":
            kolam.status = "Sedang Pemeliharaan"
            db.commit()

        # 🔥 CANDIDATE ERROR
        capture_activity(
            db, current_user,
            jenis="ikan", aksi="ADD_FISH",
            deskripsi=f"{master_ikan.species} masuk ke {kolam.name}",
            kolam_id=kolam_id,
            isi_kolam_id=existing.id,
            ikan_id=payload.ikan_id,
            qty_ekor=payload.jumlah_ekor,
            berat_kg=float(total_kg or 0),
            biaya=None, pendapatan=None, saldo_delta=None,
            meta={
                "vendor": vendor_name,
                "harga_per_kg_snapshot": float(existing.harga_per_kg_snapshot or 0),
                "harga_per_unit_snapshot": float(existing.harga_per_unit_snapshot or 0)
            }
        )

        db.commit()

        print("✅ SUCCESS ADD FISH")
        return existing

    except Exception as e:
        print("❌ ERROR ADD FISH:", str(e))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

from sqlalchemy.orm import joinedload

@app.get("/kolam/{kolam_id}/fish", response_model=List[schemas.IsiKolamResponse])
def get_fish_in_kolam(
    kolam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # --- Cek kolam & akses ---
    kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")
    
    if current_user.role == "petani":
        assigned = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.kolam_id == kolam_id,
            models.PemilikPetaniKolam.petani_id == current_user.id
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Forbidden")

    # --- Ambil data isi_kolam ---
    isi_list = db.query(models.IsiKolam).options(joinedload(models.IsiKolam.ikan)).filter(
        models.IsiKolam.kolam_id == kolam_id
    ).all()

    return [
        schemas.IsiKolamResponse(
            id=isi.id,
            kolam_id=isi.kolam_id,
            ikan_id=isi.ikan_id,
            tanggal_masuk=isi.tanggal_masuk,
            jumlah_ekor=isi.jumlah_ekor,
            total_kg=float(isi.total_kg or 0),
            created_at=isi.created_at,
            harga_per_kg_snapshot=float(isi.harga_per_kg_snapshot or 0),
            harga_per_unit_snapshot=float(isi.harga_per_unit_snapshot or 0),
            ukuran_ikan_snapshot=isi.ukuran_ikan_snapshot,
            vendor_name_snapshot=isi.vendor_name_snapshot,
            # biaya
            feed_cost_accum=float(isi.feed_cost_accum or 0),
            vitamin_cost_accum=float(isi.vitamin_cost_accum or 0),
            # ⬇️ NEW: akumulasi fisik (kg)
            feed_kg_accum=float(isi.feed_kg_accum or 0),
            vitamin_kg_accum=float(isi.vitamin_kg_accum or 0),
            ikan=schemas.FishStockResponse.from_orm(isi.ikan)
        )
        for isi in isi_list
    ]

from sqlalchemy.exc import SQLAlchemyError
from decimal import Decimal

@app.get("/aktivitas/kolam/{kolam_id}", response_model=List[schemas.AktivitasResponse])
def get_aktivitas_kolam(
    kolam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Aktivitas)
        .filter(models.Aktivitas.kolam_id == kolam_id)
        .order_by(models.Aktivitas.waktu.desc())
        .all()
    )

@router.get("/aktivitas", response_model=List[schemas.AktivitasResponse])
def list_aktivitas(
    kolam_id: Optional[int] = Query(None),
    jenis: Optional[str] = Query(None),
    aksi: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Aktivitas)

    if kolam_id is not None:
        q = q.filter(models.Aktivitas.kolam_id == kolam_id)
    if jenis:
        q = q.filter(models.Aktivitas.jenis == jenis)
    if aksi:
        q = q.filter(models.Aktivitas.aksi == aksi)
    if date_from:
        q = q.filter(models.Aktivitas.waktu >= date_from)
    if date_to:
        q = q.filter(models.Aktivitas.waktu <= date_to)

    q = q.order_by(models.Aktivitas.waktu.desc())
    return q.all()

@app.post("/kolam/{kolam_id}/sortir")
def sortir_ikan(
    kolam_id: int,
    payload: schemas.SortirPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Sortir ikan dari satu kolam ke beberapa kolam tujuan.

    Aturan:
    - Stok utama yang DIJAGA adalah JUMLAH EKOR.
    - total_kg per lot dihitung proporsional dari rasio ekor (take_ekor/lot_ekor).
    - Field berat_kg yang dikirim frontend HANYA dipakai untuk catat susut (expected vs actual),
      tidak mempengaruhi stok di DB.
    - History pakan/vitamin TIDAK disalin; hanya feed_cost_accum & feed_kg_accum yang ikut pindah proporsional.
    """
    # 1️⃣ Validasi kolam asal
    kolam_asal = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
    if not kolam_asal:
        raise HTTPException(status_code=404, detail="Kolam asal tidak ditemukan")

    isi_asal = (
        db.query(models.IsiKolam)
        .options(joinedload(models.IsiKolam.ikan).joinedload(models.FishStock.vendor))
        .filter(models.IsiKolam.kolam_id == kolam_id)
        .order_by(models.IsiKolam.tanggal_masuk.asc(), models.IsiKolam.id.asc())
        .all()
    )
    if not isi_asal:
        raise HTTPException(status_code=400, detail="Kolam asal kosong")

    total_ekor_asal = sum(int(i.jumlah_ekor or 0) for i in isi_asal)
    total_kg_asal   = sum(float(i.total_kg  or 0.0) for i in isi_asal)
    if total_ekor_asal <= 0 or total_kg_asal <= 0:
        raise HTTPException(status_code=400, detail="Data kolam asal tidak valid")

    print("===== SORTIR DEBUG =====", flush=True)
    print(f"Kolam asal #{kolam_id} ({kolam_asal.name})", flush=True)
    print(f"Total ekor asal={total_ekor_asal}, total_kg_asal={total_kg_asal}", flush=True)

    # 2️⃣ Validasi movement secara umum
    if not payload.movements or len(payload.movements) == 0:
        raise HTTPException(status_code=400, detail="Tidak ada movement sortir")

    total_ekor_dipindah = sum(int(m.jumlah_ekor or 0) for m in payload.movements)
    if total_ekor_dipindah <= 0:
        raise HTTPException(status_code=400, detail="Jumlah ekor sortir harus > 0")

    # Backend guard: tidak boleh menghabiskan semua ekor (kalau mau habis, pakai panen penuh)
    if total_ekor_dipindah >= total_ekor_asal:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Total ekor sortir ({total_ekor_dipindah}) menghabiskan populasi kolam "
                f"({total_ekor_asal}). Gunakan 'Panen Penuh' jika ingin mengosongkan kolam."
            )
        )

    print(f"Total movement={len(payload.movements)}, total_ekor_dipindah={total_ekor_dipindah}", flush=True)

    # 3️⃣ Ambil mapping ukuran (ID → nama/kode ukuran)
    ukuran_ids = [int(m.ref_ukuran_id) for m in payload.movements if m.ref_ukuran_id]
    ukuran_map: dict[int, str] = {}
    if ukuran_ids:
        for u in db.query(models.ReferenceUkuranIkan).filter(models.ReferenceUkuranIkan.id.in_(ukuran_ids)).all():
            ukuran_map[u.id] = u.name  # contoh: "LBG"

    touched_target_ids: set[int] = set()

    # Validasi per-movement (target kolam & konsistensi ukuran)
    for move in payload.movements:
        if not move.to_kolam_id:
            raise HTTPException(status_code=422, detail="Kolam tujuan wajib dipilih")
        if not move.ref_ukuran_id:
            raise HTTPException(status_code=422, detail="Ukuran wajib dipilih")

        jumlah_ekor_move = int(move.jumlah_ekor or 0)
        if jumlah_ekor_move <= 0:
            raise HTTPException(status_code=422, detail="Jumlah ekor setiap movement harus > 0")

        # berat_kg boleh 0 / bebas, hanya untuk susut
        try:
            _ = float(move.berat_kg or 0.0)
        except ValueError:
            raise HTTPException(status_code=422, detail="Format berat_kg tidak valid")

        kolam_tujuan = db.query(models.Kolam).filter(models.Kolam.id == move.to_kolam_id).first()
        if not kolam_tujuan:
            raise HTTPException(status_code=404, detail=f"Kolam tujuan {move.to_kolam_id} tidak ditemukan")

        ukuran_target_name = ukuran_map.get(int(move.ref_ukuran_id))
        if not ukuran_target_name:
            raise HTTPException(status_code=422, detail="Ukuran tidak valid")

        # Konsistensi ukuran di kolam tujuan:
        isi_tujuan_existing = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == move.to_kolam_id).all()
        ukuran_set_tujuan = {
            (x.ukuran_ikan_snapshot or "").strip()
            for x in isi_tujuan_existing
            if (x.ukuran_ikan_snapshot or "").strip()
        }
        if ukuran_set_tujuan and any(sz != ukuran_target_name for sz in ukuran_set_tujuan):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Kolam tujuan #{move.to_kolam_id} ukurannya tidak konsisten. "
                    f"Harus ukuran '{list(ukuran_set_tujuan)[0]}'."
                )
            )

        touched_target_ids.add(move.to_kolam_id)

    # 4️⃣ Eksekusi sortir (basis ekor, kg proporsional)
    total_expected_kg_dipindah: float = 0.0
    total_actual_kg_input: float = 0.0

    try:
        for move in payload.movements:
            target_ekor = int(move.jumlah_ekor or 0)
            actual_kg_input = float(move.berat_kg or 0.0)
            total_actual_kg_input += actual_kg_input

            ukuran_target_name = ukuran_map[int(move.ref_ukuran_id)]

            print("\n===== START MOVEMENT =====", flush=True)
            print(f"→ Target pindah: {target_ekor} ekor | actual_kg_input={actual_kg_input}", flush=True)
            print(f"→ Kolam tujuan: {move.to_kolam_id}", flush=True)
            print(f"→ Ukuran target: {ukuran_target_name}", flush=True)
            print("------------------------------------------", flush=True)

            sisa_ekor = target_ekor

            # Ambil dari lot-lot kolam asal secara FIFO (tanggal_masuk paling awal dulu)
            for lot in isi_asal:
                if sisa_ekor <= 0:
                    break

                lot_ekor_awal = int(lot.jumlah_ekor or 0)
                lot_kg_awal   = float(lot.total_kg  or 0.0)

                if lot_ekor_awal <= 0 or lot_kg_awal <= 0:
                    continue

                print(f"[LOT] id={lot.id} | ekor_awal={lot_ekor_awal} | kg_awal={lot_kg_awal}", flush=True)

                # Berapa ekor diambil dari lot ini
                take_ekor = min(sisa_ekor, lot_ekor_awal)
                ratio = take_ekor / lot_ekor_awal  # basis ekor
                take_kg = ratio * lot_kg_awal      # kg proporsional

                print(f"  TAKE: ekor={take_ekor}, ratio={ratio:.6f}, take_kg={take_kg:.6f}", flush=True)

                # Biaya & kg pakan/vitamin yang ikut pindah (pakai ratio yang sama) → pakai float biar nggak clash Decimal
                lot_feed_cost   = float(lot.feed_cost_accum or 0.0)
                lot_vit_cost    = float(lot.vitamin_cost_accum or 0.0)
                lot_feed_kg_acc = float(getattr(lot, "feed_kg_accum", 0.0) or 0.0)
                lot_vit_kg_acc  = float(getattr(lot, "vitamin_kg_accum", 0.0) or 0.0)

                moved_feed_cost = lot_feed_cost * ratio
                moved_vit_cost  = lot_vit_cost * ratio
                moved_feed_kg   = lot_feed_kg_acc * ratio
                moved_vit_kg    = lot_vit_kg_acc * ratio

                # Cari lot di kolam tujuan dengan ikan_id yang sama (merge)
                existing_target = (
                    db.query(models.IsiKolam)
                    .filter(
                        models.IsiKolam.kolam_id == move.to_kolam_id,
                        models.IsiKolam.ikan_id == lot.ikan_id
                    )
                    .first()
                )

                if existing_target:
                    ex_ekor = int(existing_target.jumlah_ekor or 0)
                    ex_kg   = float(existing_target.total_kg or 0.0)
                    ex_feed_cost   = float(existing_target.feed_cost_accum or 0.0)
                    ex_vit_cost    = float(existing_target.vitamin_cost_accum or 0.0)
                    ex_feed_kg_acc = float(getattr(existing_target, "feed_kg_accum", 0.0) or 0.0)
                    ex_vit_kg_acc  = float(getattr(existing_target, "vitamin_kg_accum", 0.0) or 0.0)

                    existing_target.jumlah_ekor          = ex_ekor + take_ekor
                    existing_target.total_kg             = ex_kg + take_kg
                    existing_target.ukuran_ikan_snapshot = ukuran_target_name
                    existing_target.feed_cost_accum      = ex_feed_cost + moved_feed_cost
                    existing_target.vitamin_cost_accum   = ex_vit_cost + moved_vit_cost
                    existing_target.feed_kg_accum        = ex_feed_kg_acc + moved_feed_kg
                    existing_target.vitamin_kg_accum     = ex_vit_kg_acc + moved_vit_kg
                    db.add(existing_target)
                else:
                    vendor_name = getattr(lot, "vendor_name_snapshot", None) or (
                        lot.ikan.vendor.name if lot.ikan and lot.ikan.vendor else None
                    )
                    new_target = models.IsiKolam(
                        kolam_id=move.to_kolam_id,
                        ikan_id=lot.ikan_id,
                        tanggal_masuk=date.today(),
                        jumlah_ekor=take_ekor,
                        total_kg=take_kg,
                        harga_per_kg_snapshot=getattr(lot, "harga_per_kg_snapshot", None),
                        harga_per_unit_snapshot=getattr(lot, "harga_per_unit_snapshot", None),
                        ukuran_ikan_snapshot=ukuran_target_name,
                        vendor_name_snapshot=vendor_name,
                        feed_cost_accum=moved_feed_cost,
                        vitamin_cost_accum=moved_vit_cost,
                        feed_kg_accum=moved_feed_kg,
                        vitamin_kg_accum=moved_vit_kg,
                    )
                    db.add(new_target)

                # Kurangi lot asal
                new_lot_ekor = lot_ekor_awal - take_ekor
                new_lot_kg   = lot_kg_awal - take_kg
                lot.jumlah_ekor        = max(0, new_lot_ekor)
                lot.total_kg           = max(0.0, new_lot_kg)
                lot.feed_cost_accum    = max(0.0, lot_feed_cost - moved_feed_cost)
                lot.vitamin_cost_accum = max(0.0, lot_vit_cost - moved_vit_cost)
                lot.feed_kg_accum      = max(0.0, lot_feed_kg_acc - moved_feed_kg)
                lot.vitamin_kg_accum   = max(0.0, lot_vit_kg_acc - moved_vit_kg)
                db.add(lot)

                sisa_ekor -= take_ekor
                total_expected_kg_dipindah += take_kg

                print(f"  LOT AFTER: ekor={lot.jumlah_ekor}, kg={lot.total_kg}", flush=True)
                print(f"  sisa_ekor movement ini={sisa_ekor}", flush=True)

            if sisa_ekor > 0:
                # Stok ekor di kolam asal tidak cukup untuk movement ini
                print(f"❌ ERROR: sisa_ekor {sisa_ekor} belum terambil dari kolam asal", flush=True)
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Perhitungan sortir internal tidak konsisten. "
                        f"Sisa ekor {sisa_ekor} belum terambil dari kolam asal."
                    )
                )

        # 5️⃣ Hapus / nol-kan lot yang habis di kolam asal
        for lot in isi_asal:
            lot_ekor = int(lot.jumlah_ekor or 0)
            lot_kg   = float(lot.total_kg  or 0.0)
            if lot_ekor <= 0 and lot_kg <= 0.0:
                has_mortality = db.query(models.FishMortality).filter(models.FishMortality.isi_kolam_id == lot.id).count() > 0
                if has_mortality:
                    lot.jumlah_ekor = 0
                    lot.total_kg = 0.0
                    lot.feed_cost_accum = 0.0
                    lot.vitamin_cost_accum = 0.0
                    lot.feed_kg_accum = 0.0
                    lot.vitamin_kg_accum = 0.0
                    db.add(lot)
                else:
                    db.delete(lot)

        db.commit()

        # 6️⃣ Update status kolam asal & tujuan
        sisa_asal_count = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam_id).count()
        if sisa_asal_count == 0 and kolam_asal.status != "Kosong":
            kolam_asal.status = "Kosong"
            db.add(kolam_asal)
            db.commit()

        for kid in touched_target_ids:
            k = db.query(models.Kolam).filter(models.Kolam.id == kid).first()
            if k and db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kid).count() > 0:
                k.status = "Sedang Pemeliharaan"
                db.add(k)
        db.commit()

        # 7️⃣ Hitung susut berdasarkan EXPECTED KG (dari ekor) vs ACTUAL KG input user
        susut_kg = None
        susut_percent = None
        if total_expected_kg_dipindah > 0:
            susut_kg = total_expected_kg_dipindah - total_actual_kg_input
            susut_percent = (susut_kg / total_expected_kg_dipindah) * 100.0

        # total ekor & kg sisa di kolam asal (re-query fresh)
        sisa_ekor_asal = sum(
            int(x.jumlah_ekor or 0)
            for x in db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam_id).all()
        )
        sisa_kg_asal = sum(
            float(x.total_kg or 0.0)
            for x in db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam_id).all()
        )

        print("===== END SORTIR =====", flush=True)
        print(f"total_expected_kg_dipindah={total_expected_kg_dipindah}", flush=True)
        print(f"total_actual_kg_input={total_actual_kg_input}", flush=True)
        print(f"sisa_ekor_asal={sisa_ekor_asal}, sisa_kg_asal={sisa_kg_asal}", flush=True)
        print(f"susut_kg={susut_kg}, susut_percent={susut_percent}", flush=True)

        # 8️⃣ Log summary sortir untuk history & susut
        capture_activity(
            db, current_user,
            jenis="sortir",
            aksi="SORTIR_SUMMARY",
            deskripsi=(
                f"Sortir {kolam_asal.name}: {total_ekor_dipindah} ekor, "
                f"expected {total_expected_kg_dipindah:.3f} kg, "
                f"actual {total_actual_kg_input:.3f} kg; susut "
                f"{(susut_kg or 0):.3f} kg"
                + (f" ({susut_percent:.2f}%)" if susut_percent is not None else "")
            ),
            kolam_id=kolam_id,
            qty_ekor=total_ekor_dipindah,
            berat_kg=total_actual_kg_input,  # actual timbang user
            meta={
                "total_ekor_asal": total_ekor_asal,
                "total_kg_asal": total_kg_asal,
                "total_ekor_dipindah": total_ekor_dipindah,
                "expected_kg_dipindah": float(total_expected_kg_dipindah),
                "actual_kg_input": float(total_actual_kg_input),
                "susut_kg": float(susut_kg) if susut_kg is not None else None,
                "susut_percent": float(susut_percent) if susut_percent is not None else None,
                "sisa_ekor_asal": sisa_ekor_asal,
                "sisa_kg_asal": sisa_kg_asal,
            },
        )
        db.commit()

        return {
            "status": "success",
            "dipindah_ekor": total_ekor_dipindah,
            "expected_kg_dipindah": total_expected_kg_dipindah,
            "actual_kg_input": total_actual_kg_input,
            "sisa_ekor_asal": sisa_ekor_asal,
            "sisa_kg_asal": sisa_kg_asal,
        }

    except HTTPException:
        # HTTPException jangan dibungkus ulang
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ EXCEPTION SORTIR: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"Terjadi error sortir: {e}")


# ---------- Helpers ----------
def _distribusi_ke_batch(
    db: Session,
    kolam_id: int,
    jumlah_dec: Decimal,
    feed_stock: models.FeedStock,
    isi_kolam_id: int | None,
    sign: int,  # +1 untuk create/apply, -1 untuk revert/delete
):
    """
    Alokasikan biaya & kg ke batch (IsiKolam).
    - sign=+1: menambah akumulasi
    - sign=-1: mengurangi akumulasi (reversal)
    """
    is_vitamin = (feed_stock.type or "").strip().lower() == "vitamin"
    harga_dec = D(feed_stock.price_per_kg)
    biaya_total_dec = jumlah_dec * harga_dec * D(sign)

    if isi_kolam_id:
        # 100% ke satu batch
        isi = db.query(models.IsiKolam).filter(
            models.IsiKolam.id == isi_kolam_id,
            models.IsiKolam.kolam_id == kolam_id
        ).first()
        if not isi:
            raise HTTPException(status_code=404, detail="Batch (isi_kolam) tidak ditemukan di kolam ini")

        if is_vitamin:
            isi.vitamin_cost_accum = float(D(isi.vitamin_cost_accum) + biaya_total_dec)
            isi.vitamin_kg_accum   = float(D(getattr(isi, "vitamin_kg_accum", 0)) + (jumlah_dec * D(sign)))
        else:
            isi.feed_cost_accum = float(D(isi.feed_cost_accum) + biaya_total_dec)
            isi.feed_kg_accum   = float(D(getattr(isi, "feed_kg_accum", 0)) + (jumlah_dec * D(sign)))
        db.add(isi)
        return

    # proporsional
    isi_list = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam_id).all()
    total_kg_kolam = sum(D(isi.total_kg) for isi in isi_list)

    by_biomassa = total_kg_kolam > Decimal("0")
    total_ekor_kolam = sum(int(isi.jumlah_ekor or 0) for isi in isi_list) if not by_biomassa else 0

    for isi in isi_list:
        if by_biomassa:
            porsi = (D(isi.total_kg) / total_kg_kolam) if total_kg_kolam > 0 else Decimal("0")
        else:
            porsi = (D(int(isi.jumlah_ekor or 0)) / D(total_ekor_kolam)) if total_ekor_kolam > 0 else Decimal("0")

        if porsi <= 0:
            continue

        if is_vitamin:
            isi.vitamin_cost_accum = float(D(isi.vitamin_cost_accum) + (biaya_total_dec * porsi))
            isi.vitamin_kg_accum   = float(D(getattr(isi, "vitamin_kg_accum", 0)) + (jumlah_dec * porsi * D(sign)))
        else:
            isi.feed_cost_accum = float(D(isi.feed_cost_accum) + (biaya_total_dec * porsi))
            isi.feed_kg_accum   = float(D(getattr(isi, "feed_kg_accum", 0)) + (jumlah_dec * porsi * D(sign)))
        db.add(isi)


# --- letakkan di atas (area import/helper) ---
from decimal import Decimal, InvalidOperation

def D(x) -> Decimal:
    """Ubah aman ke Decimal (termasuk None/float/str)"""
    try:
        if x is None:
            return Decimal("0")
        return Decimal(str(x))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")

# ---------- CREATE (perbaikan: simpan waktu) ----------

@app.post("/pemberian-pakan", response_model=schemas.PemberianPakanResponse)
def beri_pakan(
    payload: schemas.PemberianPakanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # cek kolam
    kolam = db.query(models.Kolam).filter(models.Kolam.id == payload.kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # cek feed stock
    feed_stock = db.query(models.FeedStock).filter(models.FeedStock.id == payload.stok_pakan_id).first()
    if not feed_stock:
        raise HTTPException(status_code=404, detail="Feed stock tidak ditemukan")

    # normalisasi angka ke Decimal
    jumlah_dec = D(payload.jumlah_kg)
    if jumlah_dec <= 0:
        raise HTTPException(status_code=400, detail="jumlah_kg harus > 0")

    # cek stok cukup
    qty_before = D(feed_stock.quantity_kg)
    if qty_before < jumlah_dec:
        raise HTTPException(status_code=400, detail="Stok pakan tidak mencukupi")

    # kurangi stok gudang (Decimal → simpan float)
    feed_stock.quantity_kg = float(qty_before - jumlah_dec)
    db.add(feed_stock)

    tanggal = payload.tanggal or date.today()

    # simpan record pemberian
    pemberian = models.PemberianPakan(
        kolam_id=payload.kolam_id,
        stok_pakan_id=payload.stok_pakan_id,
        tanggal=tanggal,
        jumlah_kg=float(jumlah_dec),     # simpan float supaya konsisten
        created_at=get_now_wib(),
        isi_kolam_id=payload.isi_kolam_id
    )
    # kalau tabel punya kolom waktu, simpan juga
    if hasattr(models.PemberianPakan, "waktu"):
        setattr(pemberian, "waktu", getattr(payload, "waktu", None))

    db.add(pemberian)
    db.flush()  # supaya dapat id

    try:
        # distribusi biaya & kg (pakan vs vitamin dipisah otomatis)
        _distribusi_ke_batch(
            db=db,
            kolam_id=payload.kolam_id,
            jumlah_dec=jumlah_dec,
            feed_stock=feed_stock,
            isi_kolam_id=payload.isi_kolam_id,
            sign=+1,
        )

        # log aktivitas (opsional)
        capture_activity(
            db, current_user,
            jenis="pakan", aksi="FEEDING",
            deskripsi=f"Pemberian {feed_stock.name} ke {kolam.name}",
            kolam_id=payload.kolam_id,
            isi_kolam_id=payload.isi_kolam_id,
            feed_id=payload.stok_pakan_id,
            amount_kg=float(jumlah_dec),
            harga_per_kg=float(feed_stock.price_per_kg or 0),
            biaya=float(D(feed_stock.price_per_kg) * jumlah_dec),
            meta={"type": feed_stock.type}
        )

        db.commit()
        db.refresh(pemberian)
        db.refresh(feed_stock)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal distribusi pakan/vitamin ke batch: {e}")

    return pemberian


# ---------- READ (by kolam) ----------

from typing import Optional

@app.get("/pemberian-pakan/{kolam_id}", response_model=List[schemas.PemberianPakanDetailResponse])
def get_pemberian_pakan_by_kolam(
    kolam_id: int,
    isi_kolam_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    if current_user.role == "petani":
        assigned = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.kolam_id == kolam_id,
            models.PemilikPetaniKolam.petani_id == current_user.id
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Forbidden")

    query = db.query(models.PemberianPakan).options(
        joinedload(models.PemberianPakan.stok_pakan),
        joinedload(models.PemberianPakan.isi_kolam).joinedload(models.IsiKolam.ikan)
    ).filter(models.PemberianPakan.kolam_id == kolam_id)

    if isi_kolam_id:
        query = query.filter(models.PemberianPakan.isi_kolam_id == isi_kolam_id)

    pemberian_list = query.order_by(models.PemberianPakan.created_at.desc()).all()
    return pemberian_list

# ---------- UPDATE (PATCH) ----------
@app.patch("/pemberian-pakan/{pemberian_id}", response_model=schemas.PemberianPakanDetailResponse)
def update_pemberian_pakan(
    pemberian_id: int,
    payload: schemas.PemberianPakanUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # --- ambil record lama ---
    pemberian: models.PemberianPakan = db.query(models.PemberianPakan).options(
        joinedload(models.PemberianPakan.stok_pakan),
        joinedload(models.PemberianPakan.isi_kolam)
    ).filter(models.PemberianPakan.id == pemberian_id).first()

    if not pemberian:
        raise HTTPException(status_code=404, detail="Pemberian pakan tidak ditemukan")

    # cek akses (opsional, samakan dgn GET-by-kolam)
    kolam = db.query(models.Kolam).filter(models.Kolam.id == pemberian.kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    if current_user.role == "petani":
        assigned = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.kolam_id == pemberian.kolam_id,
            models.PemilikPetaniKolam.petani_id == current_user.id
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Forbidden")

    # --- nilai lama (untuk revert) ---
    old_stock: models.FeedStock = pemberian.stok_pakan
    old_jumlah_dec = D(pemberian.jumlah_kg)
    old_type = (old_stock.type or "").strip().lower() if old_stock else ""
    old_price_dec = D(old_stock.price_per_kg if old_stock else 0)

    # --- nilai baru (fallback ke lama) ---
    new_stok_id = payload.stok_pakan_id if payload.stok_pakan_id is not None else pemberian.stok_pakan_id
    new_jumlah_dec = D(payload.jumlah_kg) if payload.jumlah_kg is not None else old_jumlah_dec
    new_tanggal = payload.tanggal if payload.tanggal is not None else pemberian.tanggal
    new_waktu = payload.waktu if payload.waktu is not None else getattr(pemberian, "waktu", None)
    new_isi_id = payload.isi_kolam_id if payload.isi_kolam_id is not None else pemberian.isi_kolam_id

    # validasi feed baru
    new_stock = db.query(models.FeedStock).filter(models.FeedStock.id == new_stok_id).first()
    if not new_stock:
        raise HTTPException(status_code=404, detail="Feed stock baru tidak ditemukan")

    new_type = (new_stock.type or "").strip().lower()
    new_price_dec = D(new_stock.price_per_kg)

    # --- koreksi stok gudang ---
    # 1) kembalikan stok lama
    if old_stock:
        old_qty_dec = D(old_stock.quantity_kg)
        old_stock.quantity_kg = float(old_qty_dec + old_jumlah_dec)
        db.add(old_stock)

    # 2) cek stok baru cukup
    new_qty_dec = D(new_stock.quantity_kg)
    if new_qty_dec < new_jumlah_dec:
        db.rollback()
        raise HTTPException(status_code=400, detail="Stok pakan/vitamin baru tidak mencukupi")

    # 3) kurangi stok baru
    new_stock.quantity_kg = float(new_qty_dec - new_jumlah_dec)
    db.add(new_stock)

    # --- helpers distribusi ---
    def distribusi_proporsional(kid: int):
        isi_list = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kid).all()
        total_kg_kolam_dec = sum(D(isi.total_kg) for isi in isi_list)
        by_biomassa = total_kg_kolam_dec > Decimal("0")
        total_ekor_kolam = sum(int(isi.jumlah_ekor or 0) for isi in isi_list) if not by_biomassa else 0
        return isi_list, by_biomassa, total_kg_kolam_dec, total_ekor_kolam

    # --- REVERT akumulasi lama ---
    if old_jumlah_dec > 0:
        if pemberian.isi_kolam_id:
            isi_target = db.query(models.IsiKolam).filter(
                models.IsiKolam.id == pemberian.isi_kolam_id,
                models.IsiKolam.kolam_id == pemberian.kolam_id
            ).first()
            if isi_target:
                if old_type == "vitamin":
                    isi_target.vitamin_cost_accum = float(D(isi_target.vitamin_cost_accum) - (old_jumlah_dec * old_price_dec))
                    isi_target.vitamin_kg_accum   = float(D(getattr(isi_target, "vitamin_kg_accum", 0)) - old_jumlah_dec)
                else:
                    isi_target.feed_cost_accum = float(D(isi_target.feed_cost_accum) - (old_jumlah_dec * old_price_dec))
                    isi_target.feed_kg_accum   = float(D(getattr(isi_target, "feed_kg_accum", 0)) - old_jumlah_dec)
                db.add(isi_target)
        else:
            isi_list, by_biomassa, total_kg_kolam_dec, total_ekor_kolam = distribusi_proporsional(pemberian.kolam_id)
            for isi in isi_list:
                if by_biomassa:
                    porsi_dec = D(isi.total_kg) / total_kg_kolam_dec if total_kg_kolam_dec > 0 else Decimal("0")
                else:
                    porsi_dec = Decimal(str(int(isi.jumlah_ekor or 0))) / Decimal(str(total_ekor_kolam)) if total_ekor_kolam > 0 else Decimal("0")
                if porsi_dec <= 0:
                    continue
                if old_type == "vitamin":
                    isi.vitamin_cost_accum = float(D(isi.vitamin_cost_accum) - (old_jumlah_dec * old_price_dec * porsi_dec))
                    isi.vitamin_kg_accum   = float(D(getattr(isi, "vitamin_kg_accum", 0)) - (old_jumlah_dec * porsi_dec))
                else:
                    isi.feed_cost_accum = float(D(isi.feed_cost_accum) - (old_jumlah_dec * old_price_dec * porsi_dec))
                    isi.feed_kg_accum   = float(D(getattr(isi, "feed_kg_accum", 0)) - (old_jumlah_dec * porsi_dec))
                db.add(isi)

    # --- APPLY akumulasi baru ---
    if new_jumlah_dec > 0:
        if new_isi_id:
            isi_target = db.query(models.IsiKolam).filter(
                models.IsiKolam.id == new_isi_id,
                models.IsiKolam.kolam_id == pemberian.kolam_id
            ).first()
            if not isi_target:
                db.rollback()
                raise HTTPException(status_code=404, detail="Batch (isi_kolam) tujuan tidak ditemukan di kolam ini")

            if new_type == "vitamin":
                isi_target.vitamin_cost_accum = float(D(isi_target.vitamin_cost_accum) + (new_jumlah_dec * new_price_dec))
                isi_target.vitamin_kg_accum   = float(D(getattr(isi_target, "vitamin_kg_accum", 0)) + new_jumlah_dec)
            else:
                isi_target.feed_cost_accum = float(D(isi_target.feed_cost_accum) + (new_jumlah_dec * new_price_dec))
                isi_target.feed_kg_accum   = float(D(getattr(isi_target, "feed_kg_accum", 0)) + new_jumlah_dec)
            db.add(isi_target)
        else:
            isi_list, by_biomassa, total_kg_kolam_dec, total_ekor_kolam = distribusi_proporsional(pemberian.kolam_id)
            for isi in isi_list:
                if by_biomassa:
                    porsi_dec = D(isi.total_kg) / total_kg_kolam_dec if total_kg_kolam_dec > 0 else Decimal("0")
                else:
                    porsi_dec = Decimal(str(int(isi.jumlah_ekor or 0))) / Decimal(str(total_ekor_kolam)) if total_ekor_kolam > 0 else Decimal("0")
                if porsi_dec <= 0:
                    continue
                if new_type == "vitamin":
                    isi.vitamin_cost_accum = float(D(isi.vitamin_cost_accum) + (new_jumlah_dec * new_price_dec * porsi_dec))
                    isi.vitamin_kg_accum   = float(D(getattr(isi, "vitamin_kg_accum", 0)) + (new_jumlah_dec * porsi_dec))
                else:
                    isi.feed_cost_accum = float(D(isi.feed_cost_accum) + (new_jumlah_dec * new_price_dec * porsi_dec))
                    isi.feed_kg_accum   = float(D(getattr(isi, "feed_kg_accum", 0)) + (new_jumlah_dec * porsi_dec))
                db.add(isi)

    # --- update record pemberian_pakan ---
    pemberian.stok_pakan_id = new_stok_id
    pemberian.jumlah_kg = float(new_jumlah_dec)  # simpan sebagai float agar konsisten dgn kolom yg mungkin float
    pemberian.tanggal = new_tanggal or date.today()
    if hasattr(pemberian, "waktu"):
        pemberian.waktu = new_waktu
    pemberian.isi_kolam_id = new_isi_id
    db.add(pemberian)

    # (opsional) log aktivitas
    try:
        capture_activity(
            db, current_user,
            jenis="pakan", aksi="FEEDING_EDIT",
            deskripsi=f"Ubah pemberian: {(old_stock.name if old_stock else '-')}"
                      f" → {(new_stock.name if new_stock else '-')}",
            kolam_id=pemberian.kolam_id,
            isi_kolam_id=new_isi_id,
            feed_id=new_stok_id,
            amount_kg=float(new_jumlah_dec),
            harga_per_kg=float(new_price_dec),
            biaya=float(new_price_dec * new_jumlah_dec),
            meta={"old_type": old_type, "new_type": new_type}
        )
    except Exception:
        pass

    db.commit()
    db.refresh(pemberian)
    return pemberian


# ---------- DELETE ----------
@app.delete("/pemberian-pakan/{pemberian_id}")
def delete_pemberian_pakan(
    pemberian_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    pemberian = db.query(models.PemberianPakan).options(
        joinedload(models.PemberianPakan.stok_pakan)
    ).filter(models.PemberianPakan.id == pemberian_id).first()

    if not pemberian:
        raise HTTPException(status_code=404, detail="Pemberian pakan tidak ditemukan")

    kolam_id = int(pemberian.kolam_id)
    feed_stock = pemberian.stok_pakan or db.query(models.FeedStock).get(pemberian.stok_pakan_id)
    jumlah_dec = D(pemberian.jumlah_kg)

    # kembalikan stok gudang (Decimal → simpan float)
    if jumlah_dec > 0 and feed_stock:
        feed_stock.quantity_kg = float(D(feed_stock.quantity_kg) + jumlah_dec)
        db.add(feed_stock)

    # reversal alokasi biaya & kg
    if feed_stock and jumlah_dec > 0:
        _distribusi_ke_batch(
            db=db,
            kolam_id=kolam_id,
            jumlah_dec=jumlah_dec,
            feed_stock=feed_stock,
            isi_kolam_id=pemberian.isi_kolam_id,
            sign=-1
        )

    db.delete(pemberian)
    db.commit()
    return {"status": "ok"}

@app.get("/growth_log/{kolam_id}")
def get_growth_log(kolam_id: int, db: Session = Depends(get_db)):
    logs = db.query(models.GrowthLog)\
        .filter(models.GrowthLog.kolam_id == kolam_id)\
        .order_by(models.GrowthLog.tanggal.asc())\
        .all()

    return [
        {
            "tanggal": log.tanggal,
            "total_kg": float(log.total_kg or 0),
            "berat_rata_ekor": float(log.berat_rata_ekor or 0)
        }
        for log in logs
    ]


@app.post("/mortality", response_model=schemas.MortalityResponse)
def add_mortality(
    payload: schemas.MortalityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Catat mortalitas ikan di suatu kolam.

    Perilaku:
    - Mengurangi jumlah_ekor DAN total_kg di setiap IsiKolam secara proporsional.
    - Jika setelah mortalitas ikan di kolam habis, semua IsiKolam di kolam tsb
      dibersihkan (seperti panen penuh) dan status kolam di-set ke "Kosong",
      sehingga bisa dipakai untuk siklus berikutnya.
    - Log pakan / vitamin / growth / panen TIDAK dihapus.
    """

    # 1️⃣ Cek kolam & hak akses
    kolam = (
        db.query(models.Kolam)
        .filter(models.Kolam.id == payload.kolam_id)
        .first()
    )
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    if current_user.role == "petani":
        assigned = (
            db.query(models.PemilikPetaniKolam)
            .filter(
                models.PemilikPetaniKolam.kolam_id == payload.kolam_id,
                models.PemilikPetaniKolam.petani_id == current_user.id,
            )
            .first()
        )
        if not assigned:
            raise HTTPException(status_code=403, detail="Anda tidak berhak mengakses kolam ini")

    # 2️⃣ Ambil seluruh IsiKolam sebagai basis perhitungan
    isi_list = (
        db.query(models.IsiKolam)
        .options(joinedload(models.IsiKolam.ikan))
        .filter(models.IsiKolam.kolam_id == payload.kolam_id)
        .order_by(models.IsiKolam.tanggal_masuk.asc(), models.IsiKolam.id.asc())
        .all()
    )
    if not isi_list:
        raise HTTPException(status_code=400, detail="Kolam kosong, tidak ada ikan untuk mortalitas")

    total_ikan = sum(int(isi.jumlah_ekor or 0) for isi in isi_list)
    total_kg = sum(float(isi.total_kg or 0.0) for isi in isi_list)

    if total_ikan <= 0 or total_kg < 0:
        raise HTTPException(status_code=400, detail="Data isi kolam tidak valid")

    if payload.jumlah_mati is None or payload.jumlah_mati <= 0:
        raise HTTPException(status_code=400, detail="Jumlah mati harus > 0")

    if payload.jumlah_mati > total_ikan:
        raise HTTPException(
            status_code=400,
            detail=f"Jumlah mati ({payload.jumlah_mati}) melebihi populasi di kolam ({total_ikan} ekor)",
        )

    # 3️⃣ Kurangi jumlah ikan & berat secara proporsional per lot
    sisa_mati = int(payload.jumlah_mati)
    for isi in isi_list:
        if sisa_mati <= 0:
            break

        lot_ekor = int(isi.jumlah_ekor or 0)
        lot_kg = float(isi.total_kg or 0.0)

        if lot_ekor <= 0 or lot_kg <= 0:
            continue

        # Berapa ekor yang mati di lot ini
        if lot_ekor <= sisa_mati:
            mati_ekor = lot_ekor
        else:
            mati_ekor = sisa_mati

        ratio = mati_ekor / lot_ekor  # proporsi dari lot yang mati
        mati_kg = ratio * lot_kg

        isi.jumlah_ekor = lot_ekor - mati_ekor
        isi.total_kg = max(0.0, lot_kg - mati_kg)
        db.add(isi)

        sisa_mati -= mati_ekor

    # 4️⃣ Catat log mortalitas (per kolam, bukan per lot)
    new_mortality = models.FishMortality(
        kolam_id=payload.kolam_id,
        tanggal=payload.tanggal or date.today(),
        waktu=payload.waktu,
        jumlah_mati=payload.jumlah_mati,
        keterangan=payload.keterangan,
        created_at=get_now_wib(),
    )
    db.add(new_mortality)

    # 5️⃣ Cek apakah kolam habis setelah mortalitas
    total_ikan_after = sum(int(isi.jumlah_ekor or 0) for isi in isi_list)
    total_kg_after = sum(float(isi.total_kg or 0.0) for isi in isi_list)

    if total_ikan_after <= 0 or total_kg_after <= 0.0001:
        # Semua ikan dianggap habis karena mortalitas
        # → bersihkan IsiKolam seperti panen penuh, dan set kolam jadi "Kosong"
        for isi in isi_list:
            # Kalau model FishMortality punya kolom isi_kolam_id dan sudah pernah
            # dipakai log lain, kita nol-kan saja; kalau tidak, hapus.
            has_mortality = False
            if hasattr(models.FishMortality, "isi_kolam_id"):
                has_mortality = (
                    db.query(models.FishMortality)
                    .filter(models.FishMortality.isi_kolam_id == isi.id)
                    .count() > 0
                )

            if has_mortality:
                isi.jumlah_ekor = 0
                isi.total_kg = 0.0
                db.add(isi)
            else:
                db.delete(isi)

        if kolam.status != "Kosong":
            kolam.status = "Kosong"
            db.add(kolam)

    # 6️⃣ Aktivitas + audit log (tetap jalan seperti sebelumnya)
    capture_activity(
        db,
        current_user,
        jenis="mortalitas",
        aksi="MORTALITY",
        deskripsi=f"Kematian ikan di {kolam.name}",
        kolam_id=payload.kolam_id,
        qty_ekor=payload.jumlah_mati,
        meta={"keterangan": payload.keterangan},
    )

    log_action(
        user=current_user.username,
        action="mortality",
        detail=f"{payload.jumlah_mati} ikan mati di kolam {kolam.name}",
    )

    db.commit()
    db.refresh(new_mortality)
    return new_mortality


class TambahBeratRequest(BaseModel):
    tambahan_kg: float
    beratRata: float | None = None   # ✅ tambahkan

@app.post("/kolam/{kolam_id}/tambah_berat")
def tambah_berat_kolam(
    kolam_id: int,
    payload: TambahBeratRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    kolam = db.query(models.Kolam).filter(models.Kolam.id == kolam_id).first()
    if not kolam:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan")

    # cek hak akses petani
    if current_user.role == "petani":
        assigned = db.query(models.PemilikPetaniKolam).filter(
            models.PemilikPetaniKolam.kolam_id == kolam_id,
            models.PemilikPetaniKolam.petani_id == current_user.id
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Forbidden")

    tambahan = float(payload.tambahan_kg or 0)
    if tambahan <= 0:
        raise HTTPException(status_code=400, detail="Tambahan berat harus > 0")

    # ambil semua isi_kolam pada kolam ini
    isi_list = db.query(models.IsiKolam).filter(models.IsiKolam.kolam_id == kolam_id).all()
    if not isi_list:
        raise HTTPException(status_code=400, detail="Kolam kosong, tidak ada ikan")

    # hitung total berat sekarang
    total_kg_sekarang = sum(float(isi.total_kg or 0) for isi in isi_list)
    if total_kg_sekarang <= 0:
        raise HTTPException(status_code=400, detail="Data berat ikan kosong, tidak bisa distribusi")

    # distribusi tambahan_kg proporsional ke setiap entry isi_kolam
    for isi in isi_list:
        porsi = float(isi.total_kg or 0) / total_kg_sekarang
        tambahan_per_entry = porsi * tambahan
        isi.total_kg = float(isi.total_kg or 0) + tambahan_per_entry
        db.add(isi)

        # Buat growth log
        log = models.GrowthLog(
            isi_kolam_id=isi.id,
            kolam_id=kolam_id,
            total_kg=float(isi.total_kg or 0),
            berat_rata_ekor=payload.beratRata   # ✅ sekarang tidak error
        )
        db.add(log)

    db.commit()

    log_action(
        current_user.username,
        "tambah berat kolam",
        f"Kolam {kolam.name} bertambah {tambahan} kg"
    )

    return {"message": f"Berhasil menambahkan {tambahan} kg ke kolam {kolam.name}"}

# @app.post("/update_berat")
# def update_berat(payload: UpdateBeratRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
#     isi_kolam_list = db.query(IsiKolam).filter(IsiKolam.kolam_id == payload.kolam_id).all()
#     if not isi_kolam_list:
#         raise HTTPException(status_code=404, detail="Kolam kosong atau tidak ditemukan")

#     growth_logs = []

#     for ikan in isi_kolam_list:
#         ikan.berat_rata_ekor = payload.beratRata

#         log = GrowthLog(
#             isi_kolam_id=ikan.id,
#             kolam_id=ikan.kolam_id,
#             berat_rata_ekor=payload.beratRata
#         )
#         db.add(log)

#     db.commit()  # commit semua perubahan sekaligus

#     # ambil growth_logs yang baru di-commit
#     for ikan in isi_kolam_list:
#         log = db.query(GrowthLog).filter(GrowthLog.isi_kolam_id == ikan.id).order_by(GrowthLog.tanggal.desc()).first()
#         growth_logs.append({
#             "tanggal": log.tanggal.isoformat(),
#             "isi_kolam_id": log.isi_kolam_id,
#             "kolam_id": log.kolam_id,
#             "berat": float(log.berat_rata_ekor)
#         })

#     return {"message": "Berhasil update berat", "growth_logs": growth_logs}

@app.get("/fish_mortality/{kolam_id}")
def get_fish_mortality(kolam_id: int, isi_kolam_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(FishMortality).filter(FishMortality.kolam_id == kolam_id)
    if isi_kolam_id:
        query = query.filter(FishMortality.isi_kolam_id == isi_kolam_id)
    logs = query.order_by(FishMortality.tanggal).all()
    
    if not logs:
        raise HTTPException(status_code=404, detail="Belum ada data mortalitas")
    
    return [
        {
            "id": log.id,
            "kolam_id": log.kolam_id,
            "isi_kolam_id": getattr(log, "isi_kolam_id", None),
            "jumlah_mati": log.jumlah_mati,
            "tanggal": log.tanggal.isoformat(),
            "waktu": log.waktu.isoformat() if log.waktu else None,
            "keterangan": log.keterangan
        }
        for log in logs
    ]


@app.get("/growth_log/{kolam_id}")
def get_growth_log(kolam_id: int, isi_kolam_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(GrowthLog).filter(GrowthLog.kolam_id == kolam_id)
    if isi_kolam_id:
        query = query.filter(GrowthLog.isi_kolam_id == isi_kolam_id)
    logs = query.order_by(GrowthLog.tanggal).all()
    
    if not logs:
        raise HTTPException(status_code=404, detail="Belum ada data pertumbuhan")
    
    return [
        {
            "id": log.id,
            "isi_kolam_id": log.isi_kolam_id,
            "kolam_id": log.kolam_id,
            "berat_rata_ekor": float(log.berat_rata_ekor) if log.berat_rata_ekor else None,
            "total_kg": float(log.total_kg) if log.total_kg else None,  # ✅
            "tanggal": log.tanggal.isoformat()
        }
        for log in logs
    ]

# ==========================
# REFERENCE CRUD (Jenis Kolam, Ukuran Ikan, Aktivitas, Status)
# ==========================
from fastapi import Path
from typing import Optional

# ----- Jenis Kolam -----
@app.post("/reference/jenis-kolam", response_model=schemas.JenisKolamResponse)
def create_jenis_kolam(payload: schemas.JenisKolamCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh membuat reference")

    # optional: mencegah duplikasi nama
    existing = db.query(models.ReferenceJenisKolam).filter(models.ReferenceJenisKolam.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Jenis kolam dengan nama tersebut sudah ada")

    new_ref = models.ReferenceJenisKolam(
        name=payload.name,
        description=payload.description,
        created_at=get_now_wib()
    )
    db.add(new_ref)
    db.commit()
    db.refresh(new_ref)

    log_action(current_user.username, "create reference_jenis_kolam", f"{new_ref.name}")
    return new_ref

@app.get("/reference/jenis-kolam", response_model=List[schemas.JenisKolamResponse])
def list_jenis_kolam(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.ReferenceJenisKolam).order_by(models.ReferenceJenisKolam.name).all()

@app.get("/reference/jenis-kolam/{ref_id}", response_model=schemas.JenisKolamResponse)
def get_jenis_kolam(ref_id: int = Path(..., gt=0), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ref = db.query(models.ReferenceJenisKolam).filter(models.ReferenceJenisKolam.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference jenis kolam tidak ditemukan")
    return ref

@app.put("/reference/jenis-kolam/{ref_id}", response_model=schemas.JenisKolamResponse)
def update_jenis_kolam(ref_id: int, payload: schemas.JenisKolamUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh mengubah reference")

    ref = db.query(models.ReferenceJenisKolam).filter(models.ReferenceJenisKolam.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference jenis kolam tidak ditemukan")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(ref, k, v)
    db.commit()
    db.refresh(ref)

    log_action(current_user.username, "update reference_jenis_kolam", f"{ref.id} -> {ref.name}")
    return ref

@app.delete("/reference/jenis-kolam/{ref_id}")
def delete_jenis_kolam(ref_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh menghapus reference")
    ref = db.query(models.ReferenceJenisKolam).filter(models.ReferenceJenisKolam.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference jenis kolam tidak ditemukan")
    db.delete(ref)
    db.commit()

    log_action(current_user.username, "delete reference_jenis_kolam", f"{ref_id} -> {ref.name}")
    return {"message": "Reference jenis kolam dihapus"}

# ----- Ukuran Ikan -----
@app.post("/reference/ukuran-ikan", response_model=schemas.UkuranIkanResponse)
def create_ukuran_ikan(payload: schemas.UkuranIkanCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh membuat reference")

    # Validasi nama species
    allowed_species = {"Lele", "Nila"}
    if payload.name not in allowed_species:
        raise HTTPException(status_code=422, detail="Nama harus 'Lele' atau 'Nila'")

    # Cegah duplikat species + ukuran (opsional; kalau mau unik per kombinasi)
    existing = db.query(models.ReferenceUkuranIkan).filter(
        models.ReferenceUkuranIkan.name == payload.name,
        models.ReferenceUkuranIkan.ukuran == payload.ukuran
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ukuran ikan dengan kombinasi tersebut sudah ada")

    # Normalisasi tipe_harga agar cocok enum lama
    t = (payload.tipe_harga or "").lower()
    if t in ("ekor", "ukuran"):
        tipe_norm = "ukuran"
    elif t in ("kg", "berat"):
        tipe_norm = "berat"
    else:
        raise HTTPException(status_code=422, detail="tipe_harga harus 'ekor' atau 'kg'")

    new_ref = models.ReferenceUkuranIkan(
        name=payload.name,            # Lele/Nila
        ukuran=payload.ukuran,        # <— NEW
        tipe_harga=tipe_norm,         # disimpan sbg 'ukuran'/'berat'
        description=payload.description,
        created_at=get_now_wib(),
    )
    db.add(new_ref)
    db.commit()
    db.refresh(new_ref)
    log_action(current_user.username, "create reference_ukuran_ikan", f"{new_ref.name} {new_ref.ukuran or ''}".strip())
    return new_ref

@app.get("/reference/ukuran-ikan", response_model=List[schemas.UkuranIkanResponse])
def list_ukuran_ikan(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.ReferenceUkuranIkan).order_by(models.ReferenceUkuranIkan.name).all()

@app.get("/reference/ukuran-ikan/{ref_id}", response_model=schemas.UkuranIkanResponse)
def get_ukuran_ikan(ref_id: int = Path(..., gt=0), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ref = db.query(models.ReferenceUkuranIkan).filter(models.ReferenceUkuranIkan.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference ukuran ikan tidak ditemukan")
    return ref

@app.put("/reference/ukuran-ikan/{ref_id}", response_model=schemas.UkuranIkanResponse)
def update_ukuran_ikan(ref_id: int, payload: schemas.UkuranIkanUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh mengubah reference")

    ref = db.query(models.ReferenceUkuranIkan).filter(models.ReferenceUkuranIkan.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference ukuran ikan tidak ditemukan")

    data = payload.dict(exclude_unset=True)

    # Validasi name jika diubah
    if "name" in data:
        if data["name"] not in {"Lele", "Nila"}:
            raise HTTPException(status_code=422, detail="Nama harus 'Lele' atau 'Nila'")

    # Normalisasi tipe_harga jika diubah
    if "tipe_harga" in data and data["tipe_harga"] is not None:
        t = str(data["tipe_harga"]).lower()
        if t in ("ekor", "ukuran"):
            data["tipe_harga"] = "ukuran"
        elif t in ("kg", "berat"):
            data["tipe_harga"] = "berat"
        else:
            raise HTTPException(status_code=422, detail="tipe_harga harus 'ekor' atau 'kg'")

    for k, v in data.items():
        setattr(ref, k, v)

    db.commit()
    db.refresh(ref)
    log_action(current_user.username, "update reference_ukuran_ikan", f"{ref.id} -> {ref.name} {ref.ukuran or ''}".strip())
    return ref

@app.delete("/reference/ukuran-ikan/{ref_id}")
def delete_ukuran_ikan(ref_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh menghapus reference")
    ref = db.query(models.ReferenceUkuranIkan).filter(models.ReferenceUkuranIkan.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference ukuran ikan tidak ditemukan")
    db.delete(ref)
    db.commit()

    log_action(current_user.username, "delete reference_ukuran_ikan", f"{ref_id} -> {ref.name}")
    return {"message": "Reference ukuran ikan dihapus"}

# ----- Aktivitas Kolam -----
@app.post("/reference/aktivitas-kolam", response_model=schemas.AktivitasKolamResponse)
def create_aktivitas(payload: schemas.AktivitasKolamCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh membuat reference")

    existing = db.query(models.ReferenceAktivitasKolam).filter(models.ReferenceAktivitasKolam.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Aktivitas dengan nama tersebut sudah ada")

    new_ref = models.ReferenceAktivitasKolam(
        name=payload.name,
        description=payload.description,
        created_at=get_now_wib()
    )
    db.add(new_ref)
    db.commit()
    db.refresh(new_ref)

    log_action(current_user.username, "create reference_aktivitas_kolam", f"{new_ref.name}")
    return new_ref

@app.get("/reference/aktivitas-kolam", response_model=List[schemas.AktivitasKolamResponse])
def list_aktivitas(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.ReferenceAktivitasKolam).order_by(models.ReferenceAktivitasKolam.name).all()

@app.get("/reference/aktivitas-kolam/{ref_id}", response_model=schemas.AktivitasKolamResponse)
def get_aktivitas(ref_id: int = Path(..., gt=0), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ref = db.query(models.ReferenceAktivitasKolam).filter(models.ReferenceAktivitasKolam.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference aktivitas tidak ditemukan")
    return ref

@app.put("/reference/aktivitas-kolam/{ref_id}", response_model=schemas.AktivitasKolamResponse)
def update_aktivitas(ref_id: int, payload: schemas.AktivitasKolamUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh mengubah reference")

    ref = db.query(models.ReferenceAktivitasKolam).filter(models.ReferenceAktivitasKolam.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference aktivitas tidak ditemukan")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(ref, k, v)
    db.commit()
    db.refresh(ref)

    log_action(current_user.username, "update reference_aktivitas_kolam", f"{ref.id} -> {ref.name}")
    return ref

@app.delete("/reference/aktivitas-kolam/{ref_id}")
def delete_aktivitas(ref_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh menghapus reference")
    ref = db.query(models.ReferenceAktivitasKolam).filter(models.ReferenceAktivitasKolam.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference aktivitas tidak ditemukan")
    db.delete(ref)
    db.commit()

    log_action(current_user.username, "delete reference_aktivitas_kolam", f"{ref_id} -> {ref.name}")
    return {"message": "Reference aktivitas dihapus"}

# ----- Status Kolam / Ikan -----
@app.post("/reference/status-kolam-ikan", response_model=schemas.StatusKolamIkanResponse)
def create_status(payload: schemas.StatusKolamIkanCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh membuat reference")

    existing = db.query(models.ReferenceStatusKolamIkan).filter(models.ReferenceStatusKolamIkan.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Status dengan nama tersebut sudah ada")

    new_ref = models.ReferenceStatusKolamIkan(
        name=payload.name,
        description=payload.description,
        created_at=get_now_wib()
    )
    db.add(new_ref)
    db.commit()
    db.refresh(new_ref)

    log_action(current_user.username, "create reference_status_kolam_ikan", f"{new_ref.name}")
    return new_ref

@app.get("/reference/status-kolam-ikan", response_model=List[schemas.StatusKolamIkanResponse])
def list_status(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.ReferenceStatusKolamIkan).order_by(models.ReferenceStatusKolamIkan.name).all()

@app.get("/reference/status-kolam-ikan/{ref_id}", response_model=schemas.StatusKolamIkanResponse)
def get_status(ref_id: int = Path(..., gt=0), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ref = db.query(models.ReferenceStatusKolamIkan).filter(models.ReferenceStatusKolamIkan.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference status tidak ditemukan")
    return ref

@app.put("/reference/status-kolam-ikan/{ref_id}", response_model=schemas.StatusKolamIkanResponse)
def update_status(ref_id: int, payload: schemas.StatusKolamIkanUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh mengubah reference")

    ref = db.query(models.ReferenceStatusKolamIkan).filter(models.ReferenceStatusKolamIkan.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference status tidak ditemukan")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(ref, k, v)
    db.commit()
    db.refresh(ref)

    log_action(current_user.username, "update reference_status_kolam_ikan", f"{ref.id} -> {ref.name}")
    return ref

@app.delete("/reference/status-kolam-ikan/{ref_id}")
def delete_status(ref_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "pemilik":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang boleh menghapus reference")
    ref = db.query(models.ReferenceStatusKolamIkan).filter(models.ReferenceStatusKolamIkan.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference status tidak ditemukan")
    db.delete(ref)
    db.commit()

    log_action(current_user.username, "delete reference_status_kolam_ikan", f"{ref_id} -> {ref.name}")
    return {"message": "Reference status dihapus"}


# =========================================================================================================================================
# ===== Vendor Endpoints (SAFE & STABLE) =====
# =========================================================================================================================================
from typing import List
import re
import logging

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

# Pastikan objek berikut ada / di-import:
# - app: FastAPI()
# - models, schemas
# - get_db, get_current_user

logger = logging.getLogger("uvicorn.error")

BP_PATTERN = re.compile(r"^BP\d{4,}$")  # minimal BP + 4 digit


def _none_if_blank(v: str | None) -> str | None:
    if v is None:
        return None
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


def _clean_str(v: str | None) -> str | None:
    return v.strip() if isinstance(v, str) else v


def _max_bp_from_rows(rows) -> int:
    """
    rows: list of tuples [(bp_code,), ...]
    Ambil angka maksimum dari bp_code yang valid (regex ^BP\\d+$).
    """
    max_n = 0
    for (code,) in rows:
        if not code:
            continue
        s = str(code).strip()
        m = re.fullmatch(r"BP(\d+)", s)
        if m:
            try:
                n = int(m.group(1))
                if n > max_n:
                    max_n = n
            except ValueError:
                continue
    return max_n


def generate_bp_code(db: Session) -> str:
    """
    Generate next BP code TANPA SQL rumit (kompatibel MySQL/MariaDB):
    - Ambil semua bp_code (kolom saja, cepat)
    - Hitung max angka di Python
    - Return BP{max+1:04d}
    """
    rows = db.query(models.Vendor.bp_code).all()
    max_n = _max_bp_from_rows(rows)
    next_n = max_n + 1
    return f"BP{next_n:04d}"


# =========================================================================================================================================
# NEXT CODE (untuk frontend auto-number; backend tetap generate sendiri saat create)
# =========================================================================================================================================
@app.get("/reference/vendor/next-code")
def get_next_vendor_code(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        code = generate_bp_code(db)
        return {"next_bp_code": code}
    except SQLAlchemyError as e:
        logger.exception("[GET /reference/vendor/next-code] SQLAlchemyError")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


# =========================================================================================================================================
# LIST
# =========================================================================================================================================
@app.get("/reference/vendor", response_model=List[schemas.VendorResponse])
def list_vendors(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Vendor).order_by(models.Vendor.created_at.desc()).all()


# =========================================================================================================================================
# CREATE (abaikan bp_code dari client; backend SELALU generate & validasi)
# =========================================================================================================================================
@app.post("/reference/vendor", response_model=schemas.VendorResponse)
def create_vendor(
    payload: schemas.VendorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    logger.info(f"[POST /reference/vendor] payload_in={payload.model_dump()}")

    name = _clean_str(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Nama wajib diisi.")

    nomor_hp = _none_if_blank(payload.Nomor_HP)
    alamat = _none_if_blank(payload.alamat)
    tanggal_daftar = payload.tanggal_daftar

    # Backend SELALU generate supaya pasti unik & konsisten
    bp_code = generate_bp_code(db)

    # Pre-check unik yang ramah
    if db.query(models.Vendor).filter(models.Vendor.bp_code == bp_code).first():
        # extremely rare; regenerate sekali lagi
        bp_code = generate_bp_code(db)
        if db.query(models.Vendor).filter(models.Vendor.bp_code == bp_code).first():
            raise HTTPException(status_code=500, detail="Gagal membuat BP Code unik (duplikasi berulang).")

    if nomor_hp and db.query(models.Vendor).filter(models.Vendor.Nomor_HP == nomor_hp).first():
        raise HTTPException(status_code=400, detail="Nomor HP sudah digunakan.")

    obj = models.Vendor(
        name=name,
        Nomor_HP=nomor_hp,
        alamat=alamat,
        tanggal_daftar=tanggal_daftar,
        bp_code=bp_code,
    )
    db.add(obj)

    # Commit + retry kecil jika kebetulan bentrok (race)
    for attempt in range(3):
        try:
            db.commit()
            db.refresh(obj)
            logger.info(f"[POST /reference/vendor] created id={obj.id}, bp_code={obj.bp_code}")
            return obj
        except IntegrityError as e:
            db.rollback()
            err = str(getattr(e, "orig", e)).lower()
            # kalau kena unique bp_code (race), regen & retry
            if "bp_code" in err:
                new_code = generate_bp_code(db)
                logger.warning(
                    f"[POST /reference/vendor][retry {attempt+1}] conflict bp_code={bp_code} -> regenerate {new_code}"
                )
                bp_code = new_code
                obj.bp_code = bp_code
                continue
            if "nomor_hp" in err or "nomor_hp".lower() in err:
                raise HTTPException(status_code=400, detail="Nomor HP sudah digunakan.")
            logger.exception("[POST /reference/vendor] IntegrityError")
            raise HTTPException(status_code=500, detail=f"DB integrity error: {e}")
        except SQLAlchemyError as e:
            db.rollback()
            logger.exception("[POST /reference/vendor] SQLAlchemyError")
            raise HTTPException(status_code=500, detail=f"DB error: {e}")

    raise HTTPException(
        status_code=500, detail="Gagal membuat vendor karena konflik kode yang berulang."
    )


# =========================================================================================================================================
# UPDATE
# =========================================================================================================================================
@app.put("/reference/vendor/{vendor_id}", response_model=schemas.VendorResponse)
def update_vendor(
    vendor_id: int,
    payload: schemas.VendorUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    obj = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Vendor tidak ditemukan")

    before = {
        "name": obj.name,
        "Nomor_HP": obj.Nomor_HP,
        "alamat": obj.alamat,
        "tanggal_daftar": obj.tanggal_daftar,
        "bp_code": obj.bp_code,
    }
    logger.info(f"[PUT /reference/vendor/{vendor_id}] BEFORE: {before}")

    data = payload.dict(exclude_unset=True)

    # Bersihkan & validasi ringan
    if "name" in data and data["name"] is not None:
        data["name"] = _clean_str(data["name"])
        if not data["name"]:
            raise HTTPException(status_code=400, detail="Nama wajib diisi.")

    if "Nomor_HP" in data:
        data["Nomor_HP"] = _none_if_blank(data["Nomor_HP"])

    if "alamat" in data:
        data["alamat"] = _none_if_blank(data["alamat"])

    # (Opsional) izinkan ubah bp_code? Biasanya TIDAK.
    if "bp_code" in data:
        # kebijakan: TIDAK memperbolehkan kosong & harus pola BP####
        if data["bp_code"] is None or (isinstance(data["bp_code"], str) and data["bp_code"].strip() == ""):
            raise HTTPException(status_code=400, detail="BP Code tidak boleh dikosongkan.")
        data["bp_code"] = data["bp_code"].strip()
        if not BP_PATTERN.match(data["bp_code"]):
            raise HTTPException(
                status_code=400,
                detail="Format BP Code tidak valid. Gunakan pola BP#### (contoh: BP0001).",
            )
        if data["bp_code"] != obj.bp_code:
            # cek unik kalau memang berubah
            if db.query(models.Vendor).filter(
                models.Vendor.id != vendor_id, models.Vendor.bp_code == data["bp_code"]
            ).first():
                raise HTTPException(status_code=400, detail="BP Code sudah digunakan.")

    # cek unik nomor HP kalau diubah
    if "Nomor_HP" in data and data["Nomor_HP"]:
        if db.query(models.Vendor).filter(
            models.Vendor.id != vendor_id, models.Vendor.Nomor_HP == data["Nomor_HP"]
        ).first():
            raise HTTPException(status_code=400, detail="Nomor HP sudah digunakan.")

    for field, value in data.items():
        setattr(obj, field, value)

    try:
        db.commit()
        db.refresh(obj)
        after = {
            "name": obj.name,
            "Nomor_HP": obj.Nomor_HP,
            "alamat": obj.alamat,
            "tanggal_daftar": obj.tanggal_daftar,
            "bp_code": obj.bp_code,
        }
        logger.info(f"[PUT /reference/vendor/{vendor_id}] AFTER:  {after}")
        return obj
    except IntegrityError as e:
        db.rollback()
        logger.exception(f"[PUT /reference/vendor/{vendor_id}] IntegrityError")
        raise HTTPException(status_code=400, detail=f"Integrity error: {e}")
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception(f"[PUT /reference/vendor/{vendor_id}] SQLAlchemyError")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


# =========================================================================================================================================
# DELETE
# =========================================================================================================================================
@app.delete("/reference/vendor/{vendor_id}")
def delete_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    obj = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Vendor tidak ditemukan")
    try:
        db.delete(obj)
        db.commit()
        logger.info(f"[DELETE /reference/vendor/{vendor_id}] Deleted.")
        return {"status": "success", "deleted_id": vendor_id}
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception(f"[DELETE /reference/vendor/{vendor_id}] SQLAlchemyError")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


# =========================================================================================================================================

app.include_router(router, prefix="/kolam")

@app.get("/aktivitas", response_model=schemas.AktivitasListResponse)
def list_aktivitas(
    kolam_id: Optional[int] = None,
    isi_kolam_id: Optional[int] = None,
    user_id: Optional[int] = None,
    jenis: Optional[str] = None,
    aksi: Optional[str] = None,
    dari: Optional[date] = None,
    sampai: Optional[date] = None,
    q: Optional[str] = None,             # cari di deskripsi
    page: int = 1,
    per_page: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # RBAC: petani hanya boleh lihat aktivitas kolam yang di-assign
    qset = db.query(models.Aktivitas)

    if current_user.role == "petani":
        # ambil kolam yang diassign
        allowed = (
            db.query(models.PemilikPetaniKolam.kolam_id)
            .filter(models.PemilikPetaniKolam.petani_id == current_user.id)
            .all()
        )
        allowed_ids = [k[0] for k in allowed]
        if not allowed_ids:
            return schemas.AktivitasListResponse(items=[], total=0, page=page, per_page=per_page)
        qset = qset.filter((models.Aktivitas.kolam_id == None) | (models.Aktivitas.kolam_id.in_(allowed_ids)))

    # filters umum
    if kolam_id:     qset = qset.filter(models.Aktivitas.kolam_id == kolam_id)
    if isi_kolam_id: qset = qset.filter(models.Aktivitas.isi_kolam_id == isi_kolam_id)
    if user_id:      qset = qset.filter(models.Aktivitas.user_id == user_id)
    if jenis:        qset = qset.filter(models.Aktivitas.jenis == jenis)
    if aksi:         qset = qset.filter(models.Aktivitas.aksi == aksi)
    if dari:         qset = qset.filter(models.Aktivitas.waktu >= dari)
    if sampai:       qset = qset.filter(models.Aktivitas.waktu <= sampai)
    if q:            qset = qset.filter(models.Aktivitas.deskripsi.ilike(f"%{q}%"))

    total = qset.count()
    rows = (
        qset.order_by(models.Aktivitas.waktu.desc(), models.Aktivitas.id.desc())
            .offset(max(0, (page - 1) * per_page))
            .limit(per_page)
            .all()
    )
    return schemas.AktivitasListResponse(items=rows, total=total, page=page, per_page=per_page)

# ==========================
# ROOT
# ==========================
@app.get("/")
def root():
    return {"message": "API Budidaya Lele Ready 🚀"}
app.include_router(router)