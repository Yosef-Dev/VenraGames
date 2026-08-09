// ==========================================
// 1. المتغيرات والتهيئة الأساسية (Initialization)
// ==========================================
const socket = io(); // الاتصال بالخادم

// بيانات اللاعب والتخزين المحلي
let playerData = {
    name: localStorage.getItem('vg_username') || '',
    avatar: localStorage.getItem('vg_avatar') || ''
};

// حالة اللعبة الحالية
let gameState = {
    matchId: null,
    questions: [],
    currentIndex: 0,
    myScore: 0,
    oppScore: 0,
    timerInterval: null,
    timeRemaining: 300 // 5 دقائق بالثواني
};

// ==========================================
// 2. التحكم في الشاشات (Screen Management)
// ==========================================
const screens = document.querySelectorAll('.screen');
const topBar = document.getElementById('top-bar');

function showScreen(screenId) {
    screens.forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none'; // إخفاء فعلي لعدم التداخل
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'flex';
        // إضافة تأخير بسيط لتفعيل الأنيميشن
        setTimeout(() => targetScreen.classList.add('active'), 10);
    }

    // إظهار البار العلوي في كل الشاشات عدا التحميل والتسجيل
    if (screenId !== 'screen-loading' && screenId !== 'screen-register') {
        topBar.classList.remove('hidden');
        updateTopBar();
    } else {
        topBar.classList.add('hidden');
    }
}

function updateTopBar() {
    document.getElementById('my-mini-name').innerText = playerData.name;
    if (playerData.avatar) {
        document.getElementById('my-mini-avatar').style.backgroundImage = `url(${playerData.avatar})`;
    }
}

// ==========================================
// 3. شريط التحميل (Loading Sequence)
// ==========================================
window.onload = () => {
    let progress = 0;
    const loadingBar = document.getElementById('loading-bar');
    
    const loadingInterval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress > 100) progress = 100;
        loadingBar.style.width = `${progress}%`;

        if (progress === 100) {
            clearInterval(loadingInterval);
            setTimeout(() => {
                // توجيه المستخدم حسب وجود حساب مسبق
                if (playerData.name) {
                    showScreen('screen-main');
                } else {
                    showScreen('screen-register');
                }
            }, 500); // نصف ثانية إضافية للمتعة البصرية
        }
    }, 150);
};

// ==========================================
// 4. نظام التسجيل ومعالجة الصور (Registration & Avatar)
// ==========================================
const avatarInput = document.getElementById('avatar-input');
const avatarPreview = document.getElementById('avatar-preview');
const btnSaveProfile = document.getElementById('btn-save-profile');

// تحويل الصورة المرفوعة إلى Base64
avatarInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            playerData.avatar = e.target.result;
            avatarPreview.innerHTML = ''; // مسح أيقونة الـ SVG
            avatarPreview.style.backgroundImage = `url(${playerData.avatar})`;
        };
        reader.readAsDataURL(file);
    }
});

btnSaveProfile.addEventListener('click', () => {
    const nameInput = document.getElementById('username-input').value.trim();
    if (nameInput.length < 3) {
        alert("يرجى إدخال اسم يتكون من 3 أحرف على الأقل!");
        return;
    }

    playerData.name = nameInput;
    localStorage.setItem('vg_username', playerData.name);
    if (playerData.avatar) localStorage.setItem('vg_avatar', playerData.avatar);
    
    showScreen('screen-main');
});

// ==========================================
// 5. نظام البحث والمطابقة (Matchmaking System)
// ==========================================
document.getElementById('btn-play-random').addEventListener('click', () => {
    showScreen('screen-waiting');
    socket.emit('search_match', playerData);
});

document.getElementById('btn-cancel-search').addEventListener('click', () => {
    socket.emit('cancel_search');
    showScreen('screen-main');
});

// ==========================================
// 6. أحداث اللعب الحية (Real-time Game Logic)
// ==========================================

