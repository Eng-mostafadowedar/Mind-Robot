/**
 * Chat.js v22.1 — MindRobot AI Chat
 * ═══════════════════════════════════════════════════
 * v22.1 CHANGES:
 *   ✅ addMessage() — newlines display properly (innerHTML + <br>)
 *   ✅ addMessage() — basic formatting (bold)
 *   ✅ showWelcomeIntro() — uses /api/chat/greeting API
 *   ✅ Removed setRobotMode() — endpoint doesn't exist
 *   ✅ TTS: /api/chat/tts
 *   ✅ 5-min inactivity → redirect to home
 *   ✅ robotLabel = "مايند"
 */

/* ═══════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════ */

var SERVER_URL = 'http://' + window.location.hostname + ':8000';

var sessionId = '';
var chatBusy = false;

// Audio state
var isListening = false;
var isRecording = false;
var continuousMode = false;
var continuousStreamReady = false;
var mediaStream = null;
var audioContext = null;
var analyserNode = null;
var mediaRecorder = null;
var audioChunks = [];

// TTS state
var currentTTS = null;
var currentTTSUrl = null;

// Timers
var autoResetTimer = null;
var inactivityTimer = null;

// VAD — thresholds for Pi mic
var VAD_CONFIG = {
    ENERGY_THRESHOLD: 0.008,
    SILENCE_TIMEOUT: 4000,
    MIN_SPEECH_DURATION: 300,
    HIGH_PASS_FREQ: 200,
    MOVING_AVG_SIZE: 5,
    FFT_SIZE: 512,
    SPEECH_MIN_PEAK: 0.012
};

var MIN_BLOB_SIZE = 2000;
var MAX_BLOB_SIZE = 500000;
var DEBUG_MODE = true;
var COOLDOWN_MS = 2000;

// DOM refs
var chatMessages = null;
var messageInput = null;
var sendBtn = null;
var micBtn = null;
var understoodBtn = null;
var continuousBtn = null;
var listeningIndicator = null;
var thinkingIndicator = null;
var statusText = null;
var continuousBanner = null;

/* ═══════════════════════════════════════════════════
   i18n — Arabic only
   ═══════════════════════════════════════════════════ */

var chatLang = 'ar';

var chatI18n = {
    ar: {
        userLabel: 'أنت',
        robotLabel: 'مايند',
        thinking: 'جاري التفكير...',
        listening: 'أستمع...',
        recording: 'تسجيل...',
        micOff: 'المايك مقفول',
        manualRecording: 'تسجيل... اضغط تاني للإيقاف والإرسال',
        micError: 'مش قادر أفتح المايك',
        sttRecognizing: 'جاري التعرف على الكلام...',
        sttNoise: 'ضوضاء — حاول تاني...',
        sttError: 'خطأ في التعرف على الكلام',
        replying: 'جاري الرد...',
        confirmTitle: 'هل ده اللي قلته؟',
        confirmSend: 'إرسال',
        confirmRetry: 'أعد التسجيل',
        confirmCancel: 'إلغاء',
        connectionError: 'حصل خطأ في الاتصال',
        ttsError: 'معلش حصل خطأ',
        resumedChat: '— استأنفنا المحادثة —',
        inputPlaceholder: 'اكتب رسالتك...',
        continuousActive: 'محادثة مستمرة — اتكلم براحتك',
        continuousOn: 'الوضع المستمر شغال',
        continuousOff: 'الوضع المستمر مقفول',
        continuousListening: 'باسمعك... اتكلم دلوقتي',
        continuousProcessing: 'باجهز الرد...',
        continuousWaiting: 'باستنى الصوت يخلص...',
        understood: 'فاهم'
    }
};

function t(key) {
    if (chatI18n[chatLang] && chatI18n[chatLang][key]) return chatI18n[chatLang][key];
    return key;
}

