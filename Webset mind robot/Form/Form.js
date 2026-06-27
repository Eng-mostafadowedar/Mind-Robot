var lang = localStorage.getItem('mindrobot_lang') || 'en';
var API = window.location.origin;
var capturedBlob = null;
var capturedDataUrl = '';
var detTimer = null;
var camClock = null;
var faceOk = false; faceStable = 0;
var faceStable = 0;

var formTxt = {
  ar: {
    fillFields: 'يرجى ملء جميع الحقول المطلوبة',
    saved: 'تم الحفظ بنجاح',
    saving: 'جارٍ الحفظ...',
    capturing: 'جارٍ الالتقاط...',
    camWait: 'جاري تشغيل الكاميرا...',
    camOff: 'الكاميرا غير متصلة',
    faceOk: 'تم التعرف على الوجه',
    faceWait: 'بانتظار الوجه...',
    retake: 'إعادة',
    next: 'التالي',
    male: 'ذكر',
    female: 'أنثى'
  },
  en: {
    fillFields: 'Please fill all required fields',
    saved: 'Saved successfully',
    saving: 'Saving...',
    capturing: 'Capturing...',
    camWait: 'Starting camera...',
    camOff: 'Camera not connected',
    faceOk: 'Face detected',
    faceWait: 'Waiting for face...',
    retake: 'Retake',
    next: 'NEXT',
    male: 'Male',
    female: 'Female'
  }
};

function setupDropdown(triggerId, menuId, inputId) {
  var trig = document.getElementById(triggerId);
  var menu = document.getElementById(menuId);
  var inp = document.getElementById(inputId);
  if (!trig || !menu) return;
  trig.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  var items = menu.querySelectorAll('li, [data-value]');
  items.forEach(function(item) {
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      var val = item.getAttribute('data-value') || item.textContent;
      inp.value = val;
      trig.querySelector('span').textContent = item.textContent;
      menu.style.display = 'none';
    });
  });
  document.addEventListener('click', function() { menu.style.display = 'none'; });
}

function updateDateTime() {
  var now = new Date();
  var dEl = document.getElementById('patientDate');
  var tEl = document.getElementById('patientTime');
  if (dEl) dEl.value = now.toISOString().split('T')[0];
  if (tEl) tEl.value = now.toTimeString().slice(0, 5);
}

function initCamera() {
  var container = document.getElementById('cameraVideo');
  if (!container) return;
  container.innerHTML = '<img id="camImg" alt="Camera" src="/camera/stream">';
  
  var wait = document.getElementById("cameraWaiting");
  if (wait) wait.style.display = "none";
  startFaceDetection();
}

function startFaceDetection() {
  stopDetection();
  var prompt = document.getElementById('camPrompt');
  if (prompt) prompt.textContent = formTxt[lang].faceWait;
  detTimer = setInterval(function() {
    fetch(API + '/camera/detect', { method: 'GET', cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var faceBox = document.getElementById('faceBox');
        if (d.face_detected) {
          if (faceBox) faceBox.classList.add('detected');
          faceStable++;
          if (faceStable >= 3 && faceOk === false) {
            faceOk = true;
            if (prompt) prompt.textContent = formTxt[lang].faceOk;
            setTimeout(function() { autoCapture(); }, 800);
          }
        } else {
          faceStable = 0;
          if (faceBox) faceBox.classList.remove('detected');
        }
      })
  }, 2000);
}

function stopDetection() {
  if (detTimer) { clearInterval(detTimer); detTimer = null; }
}

function autoCapture() {
  stopDetection();
  var prompt = document.getElementById('camPrompt');
  if (prompt) prompt.textContent = formTxt[lang].capturing;
  fetch(API + '/camera/capture', { method: 'POST' })
    .then(function(r) { return r.blob(); })
    .then(function(blob) {
      capturedBlob = blob;
      var url = URL.createObjectURL(blob);
      capturedDataUrl = url;
      var capDiv = document.getElementById('capturedPreview');
      var capImg = document.getElementById('capturedImage');
      var placeholder = document.getElementById('photoPlaceholder');
      if (capImg) capImg.src = url;
      if (capDiv) capDiv.style.display = 'flex';
      if (placeholder) placeholder.style.display = 'none';
      if (prompt) prompt.textContent = formTxt[lang].faceOk;
    })
    .catch(function() {
      if (prompt) prompt.textContent = formTxt[lang].camOff;
    });
}

function retakePhoto() {
  faceOk = false; faceStable = 0;
  capturedBlob = null;
  capturedDataUrl = '';
  var capDiv = document.getElementById('capturedPreview');
  var capImg = document.getElementById('capturedImage');
  var placeholder = document.getElementById('photoPlaceholder');
  if (capImg) capImg.src = '';
  if (capDiv) capDiv.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
  startFaceDetection();
}

function clearErrors(){
document.querySelectorAll('.if-field.has-error').forEach(function(f){f.classList.remove('has-error');});
}
function validateForm() {
  clearErrors();
  var ok=true;
  var required = ['patientName', 'patientAge', 'patientWeight', 'patientHeight', 'patientOccupation', 'patientPhone', 'patientEmail', 'patientCity'];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById(required[i]);
    if (!el || !el.value.trim()) {
      var p=el.closest('.if-field');
      if(p)p.classList.add('has-error');
      ok=false;
    }
  }
  ['patientGender','patientBloodType','patientGovernorate'].forEach(function(id){
    var el=document.getElementById(id);
    if(!el||!el.value){var p=el.closest('.if-field');if(p)p.classList.add('has-error');ok=false;}
  });
  return ok;
}

