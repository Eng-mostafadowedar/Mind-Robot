import asyncio
import time
import re
import json
import os
import fcntl
import RPi.GPIO as GPIO

LED_PINS = [22, 5, 13]

# شغّل الليدات عند استيراد الملف
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
for pin in LED_PINS:
    GPIO.setup(pin, GPIO.OUT)
    GPIO.output(pin, GPIO.HIGH)
print("🔴 3 LEDs ON")
from pathlib import Path
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
import smtplib
import subprocess
import threading
import cv2
import io
import base64 as b64lib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from email.mime.base import MIMEBase
from email import encoders
from email.header import Header
from email.utils import formatdate, make_msgid

# ═══════════════════════════════════════════════════
#  🤖 AI Chat — chat_routes.py v16 (Technical-First Mind Persona)
#     ← الصوت (TTS_VOICE) محدد هنا — المصدر الوحيد
# ═══════════════════════════════════════════════════
from chat_routes import router as chat_router, init_chat_db, TTS_VOICE

app = FastAPI()
@app.on_event("shutdown")
def shutdown_event():
    for pin in LED_PINS:
        GPIO.output(pin, GPIO.LOW)
    GPIO.cleanup()
    print("⚫ 3 LEDs OFF")

# ═══ مسار المشروع الأساسي (مطلق) ═══
BASE_DIR = Path("/home/mindrobot/Desktop/mindrobot")

# ═══ ملف الإعدادات (.env) ═══
env_file = BASE_DIR / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())
else:
    print(f"⚠️  ملف .env مش موجود في: {env_file}")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASS = os.environ.get("GMAIL_APP_PASS", "")

if not GROQ_API_KEY:
    print("⚠️  تحذير: مفتاح API غير موجود! أنشئ ملف .env وضعه فيه:")
    print("   GROQ_API_KEY=gsk_your_key_here")

if GMAIL_USER:
    print(f"✅ Gmail User: {GMAIL_USER}")
else:
    print("❌ GMAIL_USER مش موجود في .env")

if GMAIL_APP_PASS:
    print(f"✅ Gmail App Pass: {'*' * 4}{GMAIL_APP_PASS[-4:]}")
else:
    print("❌ GMAIL_APP_PASS مش موجود في .env")

# ═══ الصوت العربي — المصدر الوحيد: chat_routes.py → TTS_VOICE ═══
#   عشان تغير الصوت → غيّر TTS_VOICE في chat_routes.py بس
#   الصوت الحالي: ar-SA-HamedNeural

STATE_FILE = str(BASE_DIR / "state.json")
PATIENTS_FILE = str(BASE_DIR / "patients_data.json")
STATS_FILE = str(BASE_DIR / "stats_data.json")

# ═══════════════════════════════════════════════════
#  Robot State
# ═══════════════════════════════════════════════════

robot_state = {
    "mode": "idle",        # idle | busy | chat
    "last_activity": time.time(),
    "current_user": None
}

def set_robot_mode(mode: str, user: str = None):
    """تحديث حالة الروبوت."""
    robot_state["mode"] = mode
    robot_state["last_activity"] = time.time()
    robot_state["current_user"] = user
    print(f"[ROBOT] Mode: {mode}" + (f" | user: {user}" if user else ""))

# ═══════════════════════════════════════════════════
#  Pydantic Models
# ═══════════════════════════════════════════════════

class SensorMode(BaseModel):
    mode: str

class StatIncrement(BaseModel):
    type: str

class QuickCheckData(BaseModel):
    heartRate: float = 0
    spo2: float = 0
    temperature: float = 0
    gsr: float = 0

# ═══ قراءة آمنة لملفات JSON مع قفل فايل ═══
def read_json_locked(filename, default):
    filepath = BASE_DIR / filename
    try:
        with open(filepath, 'r') as f:
            fcntl.flock(f, fcntl.LOCK_SH)
            data = json.load(f)
            fcntl.flock(f, fcntl.LOCK_UN)
            return data
    except (json.JSONDecodeError, IOError, OSError):
        return default
    except Exception:
        return default