function applyChatLang(lang) {
    chatLang = lang;
    if (messageInput) messageInput.placeholder = t('inputPlaceholder');

    var els = document.querySelectorAll('[data-chat-i18n]');
    for (var i = 0; i < els.length; i++) {
        var key = els[i].getAttribute('data-chat-i18n');
        if (chatI18n[lang] && chatI18n[lang][key]) {
            els[i].textContent = chatI18n[lang][key];
        }
    }

    if (continuousBanner) {
        var bannerSpan = continuousBanner.querySelector('span');
        if (bannerSpan) bannerSpan.textContent = t('continuousActive');
    }
}

function applyArabicChat() {
    chatLang = 'ar';
    applyChatLang('ar');
}

/* ═══════════════════════════════════════════════════
   TEXT FORMATTING — newlines + basic markdown
   ═══════════════════════════════════════════════════ */

function formatText(text) {
    if (!text) return '';

    // Escape HTML first (prevent XSS)
    var html = text;
    html = html.replace(/&/g, '&amp;');
    html = html.replace(/</g, '&lt;');
    html = html.replace(/>/g, '&gt;');

    // Newlines → <br>
    html = html.replace(/\n/g, '<br>');

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    return html;
}

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Chat] Initializing v22.1 — MindRobot...');

    chatMessages = document.getElementById('chatMessages');
    messageInput = document.getElementById('messageInput');
    sendBtn = document.getElementById('sendBtn');
    micBtn = document.getElementById('micBtn');
    understoodBtn = document.getElementById('understoodBtn');
    continuousBtn = document.getElementById('continuousBtn');
    listeningIndicator = document.getElementById('listeningIndicator');
    thinkingIndicator = document.getElementById('thinkingIndicator');
    statusText = document.getElementById('statusText');
    continuousBanner = document.getElementById('continuousBanner');

    sessionId = generateSessionId();

    applyArabicChat();

    // Event Listeners
    sendBtn.addEventListener('click', handleSendText);
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    });

    micBtn.addEventListener('click', handleMicToggle);
    understoodBtn.addEventListener('click', handleUnderstood);
    continuousBtn.addEventListener('click', handleContinuousToggle);

    window.addEventListener('beforeunload', handleCleanup);

    document.addEventListener('mindrobot:langchange', function(e) {
        applyArabicChat();
    });

    // Init: load history, then welcome if fresh
    loadHistory().then(function(hadHistory) {
        if (!hadHistory) {
            showWelcomeIntro();
        }
        setStatus('');
    }).catch(function(err) {
        console.warn('[Chat] Init error:', err);
        showWelcomeIntro();
    });

    resetInactivityTimer();
    console.log('[Chat] Ready | Session:', sessionId);
});

function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 8) + '_' + Date.now();
}

function logDebug(msg) {
    if (DEBUG_MODE) console.log('[Chat]', msg);
}

/* ═══════════════════════════════════════════════════
   WELCOME INTRO — from /api/chat/greeting API
   ═══════════════════════════════════════════════════ */

function showWelcomeIntro() {
    console.log('[Chat] Fetching greeting from API...');

    fetch(SERVER_URL + '/api/chat/greeting?session_id=' + encodeURIComponent(sessionId))
    .then(function(res) { return res.json(); })
    .then(function(data) {
        var greetingText = '';
        if (data && data.greeting) {
            greetingText = data.greeting;
        } else {
            greetingText = 'أهلاً بيك يا بشوي! أنا مايند، روبوت ذكي اتعمل في الجيزة، مصر. إيه رأيك نعمل النهاردة؟';
        }

        addMessage(greetingText, 'assistant');

        setTimeout(function() {
            speakText(greetingText);
        }, 500);
    })
    .catch(function(err) {
        console.warn('[Chat] Greeting API error:', err);
        var fallback = 'أهلاً بيك يا بشوي! أنا مايند، روبوت ذكي اتعمل في الجيزة، مصر. إيه رأيك نعمل النهاردة؟';
        addMessage(fallback, 'assistant');
        setTimeout(function() {
            speakText(fallback);
        }, 500);
    });
}

