const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

// إعداد الخادم
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// تحديد مجلد public لملفات الواجهة الرسومية
app.use(express.static(path.join(__dirname, 'public')));

// قراءة ملف الأسئلة بأمان (وإنشاء ملف تجريبي إذا لم يكن موجوداً)
const questionsPath = path.join(__dirname, 'questions.json');
if (!fs.existsSync(questionsPath)) {
    fs.writeFileSync(questionsPath, JSON.stringify([
        { id: 1, question: "سؤال تجريبي لتشغيل السيرفر؟", options: ["1", "2", "3", "4"], correctAnswer: 0 }
    ]));
}
let questionsDB = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

// متغيرات النظام
let waitingPlayer = null; // اللاعب الذي ينتظر خصماً
const activeMatches = new Map(); // المباريات النشطة حالياً

// دالة لجلب 10 أسئلة عشوائية
function getRandomQuestions(num) {
    const shuffled = [...questionsDB].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(num, questionsDB.length));
}

// دالة لإنهاء المباراة وحساب الفائز
function endMatch(matchId) {
    const match = activeMatches.get(matchId);
    if (!match) return;

    clearTimeout(match.timer); // إيقاف المؤقت

    let winner = "draw";
    if (match.p1.score > match.p2.score) winner = match.p1.id;
    else if (match.p2.score > match.p1.score) winner = match.p2.id;

    // إرسال النتيجة النهائية للاعبين
    io.to(matchId).emit('match_finished', {
        winner: winner,
        p1: { id: match.p1.id, name: match.p1.name, score: match.p1.score },
        p2: { id: match.p2.id, name: match.p2.name, score: match.p2.score }
    });

    activeMatches.delete(matchId); // مسح المباراة من الذاكرة
}

// بدء استقبال الاتصالات
io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);

    // 1. طلب البحث عن مباراة (اللعب عشوائياً)
    socket.on('search_match', (playerData) => {
        // إذا كان هناك لاعب ينتظر، قم بإنشاء مباراة بينهما
        if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
            const player1 = waitingPlayer;
            const player2 = { socket, playerData };
            waitingPlayer = null; // تفريغ قائمة الانتظار

            const matchId = `match_${Date.now()}`;
            const matchQuestions = getRandomQuestions(10);
            
            // إزالة الإجابة الصحيحة قبل إرسال الأسئلة للعميل (أمان لمنع الغش)
            const clientQuestions = matchQuestions.map(q => ({
                id: q.id, 
                question: q.question, 
                options: q.options 
            }));

            // إنشاء سجل المباراة في الباك آند
            activeMatches.set(matchId, {
                id: matchId,
                questions: matchQuestions,
                p1: { socket: player1.socket, id: player1.socket.id, name: player1.playerData.name, avatar: player1.playerData.avatar, score: 0, answersCount: 0 },
                p2: { socket: player2.socket, id: player2.socket.id, name: player2.playerData.name, avatar: player2.playerData.avatar, score: 0, answersCount: 0 },
                // مؤقت 5 دقائق (300,000 مللي ثانية)
                timer: setTimeout(() => endMatch(matchId), 300000) 
            });

            // إدخال اللاعبين في غرفة اتصال خاصة بالمباراة
            player1.socket.join(matchId);
            player2.socket.join(matchId);

            // إبلاغ اللاعبين ببدء المباراة
            io.to(matchId).emit('match_found', {
                matchId,
                questions: clientQuestions,
                players: {
                    p1: { id: player1.socket.id, name: player1.playerData.name, avatar: player1.playerData.avatar },
                    p2: { id: player2.socket.id, name: player2.playerData.name, avatar: player2.playerData.avatar }
                },
                duration: 300000 // 5 دقائق
            });
            
            console.log(`بدأت مباراة جديدة: ${matchId}`);
        } else {
            // إذا لم يكن هناك أحد ينتظر، اجعل هذا اللاعب في الانتظار
            waitingPlayer = { socket, playerData };
        }
    });

    // 2. استلام إجابة من اللاعب
    socket.on('submit_answer', ({ matchId, questionId, selectedOption }) => {
        const match = activeMatches.get(matchId);
        if (!match) return;

        const player = match.p1.id === socket.id ? match.p1 : match.p2;
        const question = match.questions.find(q => q.id === questionId);

        // التحقق من الإجابة الصحيحة وزيادة النقاط
        if (question && question.correctAnswer === selectedOption) {
            player.score += 1;
        }
        player.answersCount += 1;

        // إذا أنهى كلا اللاعبين الـ 10 أسئلة، قم بإنهاء المباراة فوراً
        if (match.p1.answersCount === 10 && match.p2.answersCount === 10) {
            endMatch(matchId);
        }
    });

    // 3. إلغاء البحث إذا تراجع اللاعب
    socket.on('cancel_search', () => {
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }
    });

    // 4. انقطاع الاتصال (خروج مفاجئ)
    socket.on('disconnect', () => {
        console.log(`مستخدم غادر: ${socket.id}`);
        
        // إزالة من قائمة الانتظار إذا كان ينتظر
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }

        // البحث إذا كان اللاعب داخل مباراة نشطة
        for (const [matchId, match] of activeMatches.entries()) {
            if (match.p1.id === socket.id || match.p2.id === socket.id) {
                // إبلاغ الخصم بانسحاب اللاعب وفوزه التلقائي
                socket.to(matchId).emit('opponent_disconnected');
                clearTimeout(match.timer);
                activeMatches.delete(matchId);
                break;
            }
        }
    });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على المنفذ ${PORT}`);
    console.log(`👉 قم بزيارة: http://localhost:${PORT}`);
});