def write_json_locked(filename, data):
    filepath = BASE_DIR / filename
    try:
        with open(filepath, 'w') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            json.dump(data, f, indent=2, ensure_ascii=False)
            fcntl.flock(f, fcntl.LOCK_UN)
            return True
    except Exception as e:
        print(f"[ERROR] Write failed for {filename}: {e}")
        return False

@app.middleware("http")
async def disable_js_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.endswith(".js") or request.url.path.endswith(".css") or request.url.path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══ قراءة السنسورات ═══
@app.get("/vitals")
def api_get_vitals():
    hr_data = read_json_locked("hr_data.json", {"hr": 0, "spo2": 0})
    temp_data = read_json_locked("temp_data.json", {"temp": 0})
    gsr_data = read_json_locked("gsr_data.json", {"gsr": 0})
    
    # Compute sensor levels for overview.js
    hr_val = hr_data.get("hr", 0) or 0
    spo2_val = hr_data.get("spo2", 0) or 0
    temp_val = temp_data.get("temp", 0) or 0
    gsr_val = gsr_data.get("gsr", 0) or 0

    def _hr_level(v):
        if v <= 0: return "off"
        if 60 <= v <= 100: return "normal"
        if (50 <= v < 60) or (100 < v <= 110): return "warning"
        return "danger"

    def _spo2_level(v):
        if v <= 0: return "off"
        if v >= 95: return "normal"
        if 90 <= v < 95: return "warning"
        return "danger"

    def _temp_level(v):
        if v <= 0: return "off"
        if 36.1 <= v <= 37.2: return "normal"
        if (35.0 <= v < 36.1) or (37.2 < v <= 37.9): return "warning"
        return "danger"

    def _gsr_level(v):
        if v <= 0: return "off"
        if 1.0 <= v <= 3.0: return "normal"
        if 3.0 < v <= 5.0: return "warning"
        return "danger"

    return {
        "hr": hr_val,
        "spo2": spo2_val,
        "temp": temp_val,
        "gsr": gsr_val,
        "hr_level": _hr_level(hr_val),
        "spo2_level": _spo2_level(spo2_val),
        "temp_level": _temp_level(temp_val),
        "gsr_level": _gsr_level(gsr_val),
        "hr_status": hr_data.get("hr_status", ""),
        "spo2_status": hr_data.get("spo2_status", ""),
        "status": "reading",
        "sensor_error": False
    }

@app.get("/api/sensor_status")
def check_sensor_status():
    return {"error": False}

@app.post("/api/start_sensors")
def start_sensors(mode: SensorMode):
    return {"status": "sensors_started"}

@app.post("/api/set_sensor_state")
def set_sensor_state(data: dict):
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(data, f)
        return {"status": "state_updated"}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════
#  /api/status Health Check
# ═══════════════════════════════════════════════════

@app.get("/api/status")
async def health_check():
    """فحص حالة السيرفر والروبوت والسنسورات."""
    try:
        hr_data = read_json_locked("hr_data.json", {"hr": 0, "spo2": 0})
        temp_data = read_json_locked("temp_data.json", {"temp": 0})
        gsr_data = read_json_locked("gsr_data.json", {"gsr": 0})
        stats_data = read_json_locked("stats_data.json", {})
    except Exception:
        hr_data = temp_data = gsr_data = stats_data = {}

    uptime = time.time() - app.state.start_time if hasattr(app.state, 'start_time') else 0

    return {
        "status": "ok",
        "robot": {
            "mode": robot_state["mode"],
            "current_user": robot_state["current_user"],
            "idle_seconds": int(time.time() - robot_state["last_activity"])
        },
        "sensors": {
            "hr": hr_data.get("hr", 0),
            "spo2": hr_data.get("spo2", 0),
            "temp": temp_data.get("temp", 0),
            "gsr": gsr_data.get("gsr", 0)
        },
        "stats": stats_data,
        "server": {
            "uptime_seconds": int(uptime),
            "version": "3.0"
        }
    }


# ═══════════════════════════════════════════════════
#  Robot State Endpoints
# ═══════════════════════════════════════════════════