/* ═══════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════ */

function addMessage(text, sender) {
    if (!chatMessages) return;

    var div = document.createElement('div');
    div.className = 'message ' + sender;

    var label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = (sender === 'user') ? t('userLabel') : t('robotLabel');

    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Use innerHTML with formatting
    if (sender === 'assistant') {
        bubble.innerHTML = formatText(text);
    } else {
        var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        bubble.innerHTML = escaped.replace(/\n/g, '<br>');
    }

    div.appendChild(label);
    div.appendChild(bubble);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
    if (!chatMessages) return;

    var div = document.createElement('div');
    div.className = 'message system';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showThinking(show) {
    if (thinkingIndicator) thinkingIndicator.style.display = show ? 'flex' : 'none';
    if (statusText && show) statusText.textContent = t('thinking');
}

function showListeningUI(show) {
    if (listeningIndicator) listeningIndicator.style.display = show ? 'flex' : 'none';
}

function setStatus(text) {
    if (statusText) statusText.textContent = text;
}

function showUnderstoodBtn(show) {
    if (!understoodBtn) return;
    understoodBtn.style.display = show ? 'flex' : 'none';
}

// 5-min inactivity → redirect to home
function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function() {
        console.log('[Chat] Inactivity timeout (5 min) — redirecting...');
        window.location.href = SERVER_URL + '/Home/Home.html';
    }, 300000);
}

function resetAutoResetTimer() {
    if (autoResetTimer) clearTimeout(autoResetTimer);
    autoResetTimer = setTimeout(function() {
        if (isRecording && !chatBusy) {
            console.log('[Chat] Auto-reset: recording too long');
            stopRecordingAndProcess();
        }
    }, 15000);
}

/* ═══════════════════════════════════════════════════
   BUTTON HANDLERS
   ═══════════════════════════════════════════════════ */

function handleSendText() {
    var text = messageInput ? messageInput.value.trim() : '';
    if (!text || chatBusy) return;

    chatBusy = true;
    messageInput.value = '';
    resetInactivityTimer();
    stopAllRecording();
    showUnderstoodBtn(false);
    stopTTS();

    addMessage(text, 'user');
    showThinking(true);

    fetch(SERVER_URL + '/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.error) {
            addMessage(data.error, 'system');
            speakText(t('ttsError'));
        } else if (data.reply) {
            addMessage(data.reply, 'assistant');
            showUnderstoodBtn(true);
            return speakText(data.reply);
        }
    })
    .catch(function(e) {
        console.error('[Chat] Send error:', e);
        addMessage(t('connectionError'), 'system');
    })
    .finally(function() {
        showThinking(false);
        chatBusy = false;
        if (continuousMode) {
            setTimeout(function() { startContinuousListen(); }, COOLDOWN_MS);
        }
    });
}

function handleMicToggle() {
    if (chatBusy) return;

    if (continuousMode) {
        handleContinuousToggle();
        return;
    }

    if (isRecording) {
        stopRecordingAndProcess();
        return;
    }

    if (isListening) {
        stopAllRecording();
        setStatus(t('micOff'));
        return;
    }

    setStatus(t('manualRecording'));
    startMicAndRecord();
}

function handleUnderstood() {
    if (chatBusy) return;

    stopTTS();

    chatBusy = true;
    showUnderstoodBtn(false);

    var understoodText = 'فاهم';
    addMessage(understoodText, 'user');

    fetch(SERVER_URL + '/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: understoodText, session_id: sessionId })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.reply) {
            addMessage(data.reply, 'assistant');
            showUnderstoodBtn(true);
            return speakText(data.reply);
        }
    })
    .catch(function(e) {
        console.warn('[Chat] Understood send error:', e);
    })
    .finally(function() {
        chatBusy = false;
        if (continuousMode) {
            setTimeout(function() { startContinuousListen(); }, COOLDOWN_MS);
        }
    });
}

