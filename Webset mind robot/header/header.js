/**
 * Header Component - MindRobot
 * ✅ أضفنا التبويبات (Nav) عشان تتولد أوتوماتيك في كل الصفحات
 * ✅ أيقونات بس لـ Home و AI Chat
 * ✅ الألوان مكتوبة يدوي (Inline) في التاريخ والوقت عشان تبان 100%
 * ✅ تم تعديل مسارات التبويبات لمسارات جذرية (Root) لمنش مشكلة "أنا فين؟"
 * ✅ تم إضافة حقن تلقائي لملفات CSS و FontAwseome عشان يشتغل لوحده
 * ✅ تم إضافة ترجمة التبويبات (Nav Tabs) للعربي والإنجليزي
 * ✅ تم إضافة نظام قفل الأدمن (Admin Lock) للنافبار - التبويبات تبان عادية بس تطلب باسورد
 */

(function () {
  'use strict';

  var EMERGENCY_NUMBER = '01205702337';
  var currentLang = localStorage.getItem('mindrobot_lang') || 'en';
  
  // ✅✅ إعدادات الأدمن ✅✅
  var SESSION_KEY = 'mindrobot_admin_unlocked';
  var CORRECT_PASSWORD = 'mind1234'; // الباسورد الافتراضي

  var hdrI18n = {
    en: {
      dateLabel: 'Date',
      timeLabel: 'Cairo Time',
      sosBtn: 'Emergency SOS',
      sosTitle: 'Emergency Call',
      sosCall: 'Call Now',
      sosCancel: 'Cancel',
      sosHint: 'Direct call to emergency number',
      sosCalling: 'Calling emergency number...',
      subtitle: 'Hospital-grade AI Monitoring - Egypt',
      tabHome: 'Home',
      tabForm: 'Patient Registration',
      tabMedical: 'Medical Record',
      tabOverview: 'Overview',
      tabAssessment: 'Assessment',
      tabChat: 'AI CHAT'
    },
    ar: {
      dateLabel: 'التاريخ',
      timeLabel: 'توقيت القاهرة',
      sosBtn: 'طوارئ SOS',
      sosTitle: 'اتصال طوارئ',
      sosCall: 'اتصل الآن',
      sosCancel: 'إلغاء',
      sosHint: 'اتصال مباشر برقم الطوارئ',
      sosCalling: 'جاري الاتصال برقم الطوارئ...',
      subtitle: 'مراقبة ذكية بمستوى مستشفى - مصر',
      tabHome: 'الرئيسية',
      tabForm: 'تسجيل المريض',
      tabMedical: 'السجل الطبي',
      tabOverview: 'نظرة عامة',
      tabAssessment: 'التقييم',
      tabChat: 'محادثة ذكية'
    }
  };

  window.MindRobotHeader = {
    currentLang: currentLang,
    onLanguageChange: null,
    emergencyNumber: EMERGENCY_NUMBER
  };

  // =============================================
  // حقن الأصول (CSS و الأيقونات) تلقائياً لو مش موجودة
  // =============================================
  function injectAssets() {
    if (!document.querySelector('link[href*="master.css"]')) {
      var masterCSS = document.createElement('link');
      masterCSS.rel = 'stylesheet';
      masterCSS.href = '/master.css'; 
      document.head.appendChild(masterCSS);
    }

    if (!document.querySelector('link[href*="fontawesome"]')) {
      var faCSS = document.createElement('link');
      faCSS.rel = 'stylesheet';
      faCSS.href = '/fontawesome/css/all.min.css'; 
      document.head.appendChild(faCSS);
    }
  }

  // =============================================
  // قالب الهيدر - ✅ تم إضافة زرار القفل
  // =============================================

  var headerTemplate =
    '<header class="topbar" id="mrTopbar">' +
      '<div class="brand">' +
        '<div class="logo">' +
          '<span class="logo-dot"></span>' +
          '<span class="logo-dot"></span>' +
          '<span class="logo-dot"></span>' +
        '</div>' +
        '<div>' +
          '<div class="brand-title">MindRobot</div>' +
          '<div class="brand-subtitle-wrap">' +
            '<div class="brand-subtitle" id="brandSubtitle">' + hdrI18n[currentLang].subtitle + '</div>' +
            '<div class="brand-subtitle-line"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="topbar-datetime">' +
        '<div class="topbar-date-block">' +
          '<div class="topbar-date-icon"><i class="fas fa-calendar-day"></i></div>' +
          '<div class="topbar-date-info">' +
            '<span class="topbar-date-value" id="topbarDateValue" style="color: #ffffff !important;"></span>' +
            '<span class="topbar-date-label" id="topbarDateLabel" style="color: #94a3b8 !important;">Date</span>' +
          '</div>' +
        '</div>' +
        '<div class="topbar-time-block">' +
          '<div class="topbar-time-icon"><i class="fas fa-clock"></i></div>' +
          '<div class="topbar-time-info">' +
            '<div class="topbar-time-value">' +
              '<span class="topbar-time-hm" id="topbarTimeHM" style="color: #ffffff !important;"></span>' +
              '<span class="topbar-time-sec" id="topbarTimeSec" style="color: #43e5ff !important;"></span>' +
              '<span class="topbar-time-period" id="topbarTimePeriod" style="color: #43e5ff !important;"></span>' +
            '</div>' +
            '<span class="topbar-time-label" id="topbarTimeLabel" style="color: #94a3b8 !important;">Cairo Time</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="topbar-actions">' +
        '<button class="btn btn-lang" id="langToggleBtn">' +
          '<span class="btn-lang-text">AR</span>' +
        '</button>' +
        '<button id="adminLockBtn" class="admin-lock-btn" title="Admin Lock/Unlock"><i class="fas fa-lock"></i></button>' +
        '<button class="btn btn-danger" id="sosBtn">' +
          '<span class="sos-pulse"></span>' +
          '<span data-hdr-i18n="sosBtn">Emergency SOS</span>' +
          '<span class="sos-number">' + EMERGENCY_NUMBER + '</span>' +
        '</button>' +
      '</div>' +
    '</header>';

  // =============================================
  // قالب التبويبات (Nav)
  // =============================================

  var navTemplate =
    '<nav class="workspace-nav" aria-label="Workspace pages">' +
      '<a class="workspace-tab" href="/Home/Home.html"><i class="fas fa-home"></i> <span data-hdr-i18n="tabHome">Home</span></a>' +
      '<a class="workspace-tab" href="/Form/Form.html"><span data-hdr-i18n="tabForm">Patient Registration</span></a>' +
      '<a class="workspace-tab" href="/MedicalRecord/MedicalRecord.html"><span data-hdr-i18n="tabMedical">Medical Record</span></a>' +
      '<a class="workspace-tab" href="/overview/overview.html"><span data-hdr-i18n="tabOverview">Overview</span></a>' +
      '<a class="workspace-tab" href="/Assessment/Assessment.html"><span data-hdr-i18n="tabAssessment">Assessment</span></a>' +
      '<a class="workspace-tab" href="/Chat/Chat.html"><i class="fas fa-robot"></i> <span data-hdr-i18n="tabChat">AI CHAT</span></a>' +
    '</nav>';

  // ✅✅ قالب نافذة الباسورد بتاعة الأدمن ✅✅
  var adminModalTemplate = 
    '<div id="adminModal" class="admin-modal">' +
      '<div class="admin-modal-content">' +
        '<h3><i class="fas fa-user-shield"></i> Admin Access</h3>' +
        '<p>Enter password to unlock navigation</p>' +
        '<input type="password" id="adminPassInput" placeholder="Password...">' +
        '<div class="admin-modal-actions">' +
          '<button id="adminLoginBtn" class="admin-btn unlock-btn">Unlock</button>' +
          '<button id="adminCancelBtn" class="admin-btn cancel-btn">Cancel</button>' +
        '</div>' +
        '<p id="adminError" class="admin-error">Incorrect Password!</p>' +
      '</div>' +
    '</div>';

  // =============================================
  // حقن الهيدر والـ Nav والـ Modal
  // =============================================

  function injectLayout() {
    if (document.getElementById('mrTopbar')) return;
    
    injectAssets();

    var appShell = document.getElementById('app');
    if (appShell) {
      appShell.insertAdjacentHTML('afterbegin', headerTemplate + navTemplate);
    } else {
      document.body.insertAdjacentHTML('afterbegin', headerTemplate + navTemplate);
    }
    
    document.body.insertAdjacentHTML('beforeend', adminModalTemplate);

    highlightActiveTab();
  }

  // =============================================
  // تحديد التبويب النشط (Active)
  // =============================================

  function highlightActiveTab() {
    var tabs = document.querySelectorAll('.workspace-tab');
    if (!tabs.length) return;

    tabs.forEach(function(tab) {
      tab.classList.remove('active');
    });

    var currentPage = window.location.pathname.split('/').pop().toLowerCase();

    if (currentPage === '' || currentPage === 'index.html') {
      var homeTab = document.querySelector('.workspace-tab[href*="Home/Home.html"]');
      if (homeTab) homeTab.classList.add('active');
      return;
    }

    tabs.forEach(function(tab) {
      var tabHref = tab.getAttribute('href').toLowerCase();
      if (tabHref.includes(currentPage)) {
        tab.classList.add('active');
      }
    });
  }

  // =============================================
  // التاريخ والوقت
  // =============================================

  var dateTimeInterval = null;

  function updateDateTime() {
    var now = new Date();
    var dateLocale = currentLang === 'ar' ? 'ar-EG' : 'en-GB';

    var dateStr = now.toLocaleDateString(dateLocale, {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    var dayName = now.toLocaleDateString(dateLocale, {
      timeZone: 'Africa/Cairo',
      weekday: 'long'
    });

    var topbarDateValue = document.getElementById('topbarDateValue');
    var topbarDateLabel = document.getElementById('topbarDateLabel');
    var topbarTimeHM = document.getElementById('topbarTimeHM');
    var topbarTimeSec = document.getElementById('topbarTimeSec');
    var topbarTimePeriod = document.getElementById('topbarTimePeriod');
    var topbarTimeLabel = document.getElementById('topbarTimeLabel');

    if (topbarDateValue) topbarDateValue.textContent = dayName + ', ' + dateStr;
    if (topbarDateLabel) topbarDateLabel.textContent = hdrI18n[currentLang].dateLabel;

    var fullTime = now.toLocaleTimeString('en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    var timeMatch = fullTime.match(/(\d{1,2}:\d{2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      if (topbarTimeHM) topbarTimeHM.textContent = timeMatch[1];
      if (topbarTimeSec) topbarTimeSec.textContent = timeMatch[2];
      if (topbarTimePeriod) {
        topbarTimePeriod.textContent = currentLang === 'ar'
          ? (timeMatch[3].toUpperCase() === 'AM' ? 'ص' : 'م')
          : timeMatch[3].toUpperCase();
      }
    }

    if (topbarTimeLabel) topbarTimeLabel.textContent = hdrI18n[currentLang].timeLabel;
  }

  function startDateTime() {
    updateDateTime();
    dateTimeInterval = setInterval(updateDateTime, 1000);
  }

  function stopDateTime() {
    if (dateTimeInterval) { clearInterval(dateTimeInterval); dateTimeInterval = null; }
  }

  // =============================================
  // تبديل اللغة
  // =============================================

  function applyHeaderLang(lang, animate) {
    currentLang = lang;
    window.MindRobotHeader.currentLang = lang;
    localStorage.setItem('mindrobot_lang', lang);

    var langToggleBtn = document.getElementById('langToggleBtn');
    var sosBtn = document.getElementById('sosBtn');
    var brandSubtitle = document.getElementById('brandSubtitle');

    var langText = langToggleBtn ? langToggleBtn.querySelector('.btn-lang-text') : null;
    if (langText) {
      if (animate) {
        langText.classList.add('switching');
        setTimeout(function () {
          langText.textContent = lang === 'ar' ? 'EN' : 'AR';
          langText.classList.remove('switching');
        }, 200);
      } else {
        langText.textContent = lang === 'ar' ? 'EN' : 'AR';
      }
    }

    var sosText = sosBtn ? sosBtn.querySelector('[data-hdr-i18n="sosBtn"]') : null;
    if (sosText) {
      if (animate) {
        sosText.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        sosText.style.opacity = '0';
        sosText.style.transform = 'translateY(-4px)';
        setTimeout(function () {
          sosText.textContent = hdrI18n[lang].sosBtn;
          sosText.style.opacity = '1';
          sosText.style.transform = 'translateY(0)';
        }, 200);
      } else {
        sosText.textContent = hdrI18n[lang].sosBtn;
      }
    }

    if (brandSubtitle) {
      if (animate) {
        brandSubtitle.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        brandSubtitle.style.opacity = '0';
        brandSubtitle.style.transform = 'translateY(-6px)';
        setTimeout(function () {
          brandSubtitle.textContent = hdrI18n[lang].subtitle;
          brandSubtitle.style.opacity = '1';
          brandSubtitle.style.transform = 'translateY(0)';
        }, 250);
      } else {
        brandSubtitle.textContent = hdrI18n[lang].subtitle;
      }
    }

    var tabKeys = ['tabHome', 'tabForm', 'tabMedical', 'tabOverview', 'tabAssessment', 'tabChat'];
    tabKeys.forEach(function(key) {
      var el = document.querySelector('[data-hdr-i18n="' + key + '"]');
      if (el) el.textContent = hdrI18n[lang][key];
    });

    // ❌ لا نغير اتجاه الصفحة - الصفحة تبقى LTR دايماً
    // document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    // document.documentElement.lang = lang;

    updateDateTime();

    var event = new CustomEvent('mindrobot:langchange', { detail: { lang: lang } });
    document.dispatchEvent(event);

    if (window.MindRobotHeader.onLanguageChange) {
      window.MindRobotHeader.onLanguageChange(lang);
    }
  }

  // =============================================
  // SOS
  // =============================================

  var sosOverlay = null;

  function createSosOverlay() {
    if (sosOverlay) return sosOverlay;

    var overlay = document.createElement('div');
    overlay.className = 'hdr-sos-overlay';
    overlay.id = 'sosOverlay';

    overlay.innerHTML =
      '<div class="hdr-sos-card">' +
        '<div class="hdr-sos-ring"><i class="fas fa-phone-alt"></i></div>' +
        '<div class="hdr-sos-title" id="sosTitle">' + hdrI18n[currentLang].sosTitle + '</div>' +
        '<div class="hdr-sos-number-display">' + EMERGENCY_NUMBER + '</div>' +
        '<div class="hdr-sos-hint" id="sosHint">' + hdrI18n[currentLang].sosHint + '</div>' +
        '<div class="hdr-sos-btns">' +
          '<button class="hdr-sos-btn hdr-sos-btn-call" id="sosCallBtn">' +
            '<i class="fas fa-phone-alt"></i> ' +
            '<span id="sosCallText">' + hdrI18n[currentLang].sosCall + '</span>' +
          '</button>' +
          '<button class="hdr-sos-btn hdr-sos-btn-cancel" id="sosCancelBtn">' +
            '<span id="sosCancelText">' + hdrI18n[currentLang].sosCancel + '</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    sosOverlay = overlay;

    document.getElementById('sosCallBtn').addEventListener('click', makeEmergencyCall);
    document.getElementById('sosCancelBtn').addEventListener('click', closeSosOverlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSosOverlay(); });

    return overlay;
  }

  function openSosOverlay() {
    var overlay = createSosOverlay();
    document.getElementById('sosTitle').textContent = hdrI18n[currentLang].sosTitle;
    document.getElementById('sosHint').textContent = hdrI18n[currentLang].sosHint;
    document.getElementById('sosCallText').textContent = hdrI18n[currentLang].sosCall;
    document.getElementById('sosCancelText').textContent = hdrI18n[currentLang].sosCancel;
    overlay.classList.add('active');
  }

  function closeSosOverlay() {
    if (sosOverlay) sosOverlay.classList.remove('active');
  }

  function makeEmergencyCall() {
    console.warn('[EMERGENCY SOS] Calling:', EMERGENCY_NUMBER, 'at', new Date().toISOString());
    var link = document.createElement('a');
    link.href = 'tel:' + EMERGENCY_NUMBER;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { if (link.parentNode) link.remove(); }, 1000);
    showToast(hdrI18n[currentLang].sosCalling + ' ' + EMERGENCY_NUMBER, 'error');
    setTimeout(closeSosOverlay, 1000);
  }

  // =============================================
  // Toast
  // =============================================

  function showToast(message, type) {
    type = type || 'info';
    var container = document.querySelector('.if-toast-box');
    if (!container) { container = document.createElement('div'); container.className = 'if-toast-box'; document.body.appendChild(container); }
    var icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
    var toast = document.createElement('div');
    toast.className = 'if-toast ' + type;
    toast.innerHTML = '<i class="if-toast-icon ' + (icons[type] || icons.info) + '"></i><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 4000);
  }

  // =============================================
  // ✅✅ Admin Lock Logic ✅✅
  // =============================================

  function applyLockState() {
    var isUnlocked = sessionStorage.getItem(SESSION_KEY) === 'true';
    var navEl = document.querySelector('.workspace-nav');
    var lockBtn = document.getElementById('adminLockBtn');

    if (!navEl || !lockBtn) return;

    if (isUnlocked) {
      navEl.classList.remove('is-locked');
      lockBtn.classList.add('is-unlocked');
      lockBtn.innerHTML = '<i class="fas fa-lock-open"></i>';
      lockBtn.title = 'Lock Navigation';
    } else {
      navEl.classList.add('is-locked');
      lockBtn.classList.remove('is-unlocked');
      lockBtn.innerHTML = '<i class="fas fa-lock"></i>';
      lockBtn.title = 'Unlock Navigation (Admin)';
    }
  }

  function bindAdminLock() {
    var lockBtn = document.getElementById('adminLockBtn');
    var modal = document.getElementById('adminModal');
    var passInput = document.getElementById('adminPassInput');
    var loginBtn = document.getElementById('adminLoginBtn');
    var cancelBtn = document.getElementById('adminCancelBtn');
    var errorTxt = document.getElementById('adminError');

    // فتح شاشة الباسورد
    function openLoginModal() {
      if(modal) {
        modal.classList.add('is-visible');
        if(passInput) passInput.value = '';
        if(errorTxt) errorTxt.style.display = 'none';
        setTimeout(function() { if(passInput) passInput.focus(); }, 100);
      }
    }

    if (lockBtn) {
      lockBtn.addEventListener('click', function() {
        var isUnlocked = sessionStorage.getItem(SESSION_KEY) === 'true';
        if (isUnlocked) {
          sessionStorage.setItem(SESSION_KEY, 'false');
          applyLockState();
        } else {
          openLoginModal();
        }
      });
    }

    if (loginBtn) {
      loginBtn.addEventListener('click', function() {
        if (passInput && passInput.value === CORRECT_PASSWORD) {
          sessionStorage.setItem(SESSION_KEY, 'true');
          if(modal) modal.classList.remove('is-visible');
          applyLockState();
        } else {
          if(errorTxt) errorTxt.style.display = 'block';
          if(passInput) { passInput.value = ''; passInput.focus(); }
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        if(modal) modal.classList.remove('is-visible');
      });
    }

    if (passInput) {
      passInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          if(loginBtn) loginBtn.click();
        }
      });
    }

    // ✅✅ اختطاف الضغطة على التبويبات لما تكون مقفولة ✅✅
    var navEl = document.querySelector('.workspace-nav');
    if (navEl) {
      navEl.addEventListener('click', function(e) {
        // لو القايمة مقفولة وداس على أي لينك جواها
        if (navEl.classList.contains('is-locked')) {
          var targetTab = e.target.closest('.workspace-tab');
          if (targetTab) {
            e.preventDefault(); // يمنع الصفحة تفتح
            openLoginModal(); // يفتح شاشة الباسورد
          }
        }
      });
    }
  }

  // =============================================
  // ربط الأحداث
  // =============================================

  function bindEvents() {
    var langToggleBtn = document.getElementById('langToggleBtn');
    var sosBtn = document.getElementById('sosBtn');

    if (langToggleBtn) {
      langToggleBtn.addEventListener('click', function () {
        var newLang = currentLang === 'en' ? 'ar' : 'en';
        applyHeaderLang(newLang, true);
      });
    }

    if (sosBtn) {
      sosBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openSosOverlay();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (sosOverlay && sosOverlay.classList.contains('active')) {
          closeSosOverlay();
        }
        var modal = document.getElementById('adminModal');
        if (modal && modal.classList.contains('is-visible')) {
          modal.classList.remove('is-visible');
        }
      }
    });

    // تفعيل أحداث القفل
    bindAdminLock();
  }

  // =============================================
  // تهيئة
  // =============================================

  function initHeader() {
    injectLayout();

    currentLang = localStorage.getItem('mindrobot_lang') || 'en';
    window.MindRobotHeader.currentLang = currentLang;

    var langToggleBtn = document.getElementById('langToggleBtn');
    var langText = langToggleBtn ? langToggleBtn.querySelector('.btn-lang-text') : null;
    if (langText) langText.textContent = currentLang === 'ar' ? 'EN' : 'AR';

    var sosBtn = document.getElementById('sosBtn');
    var sosText = sosBtn ? sosBtn.querySelector('[data-hdr-i18n="sosBtn"]') : null;
    if (sosText) sosText.textContent = hdrI18n[currentLang].sosBtn;

    var brandSubtitle = document.getElementById('brandSubtitle');
    if (brandSubtitle) brandSubtitle.textContent = hdrI18n[currentLang].subtitle;

    var tabKeysInit = ['tabHome', 'tabForm', 'tabMedical', 'tabOverview', 'tabAssessment', 'tabChat'];
    tabKeysInit.forEach(function(key) {
      var el = document.querySelector('[data-hdr-i18n="' + key + '"]');
      if (el) el.textContent = hdrI18n[currentLang][key];
    });

    // ❌ لا نغير اتجاه الصفحة - الصفحة تبقى LTR دايماً
    // document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    // document.documentElement.lang = currentLang;

    bindEvents();
    startDateTime();
    
    // ✅ تطبيق حالة القفل أول ما الصفحة تفتح
    applyLockState();

    console.log('[MindRobot Header] Initialized - Lang:', currentLang, '- Emergency:', EMERGENCY_NUMBER);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }

  window.addEventListener('beforeunload', stopDateTime);

})();