@app.post("/api/robot/set-mode")
async def set_mode(data: dict):
    """تحديث حالة الروبوت من الفرونت إند."""
    try:
        mode = data.get("mode", "idle")
        user = data.get("user")
        if mode not in ("idle", "busy", "chat"):
            return JSONResponse(status_code=400, content={"error": "حالة غير صحيحة"})
        set_robot_mode(mode, user)
        return {"status": "ok", "mode": mode}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/robot/mode")
async def get_mode():
    """معرفة حالة الروبوت الحالية."""
    return {
        "mode": robot_state["mode"],
        "current_user": robot_state["current_user"],
        "idle_seconds": int(time.time() - robot_state["last_activity"])
    }


# ═══════════════════════════════════════════════════
#  🗑️ OLD CHAT/TTS ENDPOINTS REMOVED
# ═══════════════════════════════════════════════════
#  The old /chat, /tts, /response.mp3, /tts/{filename}
#  endpoints have been REMOVED. They are now handled by
#  chat_routes.py v15 which provides:
#    POST /api/chat/send    — Smart chat (Memory + Search + Persona)
#    POST /api/chat/stt     — Speech to text (Whisper)
#    POST /api/chat/tts     — Text to speech (with voice modulation)
#    GET  /api/chat/history — Chat history
#    GET  /api/chat/greeting — Smart greeting
#    GET  /api/chat/status   — Robot system status
#    GET  /api/chat/diary    — Work diary
#    GET  /api/chat/achievements — Achievements
#    GET  /api/chat/memory/search — Memory search
#    POST /api/chat/chroma/add — Add to ChromaDB
#    GET  /api/chat/chroma/search — Search ChromaDB
#    GET  /api/chat/chroma/count — ChromaDB doc count
# ═══════════════════════════════════════════════════


# ═══════════════════════════════════════════════════
#  📁 نظام الملفات - patients/ + quick_checks/
# ═══════════════════════════════════════════════════

PATIENTS_DIR = BASE_DIR / "patients"
QUICKCHECKS_DIR = BASE_DIR / "quick_checks"

PATIENTS_DIR.mkdir(exist_ok=True)
QUICKCHECKS_DIR.mkdir(exist_ok=True)

def _get_counter(dir_path):
    counter_file = dir_path / "counter.json"
    try:
        with open(counter_file, 'r') as f:
            return json.load(f).get("count", 0)
    except:
        return 0

def _set_counter(dir_path, count):
    counter_file = dir_path / "counter.json"
    try:
        with open(counter_file, 'w') as f:
            json.dump({"count": count}, f)
    except Exception as e:
        print(f"[ERROR] Failed to write counter: {e}")

def _next_patient_id():
    count = _get_counter(PATIENTS_DIR) + 1
    _set_counter(PATIENTS_DIR, count)
    return f"MR-{count:05d}"

def _next_qc_id():
    count = _get_counter(QUICKCHECKS_DIR) + 1
    _set_counter(QUICKCHECKS_DIR, count)
    return f"QC-{count:05d}"


# =========================================
#  Patient Storage Endpoints
# =========================================

def load_patients():
    return read_json_locked("patients_data.json", {"patients": []})

def save_patients(data):
    return write_json_locked("patients_data.json", data)

@app.get("/api/patients")
def get_patients():
    data = load_patients()
    return data.get("patients", [])

@app.get("/api/patients/{patient_id}")
def get_patient(patient_id: str):
    data = load_patients()
    patients = data.get("patients", [])
    for p in patients:
        if str(p.get("id")) == str(patient_id):
            return p
    return {"error": "Patient not found"}

@app.post("/api/patients")
def create_patient(patient: dict):
    mr_id = _next_patient_id()
    patient["patientId"] = mr_id
    patient["id"] = mr_id
    patient["visitDate"] = patient.get("visitDate", time.strftime("%Y-%m-%dT%H:%M", time.localtime()))

    data = load_patients()
    patients = data.get("patients", [])
    patients.append(patient)
    data["patients"] = patients
    save_patients(data)

    increment_stats(StatIncrement(type="registered"))

    print(f"[SAVE] Patient registered → {mr_id}")
    return {"status": "saved", "id": mr_id, "patientId": mr_id}

