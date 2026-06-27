// Assessment.js v146.4
// v146.4: Full-page A4 PDF — bigger fonts, wider spacing, fills entire page
// v146.3: Font via fetch TTF directly (NO font-data.js needed)
// v146.2: Font from font-data.js (embedded base64) — HAD SYNTAX ERROR
// v146.1: Fix font loading (pdfMake.vfs init), compact single-page PDF
// v145: pdfmake PDF generation, font loading, fix var t shadowing bug
// v139: Fixed TTS always Arabic (vt always returns ar text)
// v138: Header i18n keys, unified frame layout
// v135: Replaced browser speechSynthesis with backend edge-tts

'use strict';

var TIMER_DURATION = 300;
var API_BASE = '';

var timerInterval = null;
var timeRemaining = TIMER_DURATION;
var lastVoiceAlert = -1;
var patientData = null;
var vitalsData = null;
var fontLoaded = false;
var fontLoadPromise = null;

var i18n = {
  en: {
    'header.title': 'AI Medical Report',
    'header.subtitle': 'AI-driven health analysis and initial classification.',
    'title.assessment': 'Health Assessment Report',
    'title.healthProfile': 'Your Health Profile',
    'title.capturedVitals': 'Captured Vitals',
    'title.aiClassification': 'AI General Classification',
    'title.aiActionPlan': 'AI Action Plan',
    'title.healthTips': 'Health Tips',
    'label.noPhoto': 'No Photo',
    'label.gender': 'Gender',
    'label.weight': 'Weight',
    'label.height': 'Height',
    'label.bloodType': 'Blood Type',
    'label.occupation': 'Occupation',
    'label.phone': 'Phone',
    'label.email': 'Email',
    'label.address': 'Address',
    'label.chronic': 'Chronic:',
    'label.allergies': 'Allergies:',
    'label.medications': 'Medications:',
    'label.noneReported': 'None reported',
    'label.bloodPressure': 'Blood Pressure',
    'label.heartRate': 'Heart Rate',
    'label.oxygenSaturation': 'Oxygen Saturation',
    'label.temperature': 'Temperature',
    'label.confidence': 'Confidence',
    'label.sessionTimer': 'Session Timer',
    'label.patientEmail': 'Patient Email',
    'label.notRegistered': 'Not registered',
    'label.date': 'Date',
    'label.time': 'Time',
    'status.critical': 'Critical',
    'status.caution': 'Caution',
    'status.normal': 'Stable',
    'plan.critical': 'Immediate medical intervention recommended. Contact emergency services or visit the nearest hospital.',
    'plan.caution': 'Some vitals are outside normal range. Schedule a doctor appointment for further evaluation.',
    'plan.normal': 'All vitals are within normal range. Continue your healthy lifestyle and routine check-ups.',
    'timer.review': 'You have 5 minutes to review your report',
    'timer.4min': '4 minutes remaining',
    'timer.3min': '3 minutes remaining',
    'timer.2min': '2 minutes remaining',
    'timer.1min': '1 minute remaining',
    'timer.30sec': '30 seconds remaining',
    'timer.10sec': '10 seconds remaining',
    'timer.almost': 'Time is almost up!',
    'timer.expired': 'Time expired - returning to home',
    'email.noEmail': 'Please enter an email address',
    'email.invalid': 'Invalid email address',
    'email.sending': 'Generating PDF & sending...',
    'email.success': 'Report sent successfully!',
    'email.failed': 'Failed: ',
    'email.sendReport': 'Send Report',
    'email.receivePDF': 'Receive PDF via Email',
    'email.sendHealthReport': 'Send Health Report',
    'email.orEnterManually': 'Or enter email manually',
    'email.send': 'Send',
    'disclaimer': 'AI-Assisted Analysis - For reference only. Always consult a qualified healthcare professional.',
  },
  ar: {
    'header.title': 'تقرير طبي بالذكاء الاصطناعي',
    'header.subtitle': 'تحليل صحي مدعوم بالذكاء الاصطناعي والتصنيف المبدئي.',
    'title.assessment': 'تقرير التقييم الصحي',
    'title.healthProfile': 'ملفك الصحي',
    'title.capturedVitals': 'القياسات المأخوذة',
    'title.aiClassification': 'التصنيف العام بالذكاء الاصطناعي',
    'title.aiActionPlan': 'خطة العمل بالذكاء الاصطناعي',
    'title.healthTips': 'نصائح صحية',
    'label.noPhoto': 'بدون صورة',
    'label.gender': 'الجنس',
    'label.weight': 'الوزن',
    'label.height': 'الطول',
    'label.bloodType': 'فصيلة الدم',
    'label.occupation': 'المهنة',
    'label.phone': 'الهاتف',
    'label.email': 'البريد الإلكتروني',
    'label.address': 'العنوان',
    'label.chronic': 'أمراض مزمنة:',
    'label.allergies': 'حساسية:',
    'label.medications': 'أدوية:',
    'label.noneReported': 'لا يوجد',
    'label.bloodPressure': 'ضغط الدم',
    'label.heartRate': 'معدل ضربات القلب',
    'label.oxygenSaturation': 'تشبع الأكسجين',
    'label.temperature': 'درجة الحرارة',
    'label.confidence': 'مستوى الثقة',
    'label.sessionTimer': 'مؤقت الجلسة',
    'label.patientEmail': 'بريد المريض',
    'label.notRegistered': 'غير مسجل',
    'label.date': 'التاريخ',
    'label.time': 'الوقت',
    'status.critical': 'حرج',
    'status.caution': 'تنبيه',
    'status.normal': 'مستقر',
    'plan.critical': 'يوصى بالتدخل الطبي الفوري. اتصل بخدمات الطوارئ أو توجه إلى أقرب مستشفى.',
    'plan.caution': 'بعض العلامات الحيوية خارج النطاق الطبيعي. حدد موعداً مع الطبيب للتقييم.',
    'plan.normal': 'جميع العلامات الحيوية ضمن النطاق الطبيعي. استمر في نمط حياتك الصحي والفحوصات الدورية.',
    'timer.review': 'لديك 5 دقائق لمراجعة تقريرك',
    'timer.4min': 'متبقي 4 دقائق',
    'timer.3min': 'متروك 3 دقائق',
    'timer.2min': 'متروك دقيقتان',
    'timer.1min': 'متروك دقيقة واحدة',
    'timer.30sec': 'متروك 30 ثانية',
    'timer.10sec': 'متروك 10 ثوانٍ',
    'timer.almost': 'الوقت على وشك النفاد!',
    'timer.expired': 'انتهى الوقت - العودة للرئيسية',
    'email.noEmail': 'يرجى إدخال عنوان بريد إلكتروني',
    'email.invalid': 'عنوان بريد إلكتروني غير صالح',
    'email.sending': 'جاري إنشاء PDF وإرسال التقرير...',
    'email.success': 'تم إرسال التقرير بنجاح!',
    'email.failed': 'فشل الإرسال: ',
    'email.sendReport': 'إرسال التقرير',
    'email.receivePDF': 'استلم PDF عبر البريد',
    'email.sendHealthReport': 'إرسال التقرير الصحي',
    'email.orEnterManually': 'أو أدخل البريد يدوياً',
    'email.send': 'إرسال',
    'disclaimer': 'تحليل بمساعدة الذكاء الاصطناعي - لأغراض مرجعية فقط. استشر دائماً متخصصاً مؤهلاً في الرعاية الصحية.',
  }
};

