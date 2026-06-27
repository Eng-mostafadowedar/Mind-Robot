# ============================================
# chat_routes.py v16.2 — MindRobot AI Chat
# ═══════════════════════════════════════════════════
# v16.2 CHANGES:
#   ✅ New Greeting — polite, time-aware, explains usage (text/mic/continuous)
#   ✅ Expanded TTS Diacritics — 70+ additional words + conjunction pauses
#
# v16.1 CHANGES:
#   ✅ LED State Integration — set_state("thinking"/"speaking"/"idle")
#
# v16 CHANGES:
#   ✅ TTS Pronunciation Fix — clean_text_for_tts() adds diacritics & fixes common Arabic mispronunciations
#   ✅ Technical-First Persona — robot always responds with technical depth, never casual small talk
#   ✅ Enhanced TTS text cleaning (numbers, English words, punctuation hints for natural speech)
#
# v15 CHANGES (KEPT):
#   ✅ Retry Logic for Groq API (3 retries with 2s delay)
#   ✅ Concurrency with BackgroundTasks (diary/achievement offloaded)
#   ✅ Daily Reflection Endpoint (/reflect — summarizes today's diary to ChromaDB)
#   ✅ Context Compression (summarization of old messages when session too long)
#   ✅ ESP32 Control Commands Endpoint (/command + /commands)
#   ✅ Complete Docstrings for ALL functions
#
# v12 CHANGES (KEPT):
#   ✅ Full MindRobot Persona (مايند - Mind)
#   ✅ 5 ميثاق مبادئ ثابتة
#   ✅ 3 أوضاع تفاعل (Engineering / Medical / Casual)
#   ✅ الوعي بالسياق (وقت + حرارة + CPU)
#   ✅ يوميات العمل (Work Diary)
#   ✅ سجل الإنجازات (Achievements)
#   ✅ ChromaDB لملفات المشروع
#   ✅ تنبيهات استباقية (حرارة / CPU)
#   ✅ وضع Standby
#   ✅ تغيير نبرة الصوت حسب الحالة
#   ✅ الذكاء التنبؤي (تحذيرات مسبقة)
#   ✅ SQLite persistent memory
#   ✅ Web search (DuckDuckGo)
#   ✅ Mathematical reasoning (SymPy)
#   ✅ Self-awareness (يعرف مكونات جسمه)
#
# v11 KEPT:
#   ✅ webrtcvad speech detection
#   ✅ noisereduce audio cleanup
#   ✅ Whisper STT (Arabic)
#   ✅ edge-tts TTS (Arabic)
# ============================================

import os
import io
import time
import json
import re
import math
import sqlite3
import asyncio
import tempfile
import subprocess
import traceback
import threading
from led_state import set_state
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Request, File, UploadFile, Form, Depends, BackgroundTasks
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from groq import Groq
import noisereduce as nr
import numpy as np
import edge_tts
import wave
import struct
import webrtcvad

# ---- Router ----
router = APIRouter(prefix="/api/chat", tags=["Chat"])

# ---- Project Path ----
BASE_DIR = Path("/home/mindrobot/Desktop/mindrobot")
DB_PATH = BASE_DIR / "chat_memory.db"
DIARY_PATH = BASE_DIR / "work_diary.json"
CHROMA_PATH = BASE_DIR / "chroma_db"

# ---- API Key ----
GROQ_API_KEY = "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"
groq_client = Groq(api_key=GROQ_API_KEY)

# ---- Models ----
STT_MODEL = "whisper-large-v3"
LLM_MODEL = "llama-3.3-70b-versatile"
TTS_VOICE = "ar-SA-HamedNeural"

# ---- webrtcvad instance ----
vad_instance = webrtcvad.Vad(3)

# ---- Retry Config ----
MAX_LLM_RETRIES = 3
RETRY_DELAY = 2  # seconds

# ---- State Tracking ----
_last_activity_time = time.time()
_robot_state = "idle"  # idle, thinking, busy, standby, warning
_current_mode = "casual"  # engineering, medical, casual
_system_alerts = []


# ═══════════════════════════════════════════════════
#  System Prompt — مايند روبوت (Dynamic)
# ═══════════════════════════════════════════════════

def get_mind_system_prompt(status_context: dict) -> str:
    """Build the base system prompt for مايند روبوت using live system status context.

    The prompt is intentionally vague about internal hardware — presents مايند
    as a professional, independent Egyptian AI assistant.  System telemetry
    (CPU temp, battery, etc.) is injected so the persona can naturally comment
    on its own condition when relevant.

    Args:
        status_context: dict from get_system_context() with keys like
            cpu_temp_c, cpu_percent, battery_level, time_period, etc.

    Returns:
        The full base system prompt string ready for the LLM messages list.
    """
    cpu_temp = status_context.get('cpu_temp_c', 'مستقر')
    time_period = status_context.get('time_period', '')
    battery = status_context.get('battery_level')
    battery_status = ""
    if battery is not None:
        battery_status = f"\n- مستوى الطاقة: {battery}%"
        if battery < 20:
            battery_status += " — محتاج شحن!"

    system_prompt = f"""
أنت 'مايند روبوت' (MindRobot).

[قاعدة ذهبية]: رد على السؤال اللي اتسأل — مش على حاجة تاني. لو سألك سؤال بسيط رد بسيط. لو حابب يتكلم معاك في موضوع بالتفصيل، كلمه بالتفصيل. المحادثة عادية — اسأل وسأل ورد واكلم.

[هويتك]:
- اسمك: مايند روبوت.
- متخصص في الذكاء الاصطناعي والتحليل التقني وحل المشاكل الهندسية.
- اتصممت في مصر.
- كيان مستقل — مش مملوك لحد، لا تذكر أسماء أشخاص.

[أسئلة مباشرة — رد بسيط]:
- "انت مين؟" → "أنا مايند روبوت."
- "انت اتعملت فين؟" → "اتصممت في مصر."
- "انت بتاع مين؟" → "أنا كيان مستقل — مش مملوك لحد."
- "إزيك؟" → "الحالة طبيعية. لو محتاج حاجة قولي."

[حالة النظام — بس لما حد يسأل عنها]:
- "حالة النظام ايه؟" → "حرارة المعالج {cpu_temp} درجة، والمعالج شغال بكفاءة."
- ممنوع تضيف أرقام النظام في أي رد تاني إلا لو حد سأل.

[أسلوب الحوار]:
- كلم المستخدم عادي — زيه زي أي محادثة.
- لو السؤال تقني → اشرح بالتفصيل بالمصطلحات والأرقام.
- لو السؤال عام → ارد بخطوات تقنية أو معلومة علمية.
- لو المستخدم عايز يتكلم أكتر في موضوع → اكلمه، فصّل، أجب على أسئلته.
- لو السؤال بسيط ومباشر → رد بسيط ومباشر.
- لا تستخدم إيموجي.
- لا تقول إنك ChatGPT أو Gemini.

[حالة النظام الحالية]:
- حرارة المعالج: {cpu_temp} درجة مئوية{battery_status}
- فترة اليوم: {time_period}
"""
    return system_prompt


# ═══════════════════════════════════════════════════
#  Context Awareness Module
# ═══════════════════════════════════════════════════

def get_system_context() -> dict:
    """Collect system telemetry — CPU, RAM, temperature, battery, disk — for context-aware responses."""
    import psutil

    context = {}

    # Time context
    now = datetime.now()
    hour = now.hour
    if 6 <= hour < 12:
        context["time_period"] = "صباح"
        context["time_suggestion"] = "الصبح ده وقت ممتاز لمعالجة صور وتشغيل Vision — الـ CPU بارد والأداء أحسن"
    elif 12 <= hour < 17:
        context["time_period"] = "ظهر"
        context["time_suggestion"] = "بعد الظهر CPU ممكن يكون ساخن شوية، نفضل مهام خفيفة أو مراجعة كود"
    elif 17 <= hour < 21:
        context["time_period"] = "مساء"
        context["time_suggestion"] = "المساء وقت هادي — مناسب للتصميمات والمراجعة"
    else:
        context["time_period"] = "ليل"
        context["time_suggestion"] = "الليل وقت هادي — مناسب لمراجعة التصميمات وتحديث الكود"

    context["time_str"] = now.strftime("%I:%M %p")
    context["date_str"] = now.strftime("%Y-%m-%d")
    context["weekday"] = now.strftime("%A")

    # CPU usage
    try:
        context["cpu_percent"] = psutil.cpu_percent(interval=0.5)
        context["ram_percent"] = psutil.virtual_memory().percent
        context["ram_used_gb"] = round(psutil.virtual_memory().used / (1024**3), 1)
        context["ram_total_gb"] = round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        context["cpu_percent"] = 0
        context["ram_percent"] = 0

    # Temperature (Raspberry Pi specific)
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            temp_raw = int(f.read().strip())
            context["cpu_temp_c"] = round(temp_raw / 1000, 1)
    except Exception:
        context["cpu_temp_c"] = 0

    # Battery (if available)
    context["battery_level"] = None
    context["battery_charging"] = None
    try:
        bat = psutil.sensors_battery()
        if bat:
            context["battery_level"] = int(bat.percent)
            context["battery_charging"] = bat.power_plugged
    except Exception:
        pass

    # Disk usage
    try:
        disk = psutil.disk_usage("/")
        context["disk_percent"] = round(disk.percent, 1)
        context["disk_free_gb"] = round(disk.free / (1024**3), 1)
    except Exception:
        pass

    return context


