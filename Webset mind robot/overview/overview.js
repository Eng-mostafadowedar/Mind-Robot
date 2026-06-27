document.addEventListener('DOMContentLoaded', function () {

  let activeOrganGroup = 'cardio';
  let currentSensorValues = { bpm: 0, o2: 0, gsr: 0, temp: 0 };
  let currentSensorLevels = { bpm: 'off', o2: 'off', temp: 'off', gsr: 'off' };
  const API_URL = window.location.origin;

  const urlParams = new URLSearchParams(window.location.search);
  const currentMode = urlParams.get('mode') || 'guest';

  const MAX_RETRIES = 3;
  const READ_TIME = 20000;

  function numberToArabic(num) {
    if (num === 0) return '\u0635\u0641\u0631';
    var units = ['', '\u0648\u0627\u062d\u062f', '\u0627\u062b\u0646\u0627\u0646', '\u062b\u0644\u0627\u062b\u0629', '\u0623\u0631\u0628\u0639\u0629', '\u062e\u0645\u0633\u0629', '\u0633\u062a\u0629', '\u0633\u0628\u0639\u0629', '\u062b\u0645\u0627\u0646\u064a\u0629', '\u062a\u0633\u0639\u0629'];
    var teens = ['\u0639\u0634\u0631\u0629', '\u0623\u062d\u062f \u0639\u0634\u0631', '\u0627\u062b\u0646\u0627 \u0639\u0634\u0631', '\u062b\u0644\u0627\u062b\u0629 \u0639\u0634\u0631', '\u0623\u0631\u0628\u0639\u0629 \u0639\u0634\u0631', '\u062e\u0645\u0633\u0629 \u0639\u0634\u0631', '\u0633\u062a\u0629 \u0639\u0634\u0631', '\u0633\u0628\u0639\u0629 \u0639\u0634\u0631', '\u062b\u0645\u0627\u0646\u064a\u0629 \u0639\u0634\u0631', '\u062a\u0633\u0639\u0629 \u0639\u0634\u0631'];
    var tensArr = ['', '', '\u0639\u0634\u0631\u0648\u0646', '\u062b\u0644\u0627\u062b\u0648\u0646', '\u0623\u0631\u0628\u0639\u0648\u0646', '\u062e\u0645\u0633\u0648\u0646', '\u0633\u062a\u0648\u0646', '\u0633\u0628\u0639\u0648\u0646', '\u062b\u0645\u0627\u0646\u0648\u0646', '\u062a\u0633\u0639\u0648\u0646'];
    var hunds = ['', '\u0645\u0627\u0626\u0629', '\u0645\u0627\u0626\u062a\u0627\u0646', '\u062b\u0644\u0627\u062b\u0645\u0627\u0626\u0629', '\u0623\u0631\u0628\u0639\u0645\u0627\u0626\u0629', '\u062e\u0645\u0633\u0645\u0627\u0626\u0629', '\u0633\u062a\u0645\u0627\u0626\u0629', '\u0633\u0628\u0639\u0645\u0627\u0626\u0629', '\u062b\u0645\u0627\u0646\u0645\u0627\u0626\u0629', '\u062a\u0633\u0639\u0645\u0627\u0626\u0629'];
    var intPart = Math.floor(num);
    var decPart = Math.round((num - intPart) * 10);
    if (decPart === 10) { intPart++; decPart = 0; }
    var result = '';
    if (intPart >= 100) {
      result += hunds[Math.floor(intPart / 100)];
      intPart = intPart % 100;
      if (intPart > 0) result += ' \u0648';
    }
    if (intPart >= 20) {
      var t = Math.floor(intPart / 10);
      var u = intPart % 10;
      if (u === 0) { result += tensArr[t]; }
      else { result += units[u] + ' \u0648' + tensArr[t]; }
    } else if (intPart >= 11) {
      result += teens[intPart - 10];
    } else if (intPart >= 1) {
      result += units[intPart];
    }
    if (decPart > 0) {
      result += ' \u0641\u0627\u0635\u0644\u0629 ' + units[decPart];
    }
    return result;
  }

  var overviewI18n = {
    en: {
      panelTitle: 'Patient Overview', panelHint: 'Review captured patient identity and reported conditions.',
      waitingName: 'Waiting...', waitingAge: 'Age: -- years',
      bpmLabel: 'Heart Rate', o2Label: 'Oxygen Level', gsrLabel: 'Stress Level', tempLabel: 'Body Temp',
      statusNormal: 'Normal', statusElevated: 'Elevated', statusCritical: 'Critical',
      statusExcellent: 'Excellent', statusLow: 'Low', statusFever: 'Fever',
      statusCalm: 'Calm', statusStressed: 'Stressed',
      monitoringStatus: 'Monitoring...', scanningStatus: 'Scanning...',
      ageLabel: 'Age:', yearsLabel: 'years',
      countdownMsg: 'Scan starting in',
      countdownIntro: 'Welcome, I will now begin your medical checkup. Please stay calm and follow my instructions carefully.',
      countdownReady: 'Get ready, the first sensor will be the heart and oxygen sensor.',
      startMsg: 'Hello, I will now begin your medical checkup. Please follow my instructions.',
      step1Instruct: 'Now, we will measure your heart rate and oxygen level. Please place your thumb steadily on the heart and oxygen sensor.',
      step1Result: 'Your heart rate is {val} beats per minute, which is {state}. Your oxygen level is {val2} percent, which is {state2}.',
      step1NoReading: 'I could not get a clear reading. Try adjusting your thumb position on the sensor.',
      step1Retry: 'Please adjust your thumb and try again.',
      step2Instruct: 'Excellent. Now we will measure your body temperature. Please place your index finger firmly on your forehead with the temperature sensor.',
      step2Result: 'Your body temperature is {val} degrees Celsius, which is {state}.',
      step2NoReading: 'I could not get a clear reading. Make sure the temperature sensor is touching your forehead.',
      step2Retry: 'Please adjust the sensor on your forehead and try again.',
      step3Instruct: 'And finally, we will measure your stress level. Please place your index and middle fingers together on the stress sensors.',
      step3Result: 'Your stress level is {val}, which indicates you are {state}.',
      step3NoReading: 'I could not get a clear reading. Try to relax your hands more on the sensors.',
      step3Retry: 'Please relax your hands and try again.',
      finalSummary: 'The medical checkup is now complete. Thank you for your cooperation. You will now be redirected to the home screen.',
      resultGood: 'Well done.', resultWarn: 'Attention.',
      stateNormal: 'normal', stateWarning: 'slightly abnormal', stateDanger: 'critical',
      stateExcellent: 'excellent', stateLow: 'low', stateFever: 'a fever',
      stateCalm: 'calm', stateStressed: 'stressed',
      noReading: 'I could not get a clear reading.',
      retryMsg: 'Please adjust and try again.',
      maxRetriesMsg: 'Maximum attempts reached. Sensor might be disconnected. Returning to home screen.',
    },
    ar: {
      panelTitle: '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0631\u064a\u0636', panelHint: '\u0645\u0631\u0627\u062c\u0639\u0629 \u0647\u0648\u064a\u0629 \u0627\u0644\u0645\u0631\u064a\u0636 \u0648\u0627\u0644\u062d\u0627\u0644\u0627\u062a \u0627\u0644\u0645\u0628\u0644\u063a\u0629.',
      waitingName: '\u062c\u0627\u0631\u064a \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631...', waitingAge: '\u0627\u0644\u0639\u0645\u0631: -- \u0633\u0646\u0629',
      bpmLabel: '\u0645\u0639\u062f\u0644 \u0627\u0644\u0646\u0628\u0636', o2Label: '\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0623\u0643\u0633\u062c\u064a\u0646', gsrLabel: '\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u062a\u0648\u062a\u0631', tempLabel: '\u062f\u0631\u062c\u0629 \u0627\u0644\u062d\u0631\u0627\u0631\u0629',
      statusNormal: '\u0637\u0628\u064a\u0639\u064a', statusElevated: '\u0645\u0631\u062a\u0641\u0639', statusCritical: '\u062d\u0631\u062c',
      statusExcellent: '\u0645\u0645\u062a\u0627\u0632', statusLow: '\u0645\u0646\u062e\u0641\u0636', statusFever: '\u062d\u0645\u0649',
      statusCalm: '\u0647\u0627\u062f\u0626', statusStressed: '\u0645\u062a\u0648\u062a\u0631',
      monitoringStatus: '\u0645\u0631\u0627\u0642\u0628\u0629...', scanningStatus: '\u062c\u0627\u0631\u064a \u0627\u0644\u0641\u062d\u0635...',
      ageLabel: '\u0627\u0644\u0639\u0645\u0631:', yearsLabel: '\u0633\u0646\u0629',
      countdownMsg: '\u0633\u064a\u0628\u062f\u0623 \u0627\u0644\u0641\u062d\u0635 \u062e\u0644\u0627\u0644',
      countdownIntro: '\u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0643\u0645\u060c \u0633\u0623\u0628\u062f\u0623 \u0627\u0644\u0622\u0646 \u0627\u0644\u0641\u062d\u0635 \u0627\u0644\u0637\u0628\u064a. \u064a\u0631\u062c\u0649 \u0627\u0644\u0647\u062f\u0648\u0621 \u0648\u0627\u062a\u0628\u0627\u0639 \u062a\u0639\u0644\u064a\u0645\u0627\u062a\u064a \u0628\u0639\u0646\u0627\u064a\u0629.',
      countdownReady: '\u0627\u0633\u062a\u0639\u062f\u0648\u0627\u060c \u0633\u0646\u0628\u062f\u0623 \u0623\u0648\u0644\u0627\u064b \u0628\u0642\u064a\u0627\u0633 \u0645\u0639\u062f\u0644 \u0646\u0628\u0636\u0643 \u0648\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0623\u0643\u0633\u062c\u064a\u0646.',
      startMsg: '\u0645\u0631\u062d\u0628\u0627\u064b\u060c \u0633\u0623\u0628\u062f\u0623 \u0627\u0644\u0622\u0646 \u0627\u0644\u0641\u062d\u0635 \u0627\u0644\u0637\u0628\u064a \u0627\u0644\u062e\u0627\u0635 \u0628\u0643. \u064a\u0631\u062c\u0649 \u0627\u062a\u0628\u0627\u0639 \u062a\u0639\u0644\u064a\u0645\u0627\u062a\u064a.',
      step1Instruct: '\u0627\u0644\u0622\u0646 \u0633\u0646\u0642\u064a\u0633 \u0645\u0639\u062f\u0644 \u0646\u0628\u0636\u0643 \u0648\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0623\u0643\u0633\u062c\u064a\u0646. \u064a\u0631\u062c\u0649 \u0648\u0636\u0639 \u0625\u0628\u0647\u0627\u0645\u0643 \u0628\u062b\u0628\u0627\u062a \u0639\u0644\u0649 \u0627\u0644\u062c\u0647\u0627\u0632.',
      step1Result: '\u0645\u0639\u062f\u0644 \u0646\u0628\u0636\u0643 \u0647\u0648 {val} \u0646\u0628\u0636\u0629 \u0641\u064a \u0627\u0644\u062f\u0642\u064a\u0642\u0629\u060c \u0648\u0647\u064a \u062d\u0627\u0644\u0629 {state}. \u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0623\u0643\u0633\u062c\u064a\u0646 \u0644\u062f\u064a\u0643 \u0647\u0648 {val2} \u0628\u0627\u0644\u0645\u0627\u0626\u0629\u060c \u0648\u0647\u064a \u062d\u0627\u0644\u0629 {state2}.',
      step1NoReading: '\u0644\u0645 \u0623\u062a\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0642\u0631\u0627\u0621\u0629 \u0648\u0627\u0636\u062d\u0629. \u062d\u0627\u0648\u0644 \u0636\u0628\u0637 \u0625\u0628\u0647\u0627\u0645\u0643 \u062c\u064a\u062f\u0627\u064b \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      step1Retry: '\u062d\u0627\u0648\u0644 \u0636\u0628\u0637 \u0625\u0628\u0647\u0627\u0645\u0643 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      step2Instruct: '\u0645\u0645\u062a\u0627\u0632\u060c \u0627\u0644\u0622\u0646 \u0633\u0646\u0642\u064a\u0633 \u062d\u0631\u0627\u0631\u0629 \u062c\u0633\u0645\u0643. \u064a\u0631\u062c\u0649 \u0648\u0636\u0639 \u0627\u0644\u0633\u0628\u0627\u0628\u0629 \u0628\u0625\u062d\u0643\u0627\u0645 \u0639\u0644\u0649 \u062c\u0628\u0647\u062a\u0643.',
      step2Result: '\u062f\u0631\u062c\u0629 \u062d\u0631\u0627\u0631\u0629 \u062c\u0633\u0645\u0643 \u0647\u064a {val} \u062f\u0631\u062c\u0629 \u0645\u0626\u0648\u064a\u0629\u060c \u0648\u0647\u064a \u062a\u0639\u062a\u0628\u0631 {state}.',
      step2NoReading: '\u0644\u0645 \u0623\u062a\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0642\u0631\u0627\u0621\u0629 \u0648\u0627\u0636\u062d\u0629. \u062a\u0623\u0643\u062f \u0623\u0646 \u0627\u0644\u0633\u0628\u0627\u0628\u0629 \u0645\u0633\u062a\u0648\u064a\u0629 \u0639\u0644\u0649 \u062c\u0628\u0647\u062a\u0643 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      step2Retry: '\u062b\u0628\u062a \u0627\u0644\u0633\u0628\u0627\u0628\u0629 \u0639\u0644\u0649 \u062c\u0628\u0647\u062a\u0643 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      step3Instruct: '\u0648\u0623\u062e\u064a\u0631\u0627\u064b\u060c \u0633\u0646\u0642\u064a\u0633 \u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u062a\u0648\u062a\u0631 \u0644\u062f\u064a\u0643. \u064a\u0631\u062c\u0649 \u0648\u0636\u0639 \u0627\u0644\u0633\u0628\u0627\u0628\u0629 \u0648\u0627\u0644\u0648\u0633\u0637\u0649 \u0645\u0639\u0627\u064b \u0639\u0644\u0649 \u0627\u0644\u062c\u0647\u0627\u0632.',
      step3Result: '\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u062a\u0648\u062a\u0631 \u0644\u062f\u064a\u0643 \u0647\u0648 {val}\u060c \u0645\u0645\u0627 \u064a\u0634\u064a\u0631 \u0625\u0644\u0649 \u0623\u0646\u0643 {state}.',
      step3NoReading: '\u0644\u0645 \u0623\u062a\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0642\u0631\u0627\u0621\u0629 \u0648\u0627\u0636\u062d\u0629. \u062d\u0627\u0648\u0644 \u0627\u0633\u062a\u0631\u062e\u0627\u0621 \u064a\u062f\u064a\u0643 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      step3Retry: '\u0627\u0633\u062a\u0631\u062e\u064d \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      finalSummary: '\u0627\u0646\u062a\u0647\u0649 \u0627\u0644\u0641\u062d\u0635 \u0627\u0644\u0637\u0628\u064a \u0628\u0627\u0644\u0643\u0627\u0645\u0644. \u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0639\u0627\u0648\u0646\u0643. \u0633\u064a\u062a\u0645 \u062a\u062d\u0648\u064a\u0644\u0643 \u0627\u0644\u0622\u0646 \u0644\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629.',
      resultGood: '\u0623\u062d\u0633\u0646\u062a.', resultWarn: '\u0627\u0646\u062a\u0628\u0647.',
      stateNormal: '\u0637\u0628\u064a\u0639\u064a\u0629', stateWarning: '\u063a\u064a\u0631 \u0637\u0628\u064a\u0639\u064a\u0629 \u0642\u0644\u064a\u0644\u0627\u064b', stateDanger: '\u062d\u0631\u062c\u0629',
      stateExcellent: '\u0645\u0645\u062a\u0627\u0632\u0629', stateLow: '\u0645\u0646\u062e\u0641\u0636\u0629', stateFever: '\u062d\u0645\u0649',
      stateCalm: '\u0647\u0627\u062f\u0626', stateStressed: '\u0645\u062a\u0648\u062a\u0631',
      noReading: '\u0644\u0645 \u0623\u0633\u062a\u0637\u0639 \u0623\u062e\u0630 \u0627\u0644\u0642\u0631\u0627\u0621\u0629.',
      retryMsg: '\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      maxRetriesMsg: '\u0644\u0645 \u0623\u0633\u062a\u0637\u0639 \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0642\u064a\u0627\u0633. \u0633\u064a\u062a\u0645 \u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629.'
    }
  };
  var currentLang = localStorage.getItem('mindrobot_lang') || 'en';
  var speechLang = 'ar'; // Always speak Arabic

  const robotMouth = document.querySelector('.clay-mouth');
  const aiChatLog = document.getElementById('aiChatLog');
  const micBtn = document.getElementById('micBtn');
  const chatStatus = document.getElementById('chatStatus');
  const photoImg = document.getElementById('overviewPhoto');
  const photoPlaceholder = document.getElementById('overviewPhotoPlaceholder');
  const nameEl = document.getElementById('ovName');
  const ageEl = document.getElementById('ovAge');

  const overlay = document.getElementById('countdown-overlay');
  const countdownNum = document.getElementById('countdown-number');
  const countdownTxt = document.getElementById('countdown-text');

  if (micBtn) micBtn.style.display = 'none';

  let isTalking = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function fmtVal(val) {
    return numberToArabic(val);
  }

  // Helper: get redirect URL based on mode
  function getRedirectUrl() {
    if (currentMode === 'register') {
      return '/Assessment/Assessment.html';
    }
    return '/Home/Home.html';
  }

  async function showCountdown(seconds) {
    overlay.style.display = 'flex';
    var arDict = overviewI18n['ar'];
    var enDict = overviewI18n['en'];
    await playDirectAudio(arDict.countdownIntro, 'normal', enDict.countdownIntro);
    for (let i = seconds; i > 0; i--) {
      countdownNum.textContent = i;
      countdownTxt.textContent = arDict.countdownMsg + ' ' + i + ' s';
      if (i === 3) { await playDirectAudio(arDict.countdownReady, 'normal', enDict.countdownReady); }
      await sleep(1000);
    }
    overlay.style.display = 'none';
  }

  function updatePatientInfo() {
    var patients = JSON.parse(localStorage.getItem('mindrobot_patients') || '[]');
    var currentIdx = localStorage.getItem('mindrobot_currentPatientIndex');
    var patient = (patients.length > 0 && currentIdx !== null) ? patients[parseInt(currentIdx)] : null;
    var dict = overviewI18n[currentLang];
    if (patient && patient.fullName) {
      nameEl.textContent = patient.fullName;
      ageEl.textContent = dict.ageLabel + ' ' + (patient.age || '--') + ' ' + dict.yearsLabel;
      if (patient.photo) { photoImg.src = patient.photo; photoImg.style.display = 'block'; photoPlaceholder.style.display = 'none'; }
      else { photoImg.style.display = 'none'; photoPlaceholder.style.display = 'flex'; }
    } else { nameEl.textContent = dict.waitingName; ageEl.textContent = dict.waitingAge; photoImg.style.display = 'none'; photoPlaceholder.style.display = 'flex'; }
  }

  function applyOverviewLang(lang) {
    currentLang = lang;
    var dict = overviewI18n[lang];
    document.querySelectorAll('[data-i18n]').forEach(function(el) { var key = el.getAttribute('data-i18n'); if (dict[key]) el.textContent = dict[key]; });
    updatePatientInfo();
    document.querySelector('[data-organ="heart"] .sensor-label').textContent = dict.bpmLabel;
    document.querySelector('[data-organ="oxygen"] .sensor-label').textContent = dict.o2Label;
    document.querySelector('[data-organ="thermal"] .sensor-label').textContent = dict.tempLabel;
    document.querySelector('[data-organ="stress"] .sensor-label').textContent = dict.gsrLabel;
    renderVitalsData();
  }

  function getSensorState(key, val) {
    if (key === 'bpm') {
      if (val >= 60 && val <= 100) return 'normal';
      if ((val >= 50 && val < 60) || (val > 100 && val <= 110)) return 'warning';
      return 'danger';
    }
    if (key === 'o2') {
      if (val >= 95) return 'normal';
      if (val >= 90 && val < 95) return 'warning';
      return 'danger';
    }
    if (key === 'temp') {
      if (val >= 36.1 && val <= 37.2) return 'normal';
      if ((val >= 35.0 && val < 36.1) || (val > 37.2 && val <= 37.9)) return 'warning';
      return 'danger';
    }
    if (key === 'gsr') {
      if (val >= 1.0 && val <= 3.0) return 'normal';
      if (val > 3.0 && val <= 5.0) return 'warning';
      return 'danger';
    }
    return 'normal';
  }

  function getStateText(state, type, forceLang) {
    var dict = overviewI18n[forceLang || currentLang];
    if (type === 'bpm') { if(state === 'normal') return dict.stateNormal; if(state === 'warning') return dict.stateWarning; return dict.stateDanger; }
    if (type === 'o2') { if(state === 'normal') return dict.stateExcellent; if(state === 'warning') return dict.stateLow; return dict.stateDanger; }
    if (type === 'temp') {
      if(state === 'normal') return dict.stateNormal;
      if(state === 'warning') return dict.stateFever;
      return dict.stateDanger;
    }
    if (type === 'gsr') { if(state === 'normal') return dict.stateCalm; if(state === 'warning') return dict.stateStressed; return dict.stateDanger; }
    return state;
  }

  // Bilingual chat message: shows AR + EN in the ASSISTANT
  function addChatMessage(text, type, altText) {
    if (!type) type = 'normal';
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message ' + type + '-msg';
    if (altText) {
      msgDiv.innerHTML = '<div class="chat-msg-ar"><span class="chat-lang-tag">AR</span> ' + text + '</div>' +
                          '<div class="chat-msg-en"><span class="chat-lang-tag">EN</span> ' + altText + '</div>';
    } else {
      msgDiv.textContent = text;
    }
    aiChatLog.appendChild(msgDiv);
    aiChatLog.scrollTop = aiChatLog.scrollHeight;
  }

  function triggerTalk() {
    if(isTalking) return; isTalking = true;
    robotMouth.classList.add('is-talking');
    setTimeout(function() { robotMouth.classList.remove('is-talking'); isTalking = false; }, 2500);
  }

  function updateStatusBadge(valueElementId, state) {
    const valEl = document.getElementById(valueElementId); if (!valEl) return;
    const infoDiv = valEl.closest('.vital-side-info'); if (!infoDiv) return;
    const statusSpan = infoDiv.querySelector('.vital-status'); if (!statusSpan) return;
    var dict = overviewI18n[currentLang];
    statusSpan.classList.remove('success', 'warn', 'danger');
    if (valueElementId === 'sideBpm') {
      if (state === 'normal') { statusSpan.classList.add('success'); statusSpan.textContent = dict.statusNormal; }
      else if (state === 'warning') { statusSpan.classList.add('warn'); statusSpan.textContent = dict.statusElevated; }
      else { statusSpan.classList.add('danger'); statusSpan.textContent = dict.statusCritical; }
    } else if (valueElementId === 'sideO2') {
      if (state === 'normal') { statusSpan.classList.add('success'); statusSpan.textContent = dict.statusExcellent; }
      else if (state === 'warning') { statusSpan.classList.add('warn'); statusSpan.textContent = dict.statusLow; }
      else { statusSpan.classList.add('danger'); statusSpan.textContent = dict.statusCritical; }
    } else if (valueElementId === 'sideTemp') {
      if (state === 'normal') { statusSpan.classList.add('success'); statusSpan.textContent = dict.statusNormal; }
      else if (state === 'warning') { statusSpan.classList.add('warn'); statusSpan.textContent = dict.statusFever; }
      else { statusSpan.classList.add('danger'); statusSpan.textContent = dict.statusCritical; }
    } else if (valueElementId === 'sideGsr') {
      if (state === 'normal') { statusSpan.classList.add('success'); statusSpan.textContent = dict.statusCalm; }
      else if (state === 'warning') { statusSpan.classList.add('warn'); statusSpan.textContent = dict.statusStressed; }
      else { statusSpan.classList.add('danger'); statusSpan.textContent = dict.statusCritical; }
    }
  }

  function switchOrganGroup(groupKey) {
    activeOrganGroup = groupKey;
    document.querySelectorAll('.sensor-item').forEach(function(el) { el.classList.remove('active'); });
    var heartBox = document.querySelector('.heart-box');
    var o2Box = document.querySelector('.o2-box');
    var thermalBox = document.querySelector('.thermal-box');
    var stressBox = document.querySelector('.stress-box');
    [heartBox, o2Box, thermalBox, stressBox].forEach(function(box) { box.classList.remove('is-active'); });
    if (groupKey === 'cardio') {
      document.querySelector('[data-organ="heart"]').classList.add('active');
      document.querySelector('[data-organ="oxygen"]').classList.add('active');
      heartBox.classList.add('is-visible', 'is-active'); o2Box.classList.add('is-visible', 'is-active');
    } else if (groupKey === 'thermal') {
      document.querySelector('[data-organ="thermal"]').classList.add('active');
      thermalBox.classList.add('is-visible', 'is-active');
    } else if (groupKey === 'stress') {
      document.querySelector('[data-organ="stress"]').classList.add('active');
      stressBox.classList.add('is-visible', 'is-active');
    }
  }

  function renderVitalsData() {
    var displayBpm = currentSensorValues.bpm > 0 ? currentSensorValues.bpm.toFixed(0) : '--';
    var displayO2 = currentSensorValues.o2 > 0 ? currentSensorValues.o2.toFixed(0) : '--';
    var displayTemp = currentSensorValues.temp > 0 ? currentSensorValues.temp.toFixed(1) : '--';
    var displayGsr = currentSensorValues.gsr > 0 ? currentSensorValues.gsr.toFixed(1) : '--';
    document.getElementById('sensorBpm').textContent = displayBpm + ' BPM';
    document.getElementById('sensorO2').textContent = displayO2 + ' SpO2 %';
    document.getElementById('sensorGsr').textContent = displayGsr + ' \u00B5S';
    document.getElementById('sensorTemp').textContent = displayTemp + ' \u00B0C';
    var sideBpm = document.getElementById('sideBpm'); if(sideBpm) sideBpm.textContent = displayBpm;
    var sideO2 = document.getElementById('sideO2'); if(sideO2) sideO2.textContent = displayO2;
    var sideTemp = document.getElementById('sideTemp'); if(sideTemp) sideTemp.textContent = displayTemp;
    var sideGsr = document.getElementById('sideGsr'); if(sideGsr) sideGsr.textContent = displayGsr;
    if (currentSensorLevels.bpm !== 'off') updateStatusBadge('sideBpm', currentSensorLevels.bpm);
    if (currentSensorLevels.o2 !== 'off') updateStatusBadge('sideO2', currentSensorLevels.o2);
    if (currentSensorLevels.temp !== 'off') updateStatusBadge('sideTemp', currentSensorLevels.temp);
    if (currentSensorLevels.gsr !== 'off') updateStatusBadge('sideGsr', currentSensorLevels.gsr);
    var heartBox = document.querySelector('.heart-box'); var o2Box = document.querySelector('.o2-box');
    var thermalBox = document.querySelector('.thermal-box'); var stressBox = document.querySelector('.stress-box');
    if(heartBox) { if(currentSensorLevels.bpm === 'danger') heartBox.classList.add('is-danger'); else heartBox.classList.remove('is-danger'); }
    if(o2Box) { if(currentSensorLevels.o2 === 'danger') o2Box.classList.add('is-danger'); else o2Box.classList.remove('is-danger'); }
    if(thermalBox) { if(currentSensorLevels.temp === 'danger') thermalBox.classList.add('is-danger'); else thermalBox.classList.remove('is-danger'); }
    if(stressBox) { if(currentSensorLevels.gsr === 'danger') stressBox.classList.add('is-danger'); else stressBox.classList.remove('is-danger'); }
  }

  async function fetchVitals() {
    try {
      const response = await fetch(API_URL + '/vitals');
      if (!response.ok) throw new Error('Sensor API Error');
      const data = await response.json();
      currentSensorValues.bpm = data.hr || 0;
      currentSensorValues.o2 = data.spo2 || 0;
      currentSensorValues.temp = data.temp || 0;
      currentSensorValues.gsr = data.gsr || 0;
      currentSensorLevels.bpm = data.hr_level || 'off';
      currentSensorLevels.o2 = data.spo2_level || 'off';
      currentSensorLevels.temp = data.temp_level || 'off';
      currentSensorLevels.gsr = data.gsr_level || 'off';
      renderVitalsData();
    } catch (error) { console.error('Failed to fetch vitals:', error); }
  }

  async function playRobotAudio(textToSpeak, type, altText) {
    if (!type) type = 'normal';
    try {
      triggerTalk();
      chatStatus.textContent = 'Speaking...';
      const response = await fetch(API_URL + '/api/chat/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak })
      });
      addChatMessage(textToSpeak, type, altText);
      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play();
        await new Promise(function(resolve) { audio.onended = resolve; });
        URL.revokeObjectURL(audioUrl);
      }
      chatStatus.textContent = overviewI18n[currentLang].monitoringStatus;
    } catch (e) { console.error('Audio Error', e); }
  }

  async function playDirectAudio(textToSpeak, type, altText) {
    if (!type) type = 'normal';
    try {
      triggerTalk();
      chatStatus.textContent = 'Speaking...';
      const response = await fetch(API_URL + '/api/chat/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak })
      });
      addChatMessage(textToSpeak, type, altText);
      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play();
        await new Promise(function(resolve) { audio.onended = resolve; });
        URL.revokeObjectURL(audioUrl);
      }
      chatStatus.textContent = overviewI18n[currentLang].monitoringStatus;
    } catch (e) { console.error('Direct Audio Error', e); }
  }

  // measureWithRetries now accepts bilingual instruction + success message factories
  async function measureWithRetries(sensorGroup, instructAr, instructEn, checkSuccess, getSuccessMsgAr, getSuccessMsgEn, noReadingKey) {
    var arDict = overviewI18n['ar'];
    var enDict = overviewI18n['en'];
    switchOrganGroup(sensorGroup);
    await fetch(API_URL + '/api/set_sensor_state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensor: sensorGroup, state: 'reading' })
    });
    await playDirectAudio(instructAr, 'normal', instructEn);
    for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      chatStatus.textContent = 'Scanning... Attempt ' + attempt + '/' + MAX_RETRIES;
      currentSensorValues = { bpm: 0, o2: 0, gsr: 0, temp: 0 };
      currentSensorLevels = { bpm: 'off', o2: 'off', temp: 'off', gsr: 'off' };
      renderVitalsData();
      await sleep(READ_TIME);
      await fetchVitals();
      if (checkSuccess()) {
        var msgAr = getSuccessMsgAr();
        var msgEn = getSuccessMsgEn();
        await playDirectAudio(msgAr, 'normal', msgEn);
        await fetch(API_URL + '/api/set_sensor_state', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sensor: sensorGroup, state: 'done' })
        });
        return true;
      }
      if (attempt < MAX_RETRIES) {
        await playDirectAudio(arDict[noReadingKey], 'warning', enDict[noReadingKey]);
      }
    }
    await fetch(API_URL + '/api/set_sensor_state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensor: sensorGroup, state: 'error' })
    });
    await playDirectAudio(arDict.maxRetriesMsg, 'error', enDict.maxRetriesMsg);
    await sleep(3000);
    fetch('/api/sensors/stop', {method:'POST'}).catch(()=>{}); window.location.href = getRedirectUrl();
    return false;
  }

  async function runMedicalSequence() {
    var arDict = overviewI18n['ar'];
    var enDict = overviewI18n['en'];

    await showCountdown(15);
    await fetch(API_URL + '/api/start_sensors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: currentMode })
    });
    setInterval(fetchVitals, 1500);

    // Step 1: Heart Rate + Oxygen
    var step1Success = await measureWithRetries(
      'cardio',
      arDict.step1Instruct, enDict.step1Instruct,
      function() { return currentSensorValues.bpm > 0 && currentSensorValues.o2 > 0; },
      function() {
        var hrState = currentSensorLevels.bpm;
        var o2State = currentSensorLevels.o2;
        var allNormal = (hrState === 'normal' && o2State === 'normal');
        var prefix = allNormal ? (arDict.resultGood + ' ') : (arDict.resultWarn + ' ');
        return prefix + arDict.step1Result
          .replace('{val}', fmtVal(currentSensorValues.bpm))
          .replace('{state}', getStateText(hrState, 'bpm'))
          .replace('{val2}', fmtVal(currentSensorValues.o2))
          .replace('{state2}', getStateText(o2State, 'o2'));
      },
      function() {
        var hrState = currentSensorLevels.bpm;
        var o2State = currentSensorLevels.o2;
        var allNormal = (hrState === 'normal' && o2State === 'normal');
        var prefix = allNormal ? (enDict.resultGood + ' ') : (enDict.resultWarn + ' ');
        return prefix + enDict.step1Result
          .replace('{val}', currentSensorValues.bpm.toFixed(0))
          .replace('{state}', getStateText(hrState, 'bpm', 'en'))
          .replace('{val2}', currentSensorValues.o2.toFixed(0))
          .replace('{state2}', getStateText(o2State, 'o2', 'en'));
      },
      'step1NoReading'
    );
    if (!step1Success) return;

    // Step 2: Temperature
    var step2Success = await measureWithRetries(
      'thermal',
      arDict.step2Instruct, enDict.step2Instruct,
      function() { return currentSensorValues.temp > 0; },
      function() {
        var tempState = currentSensorLevels.temp;
        var prefix = (tempState === 'normal') ? (arDict.resultGood + ' ') : (arDict.resultWarn + ' ');
        return prefix + arDict.step2Result
          .replace('{val}', fmtVal(currentSensorValues.temp))
          .replace('{state}', getStateText(tempState, 'temp'));
      },
      function() {
        var tempState = currentSensorLevels.temp;
        var prefix = (tempState === 'normal') ? (enDict.resultGood + ' ') : (enDict.resultWarn + ' ');
        return prefix + enDict.step2Result
          .replace('{val}', currentSensorValues.temp.toFixed(1))
          .replace('{state}', getStateText(tempState, 'temp', 'en'));
      },
      'step2NoReading'
    );
    if (!step2Success) return;

    // Step 3: Stress (GSR)
    var step3Success = await measureWithRetries(
      'stress',
      arDict.step3Instruct, enDict.step3Instruct,
      function() { return currentSensorValues.gsr > 0; },
      function() {
        var gsrState = currentSensorLevels.gsr;
        var prefix = (gsrState === 'normal') ? (arDict.resultGood + ' ') : (arDict.resultWarn + ' ');
        return prefix + arDict.step3Result
          .replace('{val}', fmtVal(currentSensorValues.gsr))
          .replace('{state}', getStateText(gsrState, 'gsr'));
      },
      function() {
        var gsrState = currentSensorLevels.gsr;
        var prefix = (gsrState === 'normal') ? (enDict.resultGood + ' ') : (enDict.resultWarn + ' ');
        return prefix + enDict.step3Result
          .replace('{val}', currentSensorValues.gsr.toFixed(1))
          .replace('{state}', getStateText(gsrState, 'gsr', 'en'));
      },
      'step3NoReading'
    );
    if (!step3Success) return;

    // All measurements complete — mode-aware final message
    var finalMsgAr, finalMsgEn;
    if (currentMode === 'register') {
      finalMsgAr = '\u0627\u0646\u062a\u0647\u0649 \u0627\u0644\u0641\u062d\u0635 \u0627\u0644\u0637\u0628\u064a \u0628\u0627\u0644\u0643\u0627\u0645\u0644. \u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0639\u0627\u0648\u0646\u0643. \u0633\u064a\u062a\u0645 \u062a\u062d\u0648\u064a\u0644\u0643 \u0627\u0644\u0622\u0646 \u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0637\u0628\u064a.';
      finalMsgEn = 'The medical checkup is now complete. Thank you for your cooperation. You will now be redirected to the medical report page.';
    } else {
      finalMsgAr = arDict.finalSummary;
      finalMsgEn = enDict.finalSummary;
    }
    await playDirectAudio(finalMsgAr, 'normal', finalMsgEn);
    await sleep(3000);
    fetch('/api/sensors/stop', {method:'POST'}).catch(()=>{}); window.location.href = getRedirectUrl();
  }

  updatePatientInfo();
  applyOverviewLang(currentLang);
  runMedicalSequence();
});