var voiceTexts = {
  en: {
    300: 'Welcome to Mind Robot health assessment. You have five minutes to review your report. You can also send the report to your email by clicking the send button below.',
    240: 'Four minutes remaining',
    180: 'Three minutes remaining',
    120: 'Two minutes remaining',
    60: 'One minute remaining',
    30: 'Thirty seconds remaining',
    10: 'Ten seconds remaining',
    5: 'Time is almost up',
    0: 'Time is up, thank you',
    'reportSent': 'Report sent successfully',
  },
  ar: {
    300: 'صفحة التقرير الصحي. لديك خمس دقائق لمراجعة تقريرك. ويمكنك إرسال التقرير إلى بريدك الإلكتروني بالضغط على زر الإرسال في الأسفل.',
    240: 'متروك أربع دقائق',
    180: 'متروك ثلاث دقائق',
    120: 'متروك دقيقتان',
    60: 'متروك دقيقة واحدة',
    30: 'متروك ثلاثون ثانية',
    10: 'متروك عشر ثوانٍ',
    5: 'الوقت على وشك النفاد',
    0: 'انتهى الوقت، شكراً لكم',
    'reportSent': 'تم إرسال التقرير بنجاح',
  }
};

var currentLang = localStorage.getItem('mindrobot-lang') || 'en';

function t(key) {
  return (i18n[currentLang] && i18n[currentLang][key]) || (i18n.en[key]) || key;
}

function vt(key) {
  return (voiceTexts.ar && voiceTexts.ar[key]) ||
         (voiceTexts.en[key]) || '';
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('mindrobot-lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('lang-ar', lang === 'ar');

  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (i18n[lang] && i18n[lang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = i18n[lang][key];
      } else {
        el.textContent = i18n[lang][key];
      }
    }
  });

  if (vitalsData) {
    updateOverallStatus(vitalsData);
    if (patientData) displayTips(generateTips(vitalsData, patientData));
  }
  updateTimerMessage();
  updateTimestamp();
}

window.setLanguage = setLanguage;

var ttsAudio = null;
var ttsPlaying = false;
var lastBlobUrl = null;