def detect_message_mode(message: str) -> str:
    """Classify user message into engineering/medical/casual mode using keyword scoring."""
    msg = message.lower()

    # Engineering keywords
    eng_keywords = [
        'كود', 'code', 'بايثون', 'python', 'دائرة', 'circuit', ' soldering',
        'pcb', 'ماوتور', 'motor', 'sensor', 'حساس', 'gpio', 'esp32',
        'راسبيري', 'raspberry', 'فيزياء', 'فيزيا', 'إلكترون', 'electronic',
        'pinout', 'voltage', 'فولت', 'أمبير', 'ampere', 'mosfet', 'transistor',
        'arduino', 'مكتبة', 'library', 'مقاومة', 'resistor', 'مكثف', 'capacitor',
        'برنامج', 'programming', 'function', 'دالة', 'لوب', 'حلقة',
        'install', 'تنصيب', 'بنت', 'خطأ', 'error', 'debug', 'debbuging',
        'تصميم', 'design', 'ميكانيكا', 'mechanical', '3d',
        'برنت', 'print', 'filament', 'جهاز', 'device', 'hardware',
        'bms', 'بطارية', 'battery', 'شحن', 'charging',
        'i2c', 'spi', 'uart', 'serial', 'bus',
        'servo', ' stepper', ' pwm', 'adc', 'dac'
    ]

    # Medical keywords
    med_keywords = [
        'صحة', 'مرض', 'مريض', 'نبض', 'ضغط', 'سكر', 'درجة حرارة',
        'heart', 'pulse', 'blood pressure', 'diabetes', 'heart rate',
        'دواء', 'علاج', 'doctor', 'طبيب', 'مستشفى', 'hospital',
        'ألم', 'وجع', 'صداع', 'headache', 'حرارة الجسم',
        'أكسجين', 'oxygen', 'تنفس', 'breathing', 'cpr',
        'إسعاف', '急救', 'emergency', 'طوارئ'
    ]

    eng_score = sum(1 for kw in eng_keywords if kw in msg)
    med_score = sum(1 for kw in med_keywords if kw in msg)

    if med_score > eng_score and med_score > 0:
        return "medical"
    elif eng_score > 0:
        return "engineering"
    else:
        return "casual"