function handleContinuousToggle() {
    logDebug('handleContinuousToggle | current:', continuousMode, '| busy:', chatBusy);

    if (continuousMode) {
        continuousMode = false;
        continuousStreamReady = false;
        stopAllRecording();
        if (continuousBtn) continuousBtn.classList.remove('active');
        if (continuousBanner) continuousBanner.classList.remove('active');
        setStatus(t('continuousOff'));
        showListeningUI(false);
        if (micBtn) micBtn.classList.remove('recording');
        logDebug('Continuous mode OFF');
    } else {
        continuousMode = true;
        if (continuousBtn) continuousBtn.classList.add('active');
        if (continuousBanner) continuousBanner.classList.add('active');
        showUnderstoodBtn(false);
        logDebug('Continuous mode ON');
        forceCleanupMic();
        setTimeout(function() { startContinuousListen(); }, 500);
    }
}

/* ═══════════════════════════════════════════════════
   CONTINUOUS MODE
   ═══════════════════════════════════════════════════ */

function startContinuousListen() {
    logDebug('startContinuousListen | busy:', chatBusy, '| recording:', isRecording, '| listening:', isListening, '| streamReady:', continuousStreamReady, '| mode:', continuousMode);

    if (chatBusy) {
        if (continuousMode) setTimeout(function() { startContinuousListen(); }, 1000);
        return;
    }
    if (isRecording || isListening || !continuousMode) return;

    showListeningUI(true);
    setStatus(t('continuousListening'));
    if (micBtn) micBtn.classList.add('recording');

    startMicAndListen(function() {
        logDebug('startContinuousListen: speech ended, processing...');
        stopRecordingAndProcess();
    });
}

/* ═══════════════════════════════════════════════════
   MIC + RECORDING
   ═══════════════════════════════════════════════════ */

function startMicAndRecord() {
    navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function(stream) {
        mediaStream = stream;
        isListening = true;
        startRecording();
        if (micBtn) micBtn.classList.add('recording');
        logDebug('Manual recording started');
    })
    .catch(function(e) {
        console.error('[Chat] Mic error:', e);
        setStatus(t('micError'));
    });
}

function startMicAndListen(onSpeechEnd) {
    // Reuse existing stream if available
    if (continuousStreamReady && mediaStream && audioContext && analyserNode) {
        logDebug('startMicAndListen: REUSING existing stream');

        vadState = { history: [], speechStart: 0, lastSpeech: 0, dbgCount: 0, animFrame: null, onSpeechEnd: onSpeechEnd };

        isListening = true;
        isRecording = false;

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(function() {});
        }

        startVADLoop();
        return;
    }

    logDebug('startMicAndListen: getting new mic stream...');

    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    })
    .then(function(stream) {
        mediaStream = stream;
        continuousStreamReady = true;
        logDebug('startMicAndListen: got mic stream');

        var tracks = stream.getAudioTracks();
        if (!tracks || tracks.length === 0) {
            stream.getTracks().forEach(function(t) { t.stop(); });
            continuousStreamReady = false;
            if (continuousMode) setTimeout(function() { startContinuousListen(); }, 2000);
            return;
        }

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            stream.getTracks().forEach(function(t) { t.stop(); });
            mediaStream = null;
            continuousStreamReady = false;
            if (continuousMode) setTimeout(function() { startContinuousListen(); }, 3000);
            return;
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(function() {});
        }

        var source = audioContext.createMediaStreamSource(stream);

        var highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = VAD_CONFIG.HIGH_PASS_FREQ;
        highPass.Q.value = 0.7;

        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = VAD_CONFIG.FFT_SIZE;
        analyserNode.smoothingTimeConstant = 0.3;

        source.connect(highPass);
        highPass.connect(analyserNode);

        isListening = true;
        isRecording = false;
        vadState = { onSpeechEnd: onSpeechEnd };

        startVADLoop();
    })
    .catch(function(e) {
        console.error('[Chat] Mic error:', e.name, e.message);

        if (e.name === 'NotAllowedError') {
            setStatus('⚠️ المايك مش مسموح — اسمح بالمايك من البراوزر');
        } else if (e.name === 'NotFoundError') {
            setStatus('⚠️ مفيش مايك متصل!');
        } else {
            setStatus(t('micError') + ' (' + e.name + ')');
        }

        if (micBtn) micBtn.classList.remove('recording');
        if (continuousMode) setTimeout(function() { startContinuousListen(); }, 3000);
    });
}