@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: str):
    data = load_patients()
    patients = data.get("patients", [])
    new_patients = [p for p in patients if str(p.get("id")) != str(patient_id)]
    data["patients"] = new_patients
    save_patients(data)
    return {"status": "deleted"}


# =========================================
#  📁 Quick Check Endpoints
# =========================================

@app.post("/api/quick_checks")
def save_quick_check(qc_data: QuickCheckData):
    qc_id = _next_qc_id()
    qc_record = {
        "qcId": qc_id,
        "heartRate": qc_data.heartRate,
        "spo2": qc_data.spo2,
        "temperature": qc_data.temperature,
        "gsr": qc_data.gsr,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
        "date": time.strftime("%Y-%m-%d", time.localtime()),
        "time": time.strftime("%H:%M:%S", time.localtime())
    }

    qc_file = QUICKCHECKS_DIR / f"{qc_id}.json"
    with open(qc_file, 'w') as f:
        json.dump(qc_record, f, indent=2, ensure_ascii=False)
    print(f"[SAVE] Quick Check → {qc_id}")

    increment_stats(StatIncrement(type="quick_check"))

    return {"status": "saved", "qcId": qc_id}

@app.get("/api/quick_checks")
def get_quick_checks():
    checks = []
    for qc_file in sorted(QUICKCHECKS_DIR.glob("QC-*.json"), reverse=True):
        try:
            with open(qc_file, 'r') as f:
                checks.append(json.load(f))
        except:
            pass
    return checks


# =========================================
#  📊 Stats Endpoints
# =========================================

def load_stats():
    return read_json_locked("stats_data.json", {"registered": 0, "quick_check": 0})

def save_stats(data):
    return write_json_locked("stats_data.json", data)

@app.get("/api/stats")
def get_stats():
    data = load_stats()
    reg = _get_counter(PATIENTS_DIR)
    qc = _get_counter(QUICKCHECKS_DIR)
    data["patients_count"] = reg
    data["quick_checks_count"] = qc
    data["total"] = reg + qc
    return data

@app.post("/api/stats/increment")
def increment_stats(stat: StatIncrement):
    data = load_stats()
    stat_type = stat.type
    if stat_type in data:
        data[stat_type] = data.get(stat_type, 0) + 1
    else:
        data[stat_type] = 1
    save_stats(data)
    return {"status": "incremented", "type": stat_type, "value": data[stat_type]}


# ═══ اختبار اتصال Gmail ═══
@app.get("/api/email_test")
def test_email_config():
    try:
        print(f"[EMAIL TEST] جاري اختبار الاتصال بـ Gmail...")
        print(f"[EMAIL TEST] User: {GMAIL_USER}")
        print(f"[EMAIL TEST] Pass: {'*' * 4}{GMAIL_APP_PASS[-4:] if GMAIL_APP_PASS else 'EMPTY'}")

        if not GMAIL_USER or not GMAIL_APP_PASS:
            return {"success": False, "error": "GMAIL_USER أو GMAIL_APP_PASS فارغ في .env", "env_loaded": bool(env_file.exists())}

        server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10)
        server.login(GMAIL_USER, GMAIL_APP_PASS)
        server.quit()

        print("[EMAIL TEST] ✅ الاتصال ناجح!")
        return {"success": True, "message": "Gmail connection OK", "user": GMAIL_USER}

    except smtplib.SMTPAuthenticationError as e:
        msg = f"خطأ في كلمة السر: {e}"
        print(f"[EMAIL TEST] ❌ {msg}")
        return {"success": False, "error": msg}
    except smtplib.SMTPConnectError as e:
        msg = f"فشل الاتصال بالسيرفر: {e}"
        print(f"[EMAIL TEST] ❌ {msg}")
        return {"success": False, "error": msg}
    except Exception as e:
        msg = f"خطأ غير معروف: {type(e).__name__}: {e}"
        print(f"[EMAIL TEST] ❌ {msg}")
        return {"success": False, "error": msg}


