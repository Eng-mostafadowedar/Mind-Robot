/**
 * Medical Record - MindRobot v4
 * Grid Layout | Timer → Home | Badge Counts
 */

document.addEventListener('DOMContentLoaded', function () {

  var mrI18n = {
    en: { toastComplete: 'Please complete all highlighted sections', toastSaved: 'Saved successfully!' },
    ar: { toastComplete: 'يرجى إكمال جميع الأقسام المميزة', toastSaved: 'تم الحفظ بنجاح!' }
  };

  var currentLang = localStorage.getItem('mindrobot_lang') || 'en';
  var recordData = {};

  /* 0. Timer */
  var TIMER_DURATION = 120;
  var timerRemaining = TIMER_DURATION;
  var timerInterval = null;
  var timerStarted = false;

  function updateTimerDisplay() {
    var mins = Math.floor(timerRemaining / 60);
    var secs = timerRemaining % 60;
    var tv = document.getElementById('timerValue');
    var tf = document.getElementById('timerFill');
    if (tv) tv.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    if (tf) {
      tf.style.width = (timerRemaining / TIMER_DURATION * 100) + '%';
      if (timerRemaining <= 10) { tf.className = 'mr-timer-fill critical'; }
      else if (timerRemaining <= 30) { tf.className = 'mr-timer-fill warning'; }
      else { tf.className = 'mr-timer-fill'; }
    }
    if (tv) {
      if (timerRemaining <= 10) { tv.className = 'mr-timer-value critical'; }
      else if (timerRemaining <= 30) { tv.className = 'mr-timer-value warning'; }
      else { tv.className = 'mr-timer-value'; }
    }
  }

  function timerTick() {
    timerRemaining--;
    updateTimerDisplay();
    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      autoSaveAndRedirect();
    }
  }

  function startTimer() {
    if (timerStarted) return;
    timerStarted = true;
    timerRemaining = TIMER_DURATION;
    updateTimerDisplay();
    timerInterval = setInterval(timerTick, 1000);
  }

  function resetTimer() {
    if (!timerStarted) return;
    clearInterval(timerInterval);
    timerRemaining = TIMER_DURATION;
    updateTimerDisplay();
    timerInterval = setInterval(timerTick, 1000);
  }

  function autoSaveAndRedirect() {
    var allCards = document.querySelectorAll('.mr-card[data-required="true"]');
    recordData = {};
    allCards.forEach(function(card) {
      var cardKey = card.getAttribute('data-category-key');
      var selectedValues = [];
      card.querySelectorAll('.mr-chip.active').forEach(function(chip) {
        selectedValues.push(chip.getAttribute('data-value'));
      });
      recordData[cardKey] = selectedValues;
    });
    var patient = JSON.parse(localStorage.getItem('mindrobot_current_patient') || 'null');
    if (patient) {
      patient.medicalRecord = recordData;
      localStorage.setItem('mindrobot_current_patient', JSON.stringify(patient));
    }
    window.location.href = '/overview/overview.html?mode=register';
  }

  startTimer();

  /* 1. Accordion */
  var cardHeaders = document.querySelectorAll('.mr-card-header');
  cardHeaders.forEach(function(header) {
    header.addEventListener('click', function() {
      var parentCard = this.closest('.mr-card');
      parentCard.classList.toggle('open');
      parentCard.classList.remove('has-error');
    });
  });

  /* 2. Badge counter helper */
  function updateBadge(card) {
    var badge = card.querySelector('.mr-card-count');
    if (!badge) return;
    var cnt = card.querySelectorAll('.mr-chip.active').length;
    badge.textContent = cnt;
    badge.classList.toggle('has-items', cnt > 0);
  }

  /* 3. Chips Logic */
  var chips = document.querySelectorAll('.mr-chip');
  chips.forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      resetTimer();
      var parentCard = this.closest('.mr-card');
      var isUnsure = this.getAttribute('data-unsure') === 'true';
      parentCard.classList.remove('has-error');

      if (this.classList.contains('active')) {
        this.classList.remove('active');
      } else {
        if (isUnsure) {
          parentCard.querySelectorAll('.mr-chip:not(.mr-chip-unsure)').forEach(function(c) { c.classList.remove('active'); });
          this.classList.add('active');
        } else {
          parentCard.querySelector('.mr-chip-unsure').classList.remove('active');
          this.classList.add('active');
        }
      }

      if (parentCard.querySelectorAll('.mr-chip.active').length > 0) {
        parentCard.classList.add('has-selection');
      } else {
        parentCard.classList.remove('has-selection');
      }

      updateBadge(parentCard);
    });
  });

  /* 4. NEXT Button */
  var nextBtn = document.getElementById('btnNext');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      clearInterval(timerInterval);
      var isValid = true;
      var requiredCards = document.querySelectorAll('.mr-card[data-required="true"]');
      requiredCards.forEach(function(card) { card.classList.remove('has-error'); });

      requiredCards.forEach(function(card) {
        var activeChips = card.querySelectorAll('.mr-chip.active');
        if (activeChips.length === 0) {
          isValid = false;
          card.classList.add('has-error');
          card.classList.add('open');
        }
      });

      if (!isValid) {
        showToast(mrI18n[currentLang].toastComplete, 'error');
        var firstError = document.querySelector('.mr-card.has-error');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      /* Save data */
      recordData = {};
      requiredCards.forEach(function(card) {
        var cardKey = card.getAttribute('data-category-key');
        var activeChips = card.querySelectorAll('.mr-chip.active');
        var selectedValues = [];
        activeChips.forEach(function(chip) { selectedValues.push(chip.getAttribute('data-value')); });
        recordData[cardKey] = selectedValues;
      });

      /* Save to current patient in localStorage */
      var patient = JSON.parse(localStorage.getItem('mindrobot_current_patient') || 'null');
      if (patient) {
        patient.medicalRecord = recordData;
        localStorage.setItem('mindrobot_current_patient', JSON.stringify(patient));
        showToast(mrI18n[currentLang].toastSaved, 'success');
        setTimeout(function() { window.location.href = '/overview/overview.html?mode=register'; }, 1000);
      }
    });
  }

  /* 5. Toast */
  function showToast(message, type) {
    type = type || 'info';
    var container = document.querySelector('.if-toast-box');
    if (!container) {
      container = document.createElement('div');
      container.className = 'if-toast-box';
      container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
    var icons = { success: '✓', error: '✕', info: 'ℹ' };
    var toast = document.createElement('div');
    toast.style.cssText = 'background:var(--bg1);border:1px solid var(--stroke);padding:14px 22px;border-radius:14px;color:#fff;display:flex;align-items:center;gap:12px;font-family:var(--app-font);box-shadow:0 10px 30px rgba(0,0,0,0.4);';
    toast.innerHTML = '<span style="font-size:18px;">' + (icons[type] || 'ℹ') + '</span><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 3000);
  }

  /* 6. Language change */
  document.addEventListener('mindrobot:langchange', function (e) {
    currentLang = e.detail.lang;
  });

});