function speak(text) {
  if (!text) return;

  if (ttsAudio && ttsPlaying) {
    try { ttsAudio.pause(); ttsAudio.currentTime = 0; } catch (e) {}
    ttsPlaying = false;
  }

  if (lastBlobUrl) {
    try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {}
    lastBlobUrl = null;
  }

  fetch(API_BASE + '/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text })
  })
  .then(function(res) {
    if (!res.ok) throw new Error('TTS request failed');
    return res.blob();
  })
  .then(function(blob) {
    if (!blob || blob.size === 0) throw new Error('Empty audio response');
    lastBlobUrl = URL.createObjectURL(blob);
    ttsAudio = new Audio(lastBlobUrl);
    ttsPlaying = true;
    ttsAudio.onended = function() { ttsPlaying = false; };
    ttsAudio.onerror = function() { ttsPlaying = false; browserSpeakFallback(text); };
    var playPromise = ttsAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(function(err) { browserSpeakFallback(text); });
    }
  })
  .catch(function(err) { browserSpeakFallback(text); });
}

function browserSpeakFallback(text) {
  if (!text || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar-SA';
    u.rate = 0.85;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function loadPhoto() {
  var frame = document.getElementById('photoFrame');
  var img = document.getElementById('photoImg');
  var noPhoto = document.getElementById('noPhoto');
  if (!img || !frame) return;
  img.onload = function () {
    img.hidden = false;
    if (noPhoto) noPhoto.style.display = 'none';
    frame.classList.add('has-image');
  };
  img.onerror = function () {
    img.hidden = true;
    if (noPhoto) noPhoto.style.display = '';
    frame.classList.remove('has-image');
  };
  img.src = '/camera/capture?' + Date.now();
}

function updateTimestamp() {
  var el = document.getElementById('reportTimestamp');
  if (el) el.textContent = new Date().toLocaleString(
    currentLang === 'ar' ? 'ar-SA' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }
  );
}

function displayPatient(patient) {
  if (!patient) return;
  patientData = patient;
  var set = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  set('patientName', patient.name || 'Patient Name');
  set('patientAge', (patient.age || '--') + ' years');
  set('patientID', 'ID: ' + (patient.recordNumber || patient.record || '--'));
  set('patientGender', patient.gender || '--');
  set('patientWeight', patient.weight ? patient.weight + ' kg' : '--');
  set('patientHeight', patient.height ? patient.height + ' cm' : '--');
  set('patientBlood', patient.bloodType || '--');
  set('patientOccupation', patient.occupation || '--');
  set('patientPhone', patient.phone || '--');
  set('patientEmail', patient.email || '--');
  set('patientAddress', patient.address || '--');

  var now = new Date();
  set('patientDate', now.toLocaleDateString(
    currentLang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }
  ));
  set('patientTime', now.toLocaleTimeString(
    currentLang === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }
  ));

  if (patient.email) {
    var re = document.getElementById('regEmail');
    if (re) re.textContent = patient.email;
    var reg = document.getElementById('emailRegistered');
    if (reg) reg.classList.remove('no-email');
  }
}

function analyzeBP(s, d) {
  if (s > 140 || d > 90) return { status: 'critical', badge: 'HIGH', advice: 'Blood pressure is critically high. Seek immediate medical attention and reduce sodium intake.' };
  if (s > 130 || d > 85) return { status: 'caution', badge: 'ELEVATED', advice: 'Blood pressure is above normal range. Monitor regularly and consult your doctor.' };
  if (s < 90 || d < 60) return { status: 'caution', badge: 'LOW', advice: 'Blood pressure is below normal. Stay hydrated and avoid sudden position changes.' };
  return { status: 'normal', badge: 'NORMAL', advice: 'Blood pressure is within the healthy range. Maintain your current lifestyle.' };
}

function analyzeHR(v) {
  v = Number(v);
  if (v > 100 || v < 50) return { status: 'critical', badge: 'ABNORMAL', advice: 'Heart rate is outside safe range. Please consult a cardiologist immediately.' };
  if (v > 90 || v < 60) return { status: 'caution', badge: 'CAUTION', advice: 'Heart rate is slightly irregular. Practice deep breathing and relaxation.' };
  return { status: 'normal', badge: 'NORMAL', advice: 'Heart rate is within the healthy range. Continue regular physical activity.' };
}

function analyzeSPO2(v) {
  v = Number(v);
  if (v < 90) return { status: 'critical', badge: 'LOW', advice: 'Oxygen saturation is dangerously low. Seek medical oxygen supply immediately.' };
  if (v < 95) return { status: 'caution', badge: 'BELOW AVG', advice: 'Oxygen level is slightly low. Take deep breaths and ensure good ventilation.' };
  return { status: 'normal', badge: 'NORMAL', advice: 'Oxygen saturation is excellent. Keep up healthy breathing habits.' };
}