# =========================================
#  Email Report Endpoint — v3
# =========================================

def send_via_smtp(msg, recipient):
    errors = []

    try:
        print("[EMAIL] محاولة 1: SMTP_SSL port 465...")
        server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15)
        server.login(GMAIL_USER, GMAIL_APP_PASS)
        server.send_message(msg)
        server.quit()
        print(f"[EMAIL] ✅ تم الإرسال بنجاح عبر port 465 → {recipient}")
        return True
    except Exception as e1:
        errors.append(f"SSL:465 → {type(e1).__name__}: {e1}")
        print(f"[EMAIL] ❌ محاولة 1 فشلت: {e1}")

    try:
        print("[EMAIL] محاولة 2: STARTTLS port 587...")
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=15)
        server.starttls()
        server.login(GMAIL_USER, GMAIL_APP_PASS)
        server.send_message(msg)
        server.quit()
        print(f"[EMAIL] ✅ تم الإرسال بنجاح عبر port 587 → {recipient}")
        return True
    except Exception as e2:
        errors.append(f"STARTTLS:587 → {type(e2).__name__}: {e2}")
        print(f"[EMAIL] ❌ محاولة 2 فشلت: {e2}")

    all_errors = " | ".join(errors)
    print(f"[EMAIL] ❌ كل المحاولات فشلت: {all_errors}")
    raise Exception(all_errors)

@app.post("/api/send_report")
async def send_report_email(data: dict):
    try:
        pdf_base64 = data.get("pdf_base64", "")
        patient_name = data.get("patient_name", "Patient")
        recipient = data.get("email", "")

        print(f"[EMAIL] ── طلب إرسال جديد ──")
        print(f"[EMAIL] مريض: {patient_name} | بريد: {recipient}")

        if not pdf_base64:
            return {"success": False, "error": "Missing PDF data"}

        safe_name = re.sub(r'[^a-zA-Z0-9_\-.]', '_', patient_name.strip()) if patient_name else "Patient"
        if not safe_name:
            safe_name = "Patient"

        pdf_raw = pdf_base64.split(",")[1] if "," in pdf_base64 else pdf_base64

        try:
            pdf_bytes = b64lib.b64decode(pdf_raw)
            print(f"[EMAIL] PDF decoded: {len(pdf_bytes)} bytes")
        except Exception as decode_err:
            return {"success": False, "error": f"PDF decode error: {decode_err}"}

        if len(pdf_bytes) < 100:
            return {"success": False, "error": f"PDF too small ({len(pdf_bytes)} bytes) — invalid data"}

        saved_locally = False
        save_path = ""
        mr_id = data.get("patient_id", "") or data.get("patientId", "")

        date_str = time.strftime("%Y-%m-%d_%H-%M-%S", time.localtime())
        if mr_id:
            report_filename = f"{mr_id}_{date_str}.pdf"
        else:
            report_filename = f"{safe_name}_{date_str}.pdf"

        report_path = PATIENTS_DIR / report_filename
        try:
            with open(report_path, 'wb') as f:
                f.write(pdf_bytes)
            save_path = str(report_path)
            saved_locally = True
            print(f"[SAVE] ✅ PDF → patients/{report_filename} ({len(pdf_bytes)} bytes)")
        except Exception as save_err:
            print(f"[SAVE] ❌ {save_err}")

        filename = f"MindRobot_Report_{safe_name}.pdf"

        if not GMAIL_USER or not GMAIL_APP_PASS:
            return {
                "success": saved_locally,
                "status": "saved_locally" if saved_locally else "no_email_config",
                "filename": filename,
                "local_path": save_path
            }

        msg = MIMEMultipart()
        msg["From"] = GMAIL_USER
        msg["To"] = recipient if recipient else GMAIL_USER
        msg["Subject"] = f"MindRobot Medical Report - {patient_name}"
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid()

        body = f"""Dear {patient_name},

Please find attached your medical report generated by MindRobot AI Medical System.
This report contains your vital signs readings and AI-powered health assessment.
Please consult your healthcare provider for any medical decisions.

Best regards,
MindRobot Medical System"""
        msg.attach(MIMEText(body, "plain"))

        attachment = MIMEApplication(pdf_bytes, _subtype="pdf")

        while 'Content-Type' in attachment:
            del attachment['Content-Type']
        attachment['Content-Type'] = 'application/pdf'

        while 'Content-Transfer-Encoding' in attachment:
            del attachment['Content-Transfer-Encoding']
        attachment['Content-Transfer-Encoding'] = 'base64'

        wrapped_payload = b64lib.encodebytes(pdf_bytes).decode('ascii')
        wrapped_payload = '\r\n'.join(wrapped_payload.split('\n'))
        attachment.set_payload(wrapped_payload)

        while 'Content-Disposition' in attachment:
            del attachment['Content-Disposition']
        attachment.add_header('Content-Disposition', 'attachment', filename=('utf-8', '', filename))

        msg.attach(attachment)

        send_via_smtp(msg, recipient or GMAIL_USER)

        print(f"[EMAIL] ✅ Report sent to {recipient or GMAIL_USER} | Local: {saved_locally}")
        return {"success": True, "status": "sent", "filename": filename, "saved_locally": saved_locally}

    except Exception as e:
        error_detail = f"{type(e).__name__}: {e}"
        print(f"[EMAIL] ❌ Error: {error_detail}")
        return {"success": False, "error": error_detail}