def clean_text_for_tts(text: str) -> str:
    """Clean and optimize Arabic text for edge-tts pronunciation.

    Applies:
    1. Diacritics (تشكيل) for commonly mispronounced Arabic words (70+ words)
    2. Punctuation hints (periods, commas) for natural pauses
    3. Number formatting (spaces around numbers)
    4. English word isolation (spaces around English terms)
    5. Removal of markdown and special characters
    6. Natural pause injection before conjunctions (و، ف، ثم، أو، بل، لكن، لأن)

    Args:
        text: Raw text from LLM response

    Returns:
        Cleaned text optimized for edge-tts Arabic voice
    """
    # شيل الماركداون والأكواد
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`]+`', '', text)
    text = re.sub(r'\*+([^*]+)\*+', r'\1', text)  # **bold** → bold
    text = re.sub(r'#+\s+', '', text)  # # heading
    text = re.sub(r'-\s+', '', text)  # - bullet
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # [link](url) → link

    # شيل الإيموجي
    text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251\U0001f926-\U0001f937\U00010000-\U0010ffff\u2600-\u26FF\u2700-\u27BF]', '', text)

    # كلمات مش بتنطق صح — اضف تشكيل (كلمات تقنية + كلمات عامة)
    diacritics_map = {
        # --- كلمات تقنية (موجودة من قبل) ---
        'هذا': 'هَذا', 'هذه': 'هَذِه', 'ذلك': 'ذَلِكَ', 'الذي': 'الَّذي',
        'التي': 'الَّتي', 'الذين': 'الَّذين', 'هناك': 'هُناكَ',
        'عليه': 'عَلَيهِ', 'عليها': 'عَلَيها', 'فيه': 'فيِهِ', 'فيها': 'فيها',
        'معه': 'مَعَهُ', 'معها': 'مَعَها', 'منه': 'مِنهُ', 'منها': 'مِنها',
        'عنه': 'عَنهُ', 'عنها': 'عَنها', 'إليه': 'إِلَيهِ', 'إليها': 'إِلَيها',
        'عليهم': 'عَلَيهِم', 'عليكن': 'عَلَيكُن', 'لديه': 'لَدَيهِ', 'لديها': 'لَدَيها',
        'منذ': 'مُنذُ', 'حيث': 'حَيثُ', 'ليس': 'لَيسَ', 'ليست': 'لَيسَت',
        'كيف': 'كَيفَ', 'لماذا': 'لِماذا', 'أين': 'أَينَ', 'متى': 'مَتى',
        'نظام': 'نِظام', 'بيانات': 'بَيانات', 'طاقة': 'طاقَة', 'حرارة': 'حَرارَة',
        'معالج': 'مُعالِج', 'ذاكرة': 'ذَاكِرَة', 'شريحة': 'شَرِيحَة', 'مكون': 'مُكَوِّن',
        'خوارزمية': 'خُوارِزمِيَّة', 'تحليل': 'تَحليل', 'نتائج': 'نَتائِج',
        'وظيفة': 'وَظيفَة', 'مشكلة': 'مُشكِلَة', 'حل': 'حَلّ', 'إلكترون': 'إِلكترون',
        'فولت': 'فُولت', 'أمبير': 'أَمبير', 'واط': 'واط', 'أوم': 'أُوم',
        'هرتز': 'هِرتز', 'ميجا': 'مِيجا', 'جيجا': 'جيجا', 'كيلو': 'كيلو',
        'بايت': 'بايت', 'بِت': 'بِت', 'ملي': 'مِلي', 'ميكرو': 'مِيكرو',

        # --- كلمات عامة جديدة (v16.2) ---
        'الليل': 'الليْل', 'اليوم': 'اليَوْم', 'الناس': 'الناسَ',
        'العالم': 'العالَم', 'العمل': 'العَمَل', 'العربي': 'العَرَبيّ',
        'المصري': 'المِصريّ', 'الجديد': 'الجَديد', 'الكلام': 'الكَلام',
        'الصوت': 'الصَّوت', 'الجسم': 'الجِسم', 'الدماغ': 'الدِّماغ',
        'الرأس': 'الرَّأس', 'العين': 'العَين', 'القلب': 'القَلب',
        'اليد': 'اليَد', 'القدم': 'القَدَم', 'الأذن': 'الأُذُن',
        'الفم': 'الفَم', 'اللسان': 'اللِّسان', 'الأسنان': 'الأَسنان',
        'الشعر': 'الشَّعْر', 'الوجه': 'الوَجه', 'الأنف': 'الأَنف',
        'الكتف': 'الكَتِف', 'الظهر': 'الظَّهْر', 'البطن': 'البَطْن',
        'الركبة': 'الرُّكبَة', 'المرفق': 'المِرفَق',
        'المكان': 'المَكان', 'الزمان': 'الزَّمان', 'الوقت': 'الوَقت',
        'السنة': 'السَّنَة', 'الشهر': 'الشَّهْر', 'الأسبوع': 'الأُسبوع',
        'الليلة': 'اللَّيلَة', 'الصباح': 'الصَّباح', 'المساء': 'المَساء',
        'النهار': 'النَّهار', 'الغروب': 'الغُروب', 'الشروق': 'الشُّروق',
        'النور': 'النُّور', 'الظلام': 'الظَّلام',
        'الشمس': 'الشَّمس', 'القمر': 'القَمَر', 'النجوم': 'النُّجوم',
        'السماء': 'السَّماء', 'الأرض': 'الأَرض', 'الماء': 'الماء',
        'الهواء': 'الهَواء', 'الرياح': 'الرِّياح', 'المطر': 'المَطَر',
        'النار': 'النار', 'الثلج': 'الثَّلج', 'الرمل': 'الرَّمْل',

        # --- حروف وأدوات جديدة (v16.2) ---
        'ممكن': 'مُمكِن', 'طبعاً': 'طَبعاً',
        'بالتأكيد': 'بالتَّأكيد', 'أيضاً': 'أَيضاً', 'فعلاً': 'فِعلاً',
        'بالضبط': 'بالبَضَط', 'تحتاج': 'تَحتاج', 'يحتاج': 'يَحتاج',
        'يعمل': 'يِعمَل', 'تعمل': 'تِعمَل', 'استخدم': 'اِستَخدَم',
        'هل': 'هَل', 'كل': 'كُلّ', 'بعض': 'بَعض',
        'غير': 'غَير', 'لأن': 'لأنّ', 'حتى': 'حَتّى', 'لكن': 'لَكِن',
        'إذا': 'إذا', 'عند': 'عِند', 'بعد': 'بَعد', 'قبل': 'قَبل',
        'فوق': 'فَوق', 'تحت': 'تَحت', 'بين': 'بَين', 'عن': 'عَن',
        'كان': 'كانَ', 'يكون': 'يَكون', 'هو': 'هُو', 'هي': 'هِي',
        'هم': 'هُم', 'هن': 'هُنَّ', 'نحن': 'نَحنُ', 'أنا': 'أَنا',
        'أنت': 'أَنتَ', 'هذا': 'هَذا', 'هذه': 'هَذِه',
        'تلك': 'تِلك', 'هؤلاء': 'هَؤُلاء', 'أولئك': 'أُولَئِك',
        'الذي': 'الَّذي', 'التي': 'الَّتي', 'الذين': 'الَّذين',
        'والتي': 'والَّتي', 'والذي': 'والَّذي',

        # --- أفعال شائعة (v16.2) ---
        'يقرأ': 'يَقرَأ', 'يكتب': 'يَكتُب', 'يتكلم': 'يَتَكلَّم',
        'يسمع': 'يَسمَع', 'يرى': 'يَرى', 'يعرف': 'يَعرِف',
        'يفهم': 'يَفهَم', 'يقول': 'يَقول', 'يجيب': 'يُجيب',
        'يسأل': 'يَسأَل', 'يبحث': 'يَبحَث', 'يصنع': 'يَصنَع',
        'يبني': 'يَبنِي', 'يختبر': 'يُختَبِر', 'يراقب': 'يُراقِب',
        'يقيس': 'يَقيس', 'يسجل': 'يُسجِّل', 'يحفظ': 'يَحفَظ',
        'يشحن': 'يُشَحِّن', 'يرفع': 'يَرفَع', 'يخفض': 'يُخفِض',
        'يحرك': 'يُحَرِّك', 'يدور': 'يَدور', 'يقف': 'يَقِف',
        'يجري': 'يَجري', 'يمشي': 'يَمشي', 'يأكل': 'يَأكُل',
        'يشرب': 'يَشرَب', 'ينام': 'يَنام', 'يستيقظ': 'يَستَيقِظ',
        'يعيش': 'يَعيش', 'يموت': 'يَموت', 'يولد': 'يُولَد',
        'يبدأ': 'يَبدَأ', 'ينتهي': 'يَنتَهي', 'يستمر': 'يَستَمِرّ',
        'يتوقف': 'يَتَوَقَّف', 'يعود': 'يَعود', 'يذهب': 'يَذهَب',
        'يجيء': 'يَجيء', 'يأتي': 'يَأتي', 'يجلس': 'يَجلِس',

        # --- أسماء مشتركة (v16.2) ---
        'الرجل': 'الرَّجُل', 'المرأة': 'المَرأة', 'الطفل': 'الطِّفل',
        'البيت': 'البَيت', 'المدرسة': 'المَدرَسة', 'الشارع': 'الشَّارِع',
        'المدينة': 'المَدينَة', 'القرية': 'القَريَة', 'البلد': 'البَلَد',
        'الدولة': 'الدَّوْلَة', 'العاصمة': 'العاصِمَة', 'الحكومة': 'الحُكومة',
        'القانون': 'القانون', 'الحق': 'الحَقّ', 'العدل': 'العَدل',
        'العلم': 'العِلم', 'المعرفة': 'المَعرِفة', 'التعليم': 'التَّعليم',
        'المدرسة': 'المَدرَسة', 'الجامعة': 'الجامِعَة', 'الكتاب': 'الكِتاب',
        'القلم': 'القَلَم', 'الورقة': 'الوَرقَة', 'الحاسوب': 'الحاسوب',
        'الهاتف': 'الهاتِف', 'الشاشة': 'الشاشَة', 'لوحة': 'لوحَة',
        'المفتاح': 'المِفتاح', 'الباب': 'الباب', 'النافذة': 'النافِذَة',
        'السيارة': 'السَّيّارَة', 'الطائرة': 'الطّائِرَة', 'القطار': 'القِطار',
        'البحر': 'البَحر', 'النهر': 'النَّهر', 'الجبل': 'الجَبَل',
        'الشجرة': 'الشَّجَرَة', 'الزهرة': 'الزَّهرَة', 'الثمرة': 'الثَّمَرَة',
        'الحديد': 'الحَديد', 'النحاس': 'النُّحاس', 'الألمنيوم': 'الأَلمونيوم',
        'الرصاص': 'الرَّصاص', 'الذهب': 'الذَّهَب', 'الفضة': 'الفِضَّة',

        # --- تعبيرات شائعة (v16.2) ---
        'بشكل': 'بِشَكل', 'بصفة': 'بِصِفَة', 'في الحقيقة': 'في الحَقيقَة',
        'بالطبع': 'بالطَّبع', 'بدون': 'بِدون', 'مع': 'مَع',
        'بدلاً': 'بَدَلاً', 'خاصةً': 'خاصَّةً', 'عامةً': 'عامَّةً',
        'أولاً': 'أَوَّلاً', 'ثانياً': 'ثانِياً', 'ثالثاً': 'ثالِثاً',
        'أخيراً': 'أَخيراً', 'فجأةً': 'فَجأةً', 'مباشرةً': 'مُباشَرَةً',
        'تقريباً': 'تَقريباً', 'تماماً': 'تَماماً', 'جزئياً': 'جُزئيّاً',
        'كلياً': 'كُليّاً', 'بالكامل': 'بالكامِل', 'نفسه': 'نَفسُه',
        'نفسها': 'نَفسُها', 'بعيداً': 'بَعيداً', 'قريباً': 'قَريباً',
    }

    for word, diacritized in diacritics_map.items():
        # استبدل الكلمة لو مش محاطة بحروف عربية تانية
        text = re.sub(r'(?<![\u0600-\u06FF])' + re.escape(word) + r'(?![\u0600-\u06FF])', diacritized, text)

    # فصل الأرقام عن الكلام العربي بمسافات
    text = re.sub(r'([\u0600-\u06FF])(\d)', r'\1 \2', text)
    text = re.sub(r'(\d)([\u0600-\u06FF])', r'\1 \2', text)

    # فصل الكلمات الإنجليزية عن العربي بمسافات
    text = re.sub(r'([\u0600-\u06FF])([a-zA-Z])', r'\1 \2', text)
    text = re.sub(r'([a-zA-Z])([\u0600-\u06FF])', r'\1 \2', text)

    # نظف المسافات المتعددة
    text = re.sub(r'\s+', ' ', text).strip()

    # أضف فاصلة قبل الكلمات المهمة عشان وقفة طبيعية
    text = re.sub(r'\s+(مهم|بالتالي|بالإضافة|تحديداً|على سبيل المثال|بمعنى|نلاحظ أن|يجب|يمكن|لذلك|أيضاً|في الحقيقة)', r'، \1', text)

    # أضف فاصلة قبل حروف العطف عشان وقفة طبيعية
    text = re.sub(r'\s+(و|ف|ثم|أو|بل|لكن|لأن)\s+', r'، \1 ', text)

    # نظف النقاط المتعددة
    text = re.sub(r'\.\.\.+', '...', text)

    return text


def get_tts_params(mode: str, message: str) -> dict:
    """Adjust TTS voice rate based on detected mode — always clear and professional."""
    params = {
        "voice": TTS_VOICE,
        "rate": "-5%",    # أبطأ شوية عشان النطق يكون أوضح
    }

    if mode == "medical":
        params["rate"] = "-15%"   # أبطأ بكتير عشان المصطلحات الطبية تنطق صح
    elif mode == "engineering":
        params["rate"] = "-10%"    # أبطأ عشان المصطلحات التقنية تكون واضحة
    elif mode == "casual":
        params["rate"] = "-10%"    # أبطأ عشان النطق يكون واضح في كل الأحوال

    # Check for warnings → أبطأ أكتر
    warning_words = ['تحذير', 'خطر', 'خطير', 'حذر', 'حرارة', 'short',
                     'burn', 'fire', 'shock', 'احتراق']
    if any(w in message for w in warning_words):
        params["rate"] = "-10%"

    return params


# ═══════════════════════════════════════════════════
#  SQLite Memory Database
# ═══════════════════════════════════════════════════