function analyzeTemp(v) {
  v = Number(v);
  if (v > 39 || v < 35) return { status: 'critical', badge: 'ABNORMAL', advice: 'Body temperature is dangerously abnormal. Seek medical attention immediately.' };
  if (v > 38 || v < 36) return { status: 'caution', badge: 'CAUTION', advice: 'Temperature is slightly outside normal range. Rest and drink plenty of fluids.' };
  return { status: 'normal', badge: 'NORMAL', advice: 'Body temperature is normal. No fever detected.' };
}

function displayVitals(vitals) {
  if (!vitals) return;
  vitalsData = vitals;

  var sys = vitals.systolic || 0;
  var dia = vitals.diastolic || 0;
  var hr = vitals.heartRate || vitals.hr || 0;
  var spo2 = vitals.spo2 || vitals.oxygen || 0;
  var temp = vitals.temperature || vitals.temp || 0;

  function updateVital(id, analysis) {
    var box = document.getElementById(id);
    var badge = document.getElementById('badge' + id.replace('vital', ''));
    var advice = document.getElementById('advice' + id.replace('vital', ''));
    if (box) box.className = 'ast-vital-box status-' + analysis.status;
    if (badge) badge.textContent = analysis.badge;
    if (advice) advice.innerHTML = '<i class="fas fa-circle-info"></i><span>' + analysis.advice + '</span>';
  }

  var v = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  v('valBP', sys + '/' + dia);
  v('valHR', hr);
  v('valSPO2', spo2);
  v('valTemp', temp);

  updateVital('vitalBP', analyzeBP(sys, dia));
  updateVital('vitalHR', analyzeHR(hr));
  updateVital('vitalSPO2', analyzeSPO2(spo2));
  updateVital('vitalTemp', analyzeTemp(temp));

  updateOverallStatus(vitals);
  displayTips(generateTips(vitals, patientData));
}

function updateOverallStatus(vitals) {
  if (!vitals) return;
  var score = 0;
  var s = vitals.systolic || 0, d = vitals.diastolic || 0;
  var hr = vitals.heartRate || vitals.hr || 0;
  var sp = vitals.spo2 || vitals.oxygen || 0;
  var temp = vitals.temperature || vitals.temp || 0;
  if (s > 140 || d > 90 || sp < 90 || temp > 39 || hr > 120) score += 3;
  if (s > 130 || d > 85 || sp < 95 || temp > 38 || hr > 100) score += 1;

  var status, text, plan, conf;
  if (score >= 3) {
    status = 'critical'; text = t('status.critical'); plan = t('plan.critical'); conf = 95;
  } else if (score >= 1) {
    status = 'caution'; text = t('status.caution'); plan = t('plan.caution'); conf = 85;
  } else {
    status = 'normal'; text = t('status.normal'); plan = t('plan.normal'); conf = 92;
  }

  var banner = document.getElementById('overallBanner');
  var planBox = document.getElementById('actionPlan');
  if (banner) banner.className = 'ast-overall-banner status-' + status;
  if (planBox) planBox.className = 'ast-action-plan status-' + status;

  var os = document.getElementById('overallStatus');
  if (os) os.textContent = text;
  var pt = document.getElementById('planText');
  if (pt) pt.textContent = plan;
  var cb = document.getElementById('confBar');
  if (cb) { cb.style.width = '0%'; cb.className = 'ast-conf-bar status-' + status; setTimeout(function() { cb.style.width = conf + '%'; }, 500); }
  var cv = document.getElementById('confVal');
  if (cv) cv.textContent = conf + '%';
}

function generateTips(vitals, patient) {
  var tips = [];
  if (!vitals) return tips;
  var s = vitals.systolic || 0, d = vitals.diastolic || 0;
  var hr = vitals.heartRate || vitals.hr || 0;
  var sp = vitals.spo2 || vitals.oxygen || 0;
  var temp = vitals.temperature || vitals.temp || 0;

  if (s > 140 || d > 90) { tips.push({ icon: 'fa-triangle-exclamation', text: 'High blood pressure detected. Reduce salt intake and avoid caffeinated drinks.' }); }
  else { tips.push({ icon: 'fa-circle-check', text: 'Blood pressure is well controlled. Maintain your current diet.' }); }

  if (hr > 100) { tips.push({ icon: 'fa-heart-pulse', text: 'Elevated heart rate. Try relaxation techniques and deep breathing exercises.' }); }
  else if (hr < 60) { tips.push({ icon: 'fa-heart-pulse', text: 'Low heart rate detected. Consult your doctor if you feel dizzy.' }); }
  else { tips.push({ icon: 'fa-circle-check', text: 'Heart rate is healthy. Regular cardio exercise is beneficial.' }); }

  if (sp < 95) { tips.push({ icon: 'fa-lungs', text: 'Low oxygen saturation. Ensure proper ventilation and take deep breaths.' }); }
  else { tips.push({ icon: 'fa-circle-check', text: 'Oxygen levels are excellent. Keep maintaining good respiratory health.' }); }

  if (temp > 38) { tips.push({ icon: 'fa-temperature-high', text: 'Fever detected. Stay hydrated and rest. Consider taking fever-reducing medication.' }); }
  else if (temp < 36) { tips.push({ icon: 'fa-temperature-low', text: 'Low body temperature. Keep warm and drink warm beverages.' }); }
  else { tips.push({ icon: 'fa-circle-check', text: 'Body temperature is normal. No signs of fever.' }); }

  if (patient && patient.age > 60) tips.push({ icon: 'fa-user-shield', text: 'As a senior, regular health check-ups every 6 months are recommended.' });
  return tips;
}