// عند العثور على مباراة
socket.on('match_found', (data) => {
    gameState.matchId = data.matchId;
    gameState.questions = data.questions;
    gameState.currentIndex = 0;
    gameState.myScore = 0;
    gameState.oppScore = 0;
    gameState.timeRemaining = data.duration / 1000;

    // إعداد واجهة اللعبة
    const isP1 = data.players.p1.id === socket.id;
    const me = isP1 ? data.players.p1 : data.players.p2;
    const opp = isP1 ? data.players.p2 : data.players.p1;

    document.getElementById('ingame-p1-name').innerText = me.name;
    document.getElementById('ingame-p2-name').innerText = opp.name;
    
    if (me.avatar) document.getElementById('ingame-p1-avatar').style.backgroundImage = `url(${me.avatar})`;
    if (opp.avatar) document.getElementById('ingame-p2-avatar').style.backgroundImage = `url(${opp.avatar})`;

    document.getElementById('p1-score').innerText = '0';
    document.getElementById('p2-score').innerText = '0';

    showScreen('screen-game');
    startTimer();
    renderQuestion();
});

// إدارة المؤقت
function startTimer() {
    clearInterval(gameState.timerInterval);
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('game-timer');

    gameState.timerInterval = setInterval(() => {
        gameState.timeRemaining--;
        
        const minutes = Math.floor(gameState.timeRemaining / 60);
        const seconds = gameState.timeRemaining % 60;
        timerText.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        
        // تحديث شريط الوقت (النسبة المئوية)
        const percentage = (gameState.timeRemaining / 300) * 100;
        timerBar.style.width = `${percentage}%`;

        if (gameState.timeRemaining <= 60) {
            timerBar.style.backgroundColor = 'var(--danger)'; // تغيير اللون للأحمر في الدقيقة الأخيرة
            timerText.style.color = '#FFD700';
            timerText.classList.add('pulse');
        }

        if (gameState.timeRemaining <= 0) {
            clearInterval(gameState.timerInterval);
        }
    }, 1000);
}

// عرض السؤال والإجابات
function renderQuestion() {
    const qContainer = document.getElementById('options-container');
    const qText = document.getElementById('question-text');
    const qNum = document.getElementById('q-num');

    qContainer.innerHTML = ''; // تفريغ الخيارات القديمة

    if (gameState.currentIndex >= gameState.questions.length) {
        // إذا أنهى اللاعب جميع الأسئلة، نعرض له شاشة انتظار مصغرة
        qText.innerText = "أحسنت! ننتظر انتهاء الخصم من إجاباته...";
        qNum.innerText = "10";
        qContainer.innerHTML = '<div class="radar-circle pulse" style="position:relative; width:50px; height:50px; margin: 0 auto; border-color:var(--primary);"></div>';
        return;
    }

    const currentQ = gameState.questions[gameState.currentIndex];
    qNum.innerText = gameState.currentIndex + 1;
    qText.innerText = currentQ.question;

    currentQ.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn-3d btn-option window-pop';
        btn.innerText = opt;
        btn.style.animationDelay = `${index * 0.1}s`; // ظهور متتالي للخيارات
        
        btn.onclick = () => submitAnswer(btn, currentQ.id, index);
        qContainer.appendChild(btn);
    });
}

// إرسال الإجابة للسيرفر
function submitAnswer(btnEl, questionId, selectedIndex) {
    // تعطيل جميع الأزرار لمنع الضغط المزدوج
    const allBtns = document.querySelectorAll('.btn-option');
    allBtns.forEach(b => b.disabled = true);

    // إضافة تأثير الضغط
    btnEl.style.transform = 'translateY(8px)';
    btnEl.style.boxShadow = '0 0px 0 #CCC';
    btnEl.style.backgroundColor = 'var(--secondary)';
    btnEl.style.color = '#FFF';

    socket.emit('submit_answer', {
        matchId: gameState.matchId,
        questionId: questionId,
        selectedOption: selectedIndex
    });

    // إضافة نقطة وهمية للمستخدم لزيادة الحماس (السيرفر يحسب النتيجة الحقيقية)
    // ننتقل للسؤال التالي بعد نصف ثانية
    setTimeout(() => {
        gameState.currentIndex++;
        renderQuestion();
    }, 500);
}

// ==========================================
// 7. نهاية المباراة والنتائج (Match Results)
// ==========================================