function buildPatientData() {
  return {
    firstName: document.getElementById('patientName').value.trim(),
    lastName: document.getElementById('patientName').value.trim().split(' ').pop(),
    age: parseInt(document.getElementById('patientAge').value) || 0,
    gender: document.getElementById('patientGender').value,
    weight: parseFloat(document.getElementById('patientWeight').value) || 0,
    height: parseFloat(document.getElementById('patientHeight').value) || 0,
    bloodType: document.getElementById('patientBloodType').value,
    occupation: document.getElementById('patientOccupation').value.trim(),
    phone: '+20' + document.getElementById('patientPhone').value.trim(),
    email: document.getElementById('patientEmail').value.trim() + '@gmail.com',
    address: [document.getElementById('patientCity').value.trim(), document.getElementById('patientGovernorate').value].filter(Boolean).join(', '),
    visitDate: (document.getElementById('patientDate').value || '') + 'T' + (document.getElementById('patientTime').value || ''),
    timestamp: new Date().toISOString(),
    photo: ''
  };
}


function translateGovDropdown(l){
var items=document.querySelectorAll('#govMenu .if-dropdown-item');
items.forEach(function(item){
var v=item.getAttribute('data-value');
if(govNames&&govNames[v]){item.innerHTML='<i class="fas fa-map-pin"></i> '+govNames[v][l];}
});
var gv=document.getElementById('patientGovernorate');
var gs=document.getElementById('govSelected');
if(gv&&gv.value&&govNames&&govNames[gv.value]){gs.textContent=govNames[gv.value][l];}
}

function populateCities(gov){
var m=document.getElementById('cityMenu'),s=document.getElementById('citySelected'),i=document.getElementById('patientCity'),t=document.getElementById('cityTrigger');
if(!m)return;var old=i.value;m.innerHTML='';
var l=localStorage.getItem('mindrobot_lang')||'en';
if(!gov||!govCities||!govCities[gov]){i.value='';s.textContent=l==='ar'?'اختر المحافظة أولاً':'Select governorate first';t.disabled=true;t.style.opacity='0.5';return;}
t.disabled=false;t.style.opacity='1';
var arC=govCities[gov].ar,enC=govCities[gov].en;
for(var x=0;x<arC.length;x++){
var d=document.createElement('div');d.className='if-dropdown-item';d.setAttribute('data-value',arC[x]);
d.innerHTML='<i class="fas fa-city"></i> '+(l==='ar'?arC[x]:enC[x]);
d.addEventListener('click',function(){i.value=this.getAttribute('data-value');s.textContent=this.textContent;m.style.display='none';});
m.appendChild(d);}
if(old){var idx=arC.indexOf(old);if(idx>=0){i.value=old;s.textContent=l==='ar'?arC[idx]:enC[idx];}else{i.value='';}}
}

function doSubmit(data, btn) {
  localStorage.setItem('mindrobot_current_patient', JSON.stringify(data));
    window.location.href = '/MedicalRecord/MedicalRecord.html';
  fetch(API + '/api/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); }).then(function() {
    fetch(API + '/api/stats/increment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'registered' })
    }).catch(function() {});
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> ' + formTxt[lang].saved;
      btn.style.background = 'linear-gradient(90deg,#2ee59d,#27ae60)';
      btn.style.color = '#fff';
    }
    window.location.href = '/MedicalRecord/MedicalRecord.html';
  }).catch(function() {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-arrow-right"></i> ' + (lang === 'ar' ? 'التالي' : 'NEXT');
    }
  });
}

function submitPatient() {
  if (!validateForm()) return;
  var btn = document.getElementById('nextBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + formTxt[lang].saving; }
  if (capturedBlob) {
    var reader = new FileReader();
    reader.onload = function() {
      var data = buildPatientData();
      data.photo = reader.result;
      doSubmit(data, btn);
    };
    reader.readAsDataURL(capturedBlob);
  } else {
    doSubmit(buildPatientData(), btn);
  }
}

window.addEventListener('DOMContentLoaded', function() {
  setupDropdown('genderTrigger', 'genderMenu', 'patientGender');
  setupDropdown('bloodTypeTrigger', 'bloodTypeMenu', 'patientBloodType');
  setupDropdown('cityTrigger', 'cityMenu', 'patientCity');
  var ct=document.getElementById('cityTrigger');if(ct){ct.disabled=true;ct.style.opacity='0.5';}
  setupDropdown('govTrigger', 'govMenu', 'patientGovernorate');
  document.getElementById('govMenu').querySelectorAll('[data-value]').forEach(function(item){item.addEventListener('click',function(){populateCities(this.getAttribute('data-value'));});});
  populateCities('');
  translateGovDropdown(lang);
  updateDateTime();
  setInterval(updateDateTime, 60000);
  initCamera();
  var rb = document.getElementById('retakeBtn');
  if (rb) rb.addEventListener('click', function(e) { e.preventDefault(); retakePhoto(); });
  var nb = document.getElementById('nextBtn');
  document.querySelectorAll('input[data-required], .if-dropdown-trigger[data-required]').forEach(function(el){el.addEventListener('input',function(){clearErrors();});el.addEventListener('click',function(){clearErrors();});});
  if (nb) nb.addEventListener('click', function(e) { e.preventDefault(); submitPatient(); });
  document.addEventListener('mindrobot:langchange', function(e) { lang = e.detail.lang || 'ar'; translateGovDropdown(lang); populateCities(document.getElementById('patientGovernorate').value); });
});