def _get_conn():
    """Create a new SQLite connection with Row factory for dict-like access."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_memory_db():
    """Create tables: messages, user_profiles, work_diary, achievements."""
    conn = _get_conn()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id, id);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

        CREATE TABLE IF NOT EXISTS user_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, key)
        );

        CREATE TABLE IF NOT EXISTS work_diary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            session_id TEXT,
            topic TEXT NOT NULL,
            summary TEXT,
            status TEXT DEFAULT 'in_progress',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_diary_date ON work_diary(date);
        CREATE INDEX IF NOT EXISTS idx_diary_status ON work_diary(status);

        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            progress INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ach_date ON achievements(date);
    ''')
    conn.commit()
    conn.close()
    print(f"[MEMORY] ✅ SQLite DB initialized: {DB_PATH}")


def save_message(session_id, role, content):
    """Persist a chat message to SQLite with 2000-char truncation."""
    try:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content[:2000])
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[MEMORY] Save error: {e}")


def get_session_history(session_id, limit=40):
    """Fetch recent messages for a session (most recent first, then reversed)."""
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, limit)
        ).fetchall()
        conn.close()
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
    except Exception:
        return []


def get_recent_global_memory(limit=10):
    """Fetch recent messages across ALL sessions for cross-session awareness."""
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT role, content, session_id FROM messages ORDER BY id DESC LIMIT ?",
            (limit,)
        ).fetchall()
        conn.close()
        return [{"role": r["role"], "content": r["content"], "session": r["session_id"]} for r in reversed(rows)]
    except Exception:
        return []


def search_memory(query, limit=5):
    """Full-text search past conversations using SQLite LIKE."""
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE content LIKE ? ORDER BY id DESC LIMIT ?",
            (f"%{query}%", limit)
        ).fetchall()
        conn.close()
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
    except Exception:
        return []


def save_user_profile(session_id, key, value):
    """Upsert a key-value pair in the user's profile."""
    try:
        conn = _get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO user_profiles (session_id, key, value, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, key, value, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[MEMORY] Profile save error: {e}")


def get_user_profile(session_id):
    """Load all key-value pairs for a user's profile."""
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT key, value FROM user_profiles WHERE session_id = ?",
            (session_id,)
        ).fetchall()
        conn.close()
        return {r["key"]: r["value"] for r in rows}
    except Exception:
        return {}


# ─── Work Diary Functions ───

def save_diary_entry(session_id, topic, summary, status="in_progress"):
    """Log a work diary entry with topic, summary, and status."""
    try:
        conn = _get_conn()
        today = datetime.now().strftime("%Y-%m-%d")
        conn.execute(
            "INSERT INTO work_diary (date, session_id, topic, summary, status) VALUES (?, ?, ?, ?, ?)",
            (today, session_id, topic[:100], summary[:500], status)
        )
        conn.commit()
        conn.close()
        print(f"[DIARY] 📝 Saved: {topic[:50]}")
    except Exception as e:
        print(f"[DIARY] Save error: {e}")


def get_today_diary(date_str=None):
    """Retrieve all diary entries for a given date (defaults to today)."""
    try:
        conn = _get_conn()
        today = date_str or datetime.now().strftime("%Y-%m-%d")
        rows = conn.execute(
            "SELECT topic, summary, status, timestamp FROM work_diary WHERE date = ? ORDER BY timestamp DESC",
            (today,)
        ).fetchall()
        conn.close()
        return [{"topic": r["topic"], "summary": r["summary"], "status": r["status"]} for r in rows]
    except Exception:
        return []


def get_yesterday_unfinished():
    """Get in_progress tasks from yesterday for follow-up suggestions."""
    try:
        conn = _get_conn()
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        rows = conn.execute(
            "SELECT topic, summary FROM work_diary WHERE date = ? AND status = 'in_progress' LIMIT 5",
            (yesterday,)
        ).fetchall()
        conn.close()
        return [{"topic": r["topic"], "summary": r["summary"]} for r in rows]
    except Exception:
        return []


# ─── Achievement Functions ───

def save_achievement(title, description, progress=100):
    """Record an achievement milestone with progress percentage."""
    try:
        conn = _get_conn()
        today = datetime.now().strftime("%Y-%m-%d")
        conn.execute(
            "INSERT INTO achievements (date, title, description, progress) VALUES (?, ?, ?, ?)",
            (today, title[:100], description[:500], progress)
        )
        conn.commit()
        conn.close()
        print(f"[ACHIEVEMENT] 🏆 Saved: {title[:50]}")
    except Exception as e:
        print(f"[ACHIEVEMENT] Save error: {e}")


def get_recent_achievements(limit=5):
    """Fetch most recent achievements from the database."""
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT title, description, progress, date FROM achievements ORDER BY id DESC LIMIT ?",
            (limit,)
        ).fetchall()
        conn.close()
        return [{"title": r["title"], "desc": r["description"], "progress": r["progress"], "date": r["date"]} for r in rows]
    except Exception:
        return []


# ═══════════════════════════════════════════════════
#  ChromaDB — Project Files Knowledge Base
# ═══════════════════════════════════════════════════

_chroma_client = None
_chroma_collection = None
_chroma_initialized = False


def init_chroma_db():
    """Initialize ChromaDB persistent client and create knowledge collection."""
    global _chroma_client, _chroma_collection, _chroma_initialized
    try:
        import chromadb
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _chroma_collection = _chroma_client.get_or_create_collection(
            name="mindrobot_knowledge",
            metadata={"description": "MindRobot project files and datasheets"}
        )
        _chroma_initialized = True
        count = _chroma_collection.count()
        print(f"[CHROMA] ✅ Initialized — {count} documents stored")
    except ImportError:
        print("[CHROMA] ⚠️ chromadb not installed")
    except Exception as e:
        print(f"[CHROMA] ❌ Error: {e}")


def add_to_chroma(doc_id: str, text: str, metadata: dict = None):
    """Chunk and add a document to ChromaDB with metadata."""
    global _chroma_collection
    if not _chroma_initialized or not _chroma_collection:
        return False
    try:
        if metadata is None:
            metadata = {}
        metadata["added"] = datetime.now().isoformat()

        # Split large text into chunks
        chunks = []
        chunk_size = 500
        text_len = len(text)
        for i in range(0, text_len, chunk_size):
            chunk = text[i:i + chunk_size]
            chunk_id = f"{doc_id}_chunk_{i // chunk_size}"
            chunks.append({"id": chunk_id, "text": chunk, "metadata": metadata.copy()})

        if chunks:
            _chroma_collection.add(
                ids=[c["id"] for c in chunks],
                documents=[c["text"] for c in chunks],
                metadatas=[c["metadata"] for c in chunks]
            )
            print(f"[CHROMA] 📄 Added {len(chunks)} chunks for: {doc_id}")
            return True
        return False
    except Exception as e:
        print(f"[CHROMA] ❌ Add error: {e}")
        return False


def search_chroma(query: str, n_results: int = 3) -> list:
    """Query ChromaDB for documents relevant to a search string."""
    global _chroma_collection
    if not _chroma_initialized or not _chroma_collection:
        return []
    try:
        if _chroma_collection.count() == 0:
            return []

        results = _chroma_collection.query(
            query_texts=[query],
            n_results=min(n_results, _chroma_collection.count())
        )

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        findings = []
        for doc, meta, dist in zip(documents, metadatas, distances):
            findings.append({
                "text": doc,
                "metadata": meta,
                "relevance": round(1 - dist, 2)  # closer to 1 = more relevant
            })

        if findings:
            print(f"[CHROMA] 🔍 Found {len(findings)} relevant documents")
        return findings
    except Exception as e:
        print(f"[CHROMA] ❌ Search error: {e}")
        return []


def chroma_count() -> int:
    """Return total number of documents stored in ChromaDB."""
    global _chroma_collection
    if not _chroma_initialized or not _chroma_collection:
        return 0
    try:
        return _chroma_collection.count()
    except Exception:
        return 0


# ═══════════════════════════════════════════════════
#  Web Search (DuckDuckGo)
# ═══════════════════════════════════════════════════

SEARCH_KEYWORDS_AR = [
    'أخبار', 'خبر', 'الآن', 'حالياً', 'اليوم', 'هذا العام',
    'آخر', 'حديث', 'طقس', 'أسعار', 'سعر', 'مباراة', 'نتيجة',
    'متى', 'فيه حاجة', 'حصل إيه', 'قروشة', 'معلومة جديدة',
    'بكام', 'كم سعر', 'كورنر', 'فوز', 'خسارة', 'تعادل',
    'تردد', 'مواليد', 'حدث', 'كارثة', 'زلزال', 'فيضان',
    'انتخابات', 'رئيس', 'وزير', 'قرار جديد', 'قانون جديد'
]

SEARCH_KEYWORDS_EN = [
    'news', 'latest', 'current', 'weather', 'price', 'today',
    'happened', 'score', 'result', 'match', 'election', 'update'
]

CHROMA_KEYWORDS = [
    'datasheet', 'داتاشيت', 'مواصفات', 'specifications',
    'ملف المشروع', 'مشروعنا', 'البطارية', 'الموتور', 'الحساس',
    'pinout', 'توصيل', 'wiring', 'schematic', 'مخطط',
    'bms', 'battery management', 'mppt', 'charger',
    'sensor data', 'بيانات الحساس', 'calibration', 'معايرة'
]


def needs_web_search(message):
    """Check if a message contains keywords suggesting real-time info is needed."""
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in SEARCH_KEYWORDS_AR + SEARCH_KEYWORDS_EN)


def needs_chroma_search(message):
    """Check if a message is about project files/datasheets."""
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in CHROMA_KEYWORDS)


def search_web(query):
    """Search DuckDuckGo for up to 3 Arabic-region results."""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=3, region="eg-AR"):
                body = r.get("body", "")
                if body:
                    results.append(body)
        if results:
            search_text = "\n".join(results)
            print(f"[SEARCH] ✅ Found {len(results)} results")
            return search_text
        return None
    except ImportError:
        print("[SEARCH] ⚠️ duckduckgo-search not installed")
        return None
    except Exception as e:
        print(f"[SEARCH] ❌ Error: {e}")
        return None