function startRecording() {
    if (isRecording || !mediaStream) return;

    isRecording = true;
    audioChunks = [];
    setStatus(t('recording'));

    try {
        var mimeType = getSupportedMimeType();
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mimeType });

        mediaRecorder.ondataavailable = function(e) {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = function() {};
        mediaRecorder.start(100);
        logDebug('Recording started | mimeType=' + mimeType);
    } catch (e) {
        console.error('[Chat] Recorder error:', e);
        isRecording = false;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    isRecording = false;
}

function stopRecordingOnly() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    mediaRecorder = null;
    isRecording = false;
    logDebug('stopRecordingOnly: recording stopped, stream kept alive');
}

function stopAllRecording() {
    if (vadState && vadState.animFrame) cancelAnimationFrame(vadState.animFrame);
    if (autoResetTimer) { clearTimeout(autoResetTimer); autoResetTimer = null; }

    vadState = { history: [], speechStart: 0, lastSpeech: 0, dbgCount: 0, animFrame: null, onSpeechEnd: null };

    stopRecording();
    stopMicStream();
    showListeningUI(false);
    if (micBtn) micBtn.classList.remove('recording');
}

function stopMicStream() {
    if (mediaStream) {
        var tracks = mediaStream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            try { tracks[i].stop(); } catch(e) {}
        }
        mediaStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        try { audioContext.close(); } catch (e) {}
        audioContext = null;
        analyserNode = null;
    }
    isListening = false;
    isRecording = false;
}

function forceCleanupMic() {
    logDebug('forceCleanupMic...');

    if (mediaStream) {
        try {
            mediaStream.getTracks().forEach(function(t) { try { t.stop(); } catch(e) {} });
        } catch(e) {}
        mediaStream = null;
    }

    if (audioContext) {
        try { if (audioContext.state !== 'closed') audioContext.close(); } catch(e) {}
        audioContext = null;
        analyserNode = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch(e) {}
    }
    mediaRecorder = null;
    audioChunks = [];

    isListening = false;
    isRecording = false;
    continuousStreamReady = false;
}

function stopRecordingAndProcess() {
    logDebug('stopRecordingAndProcess | isRecording:', isRecording, '| continuous:', continuousMode);
    if (!isRecording) return;

    if (vadState && vadState.animFrame) {
        cancelAnimationFrame(vadState.animFrame);
        vadState.animFrame = null;
    }
    if (autoResetTimer) { clearTimeout(autoResetTimer); autoResetTimer = null; }

    if (continuousMode) {
        stopRecordingOnly();
    } else {
        stopRecording();
    }

    var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    logDebug('Blob size: ' + audioBlob.size + ' bytes');

    if (continuousMode) {
        showListeningUI(false);
        if (micBtn) micBtn.classList.remove('recording');
        isListening = false;
    } else {
        stopMicStream();
        showListeningUI(false);
        if (micBtn) micBtn.classList.remove('recording');
    }

    if (audioBlob.size < MIN_BLOB_SIZE) {
        logDebug('Blob too small');
        if (continuousMode && !chatBusy) {
            setStatus(t('sttNoise'));
            setTimeout(function() { startContinuousListen(); }, 1500);
        } else { setStatus(''); }
        return;
    }

    if (audioBlob.size > MAX_BLOB_SIZE) {
        logDebug('Blob too large');
        if (continuousMode && !chatBusy) {
            setStatus(t('sttNoise'));
            setTimeout(function() { startContinuousListen(); }, 1500);
        } else { setStatus(''); }
        return;
    }

    processRecording(audioBlob);
}