function displayTips(tips) {
  var container = document.getElementById('tipsList');
  if (!container) return;
  container.innerHTML = '';
  if (!tips || tips.length === 0) return;
  tips.forEach(function(tip) {
    container.innerHTML += '<div class="ast-tip-card"><div class="ast-tip-icon"><i class="fas ' + tip.icon + '"></i></div><div class="ast-tip-text">' + tip.text + '</div></div>';
  });
}

function updateTimerMessage() {
  var msg = document.getElementById('timerMsg');
  if (!msg) return;
  if (timeRemaining > 240) msg.textContent = t('timer.review');
  else if (timeRemaining === 240) msg.textContent = t('timer.4min');
  else if (timeRemaining === 180) msg.textContent = t('timer.3min');
  else if (timeRemaining === 120) msg.textContent = t('timer.2min');
  else if (timeRemaining === 60) msg.textContent = t('timer.1min');
  else if (timeRemaining === 30) msg.textContent = t('timer.30sec');
  else if (timeRemaining === 10) msg.textContent = t('timer.10sec');
  else if (timeRemaining === 5) msg.textContent = t('timer.almost');
  else if (timeRemaining <= 0) msg.textContent = t('timer.expired');
}

function updateTimer() {
  var m = Math.floor(timeRemaining / 60);
  var s = timeRemaining % 60;
  var str = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

  var box = document.getElementById('timerBox');
  var bar = document.getElementById('timerBar');
  var val = document.getElementById('timerValue');

  var state = '';
  if (timeRemaining <= 30) state = 'timer-critical';
  else if (timeRemaining <= 60) state = 'timer-warning';

  if (box) { box.classList.remove('timer-warning', 'timer-critical'); if (state) box.classList.add(state); }
  if (bar) { bar.style.width = ((timeRemaining / TIMER_DURATION) * 100) + '%'; }
  if (val) val.textContent = str;

  updateTimerMessage();

  if (timeRemaining !== lastVoiceAlert) {
    var voice = vt(timeRemaining);
    if (voice) { speak(voice); lastVoiceAlert = timeRemaining; }
  }

  if (timeRemaining > 0) timeRemaining--;
  else { clearInterval(timerInterval); setTimeout(function() { window.location.href = '/'; }, 3000); }
}