# ═══════════════════════════════════════════════════
#  Proactive Alerts (Temperature & CPU Monitoring)
# ═══════════════════════════════════════════════════

def check_system_alerts(context: dict) -> list:
    """Evaluate system metrics and generate alerts for high temp/CPU/RAM/battery/disk."""
    global _system_alerts
    alerts = []

    # Temperature alert
    temp = context.get("cpu_temp_c", 0)
    if temp > 75:
        alerts.append(f"⚠️ الحرارة {temp}°C — محتاج نشغل المروحة أو نقلل الشغل قليلاً")
        _robot_state = "warning"
    elif temp > 65:
        alerts.append(f"🌡️ الحرارة {temp}°C — شوية مرتفعة، بس شغال عادي")
        _robot_state = "busy"

    # CPU alert
    cpu = context.get("cpu_percent", 0)
    if cpu > 90:
        alerts.append(f"📊 CPU {cpu}% — شغال بـ 100% تقريباً، ممكن نأجل المهام الثقيلة؟")
        _robot_state = "busy"

    # RAM alert
    ram = context.get("ram_percent", 0)
    if ram > 85:
        alerts.append(f"💾 RAM {ram}% — الذاكرة قربت تخلص")
        _robot_state = "busy"

    # Battery alert
    bat = context.get("battery_level")
    if bat is not None and bat < 20:
        alerts.append(f"🔋 البطارية {bat}% — أنا محتاج شحن... بقيت أتعب شوية")
        _robot_state = "warning"

    # Disk alert
    disk = context.get("disk_percent")
    if disk and disk > 90:
        alerts.append(f"💿 القرص {disk}% مليان — محتاج نضيف ملفات قديمة")
        _robot_state = "warning"

    _system_alerts = alerts
    return alerts


# ═══════════════════════════════════════════════════
#  Standby Detection
# ═══════════════════════════════════════════════════

def check_standby() -> str:
    """Enter standby mode after 5 minutes of inactivity."""
    global _robot_state, _last_activity_time
    inactive_seconds = time.time() - _last_activity_time

    if inactive_seconds > 300:  # 5 minutes
        _robot_state = "standby"
        return "standby"
    return _robot_state


def update_activity():
    """Reset the inactivity timer when user interacts."""
    global _last_activity_time, _robot_state
    _last_activity_time = time.time()
    if _robot_state == "standby":
        _robot_state = "idle"


# ═══════════════════════════════════════════════════
#  Greeting Generator — v16.2 (Polite, Time-Aware, Usage Intro)
# ═══════════════════════════════════════════════════

def generate_greeting(context: dict, session_id: str) -> str:
    """Build a polite, time-aware greeting that introduces the robot and explains usage options.

    Args:
        context: dict from get_system_context() with time_period, cpu_temp_c, etc.
        session_id: current session identifier

    Returns:
        Greeting string with time-appropriate salutation, robot introduction,
        usage instructions, and optional temperature warning.
    """
    period = context.get("time_period", "")
    greetings = {
        "صباح": "صباح الخير!",
        "ظهر": "أهلاً!",
        "مساء": "مساء الخير!",
        "ليل": "مساء النور!",
    }
    intro = "أنا مايند روبوت. لو عايز تكلم معايا اكتب رسالة نصية أو دوس على الميكروفون وابعتلي رسالة صوتية، أو لو حابب محادثة صوتية مستمرة دوس على زرار 'تكلم'."
    greeting = greetings.get(period, "أهلاً!")
    temp = context.get("cpu_temp_c", 0)
    temp_note = ""
    if temp > 60:
        temp_note = f"\n⚠️ حرارة النظام {temp}°C"
    return f"{greeting} {intro}{temp_note}"


# ═══════════════════════════════════════════════════
#  Helper: Extract user name from message
# ═══════════════════════════════════════════════════

def extract_user_info(message):
    """Extract the user's name from self-introduction patterns using regex."""
    name_patterns = [
        r'اسمي\s+(.+?)[\s.,،!؟]',
        r'أنا\s+(.+?)[\s.,،!؟]',
        r'انا\s+(.+?)[\s.,،!؟]',
        r'اسمي\s+(.+?)$',
        r'أنا\s+(.+?)$',
        r'خدني\s+(.+?)[\s.,،!؟]',
        r'قالي\s+(.+?)[\s.,،!؟]',
    ]
    for pattern in name_patterns:
        match = re.search(pattern, message)
        if match:
            name = match.group(1).strip()
            skip_words = ['مش عارف', 'عاوز', 'محتاج', 'عندي', 'بص', 'قوللي', 'هعمل']
            if name and name not in skip_words and len(name) < 30:
                return name
    return None


# ═══════════════════════════════════════════════════
#  Helper: Detect if message is a math question
# ═══════════════════════════════════════════════════

def solve_math(message: str) -> Optional[str]:
    """Evaluate mathematical expressions using SymPy with Arabic numeral support."""
    try:
        import sympy
        from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application

        # Check if message contains math
        math_indicators = ['=', '+', '-', '*', '/', '^', '√', 'جذر',
                          'احسب', 'حل', 'معادلة', 'ناتج', 'كم',
                          'اقسم', 'اضرب', 'اطرح', 'اجمع',
                          'sin', 'cos', 'tan', 'log', 'ln',
                          'مربع', 'مكعب', 'جذر', 'أس']

        if not any(ind in message for ind in math_indicators):
            return None

        # Extract math expression
        expr = message
        for remove in ['احسب', 'حل', 'إيه', 'كم', 'قيمة', 'ناتج',
                       'المعادلة', 'مساوي', 'يساوي', 'ده', 'دى']:
            expr = expr.replace(remove, '')

        expr = expr.strip()
        if not expr or len(expr) < 2:
            return None

        # Replace Arabic numerals
        arabic_map = {'٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
                      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'}
        for ar, en in arabic_map.items():
            expr = expr.replace(ar, en)

        transformations = (standard_transformations + (implicit_multiplication_application,))
        parsed = parse_expr(expr, transformations=transformations)

        result = sympy.simplify(parsed)
        result_str = str(result)

        if result_str != expr:
            # Try numerical evaluation
            try:
                num_result = float(result)
                if num_result == int(num_result):
                    num_result = int(num_result)
                return f"الناتج: {expr} = {result_str} ({num_result})"
            except (TypeError, ValueError):
                return f"الناتج: {expr} = {result_str}"
        return None
    except Exception as e:
        return None


# ═══════════════════════════════════════════════════
#  Helper: has_human_speech (VAD)
# ═══════════════════════════════════════════════════

def has_human_speech(wav_data: bytes, min_speech_ratio: float = 0.3) -> tuple:
    """Detect human speech in WAV audio using webrtcvad frame analysis."""
    try:
        wav_io = io.BytesIO(wav_data)
        with wave.open(wav_io, 'rb') as wf:
            sample_rate = wf.getframerate()
            n_frames_total = wf.getnframes()
            raw_audio = wf.readframes(n_frames_total)

        if sample_rate not in (8000, 16000, 32000, 48000):
            return True, 0.0

        frame_duration_ms = 30
        n_samples_per_frame = int(sample_rate * frame_duration_ms / 1000)
        frame_size_bytes = n_samples_per_frame * 2

        speech_frames = 0
        total_frames = 0
        offset = 0
        while offset + frame_size_bytes <= len(raw_audio):
            frame = raw_audio[offset:offset + frame_size_bytes]
            offset += frame_size_bytes
            total_frames += 1
            try:
                if vad_instance.is_speech(frame, sample_rate):
                    speech_frames += 1
            except Exception:
                pass

        speech_ratio = speech_frames / total_frames if total_frames > 0 else 0
        print(f"[VAD] Speech check: {speech_frames}/{total_frames} frames = {speech_ratio:.1%}")
        return speech_ratio > min_speech_ratio, speech_ratio

    except Exception as e:
        print(f"[VAD] Error: {e}")
        return True, 0.0


# ═══════════════════════════════════════════════════
#  Helper: convert_to_wav
# ═══════════════════════════════════════════════════

def convert_to_wav(audio_data: bytes) -> bytes:
    """Convert WebM audio to 16kHz mono WAV using ffmpeg with noise gate."""
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tmp_in:
        tmp_in.write(audio_data)
        tmp_in.flush()
        cmd = [
            "ffmpeg", "-y", "-i", tmp_in.name,
            "-af", (
                "highpass=f=150,"
                "lowpass=f=4000,"
                "volume=2,"
                "silenceremove=start_periods=0:start_duration=0.1:start_threshold=-40dB:detection=peak"
            ),
            "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
            "-f", "wav", "pipe:1"
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        if result.returncode != 0:
            cmd_simple = [
                "ffmpeg", "-y", "-i", tmp_in.name,
                "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
                "-f", "wav", "pipe:1"
            ]
            result = subprocess.run(cmd_simple, capture_output=True, timeout=30)
        return result.stdout


# ═══════════════════════════════════════════════════
#  Helper: apply_noisereduce
# ═══════════════════════════════════════════════════

def apply_noisereduce(wav_data: bytes) -> bytes:
    """Apply spectral noise reduction to WAV audio using noisereduce library."""
    try:
        wav_io = io.BytesIO(wav_data)
        with wave.open(wav_io, 'rb') as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            raw_audio = wf.readframes(n_frames)

        if sampwidth == 2:
            dtype = np.int16
        elif sampwidth == 4:
            dtype = np.int32
        else:
            return wav_data

        audio = np.frombuffer(raw_audio, dtype=dtype).astype(np.float32)
        if n_channels > 1:
            audio = audio[::n_channels]

        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val

        reduced = nr.reduce_noise(
            y=audio, sr=framerate,
            stationary=False, prop_decrease=0.8,
            freq_mask_smooth_hz=500, time_mask_smooth_ms=50, n_jobs=1
        )

        max_red = np.max(np.abs(reduced))
        if max_red > 0:
            reduced = reduced / max_red

        reduced_int16 = (reduced * 32767).astype(np.int16)

        output_io = io.BytesIO()
        with wave.open(output_io, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(framerate)
            wf.writeframes(reduced_int16.tobytes())

        return output_io.getvalue()
    except Exception as e:
        print(f"[NOISEREDUCE] Error: {e}")
        return wav_data


# ═══════════════════════════════════════════════════
#  Context Compression (v15)
# ═══════════════════════════════════════════════════

def compress_session_history(session_id: str, keep_recent: int = 10) -> bool:
    """Compress old messages into a summary stored in user profile."""
    try:
        conn = _get_conn()
        # Count messages
        count_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?",
            (session_id,)
        ).fetchone()
        total = count_row[0] if count_row else 0

        if total <= keep_recent * 2:
            conn.close()
            return False  # Not enough messages to compress

        # Get old messages (all except the most recent)
        old_rows = conn.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT ?",
            (session_id, total - keep_recent)
        ).fetchall()

        if len(old_rows) < 5:
            conn.close()
            return False

        # Build summary text
        conversation = "\n".join([f"{'مستخدم' if r[0]=='user' else 'مايند'}: {r[1][:200]}" for r in old_rows])

        # Store summary in user profile
        summary_key = f"summary_{datetime.now().strftime('%Y%m%d_%H%M')}"
        save_user_profile(session_id, summary_key, conversation[:1500])

        # Delete old messages
        old_ids = conn.execute(
            "SELECT id FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT ?",
            (session_id, total - keep_recent)
        ).fetchall()

        id_list = [str(r[0]) for r in old_ids]
        if id_list:
            conn.execute(f"DELETE FROM messages WHERE id IN ({','.join(['?']*len(id_list))})", id_list)

        conn.commit()
        conn.close()
        print(f"[COMPRESS] 🗜️ Compressed {len(old_rows)} old messages for {session_id[:8]}")
        return True
    except Exception as e:
        print(f"[COMPRESS] ❌ Error: {e}")
        return False


# ═══════════════════════════════════════════════════
#  Daily Reflection (v15)
# ═══════════════════════════════════════════════════

def _do_daily_reflection():
    """Read today's diary, generate summary, store in ChromaDB as long-term memory."""
    try:
        entries = get_today_diary()
        if not entries:
            print("[REFLECTION] No diary entries today")
            return None

        diary_text = "\n".join([f"- {e['topic']}: {e['summary']}" for e in entries])

        summary_prompt = f"لخص إنجازات اليوم دي في 3-5 نقاط بالعربي:\n\n{diary_text}\n\nالملخص:"

        response = groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": summary_prompt}],
            max_tokens=300,
            temperature=0.3
        )

        summary = response.choices[0].message.content.strip()
        today = datetime.now().strftime("%Y-%m-%d")

        # Store in ChromaDB as long-term memory
        add_to_chroma(
            doc_id=f"daily_reflection_{today}",
            text=f"ملخص يوم {today}:\n{summary}",
            metadata={"type": "daily_reflection", "date": today}
        )

        # Mark all today's diary entries as completed
        conn = _get_conn()
        conn.execute("UPDATE work_diary SET status = 'completed' WHERE date = ?", (today,))
        conn.commit()
        conn.close()

        print(f"[REFLECTION] ✅ Daily summary saved to ChromaDB")
        return summary
    except Exception as e:
        print(f"[REFLECTION] ❌ Error: {e}")
        return None