/* ═══════════════════════════════════════════════════
   VAD LOOP
   ═══════════════════════════════════════════════════ */

var vadState = {
    history: [],
    speechStart: 0,
    lastSpeech: 0,
    dbgCount: 0,
    animFrame: null,
    onSpeechEnd: null
};

function startVADLoop() {
    if (!isListening || !analyserNode || chatBusy) return;

    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(function() {});
    }

    var bufferLength = analyserNode.frequencyBinCount;
    var dataArray = new Float32Array(bufferLength);
    analyserNode.getFloatTimeDomainData(dataArray);

    var sum = 0;
    var maxVal = 0;
    for (var i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
        if (Math.abs(dataArray[i]) > maxVal) maxVal = Math.abs(dataArray[i]);
    }
    var rms = Math.sqrt(sum / bufferLength);

    vadState.history.push(rms);
    if (vadState.history.length > VAD_CONFIG.MOVING_AVG_SIZE) vadState.history.shift();
    var avgRms = 0;
    for (var j = 0; j < vadState.history.length; j++) avgRms += vadState.history[j];
    avgRms = avgRms / vadState.history.length;

    vadState.dbgCount++;
    if (vadState.dbgCount % 10 === 0) {
        logDebug('VAD RMS=' + rms.toFixed(5) + ' Avg=' + avgRms.toFixed(5) + ' Peak=' + maxVal.toFixed(5) + ' Rec=' + isRecording);
    }

    var isRealSpeech = (avgRms > VAD_CONFIG.ENERGY_THRESHOLD && maxVal > VAD_CONFIG.SPEECH_MIN_PEAK);

    if (isRealSpeech) {
        if (!isRecording) {
            startRecording();
            vadState.speechStart = Date.now();
            vadState.lastSpeech = Date.now();
            logDebug('SPEECH STARTED | AvgRMS=' + avgRms.toFixed(4));
            resetAutoResetTimer();
        } else {
            vadState.lastSpeech = Date.now();
        }
    }

    if (isRecording) {
        var silenceDuration = Date.now() - vadState.lastSpeech;
        var speechDuration = Date.now() - vadState.speechStart;

        if (silenceDuration > VAD_CONFIG.SILENCE_TIMEOUT && speechDuration > VAD_CONFIG.MIN_SPEECH_DURATION) {
            logDebug('Speech ended: ' + speechDuration + 'ms');
            if (vadState.onSpeechEnd) vadState.onSpeechEnd();
            return;
        }
    }

    if (isListening) {
        vadState.animFrame = requestAnimationFrame(startVADLoop);
    }
}

/* ═══════════════════════════════════════════════════
   STT CONFIRM DIALOG (manual mode only)
   ═══════════════════════════════════════════════════ */