socket.on('match_finished', (resultData) => {
    clearInterval(gameState.timerInterval);
    
    const isP1 = resultData.p1.id === socket.id;
    const me = isP1 ? resultData.p1 : resultData.p2;
    const opp = isP1 ? resultData.p2 : resultData.p1;

    const resTitle = document.getElementById('result-title');
    const resMsg = document.getElementById('result-msg');
    const resIcon = document.getElementById('result-icon');

    let matchStatus = '';

    if (resultData.winner === 'draw') {
        resTitle.innerText = "تعادل!";
        resTitle.style.color = 'var(--secondary-dark)';
        resMsg.innerText = "أداء متقارب جداً!";
        resIcon.innerText = "🤝";
        matchStatus = 'تعادل';
    } else if (resultData.winner === socket.id) {
        resTitle.innerText = "لقد فزت!";
        resTitle.style.color = 'var(--success-dark)';
        resMsg.innerText = "أداء أسطوري يا بطل!";
        resIcon.innerText = "🏆";
        matchStatus = 'فوز';
    } else {
        resTitle.innerText = "لقد خسرت!";
        resTitle.style.color = 'var(--danger-dark)';
        resMsg.innerText = "حظاً أوفر في المرة القادمة!";
        resIcon.innerText = "💔";
        matchStatus = 'خسارة';
    }

    document.getElementById('res-my-score').innerText = me.score;
    document.getElementById('res-opp-score').innerText = opp.score;

    saveToHistory(matchStatus, opp.name, me.score, opp.score);
    showScreen('screen-result');
});

// انسحاب الخصم
socket.on('opponent_disconnected', () => {
    clearInterval(gameState.timerInterval);
    document.getElementById('result-title').innerText = "فوز تلقائي!";
    document.getElementById('result-title').style.color = 'var(--success-dark)';
    document.getElementById('result-msg').innerText = "لقد هرب الخصم من المواجهة!";
    document.getElementById('result-icon').innerText = "🏃💨";
    
    saveToHistory('فوز (انسحاب)', 'مجهول', '-', '-');
    showScreen('screen-result');
});

// العودة للرئيسية
document.getElementById('btn-return-home').addEventListener('click', () => {
    showScreen('screen-main');
});

// ==========================================
// 8. سجل المباريات (Dynamic Match History)
// ==========================================

function saveToHistory(status, opponentName, myScore, oppScore) {
    let history = JSON.parse(localStorage.getItem('vg_history')) || [];
    const date = new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    history.unshift({ status, opponentName, myScore, oppScore, date });
    
    // الاحتفاظ بآخر 20 مباراة فقط
    if(history.length > 20) history.pop(); 
    localStorage.setItem('vg_history', JSON.stringify(history));
}

// إنشاء نافذة السجل برمجياً لعدم العبث بملف HTML
document.getElementById('btn-history').addEventListener('click', () => {
    let history = JSON.parse(localStorage.getItem('vg_history')) || [];
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); z-index: 999; display: flex;
        justify-content: center; align-items: center; padding: 20px;
        backdrop-filter: blur(5px); opacity: 0; transition: opacity 0.3s;
    `;
    
    let listHTML = history.length === 0 ? '<p style="text-align:center; color:#888;">لم تلعب أي مباريات بعد.</p>' : '';
    
    history.forEach(match => {
        let color = match.status.includes('فوز') ? 'var(--success)' : match.status.includes('خسارة') ? 'var(--danger)' : 'var(--secondary)';
        listHTML += `
            <div style="background:#F9F9F9; border-right: 5px solid ${color}; padding: 10px; margin-bottom: 10px; border-radius: 10px; display:flex; justify-content: space-between; align-items:center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div>
                    <strong style="color:var(--bg-dark)">ضد: ${match.opponentName}</strong>
                    <div style="font-size:0.8rem; color:#666;">${match.date}</div>
                </div>
                <div style="font-weight:900; color:${color}; font-family:var(--font-en); font-size:1.2rem;">
                    ${match.myScore} - ${match.oppScore}
                </div>
            </div>
        `;
    });

    overlay.innerHTML = `
        <div class="panel window-pop" style="max-height: 80vh; overflow-y: auto; width: 100%; max-width: 400px; padding: 20px;">
            <h2 class="panel-title" style="margin-bottom: 15px;">📜 سجل مبارياتك</h2>
            <div style="text-align:right; margin-bottom: 20px; max-height: 50vh; overflow-y:auto; padding-right:5px;">
                ${listHTML}
            </div>
            <button id="close-history-btn" class="btn-3d btn-danger" style="margin-bottom:0;">إغلاق السجل</button>
        </div>
    `;

    document.body.appendChild(overlay);
    
    // أنيميشن الظهور
    setTimeout(() => overlay.style.opacity = '1', 10);

    document.getElementById('close-history-btn').onclick = () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    };
});
