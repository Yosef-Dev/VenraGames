/**
 * ==========================================
 * VenraGames - Socket Client Engine
 * ==========================================
 * هذا الملف مسؤول حصرياً عن إدارة الاتصال بالخادم،
 * إرسال البيانات، واستقبال أحداث اللعب اللحظية.
 */

class SocketClient {
    constructor() {
        // تهيئة الاتصال بالخادم
        this.socket = io();
        this.initListeners();
    }

    // إعداد المستمعين لأحداث الخادم
    initListeners() {
        this.socket.on('connect', () => {
            console.log(`✅ تم الاتصال بنجاح بالخادم. المعرف: ${this.socket.id}`);
        });

        this.socket.on('disconnect', () => {
            console.warn('⚠️ انقطع الاتصال بالخادم!');
        });
    }

    /**
     * طلب البحث عن مباراة عشوائية
     * @param {Object} playerData - بيانات اللاعب (الاسم والصورة)
     */
    searchMatch(playerData) {
        console.log('🔍 جاري البحث عن خصم...', playerData);
        this.socket.emit('search_match', playerData);
    }

    /**
     * إلغاء البحث عن مباراة
     */
    cancelSearch() {
        console.log('❌ تم إلغاء البحث.');
        this.socket.emit('cancel_search');
    }

    /**
     * إرسال إجابة السؤال للسيرفر
     * @param {String} matchId - معرف المباراة الحالي
     * @param {Number} questionId - معرف السؤال
     * @param {Number} selectedOption - رقم الخيار الذي اختاره اللاعب (0 إلى 3)
     */
    submitAnswer(matchId, questionId, selectedOption) {
        this.socket.emit('submit_answer', {
            matchId,
            questionId,
            selectedOption
        });
    }
}

// تصدير كائن الاتصال ليتم استخدامه في المشروع
const gameSocket = new SocketClient();