function confirmSTT(text) {
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'stt-confirm-overlay';

        var box = document.createElement('div');
        box.className = 'stt-confirm-box';

        var title = document.createElement('div');
        title.className = 'title';
        title.innerHTML = '<i class="fas fa-comment-dots"></i> ' + t('confirmTitle');

        var input = document.createElement('input');
        input.type = 'text';
        input.value = text;

        var btns = document.createElement('div');
        btns.className = 'stt-confirm-btns';

        var btnSend = document.createElement('button');
        btnSend.className = 'stt-btn-send';
        btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> ' + t('confirmSend');
        btnSend.onclick = function() {
            document.body.removeChild(overlay);
            resolve(input.value.trim() || null);
        };

        var btnRetry = document.createElement('button');
        btnRetry.className = 'stt-btn-retry';
        btnRetry.innerHTML = '<i class="fas fa-redo"></i> ' + t('confirmRetry');
        btnRetry.onclick = function() {
            document.body.removeChild(overlay);
            resolve(null);
        };

        var btnCancel = document.createElement('button');
        btnCancel.className = 'stt-btn-cancel';
        btnCancel.innerHTML = '<i class="fas fa-times"></i> ' + t('confirmCancel');
        btnCancel.onclick = function() {
            document.body.removeChild(overlay);
            resolve(false);
        };

        btns.appendChild(btnSend);
        btns.appendChild(btnRetry);
        btns.appendChild(btnCancel);
        box.appendChild(title);
        box.appendChild(input);
        box.appendChild(btns);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        input.focus();
        input.select();

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.body.removeChild(overlay);
                resolve(input.value.trim() || null);
            } else if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                resolve(false);
            }
        });
    });
}

/* ═══════════════════════════════════════════════════
   PROCESS RECORDING → STT → CHAT
   ═══════════════════════════════════════════════════ */

function processRecording(audioBlob) {
    if (chatBusy) return;
    chatBusy = true;
    showListeningUI(false);
    resetInactivityTimer();
    stopTTS();

    showThinking(true);
    setStatus(t('sttRecognizing'));

    var formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', chatLang);

    logDebug('processRecording | continuous:', continuousMode, '| blob:', audioBlob.size);

    fetch(SERVER_URL + '/api/chat/stt', {
        method: 'POST',
        body: formData
    })
    .then(function(res) { return res.json(); })
    .then(function(sttData) {
        logDebug('STT response:', JSON.stringify(sttData));

        if (sttData.error) {
            if (sttData.error === 'noise') {
                logDebug('webrtcvad: Noise detected');
                setStatus(t('sttNoise'));
            } else {
                console.warn('[Chat] STT error:', sttData.error);
                setStatus(t('sttError'));
            }
            showThinking(false);
            chatBusy = false;
            if (continuousMode) setTimeout(function() { startContinuousListen(); }, COOLDOWN_MS);
            return;
        }

        var userText = (sttData.text || '').trim();
        if (!userText) {
            showThinking(false);
            chatBusy = false;
            if (continuousMode) setTimeout(function() { startContinuousListen(); }, COOLDOWN_MS);
            return;
        }

        showThinking(false);

        if (continuousMode) {
            logDebug('Continuous mode: AUTO-SEND "' + userText + '"');
            sendTextAndPlay(userText);
        } else {
            return confirmSTT(userText).then(function(confirmed) {
                if (!confirmed) {
                    chatBusy = false;
                    if (continuousMode) setTimeout(function() { startContinuousListen(); }, COOLDOWN_MS);
                    return;
                }
                sendTextAndPlay(confirmed);
            });
        }
    })
    .catch(function(e) {
        console.error('[Chat] Process error:', e);
        addMessage(t('connectionError'), 'system');
    });
}

/* ═══════════════════════════════════════════════════
   SEND TEXT + PLAY TTS
   ═══════════════════════════════════════════════════ */

function sendTextAndPlay(text) {
    showThinking(true);
    setStatus(t('replying'));
    addMessage(text, 'user');

    fetch(SERVER_URL + '/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId })
    })
    .then(function(res) { return res.json(); })
    .then(function(sendData) {
        if (sendData.error) {
            addMessage(sendData.error, 'system');
            speakText(t('ttsError'));
        } else if (sendData.reply) {
            addMessage(sendData.reply, 'assistant');
            showUnderstoodBtn(true);
            logDebug('Got reply, playing TTS...');
            return speakText(sendData.reply);
        }
    })
    .catch(function(e) {
        console.error('[Chat] Send error:', e);
        addMessage(t('connectionError'), 'system');
    })
    .finally(function() {
        showThinking(false);
        chatBusy = false;
        if (continuousMode) {
            logDebug('Continuous: restarting listen in ' + COOLDOWN_MS + 'ms');
            setTimeout(function() { startContinuousListen(); }, COOLDOWN_MS);
        }
    });
}