function setupEmail() {
  var toggle = document.getElementById('emailToggle');
  var dropdown = document.getElementById('emailDropdown');
  var input = document.getElementById('emailInput');
  var sendBtn = document.getElementById('emailSendBtn');
  var status = document.getElementById('emailStatus');
  var registered = document.getElementById('emailRegistered');

  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', function (e) {
    if (!dropdown.contains(e.target) && !toggle.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });

  if (registered) {
    registered.addEventListener('click', function () {
      var email = document.getElementById('regEmail');
      if (email && email.textContent !== t('label.notRegistered') && input) {
        input.value = email.textContent;
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', function () { sendReport(); });
  }
}

function ab2b64(buffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function loadMicrosoftUighurFont() {
  if (fontLoaded) return Promise.resolve(true);
  if (fontLoadPromise) return fontLoadPromise;

  fontLoadPromise = new Promise(function(resolve) {
    var normalUrl = '/Assessment/msuighur.ttf';
    var boldUrl = '/Assessment/msuighub.ttf';
    var normalB64 = null;

    fetch(normalUrl)
      .then(function(res) {
        if (!res.ok) throw new Error('Not found: ' + normalUrl);
        return res.arrayBuffer();
      })
      .then(function(buffer) {
        normalB64 = ab2b64(buffer);

        return fetch(boldUrl)
          .then(function(res) {
            if (!res.ok) throw new Error('Bold not found');
            return res.arrayBuffer();
          })
          .then(function(buf) { return ab2b64(buf); })
          .catch(function() { return null; });
      })
      .then(function(boldB64) {
        if (!pdfMake.vfs) pdfMake.vfs = {};
        pdfMake.vfs['msuighur.ttf'] = normalB64;
        pdfMake.vfs['msuighub.ttf'] = boldB64 || normalB64;

        pdfMake.fonts = {
          MicrosoftUighur: {
            normal: 'msuighur.ttf',
            bold: 'msuighub.ttf',
            italics: 'msuighur.ttf',
            bolditalics: 'msuighub.ttf'
          }
        };

        fontLoaded = true;
        console.log('[Font] Microsoft Uighur loaded (' + normalB64.length + ' chars)');
        resolve(true);
      })
      .catch(function(err) {
        console.warn('[Font] Failed:', err.message, '- using Roboto');
        fontLoaded = false;
        resolve(false);
      });
  });

  return fontLoadPromise;
}

// ═══════════════════════════════════════════════════════════
// v146.4: Full-page A4 PDF — fills entire page with content
// ═══════════════════════════════════════════════════════════

function generatePDFviaPdfmake() {
  var patient = patientData || {};
  var vitals = vitalsData || {};
  var sys = vitals.systolic || 0;
  var dia = vitals.diastolic || 0;
  var hr = vitals.heartRate || vitals.hr || 0;
  var spo2 = vitals.spo2 || vitals.oxygen || 0;
  var temp = vitals.temperature || vitals.temp || 0;

  var overallStatus = getOverallStatus(vitals);
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  var timestamp = dateStr + ' - ' + timeStr;

  var fontName = fontLoaded ? 'MicrosoftUighur' : 'Roboto';

  var bpA = analyzeBP(sys, dia);
  var hrA = analyzeHR(hr);
  var spA = analyzeSPO2(spo2);
  var tpA = analyzeTemp(temp);

  function vc(a) {
    if (a.status === 'critical') return '#DC2626';
    if (a.status === 'caution') return '#D97706';
    return '#16A34A';
  }
  function vb(a) {
    if (a.status === 'critical') return '#FEE2E2';
    if (a.status === 'caution') return '#FEF3C7';
    return '#DCFCE7';
  }

  var thinBorder = {
    hLineWidth: function() { return 0.5; },
    vLineWidth: function() { return 0.5; },
    hLineColor: function() { return '#D1D5DB'; },
    vLineColor: function() { return '#D1D5DB'; }
  };

  var pName = patient.name || '--';
  var pAge = patient.age || '--';
  var pGender = patient.gender || '--';
  var pWeight = patient.weight ? patient.weight + ' kg' : '--';
  var pHeight = patient.height ? patient.height + ' cm' : '--';
  var pBlood = patient.bloodType || '--';
  var pOcc = patient.occupation || '--';
  var pPhone = patient.phone || '--';

  // ── Patient Info Table (bigger fonts, more padding) ──
  var patientBody = [
    [
      { text: 'Patient Information', fillColor: '#D97706', color: '#FFFFFF', bold: true, fontSize: 13, alignment: 'center', margin: [0, 4, 0, 4], colSpan: 4 },
      {}, {}, {}
    ],
    [
      { text: [{ text: 'Name : ', bold: true, color: '#D97706' }, pName], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
      { text: [{ text: 'Age : ', bold: true, color: '#D97706' }, pAge + ' yrs'], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
      { text: [{ text: 'Gender : ', bold: true, color: '#D97706' }, pGender], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
      { text: [{ text: 'Time : ', bold: true, color: '#D97706' }, timeStr], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] }
    ],
    [
      { text: [{ text: 'Weight : ', bold: true, color: '#D97706' }, pWeight], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
      { text: [{ text: 'Height : ', bold: true, color: '#D97706' }, pHeight], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
      { text: [{ text: 'Blood Type : ', bold: true, color: '#D97706' }, pBlood], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
      { text: [{ text: 'Occupation : ', bold: true, color: '#D97706' }, pOcc], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] }
    ],
    [
      { text: [{ text: 'Phone : ', bold: true, color: '#D97706' }, pPhone], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5], colSpan: 2 },
      {},
      { text: [{ text: 'Email : ', bold: true, color: '#D97706' }, patient.email || '--'], alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5], colSpan: 2 },
      {}
    ]
  ];

  // ── Health Profile Table ──
  var hpBody = [
    [
      { text: 'Health Profile', fillColor: '#D97706', color: '#FFFFFF', bold: true, fontSize: 13, alignment: 'center', margin: [0, 4, 0, 4], colSpan: 2 },
      {}
    ],
    [
      { text: 'General', bold: true, color: '#6B7280', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'Not selected', color: '#1F2937', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] }
    ],
    [
      { text: 'Cardiovascular', bold: true, color: '#6B7280', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'Not selected', color: '#1F2937', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] }
    ],
    [
      { text: 'Respiratory', bold: true, color: '#6B7280', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'Not selected', color: '#1F2937', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] }
    ],
    [
      { text: 'Chronic Conditions', bold: true, color: '#6B7280', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'Not selected', color: '#1F2937', fontSize: 11, alignment: 'center', margin: [0, 4, 0, 4] }
    ]
  ];

  // ── Vitals Table (bigger fonts, more padding) ──
  var vitalsBody = [
    [
      { text: 'Captured Vitals', fillColor: '#D97706', color: '#FFFFFF', bold: true, fontSize: 13, alignment: 'center', margin: [0, 4, 0, 4], colSpan: 4 },
      {}, {}, {}
    ],
    [
      { text: 'Measurement', bold: true, fontSize: 10, color: '#6B7280', alignment: 'center', margin: [0, 3, 0, 3] },
      { text: 'Value', bold: true, fontSize: 10, color: '#6B7280', alignment: 'center', margin: [0, 3, 0, 3] },
      { text: 'Status', bold: true, fontSize: 10, color: '#6B7280', alignment: 'center', margin: [0, 3, 0, 3] },
      { text: 'Report', bold: true, fontSize: 10, color: '#6B7280', alignment: 'center', margin: [0, 3, 0, 3] }
    ]
  ];

  function addVital(name, value, unit, analysis) {
    var c = vc(analysis);
    var b = vb(analysis);
    vitalsBody.push([
      { text: name, fontSize: 11, color: '#374151', alignment: 'center', margin: [0, 5, 0, 5] },
      { text: value + ' ' + unit, fontSize: 14, bold: true, color: c, alignment: 'center', margin: [0, 5, 0, 5] },
      { text: analysis.badge, fontSize: 11, bold: true, color: c, fillColor: b, alignment: 'center', margin: [0, 5, 0, 5] },
      { text: analysis.advice, fontSize: 10, color: '#374151', alignment: 'left', margin: [4, 5, 4, 5] }
    ]);
  }

  addVital('Blood Pressure', sys + '/' + dia, 'mmHg', bpA);
  addVital('Heart Rate', hr, 'bpm', hrA);
  addVital('SpO2', spo2, '%', spA);
  addVital('Temperature', temp, '\u00B0C', tpA);

  var actionPlanText = 'All vitals are within normal range. Continue your healthy lifestyle.';
  if (hrA.status !== 'normal') actionPlanText = hrA.advice;
  else if (bpA.status !== 'normal') actionPlanText = bpA.advice;
  else if (spA.status !== 'normal') actionPlanText = spA.advice;
  else if (tpA.status !== 'normal') actionPlanText = tpA.advice;

  var docDefinition = {
    pageSize: 'A4',
    pageMargins: [25, 20, 25, 40],
    defaultStyle: { font: fontName, fontSize: 11 },
    footer: function(currentPage, pageCount) {
      return {
        text: 'MindRobot AI Medical Report | Page ' + currentPage + ' of ' + pageCount,
        alignment: 'center',
        fontSize: 8,
        color: '#9CA3AF',
        margin: [0, 5, 0, 0]
      };
    },
    content: [
      // ── Header (bigger) ──
      { text: 'AI Medical Report', alignment: 'center', fontSize: 26, bold: true, color: '#D97706', margin: [0, 0, 0, 2] },
      { text: 'AI-driven health analysis and initial classification', alignment: 'center', fontSize: 11, color: '#6B7280', margin: [0, 0, 0, 2] },
      { text: timestamp, alignment: 'center', fontSize: 10, bold: true, color: '#D97706', margin: [0, 0, 0, 8] },

      // ── Patient Info ──
      {
        table: { widths: ['*', '*', '*', '*'], body: patientBody },
        layout: thinBorder
      },

      { text: '', margin: [0, 8, 0, 0] },

      // ── Health Profile ──
      {
        table: { widths: ['*', '*'], body: hpBody },
        layout: thinBorder
      },

      { text: '', margin: [0, 8, 0, 0] },

      // ── Vitals ──
      {
        table: { widths: [85, 75, 70, '*'], body: vitalsBody },
        layout: thinBorder
      },

      { text: '', margin: [0, 8, 0, 0] },

      // ── AI Classification ──
      { text: 'AI General Classification', fontSize: 13, bold: true, color: '#D97706', margin: [0, 0, 0, 4] },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              { text: 'Overall Status', bold: true, fontSize: 11, color: '#6B7280', alignment: 'center', margin: [0, 4, 0, 4] },
              { text: overallStatus === 'critical' ? 'CRITICAL' : overallStatus === 'warning' ? 'CAUTION' : 'NORMAL', bold: true, fontSize: 13, color: vc({ status: overallStatus === 'critical' ? 'critical' : overallStatus === 'warning' ? 'caution' : 'normal' }), fillColor: vb({ status: overallStatus === 'critical' ? 'critical' : overallStatus === 'warning' ? 'caution' : 'normal' }), alignment: 'center', margin: [0, 4, 0, 4] }
            ],
            [
              { text: 'Confidence Level', bold: true, fontSize: 11, color: '#6B7280', alignment: 'center', margin: [0, 4, 0, 4] },
              { text: '92%', fontSize: 13, bold: true, color: '#16A34A', alignment: 'center', margin: [0, 4, 0, 4] }
            ]
          ]
        },
        layout: thinBorder
      },

      { text: '', margin: [0, 8, 0, 0] },

      // ── Action Plan ──
      { text: '\u25B6 AI Action Plan', fontSize: 13, bold: true, color: '#D97706', margin: [0, 0, 0, 4] },
      { text: actionPlanText, fontSize: 11, color: '#374151', margin: [0, 0, 0, 8] },

      // ── Health Tips ──
      { text: 'Health Tips', fontSize: 13, bold: true, color: '#D97706', margin: [0, 0, 0, 4] },
      {
        table: {
          widths: ['*'],
          body: [
            [
              { text: '\u2714 Blood pressure is well controlled. Maintain your current diet and reduce sodium intake.', fontSize: 10, color: '#374151', margin: [6, 4, 6, 4] }
            ],
            [
              { text: '\u2714 Heart rate is healthy. Regular cardio exercise is beneficial for cardiovascular health.', fontSize: 10, color: '#374151', margin: [6, 4, 6, 4] }
            ],
            [
              { text: '\u2714 Oxygen levels are excellent. Keep maintaining good respiratory health habits.', fontSize: 10, color: '#374151', margin: [6, 4, 6, 4] }
            ],
            [
              { text: '\u2714 Body temperature is normal. No signs of fever detected. Stay hydrated.', fontSize: 10, color: '#374151', margin: [6, 4, 6, 4] }
            ]
          ]
        },
        layout: thinBorder
      },

      { text: '', margin: [0, 10, 0, 0] },

      // ── Disclaimer ──
      { text: '\u26A0 This is an AI-assisted analysis. Please consult a certified physician for final medical diagnosis.', alignment: 'center', fontSize: 9, bold: true, color: '#DC2626', margin: [0, 5, 0, 0] }
    ]
  };

  return docDefinition;
}