# ═══════════════════════════════════════════════════
#  📹 Camera Service
# ═══════════════════════════════════════════════════

class CameraManager:
    def __init__(self):
        import glob
        cascade_path = '/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml'
        if not os.path.exists(cascade_path):
            found = glob.glob('/usr/**/haarcascade_frontalface_default.xml', recursive=True)
            cascade_path = found[0] if found else ''
        self.face_cascade = cv2.CascadeClassifier(cascade_path) if cascade_path else None
        self._latest_frame = None
        self._stop = False
        self._thread = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._vid_loop, daemon=True)
        self._thread.start()
        print("[CAM] rpicam-vid thread started")

    def _vid_loop(self):
        while not self._stop:
            try:
                proc = subprocess.Popen(
                    ['rpicam-vid', '-t', '0', '--width', '320', '--height', '240',
                     '--nopreview', '--framerate', '10', '--codec', 'mjpeg', '-o', '-'],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                buf = b''
                while proc.poll() is None and not self._stop:
                    chunk = proc.stdout.read(8192)
                    if not chunk:
                        time.sleep(0.05)
                        continue
                    buf += chunk
                    while len(buf) > 4:
                        idx = buf.find(b'\xff\xd8')
                        if idx < 0:
                            buf = buf[-4:]
                            break
                        end = buf.find(b'\xff\xd9', idx + 2)
                        if end < 0:
                            break
                        self._latest_frame = buf[idx:end + 2]
                        buf = buf[end + 2:]
            except Exception as e:
                print(f"[CAM] Error: {e}")
            finally:
                try:
                    proc.terminate()
                    proc.wait(timeout=3)
                except:
                    pass
                if not self._stop:
                    time.sleep(1)
        print("[CAM] thread stopped")

    def stream_gen(self):
        self.start()
        last = None
        while not self._stop:
            frame = self._latest_frame
            if frame is not None and frame is not last:
                last = frame
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n")
            time.sleep(0.005)

    def capture(self):
        self.start()
        for _ in range(50):
            frame = self._latest_frame
            if frame and len(frame) > 1000:
                return frame
            time.sleep(0.1)
        return None

    def detect_face(self):
        frame = self.capture()
        if not frame or self.face_cascade is None:
            return False
        tmp = str(BASE_DIR / "camera_detect_tmp.jpg")
        with open(tmp, 'wb') as fh:
            fh.write(frame)
        img = cv2.imread(tmp)
        if img is None:
            return False
        gray = cv2.cvtColor(img, cv2_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(80, 80))
        return len(faces) > 0

    def close(self):
        self._stop = True

cam_mgr = CameraManager()

@app.get("/camera/stream")
async def camera_stream():
    return StreamingResponse(cam_mgr.stream_gen(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/camera/detect")
async def camera_detect():
    detected = cam_mgr.detect_face()
    return {"face_detected": detected}

@app.get("/camera/capture")
@app.post("/camera/capture")
async def camera_capture():
    frame = cam_mgr.capture()
    if not frame:
        return JSONResponse({"error": "Camera not available"}, status_code=503)
    return Response(content=frame, media_type="image/jpeg")


# ═══════════════════════════════════════════════════
#  🔧 Sensor Process Manager (Start/Stop on Demand)
# ═══════════════════════════════════════════════════

_sensor_procs = {}

def _start_sensor(script_name: str, label: str):
    """Start a sensor script with sudo if not already running."""
    if script_name in _sensor_procs and _sensor_procs[script_name].poll() is None:
        return False  # already running
    proc = subprocess.Popen(
        ["sudo", "python3", "-u", str(BASE_DIR / script_name)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    _sensor_procs[script_name] = proc
    print(f"[SENSOR] ▶️ Started: {label}")
    return True

def _stop_sensor(script_name: str, label: str):
    """Stop a sensor script if running."""
    if script_name in _sensor_procs:
        proc = _sensor_procs[script_name]
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=2)
            except: proc.kill()
        print(f"[SENSOR] ⏹️ Stopped: {label}")

def _stop_all_sensors():
    """Stop all sensor processes."""
    sensors = [
        ("hr_sensor.py", "Heart Rate"),
        ("temp_sensor.py", "Temperature"),
        ("gsr_sensor.py", "GSR"),
    ]
    for script, label in sensors:
        _stop_sensor(script, label)
    _sensor_procs.clear()
    print("[SENSOR] ⏹️ All sensors stopped")

@app.post("/api/sensors/start")
async def api_start_sensors():
    """Start sensor processes on demand."""
    sensors = [
        ("hr_sensor.py", "Heart Rate + SpO2"),
        ("temp_sensor.py", "Temperature"),
        ("gsr_sensor.py", "GSR Stress"),
    ]
    started = []
    for script, label in sensors:
        if _start_sensor(script, label):
            started.append(label)
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump({"sensor": "all", "state": "reading"}, f)
    except Exception:
        pass
    return {"status": "started", "sensors": started, "total": len(started)}

@app.post("/api/sensors/stop")
async def api_stop_sensors():
    """Stop all sensor processes."""
    _stop_all_sensors()
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump({"sensor": "all", "state": "idle"}, f)
    except Exception:
        pass
    return {"status": "stopped"}

@app.get("/api/sensors/status")
async def api_sensors_status():
    """Check which sensors are running."""
    status = {}
    for script, proc in _sensor_procs.items():
        status[script] = "running" if proc.poll() is None else "stopped"
    return {"sensors": status}


# ═══════════════════════════════════════════════════
#  🤖 تسجيل AI Chat Router (chat_routes.py v15)
# ═══════════════════════════════════════════════════
init_chat_db()
app.include_router(chat_router)


# ═══════════════════════════════════════════════════
#  ⚠️ Static Files — دايماً آخر سطر!
# ═══════════════════════════════════════════════════
app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="static")


# ═══════════════════════════════════════════════════
#  Startup & Shutdown
# ═══════════════════════════════════════════════════

@app.on_event("startup")
async def on_startup():
    app.state.start_time = time.time()
    set_robot_mode("idle")
    print(f"[SERVER] 🚀 MindRobot API v4.0 started")
    print(f"[SERVER]    🧠 Chat: chat_routes.py v16 (Technical-First Mind Persona)")
    print(f"[SERVER]    🔊 TTS:  {TTS_VOICE}")
    print(f"[SERVER]    📹 Camera: rpicam-vid")
    print(f"[SERVER]    📁 Patients + Quick Checks")
    print(f"[SERVER]    📧 Email: Gmail SMTP")
    print(f"[SERVER] Health: http://localhost:8000/api/status")

@app.on_event("shutdown")
async def on_shutdown():
    print("[SERVER] Shutting down...")
    cam_mgr.close()
    _stop_all_sensors()
    set_robot_mode("idle")
    print("[SERVER] Shutdown complete.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)