/* ═══════════════════════════════════════════════════
   TTS — Text to Speech
   ═══════════════════════════════════════════════════ */

function speakText(text) {
    if (!text || !text.trim()) return Promise.resolve();
    stopTTS();

    logDebug('TTS request: "' + text.substring(0, 50) + '..."');

    return fetch(SERVER_URL + '/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, session_id: sessionId })
    })
    .then(function(res) {
        if (!res.ok || res.status === 204) {
            console.warn('[TTS] Bad response:', res.status);
            return null;
        }
        return res.blob();
    })
    .then(function(blob) {
        if (!blob) return;

        logDebug('TTS blob: ' + blob.size + ' bytes');

        if (blob.size < 100) {
            console.warn('[TTS] Audio too small');
            return;
        }

        var audioUrl = URL.createObjectURL(blob);
        currentTTSUrl = audioUrl;

        return new Promise(function(resolve) {
            var audio = new Audio(audioUrl);
            currentTTS = audio;

            audio.onended = function() {
                logDebug('TTS ended');
                currentTTS = null;
                if (currentTTSUrl) { URL.revokeObjectURL(currentTTSUrl); currentTTSUrl = null; }
                resolve();
            };

            audio.onerror = function(e) {
                console.error('[TTS] Playback error:', e);
                currentTTS = null;
                if (currentTTSUrl) { URL.revokeObjectURL(currentTTSUrl); currentTTSUrl = null; }
                resolve();
            };

            audio.play().catch(function(err) {
                console.warn('[TTS] Play blocked:', err.message);
                currentTTS = null;
                if (currentTTSUrl) { URL.revokeObjectURL(currentTTSUrl); currentTTSUrl = null; }
                resolve();
            });
        });
    })
    .catch(function(e) {
        console.error('[TTS] Error:', e);
    });
}

function stopTTS() {
    if (currentTTS) {
        try {
            currentTTS.pause();
            currentTTS.currentTime = 0;
            currentTTS.src = '';
        } catch(e) {}
        currentTTS = null;
    }
    if (currentTTSUrl) {
        URL.revokeObjectURL(currentTTSUrl);
        currentTTSUrl = null;
    }
}

function cleanupTTS() {
    var audios = document.querySelectorAll('audio');
    for (var i = 0; i < audios.length; i++) {
        if (audios[i] !== currentTTS) {
            try { audios[i].pause(); audios[i].src = ''; } catch(e) {}
        }
    }
}

/* ═══════════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════════ */

function loadHistory() {
    return fetch(SERVER_URL + '/api/chat/history?session_id=' + encodeURIComponent(sessionId))
    .then(function(res) {
        if (res.status === 404) return null;
        return res.json();
    })
    .then(function(data) {
        if (data && data.history && data.history.length > 0) {
            for (var i = 0; i < data.history.length; i++) {
                var msg = data.history[i];
                if (msg.role === 'user' || msg.role === 'assistant') {
                    addMessage(msg.content, msg.role);
                }
            }
            addSystemMessage(t('resumedChat'));
            return true;
        }
        return false;
    })
    .catch(function(e) {
        console.warn('[Chat] Could not load history:', e);
        return false;
    });
}

/* ═══════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════ */

function getSupportedMimeType() {
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (var i = 0; i < types.length; i++) {
        if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return 'audio/webm';
}

/* ═══════════════════════════════════════════════════
   CLEANUP & EXIT
   ═══════════════════════════════════════════════════ */

function handleCleanup() {
    console.log('[Chat] Cleanup...');
    stopAllRecording();
    stopTTS();
    cleanupTTS();

    if (autoResetTimer) clearTimeout(autoResetTimer);
    if (inactivityTimer) clearTimeout(inactivityTimer);
}