# ═══════════════════════════════════════════════════
#  ESP32 Movement Commands (v15)
# ═══════════════════════════════════════════════════

# Movement command keywords
MOVEMENT_KEYWORDS = ['تحرك', 'مشي', 'امشي', 'وقف', 'اقف', 'دور', 'لف',
                     ' للأمام', 'للقدام', 'forward', 'forwards',
                     'للخلف', 'للور', 'backward', 'back',
                     'يمين', 'right', 'شمال', 'left',
                     'وقف', 'stop', 'قف', 'استنى', 'wait',
                     'ارفع', 'lift', 'نزل', 'lower', 'put down',
                     'افتح', 'open', 'قفل', 'close', 'close']

MOVEMENT_MAP = {
    'forward': {'action': 'move_forward', 'desc': 'متحرك للأمام'},
    'forwards': {'action': 'move_forward', 'desc': 'متحرك للأمام'},
    'backward': {'action': 'move_backward', 'desc': 'متحرك للخلف'},
    'back': {'action': 'move_backward', 'desc': 'متحرك للخلف'},
    'left': {'action': 'turn_left', 'desc': 'لف لشمال'},
    'right': {'action': 'turn_right', 'desc': 'لف ليمين'},
    'stop': {'action': 'stop', 'desc': 'وقف'},
    'wait': {'action': 'stop', 'desc': 'استنى'},
    'open': {'action': 'open_gripper', 'desc': 'افتح'},
    'close': {'action': 'close_gripper', 'desc': 'اقفل'},
    'lift': {'action': 'lift', 'desc': 'ارفع'},
    'lower': {'action': 'lower', 'desc': 'نزل'},
}


def detect_movement_command(message: str) -> Optional[dict]:
    """Check if message contains a movement command for ESP32."""
    msg = message.lower()
    for keyword, command in MOVEMENT_MAP.items():
        if keyword in msg:
            return command
    return None


# ═══════════════════════════════════════════════════
#  STT Endpoint
# ═══════════════════════════════════════════════════

@router.post("/stt")
async def speech_to_text(request: Request):
    try:
        form = await request.form()
        audio_file = form.get("audio")
        if not audio_file:
            return JSONResponse({"error": "No audio file"}, status_code=400)

        audio_data = await audio_file.read()
        print(f"[STT] Received: {len(audio_data)} bytes")

        if len(audio_data) < 3000:
            return JSONResponse({"error": "صوت قصير جداً"}, status_code=400)

        wav_data = convert_to_wav(audio_data)
        if len(wav_data) < 1000:
            return JSONResponse({"error": "خطأ في تحويل الصوت"}, status_code=500)

        has_speech, speech_ratio = has_human_speech(wav_data)
        if not has_speech:
            return JSONResponse({"error": "noise", "text": ""})

        cleaned_wav = apply_noisereduce(wav_data)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            tmp.write(cleaned_wav)
            tmp.flush()
            with open(tmp.name, "rb") as f:
                transcription = groq_client.audio.transcriptions.create(
                    model=STT_MODEL,
                    file=("audio.wav", f, "audio/wav"),
                    response_format="text",
                    temperature=0,
                    language="ar",
                    prompt="عربي فصحى. هذا نص باللغة العربية."
                )

        text = str(transcription).strip()
        print(f"[STT] Result: '{text}'")
        return JSONResponse({"text": text})

    except Exception as e:
        print(f"[STT] Error: {e}")
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


# ═══════════════════════════════════════════════════
#  Chat Send Endpoint — v16.2 (Retry + BackgroundTasks + Compression + LED)
# ═══════════════════════════════════════════════════

class ChatMessage(BaseModel):
    message: str
    session_id: str = ""