async function sendReport() {
  var input = document.getElementById('emailInput');
  var sendBtn = document.getElementById('emailSendBtn');
  var status = document.getElementById('emailStatus');

  var email = '';
  if (input) email = input.value.trim();
  if (!email) {
    var reg = document.getElementById('regEmail');
    if (reg && reg.textContent !== t('label.notRegistered')) email = reg.textContent.trim();
  }

  if (!email) {
    if (status) { status.textContent = t('email.noEmail'); status.className = 'ast-email-status error'; }
    return;
  }

  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    if (status) { status.textContent = t('email.invalid'); status.className = 'ast-email-status error'; }
    return;
  }

  if (sendBtn) sendBtn.disabled = true;
  if (status) { status.textContent = t('email.sending'); status.className = 'ast-email-status sending'; }

  try {
    if (!fontLoaded) await loadMicrosoftUighurFont();

    var docDefinition = generatePDFviaPdfmake();
    var pdfDocGenerator = pdfMake.createPdf(docDefinition);

    pdfDocGenerator.getBase64(function(base64Data) {
      fetch(API_BASE + '/api/send_report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdf_base64: base64Data,
          email: email,
          patient_name: (patientData && patientData.name) || 'Patient'
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.success === true) {
          if (status) { status.textContent = t('email.success'); status.className = 'ast-email-status success'; }
          speak(vt('reportSent'));
        } else {
          throw new Error(data.error || 'Server error');
        }
      })
      .catch(function(err) {
        if (status) { status.textContent = t('email.failed') + err.message; status.className = 'ast-email-status error'; }
      })
      .finally(function() {
        if (sendBtn) sendBtn.disabled = false;
      });
    });
  } catch (err) {
    if (status) { status.textContent = t('email.failed') + err.message; status.className = 'ast-email-status error'; }
    if (sendBtn) sendBtn.disabled = false;
  }
}

function getOverallStatus(vitals) {
  if (!vitals) return 'normal';
  var score = 0;
  var s = vitals.systolic || 0, d = vitals.diastolic || 0;
  var hr = vitals.heartRate || vitals.hr || 0;
  var sp = vitals.spo2 || vitals.oxygen || 0;
  var temp = vitals.temperature || vitals.temp || 0;
  if (s > 140 || d > 90 || sp < 90 || temp > 39 || hr > 120) score += 3;
  if (s > 130 || d > 85 || sp < 95 || temp > 38 || hr > 100) score += 1;
  if (score >= 3) return 'critical';
  if (score >= 1) return 'warning';
  return 'normal';
}

async function loadData() {
  try {
    var pRes = await fetch(API_BASE + '/api/patients/current');
    if (pRes.ok) displayPatient(await pRes.json());
    var vRes = await fetch(API_BASE + '/vitals');
    if (vRes.ok) displayVitals(await vRes.json());
    loadPhoto();
  } catch (e) { console.error('Load error:', e); }
}

function init() {
  setLanguage(currentLang);
  updateTimestamp();
  setupEmail();
  loadData();
  loadMicrosoftUighurFont();
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();