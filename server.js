const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const fs = require('fs');

const DB_FILE = 'users.json';
let registeredUsers = [];
let bannedIPs = []; // مصفوفة المحظورين بالـ IP

// تحميل قاعدة البيانات عند التشغيل
if (fs.existsSync(DB_FILE)) {
    try {
        const data = fs.readFileSync(DB_FILE);
        registeredUsers = JSON.parse(data);
        console.log(`📚 تم تحميل ${registeredUsers.length} مستخدم من السجلات.`);
    } catch (err) {
        console.log("⚠️ ملف البيانات فارغ أو تالف، سيتم إنشاء واحد جديد.");
    }
}

// دالة حفظ البيانات "المقدسة"
function saveData() {
    fs.writeFileSync(DB_FILE, JSON.stringify(registeredUsers, null, 2));
    console.log("💾 تم تأمين سجلات الملوك بنجاح!");
}

io.on('connection', (socket) => {
    const userIP = socket.handshake.address;

    // التحقق من حظر IP
    if (bannedIPs.includes(userIP)) {
        socket.emit('banned_notification', "أنت محظور من دخول هذا المجلس نهائياً!");
        socket.disconnect();
        return;
    }

    // 1. تسجيل حساب جديد
    socket.on('register_user', (data) => {
        // التأكد من عدم تكرار اسم المستخدم
        const exists = registeredUsers.find(u => u.user === data.user);
        if (exists) {
            socket.emit('registration_failed', { message: "اسم المستخدم هذا موجود بالفعل، اختر اسماً آخر!" });
            return;
        }

        // توليد ID عشوائي
        const randomID = Math.floor(100000 + Math.random() * 900000); // رقم من 6 خانات

        const newUser = {
            id: randomID,
            nickname: data.nickname,
            user: data.user,
            email: data.email,
            pass: data.pass,
            phone: data.phone,
            avatar: 'assets/default-avatar.png',
            coins: 100, // هدية التسجيل
            role: 'Member',
            lastIP: userIP,
            socketId: socket.id
        };

        registeredUsers.push(newUser);
        
        // الحفظ الفوري في الملف
        saveData();
        
        console.log(`✅ تم تسجيل الملك: ${newUser.nickname} (ID: ${newUser.id})`);
        
        // التعديل هنا: نبعت بيانات المستخدم فوراً بعد التسجيل (بدون كلمة المرور)
        const { pass, ...userProfile } = newUser;
        socket.emit('registration_success', { 
            message: "تم إنشاء حسابك بنجاح! جاري دخول المجلس...",
            userData: userProfile // بنبعت البيانات هنا
        });
    });

    // 2. تسجيل الدخول
    socket.on('login_attempt', (data) => {
        const userFound = registeredUsers.find(u => u.user === data.user && u.pass === data.pass);
        if (userFound) {
            // تحديث IP و socketId
            userFound.lastIP = userIP;
            userFound.socketId = socket.id;
            saveData();
            
            // إرسال بيانات المستخدم كاملة (بدون الباسورد للأمان)
            const { pass, ...userProfile } = userFound; 
            socket.emit('login_response', { success: true, userData: userProfile });
        } else {
            socket.emit('login_response', { success: false, message: "بيانات الدخول غير صحيحة!" });
        }
    });

    // 3. أوامر الإدارة: إضافة كوينز
    socket.on('admin_add_coins', (data) => {
        let target = registeredUsers.find(u => u.id == data.targetId);
        if (target) {
            target.coins += parseInt(data.amount);
            saveData(); // حفظ في JSON
            io.emit('update_user_data', target);
            console.log(`💰 تمت إضافة ${data.amount} كوينز للملك ${target.nickname}`);
        }
    });

    // 4. أوامر الإدارة: حظر IP
    socket.on('admin_ban_user', (data) => {
        let target = registeredUsers.find(u => u.id == data.targetId);
        if (target) {
            bannedIPs.push(target.lastIP);
            saveData(); // حفظ قائمة المحظورين
            console.log(`🚫 تم حظر IP: ${target.lastIP} للملك ${target.nickname}`);
            
            // إجبار الخروج
            if (target.socketId) {
                io.to(target.socketId).emit('force_logout', { message: 'تم حظرك من المجلس!' });
            }
        } else {
            socket.emit('login_response', { success: false, message: "بيانات الدخول غير صحيحة!" });
        }
    });

    // الشات
    socket.on('send_message', (data) => {
        io.emit('receive_message', data);
    });
});

http.listen(3000, () => console.log('🚀 السيرفر (المخزن) يعمل بنجاح!'));