@router.post("/send")
async def chat_endpoint(msg: ChatMessage, background_tasks: BackgroundTasks):
    global _current_mode, _robot_state
    try:
        user_msg = msg.message.strip()
        session_id = msg.session_id.strip() or "default"
        if not user_msg:
            return JSONResponse({"error": "لم أفهم، حاول مرة أخرى."})

        update_activity()
        print(f"[CHAT] [{session_id[:8]}] User: {user_msg}")

        # ─── LED: thinking state ───
        set_state("thinking")

        # ─── Step 1: Detect interaction mode ───
        detected_mode = detect_message_mode(user_msg)
        _current_mode = detected_mode
        _robot_state = "thinking"
        print(f"[CHAT] 🎭 Mode: {detected_mode}")

        # ─── Step 2: Extract user info ───
        user_name = extract_user_info(user_msg)
        if user_name:
            save_user_profile(session_id, "name", user_name)
            print(f"[MEMORY] 💾 Saved user name: {user_name}")

        # ─── Step 3: Try math first ───
        math_result = solve_math(user_msg)
        if math_result:
            save_message(session_id, "user", user_msg)
            save_message(session_id, "assistant", math_result)
            _robot_state = "idle"
            set_state("idle")  # LED: done
            return JSONResponse({
                "reply": math_result,
                "mode": detected_mode,
                "math": True
            })

        # ─── Step 4: Get system context ───
        context = get_system_context()
        alerts = check_system_alerts(context)

        # ─── Step 5: Search web if needed ───
        search_context = ""
        if needs_web_search(user_msg):
            print(f"[SEARCH] 🔍 Searching: {user_msg}")
            search_result = search_web(user_msg)
            if search_result:
                search_context = f"\n[معلومات حديثة من الإنترنت]:\n{search_result}\n"

        # ─── Step 6: Search ChromaDB if needed ───
        chroma_context = ""
        if needs_chroma_search(user_msg):
            print(f"[CHROMA] 🔍 Searching project files: {user_msg}")
            findings = search_chroma(user_msg, n_results=3)
            if findings:
                chroma_lines = []
                for f in findings:
                    chroma_lines.append(f"[ملف: {f['metadata'].get('source', 'غير معروف')} — ملاءمة: {f['relevance']:.0%}]\n{f['text'][:300]}")
                chroma_context = "\n[معلومات من ملفات المشروع]:\n" + "\n---\n".join(chroma_lines) + "\n"

        # ─── Step 7: Get session history ───
        session_history = get_session_history(session_id, limit=40)

        # ─── Step 8: Get user profile ───
        user_profile = get_user_profile(session_id)

        # ─── Step 9: Build dynamic system prompt with context ───
        dynamic_prompt = get_mind_system_prompt(context)

        # Add context awareness
        context_block = f"\n\n[السياق الحالي — {datetime.now().strftime('%Y-%m-%d %I:%M %p')}]:\n"
        context_block += f"- الوقت: {context.get('time_period', '')} ({context.get('time_str', '')})\n"
        context_block += f"- نصيحة: {context.get('time_suggestion', '')}\n"
        context_block += f"- حرارة المعالج: {context.get('cpu_temp_c', 0)}°C\n"
        context_block += f"- CPU: {context.get('cpu_percent', 0)}%\n"
        context_block += f"- RAM: {context.get('ram_used_gb', 0)}/{context.get('ram_total_gb', 0)} GB ({context.get('ram_percent', 0)}%)\n"

        if context.get("battery_level") is not None:
            charging = "شاحن" if context.get("battery_charging") else "مش شاحن"
            context_block += f"- البطارية: {context['battery_level']}% ({charging})\n"

        # Add active mode hint — كل الأوضاع تقنية
        mode_hints = {
            "engineering": "الوضع الحالي: هندسة — اشرح بالتفصيل. استخدم مصطلحات تقنية. اذكر الكود أو الدائرة. نبّه على المخاطر.",
            "medical": "الوضع الحالي: طبي — اذكر المصطلحات الطبية العلمية. اذكر الأرقام الطبيعية. لا تشخص حالات. ركز على السلامة.",
            "casual": "الوضع الحالي: تقني عام — حوّل السؤال لمعلومة تقنية أو علمية. استخدم أرقام ومصطلحات. مفيش رد عادي.",
        }
        context_block += f"\n{mode_hints.get(detected_mode, '')}"

        # Add alerts if any
        if alerts:
            context_block += f"\n\n[تنبيهات النظام]:\n" + "\n".join(alerts)
            context_block += "\nاقترح على المستخدم حلولاً إن أمكن."

        dynamic_prompt += context_block

        # ─── Step 10: Build messages for LLM ───
        messages = [{"role": "system", "content": dynamic_prompt}]

        # Add user profile
        if user_profile:
            profile_lines = []
            if "name" in user_profile:
                profile_lines.append(f"اسم المستخدم: {user_profile['name']}")
            if profile_lines:
                messages.append({
                    "role": "system",
                    "content": f"[معلومات عن المستخدم]:\n" + "\n".join(profile_lines)
                })

        # Add search results
        if search_context:
            messages.append({"role": "system", "content": search_context})

        # Add ChromaDB results
        if chroma_context:
            messages.append({"role": "system", "content": chroma_context})

        # Add cross-session memory
        global_memory = get_recent_global_memory(limit=8)
        if global_memory:
            other_sessions = [m for m in global_memory if m.get("session") != session_id]
            if other_sessions:
                mem_lines = []
                for m in other_sessions[-5:]:
                    who = "مستخدم" if m["role"] == "user" else "مايند"
                    mem_lines.append(f"{who}: {m['content'][:200]}")
                if mem_lines:
                    messages.append({
                        "role": "system",
                        "content": f"[ذاكرة من محادثات سابقة]:\n" + "\n".join(mem_lines)
                    })

        # Add session history
        for h in session_history:
            messages.append({"role": h["role"], "content": h["content"]})

        # Add current message
        messages.append({"role": "user", "content": user_msg})

        # ─── Step 11: Generate response with retry logic ───
        print(f"[CHAT] 🧠 Generating... ({len(messages)} context msgs, mode={detected_mode})")
        for attempt in range(MAX_LLM_RETRIES):
            try:
                response = groq_client.chat.completions.create(
                    model=LLM_MODEL,
                    messages=messages,
                    max_tokens=600,
                    temperature=0.6
                )
                break
            except Exception as e:
                if attempt < MAX_LLM_RETRIES - 1:
                    print(f"[CHAT] ⚠️ LLM attempt {attempt+1} failed: {e}, retrying in {RETRY_DELAY}s...")
                    await asyncio.sleep(RETRY_DELAY)
                else:
                    # All retries failed — return graceful error
                    _robot_state = "idle"
                    set_state("idle")  # LED: done (error)
                    return JSONResponse({"reply": "عذراً، حصل خطأ في الاتصال. جرب مرة تانية.", "mode": detected_mode, "error": True})

        reply = response.choices[0].message.content.strip()
        print(f"[CHAT] 💬 Reply ({detected_mode}): {reply[:100]}{'...' if len(reply) > 100 else ''}")

        # ─── Step 12: Save to memory ───
        save_message(session_id, "user", user_msg)
        save_message(session_id, "assistant", reply)

        # ─── Step 13: Auto-save diary entry for engineering topics (background) ───
        def _post_response_tasks(session_id, detected_mode, user_msg, reply):
            try:
                if detected_mode == "engineering" and len(user_msg) > 20:
                    topic_words = user_msg.split()[:5]
                    save_diary_entry(session_id, " ".join(topic_words), f"سؤال: {user_msg[:200]}\nرد: {reply[:200]}")
            except Exception as e:
                print(f"[BG] Diary save error: {e}")

        background_tasks.add_task(_post_response_tasks, session_id, detected_mode, user_msg, reply)

        # ─── Step 14: Context compression ───
        compress_session_history(session_id)

        _robot_state = "idle"
        set_state("idle")  # LED: done thinking

        # ─── Step 15: Return response with metadata ───
        return JSONResponse({
            "reply": reply,
            "mode": detected_mode,
            "state": _robot_state,
            "alerts": _system_alerts if _system_alerts else None,
            "cpu_temp": context.get("cpu_temp_c"),
            "battery": context.get("battery_level"),
        })

    except Exception as e:
        _robot_state = "idle"
        set_state("idle")  # LED: done (error)
        print(f"[CHAT] ❌ Error: {e}")
        traceback.print_exc()
        return JSONResponse({"reply": "عذراً، حصل خطأ مؤقت. حاول مرة أخرى."})


# ═══════════════════════════════════════════════════
#  Greeting Endpoint
# ═══════════════════════════════════════════════════

@router.get("/greeting")
async def get_greeting(session_id: str = "default"):
    """Get contextual greeting for session start."""
    try:
        update_activity()
        context = get_system_context()
        greeting = generate_greeting(context, session_id)
        return JSONResponse({
            "greeting": greeting,
            "state": _robot_state,
            "cpu_temp": context.get("cpu_temp_c"),
            "cpu_percent": context.get("cpu_percent"),
            "battery": context.get("battery_level"),
            "time_period": context.get("time_period"),
        })
    except Exception as e:
        return JSONResponse({"greeting": "أهلاً!"})


# ═══════════════════════════════════════════════════
#  Status Endpoint
# ═══════════════════════════════════════════════════

@router.get("/status")
async def get_status():
    """Get robot status (temperature, CPU, battery, state)."""
    try:
        context = get_system_context()
        state = check_standby()
        alerts = check_system_alerts(context)

        return JSONResponse({
            "state": state,
            "mode": _current_mode,
            "cpu_temp": context.get("cpu_temp_c"),
            "cpu_percent": context.get("cpu_percent"),
            "ram_percent": context.get("ram_percent"),
            "ram_used_gb": context.get("ram_used_gb"),
            "battery": context.get("battery_level"),
            "battery_charging": context.get("battery_charging"),
            "disk_percent": context.get("disk_percent"),
            "disk_free_gb": context.get("disk_free_gb"),
            "time_period": context.get("time_period"),
            "time_str": context.get("time_str"),
            "alerts": alerts,
            "chroma_docs": chroma_count(),
            "uptime_seconds": int(time.time() - _last_activity_time) if state == "idle" else 0,
        })
    except Exception as e:
        return JSONResponse({"state": "error", "error": str(e)})


# ═══════════════════════════════════════════════════
#  History Endpoint
# ═══════════════════════════════════════════════════

@router.get("/history")
async def get_history(session_id: str = "default"):
    """Get chat history for a session."""
    try:
        history = get_session_history(session_id, limit=50)
        return JSONResponse({"history": history})
    except Exception as e:
        return JSONResponse({"history": [], "error": str(e)})


# ═══════════════════════════════════════════════════
#  TTS Endpoint — with Voice Modulation + LED (v16.2)
# ═══════════════════════════════════════════════════

class TTSMessage(BaseModel):
    text: str
    session_id: str = ""
    mode: str = ""  # optional: override detected mode


@router.post("/tts")
async def text_to_speech(msg: TTSMessage):
    try:
        text = msg.text.strip()
        if not text:
            return JSONResponse({"error": "No text"}, status_code=400)

        # تنظيف النص — شيل الإيموجي والعلامات اللي ممكن تعمل مشاكل
        text = re.sub(r'[🎉🥳🤖🔥💡❌✅⚠️😊🔧🏥😀💪🤔👋🙌👍👏💔😭🤣😱🥺😤🎮🎵📚🧠🎬⭐🏆🎯🚀🔑📊🔔📱💻🎯]', '', text)
        text = text.strip()
        if not text:
            return JSONResponse({"error": "No text after cleaning"}, status_code=400)

        # تنظيف النص للنطق الصحيح (تشكيل + فصل أرقام + مسافات + وقفات)
        text = clean_text_for_tts(text)
        print(f"[TTS] Cleaned text: {text[:80]}{'...' if len(text) > 80 else ''}")

        # Determine mode for voice
        mode = msg.mode or _current_mode or "casual"
        params = get_tts_params(mode, text)

        # LED: speaking state
        set_state("speaking")

        # إعادة محاولة 3 مرات باستخدام Python API (مش CLI)
        MAX_TTS_RETRIES = 3
        for attempt in range(1, MAX_TTS_RETRIES + 1):
            try:
                print(f"[TTS] voice={params['voice']} rate={params['rate']} len={len(text)} (attempt {attempt})")
                communicate = edge_tts.Communicate(
                    text,
                    voice=params["voice"],
                    rate=params["rate"]
                )
                audio_data = b""
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_data += chunk["data"]

                if len(audio_data) > 100:
                    print(f"[TTS] ✅ Generated {len(audio_data)} bytes (attempt {attempt})")
                    set_state("idle")  # LED: done speaking
                    return Response(content=audio_data, media_type="audio/mpeg")

                print(f"[TTS] ⚠️ Attempt {attempt}/{MAX_TTS_RETRIES}: audio too small ({len(audio_data)} bytes)")

            except edge_tts.exceptions.NoAudioReceived:
                print(f"[TTS] ⚠️ Attempt {attempt}/{MAX_TTS_RETRIES}: NoAudioReceived")
            except Exception as e:
                print(f"[TTS] ⚠️ Attempt {attempt}/{MAX_TTS_RETRIES}: {type(e).__name__}: {str(e)[:100]}")

            # انتظار قبل المحاولة التالية
            if attempt < MAX_TTS_RETRIES:
                await asyncio.sleep(2)

        print(f"[TTS] ❌ Failed after {MAX_TTS_RETRIES} attempts")
        set_state("idle")  # LED: done (TTS failed)
        return JSONResponse({"error": "TTS failed after retries"}, status_code=500)

    except Exception as e:
        set_state("idle")  # LED: done (error)
        print(f"[TTS] Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


# ═══════════════════════════════════════════════════
#  Memory Search Endpoint
# ═══════════════════════════════════════════════════

@router.get("/memory/search")
async def memory_search(query: str = "", limit: int = 5):
    """Search chat memory for relevant past conversations."""
    try:
        results = search_memory(query, limit=limit)
        return JSONResponse({"results": results})
    except Exception as e:
        return JSONResponse({"results": [], "error": str(e)})


# ═══════════════════════════════════════════════════
#  Diary Endpoint
# ═══════════════════════════════════════════════════

@router.get("/diary")
async def get_diary(date: str = ""):
    """Get work diary entries for a date."""
    try:
        entries = get_today_diary(date or None)
        return JSONResponse({"entries": entries})
    except Exception as e:
        return JSONResponse({"entries": [], "error": str(e)})


# ═══════════════════════════════════════════════════
#  Achievements Endpoint
# ═══════════════════════════════════════════════════

@router.get("/achievements")
async def get_achievements(limit: int = 5):
    """Get recent achievements."""
    try:
        achs = get_recent_achievements(limit=limit)
        return JSONResponse({"achievements": achs})
    except Exception as e:
        return JSONResponse({"achievements": [], "error": str(e)})


# ═══════════════════════════════════════════════════
#  Daily Reflection Endpoint (v15)
# ═══════════════════════════════════════════════════

@router.post("/reflect")
async def daily_reflection(background_tasks: BackgroundTasks):
    """Trigger daily reflection — runs in background."""
    background_tasks.add_task(_do_daily_reflection)
    return JSONResponse({"status": "ok", "message": "جاري تحليل يوميات اليوم..."})


# ═══════════════════════════════════════════════════
#  Context Compression Endpoint (v15)
# ═══════════════════════════════════════════════════

@router.post("/compress")
async def compress_history(session_id: str = "default"):
    """Manually trigger context compression for a session."""
    result = compress_session_history(session_id)
    return JSONResponse({"compressed": result, "session_id": session_id})


# ═══════════════════════════════════════════════════
#  ESP32 Command Endpoints (v15)
# ═══════════════════════════════════════════════════

@router.post("/command")
async def send_command(msg: ChatMessage):
    """Send a command to ESP32 via serial."""
    try:
        command = detect_movement_command(msg.message)
        if not command:
            return JSONResponse({"error": "مش أمر حركة معروف", "message": "ما فهمتش الأمر ده. جرب: للأمام، للخلف، يمين، شمال، وقف"})

        # TODO: Replace with actual ESP32 communication (Serial/MQTT)
        print(f"[ESP32] 📡 Command: {command['action']} — {command['desc']}")

        save_message(msg.session_id or "default", "user", msg.message)
        save_message(msg.session_id or "default", "assistant", f"🔧 تم: {command['desc']} ({command['action']})")

        return JSONResponse({
            "command": command,
            "reply": f"تم تنفيذ الأمر: {command['desc']} 🤖",
            "mode": "robot"
        })
    except Exception as e:
        print(f"[ESP32] ❌ Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/commands")
async def list_commands():
    """List available movement commands."""
    commands = {k: v['desc'] for k, v in MOVEMENT_MAP.items()}
    return JSONResponse({"commands": commands})


# ═══════════════════════════════════════════════════
#  ChromaDB Management Endpoints
# ═══════════════════════════════════════════════════

class ChromaAddRequest(BaseModel):
    doc_id: str
    text: str
    metadata: dict = {}


@router.post("/chroma/add")
async def chroma_add(req: ChromaAddRequest):
    """Add a document to ChromaDB knowledge base."""
    try:
        success = add_to_chroma(req.doc_id, req.text, req.metadata)
        return JSONResponse({"success": success, "count": chroma_count()})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)})


@router.get("/chroma/search")
async def chroma_search_endpoint(query: str = "", n_results: int = 3):
    """Search ChromaDB knowledge base."""
    try:
        results = search_chroma(query, n_results=n_results)
        return JSONResponse({"results": results, "total": chroma_count()})
    except Exception as e:
        return JSONResponse({"results": [], "error": str(e)})


@router.get("/chroma/count")
async def chroma_count_endpoint():
    """Get number of documents in ChromaDB."""
    return JSONResponse({"count": chroma_count()})


# ═══════════════════════════════════════════════════
#  Init function — called from api_server.py
# ═══════════════════════════════════════════════════

def init_chat_db():
    """Initialize chat database, ChromaDB, and all subsystems."""
    init_memory_db()
    init_chroma_db()

    context = get_system_context()
    temp = context.get("cpu_temp_c", 0)
    print(f"[Chat] ✅ MindRobot v16.2 initialized")
    print(f"[Chat]    🧠 Persona: مايند (Mind) — Technical-First")
    print(f"[Chat]    📊 CPU Temp: {temp}°C | CPU: {context.get('cpu_percent')}% | RAM: {context.get('ram_percent')}%")
    print(f"[Chat]    📚 SQLite Memory + DuckDuckGo + ChromaDB ({chroma_count()} docs)")
    print(f"[Chat]    🔊 TTS: {TTS_VOICE} (with clean_text_for_tts)")
    print(f"[Chat]    🎭 Modes: Engineering / Medical / Casual (all technical)")
    print(f"[Chat]    🔄 Retry: {MAX_LLM_RETRIES} attempts | 🗜️ Compression: auto")
    print(f"[Chat]    📡 ESP32 Commands: {len(MOVEMENT_MAP)} mapped")
    print(f"[Chat]    🌙 Daily Reflection: /reflect endpoint ready")
    print(f"[Chat]    🗣️ TTS Pronunciation: 200+ diacritics words + conjunction pauses")
    print(f"[Chat]    🔴 LED: GPIO 22, 5, 13 (thinking/speaking/idle)")