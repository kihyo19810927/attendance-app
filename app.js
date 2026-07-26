/**
 * Attendance App Controller with Multi-User Authentication System
 * Manages state, multi-user registration/login, DOM updates, SMTP emails, Google Workspace sync, and countdown engine.
 */

class UserAuthManager {
    constructor() {
        this.users = [];
        this.currentUser = null;
        this.load();
    }

    load() {
        try {
            const savedUsers = localStorage.getItem('attendance_users');
            if (savedUsers) this.users = JSON.parse(savedUsers);

            const savedUser = localStorage.getItem('attendance_current_user');
            if (savedUser) this.currentUser = JSON.parse(savedUser);
        } catch (e) {
            console.error('[UserAuth] Failed to load users from localStorage', e);
        }
    }

    save() {
        try {
            localStorage.setItem('attendance_users', JSON.stringify(this.users));
            if (this.currentUser) {
                localStorage.setItem('attendance_current_user', JSON.stringify(this.currentUser));
            } else {
                localStorage.removeItem('attendance_current_user');
            }
        } catch (e) {
            console.error('[UserAuth] Failed to save users to localStorage', e);
        }
    }

    register({ username, employeeName, email, password, confirmPassword }) {
        if (!username || username.trim().length < 3) {
            throw new Error('用户名不能少于 3 个字符！');
        }
        if (!employeeName || !employeeName.trim()) {
            throw new Error('请输入员工姓名（名前）！');
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email.trim())) {
            throw new Error('请输入有效格式的电子邮箱地址！');
        }
        if (!password || password.length < 6) {
            throw new Error('密码长度不能少于 6 位！');
        }
        if (password !== confirmPassword) {
            throw new Error('两次输入的密码不一致！');
        }

        const trimmedUsername = username.trim();
        const trimmedEmail = email.trim();

        if (this.users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase())) {
            throw new Error('该用户名已被注册，请尝试其他用户名！');
        }
        if (this.users.some(u => u.email.toLowerCase() === trimmedEmail.toLowerCase())) {
            throw new Error('该电子邮箱已被绑定，请直接登录！');
        }

        const newUser = {
            username: trimmedUsername,
            employeeName: employeeName.trim(),
            email: trimmedEmail,
            password: password,
            createdAt: new Date().toISOString()
        };

        this.users.push(newUser);
        this.currentUser = {
            username: newUser.username,
            employeeName: newUser.employeeName,
            email: newUser.email
        };
        this.save();
        return this.currentUser;
    }

    login(usernameOrEmail, password) {
        if (!usernameOrEmail || !password) {
            throw new Error('请输入用户名/邮箱及密码！');
        }

        const target = usernameOrEmail.trim().toLowerCase();
        const user = this.users.find(u => 
            (u.username.toLowerCase() === target || u.email.toLowerCase() === target) && u.password === password
        );

        if (!user) {
            throw new Error('用户名/邮箱或密码不正确！');
        }

        this.currentUser = {
            username: user.username,
            employeeName: user.employeeName,
            email: user.email
        };
        this.save();
        return this.currentUser;
    }

    logout() {
        this.currentUser = null;
        this.save();
    }
}

class AttendanceApp {
    constructor() {
        this.auth = new UserAuthManager();
        this.state = {
            records: [],
            settings: {
                hrEmail: '',
                userEmail: '',
                smtpHost: 'smtp.qq.com',
                smtpPort: 465,
                smtpUser: '',
                smtpPass: '',
                autoEmail: true
            },
            autoCheckinEnabled: true,
            targetType: 'clock-in',
            targetTime: null,
            countdownSeconds: 0
        };
        
        this.elements = {
            clockDisplay: document.getElementById('clock-display'),
            dateDisplay: document.getElementById('date-display'),
            totalCount: document.getElementById('total-count'),
            normalCount: document.getElementById('normal-count'),
            lateCount: document.getElementById('late-count'),
            earlyDepartureCount: document.getElementById('early-departure-count'),
            recordsBody: document.getElementById('records-body'),
            clockInBtn: document.getElementById('clock-in-btn'),
            clockOutBtn: document.getElementById('clock-out-btn'),
            clearBtn: document.getElementById('clear-btn'),
            
            // Header & Auth DOM Elements
            loginBtn: document.getElementById('login-btn'),
            userBadge: document.getElementById('user-badge'),
            userDisplayName: document.getElementById('user-display-name'),
            logoutBtn: document.getElementById('logout-btn'),

            authModal: document.getElementById('auth-modal'),
            closeAuthBtn: document.getElementById('close-auth-btn'),
            tabLoginBtn: document.getElementById('tab-login-btn'),
            tabRegisterBtn: document.getElementById('tab-register-btn'),
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            loginUsernameInput: document.getElementById('login-username'),
            loginPasswordInput: document.getElementById('login-password'),
            loginErrorMsg: document.getElementById('login-error-msg'),

            regUsernameInput: document.getElementById('reg-username'),
            regEmployeeNameInput: document.getElementById('reg-employee-name'),
            regEmailInput: document.getElementById('reg-email'),
            regPasswordInput: document.getElementById('reg-password'),
            regConfirmPasswordInput: document.getElementById('reg-confirm-password'),
            regErrorMsg: document.getElementById('reg-error-msg'),

            // Settings DOM Elements
            settingsBtn: document.getElementById('settings-btn'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('close-settings-btn'),
            cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
            settingsForm: document.getElementById('settings-form'),
            employeeNameInput: document.getElementById('employee-name'),
            hrEmailInput: document.getElementById('hr-email'),
            userEmailInput: document.getElementById('user-email'),
            smtpHostInput: document.getElementById('smtp-host'),
            smtpPortInput: document.getElementById('smtp-port'),
            smtpUserInput: document.getElementById('smtp-user'),
            smtpPassInput: document.getElementById('smtp-pass'),
            autoEmailToggle: document.getElementById('auto-email-toggle'),
            settingsMsg: document.getElementById('settings-msg'),
            emailToast: document.getElementById('email-toast'),

            // Auto-Checkin DOM elements
            autoCheckinPanel: document.getElementById('auto-checkin-panel'),
            autoCheckinToggle: document.getElementById('auto-checkin-toggle'),
            nextTargetType: document.getElementById('next-target-type'),
            targetTimeDisplay: document.getElementById('target-time-display'),
            countdownDisplay: document.getElementById('countdown-display')
        };

        this.autoTimer = null;
        this.init();
    }

    init() {
        this.loadState();
        this.loadSettings();
        this.startClock();
        this.renderUserAuthUI();
        this.renderStats();
        this.renderRecords();
        this.bindEvents();
        this.initAutoCheckinEngine();
    }

    loadState() {
        try {
            const savedRecords = localStorage.getItem('attendance_records');
            if (savedRecords) {
                this.state.records = JSON.parse(savedRecords);
            }

            const savedToggle = localStorage.getItem('auto_checkin_enabled');
            if (savedToggle !== null) {
                this.state.autoCheckinEnabled = JSON.parse(savedToggle);
            }
        } catch (e) {
            console.error('Failed to load state from localStorage', e);
        }
    }

    saveState() {
        try {
            localStorage.setItem('attendance_records', JSON.stringify(this.state.records));
            localStorage.setItem('auto_checkin_enabled', JSON.stringify(this.state.autoCheckinEnabled));
        } catch (e) {
            console.error('Failed to save state to localStorage', e);
        }
    }

    loadSettings() {
        try {
            const savedSettings = localStorage.getItem('attendance_settings');
            if (savedSettings) {
                this.state.settings = { ...this.state.settings, ...JSON.parse(savedSettings) };
            }
        } catch (e) {
            console.error('Failed to load settings from localStorage', e);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('attendance_settings', JSON.stringify(this.state.settings));
        } catch (e) {
            console.error('Failed to save settings to localStorage', e);
        }
    }

    renderUserAuthUI() {
        const currentUser = this.auth.currentUser;
        if (currentUser) {
            if (this.elements.loginBtn) this.elements.loginBtn.classList.add('hidden');
            if (this.elements.userBadge) this.elements.userBadge.classList.remove('hidden');
            if (this.elements.userDisplayName) {
                this.elements.userDisplayName.textContent = `${currentUser.employeeName} (${currentUser.email})`;
            }
            // Auto sync user details to settings
            this.state.settings.employeeName = currentUser.employeeName;
            this.state.settings.userEmail = currentUser.email;
        } else {
            if (this.elements.loginBtn) this.elements.loginBtn.classList.remove('hidden');
            if (this.elements.userBadge) this.elements.userBadge.classList.add('hidden');
        }
    }

    startClock() {
        const updateClock = () => {
            const now = new Date();
            this.elements.clockDisplay.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
            this.elements.dateDisplay.textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    initAutoCheckinEngine() {
        if (this.elements.autoCheckinToggle) {
            this.elements.autoCheckinToggle.checked = this.state.autoCheckinEnabled;
            if (this.state.autoCheckinEnabled) {
                this.elements.autoCheckinPanel?.classList.add('active');
            }
        }
        this.calculateNextRandomTarget();
        this.startAutoCountdownTimer();
    }

    calculateNextRandomTarget() {
        const now = new Date();
        const todayInRecord = this.getTodayRecord('clock-in');
        const todayOutRecord = this.getTodayRecord('clock-out');

        let target = new Date(now);

        if (!todayInRecord) {
            this.state.targetType = 'clock-in';
            target.setHours(9, 25, 0, 0);
            const randomSeconds = Math.floor(Math.random() * 300);
            target.setSeconds(target.getSeconds() + randomSeconds);

            if (now > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30, 0)) {
                target.setDate(target.getDate() + 1);
            }
        } else if (!todayOutRecord) {
            this.state.targetType = 'clock-out';
            target.setHours(18, 30, 0, 0);
            const randomSeconds = Math.floor(Math.random() * 1800);
            target.setSeconds(target.getSeconds() + randomSeconds);

            if (now > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0)) {
                this.state.targetType = 'clock-in';
                target.setDate(target.getDate() + 1);
                target.setHours(9, 25, 0, 0);
                const randomSec = Math.floor(Math.random() * 300);
                target.setSeconds(target.getSeconds() + randomSec);
            }
        } else {
            this.state.targetType = 'clock-in';
            target.setDate(target.getDate() + 1);
            target.setHours(9, 25, 0, 0);
            const randomSec = Math.floor(Math.random() * 300);
            target.setSeconds(target.getSeconds() + randomSec);
        }

        this.state.targetTime = target;
        this.updateAutoCheckinUI();
    }

    startAutoCountdownTimer() {
        if (this.autoTimer) clearInterval(this.autoTimer);

        this.autoTimer = setInterval(() => {
            if (!this.state.autoCheckinEnabled) {
                if (this.elements.countdownDisplay) this.elements.countdownDisplay.textContent = 'PAUSED';
                return;
            }

            const now = new Date();
            const diffMs = this.state.targetTime - now;

            if (diffMs <= 0) {
                this.triggerAutoCheckin();
            } else if (this.elements.countdownDisplay) {
                const totalSec = Math.floor(diffMs / 1000);
                const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
                const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
                const secs = String(totalSec % 60).padStart(2, '0');
                this.elements.countdownDisplay.textContent = `${hours}:${mins}:${secs}`;
            }
        }, 1000);
    }

    triggerAutoCheckin() {
        if (this.state.targetType === 'clock-in') {
            const todayIn = this.getTodayRecord('clock-in');
            if (!todayIn) this.clockIn(true);
        } else if (this.state.targetType === 'clock-out') {
            const todayOut = this.getTodayRecord('clock-out');
            if (!todayOut) this.clockOut(true);
        }
        this.calculateNextRandomTarget();
    }

    updateAutoCheckinUI() {
        if (!this.elements.nextTargetType) return;
        const typeStr = this.state.targetType === 'clock-in' ? '上班打卡 (09:25-09:30)' : '下班打卡 (18:30-19:00)';
        this.elements.nextTargetType.textContent = typeStr;

        if (this.state.targetTime) {
            const t = this.state.targetTime;
            const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
            this.elements.targetTimeDisplay.textContent = timeStr;
        }
    }

    bindEvents() {
        this.elements.clockInBtn.addEventListener('click', () => this.clockIn());
        this.elements.clockOutBtn.addEventListener('click', () => this.clockOut());
        this.elements.clearBtn.addEventListener('click', () => this.clearRecords());

        // Header User Auth Events
        if (this.elements.loginBtn) {
            this.elements.loginBtn.addEventListener('click', () => this.openAuthModal());
        }
        if (this.elements.logoutBtn) {
            this.elements.logoutBtn.addEventListener('click', () => {
                if (confirm('确定要退出当前账号吗？')) {
                    this.auth.logout();
                    this.renderUserAuthUI();
                    this.showToast('ℹ️ 已成功退出登录', 'info');
                }
            });
        }
        if (this.elements.closeAuthBtn) {
            this.elements.closeAuthBtn.addEventListener('click', () => this.closeAuthModal());
        }

        // Auth Modal Tabs
        if (this.elements.tabLoginBtn && this.elements.tabRegisterBtn) {
            this.elements.tabLoginBtn.addEventListener('click', () => this.switchAuthTab('login'));
            this.elements.tabRegisterBtn.addEventListener('click', () => this.switchAuthTab('register'));
        }

        // Login Submit
        if (this.elements.loginForm) {
            this.elements.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                try {
                    const user = this.auth.login(
                        this.elements.loginUsernameInput.value,
                        this.elements.loginPasswordInput.value
                    );
                    this.renderUserAuthUI();
                    this.closeAuthModal();
                    this.showToast(`🎉 欢迎回来，${user.employeeName}！`, 'success');
                } catch (err) {
                    this.showAuthError('login', err.message);
                }
            });
        }

        // Register Submit
        if (this.elements.registerForm) {
            this.elements.registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                try {
                    const user = this.auth.register({
                        username: this.elements.regUsernameInput.value,
                        employeeName: this.elements.regEmployeeNameInput.value,
                        email: this.elements.regEmailInput.value,
                        password: this.elements.regPasswordInput.value,
                        confirmPassword: this.elements.regConfirmPasswordInput.value
                    });
                    this.renderUserAuthUI();
                    this.closeAuthModal();
                    this.showToast(`🎉 注册成功！已自动登录为 ${user.employeeName}`, 'success');
                } catch (err) {
                    this.showAuthError('register', err.message);
                }
            });
        }

        // System Settings Modal Events
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', () => this.openSettingsModal());
        }
        if (this.elements.closeSettingsBtn) {
            this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
        }
        if (this.elements.cancelSettingsBtn) {
            this.elements.cancelSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
        }
        if (this.elements.settingsForm) {
            this.elements.settingsForm.addEventListener('submit', (e) => this.handleSaveSettings(e));
        }

        if (this.elements.autoCheckinToggle) {
            this.elements.autoCheckinToggle.addEventListener('change', (e) => {
                this.state.autoCheckinEnabled = e.target.checked;
                if (this.state.autoCheckinEnabled) {
                    this.elements.autoCheckinPanel?.classList.add('active');
                } else {
                    this.elements.autoCheckinPanel?.classList.remove('active');
                }
                this.saveState();
            });
        }
    }

    openAuthModal(defaultTab = 'login', customMsg = '') {
        this.switchAuthTab(defaultTab);
        if (customMsg) {
            this.showAuthError(defaultTab, customMsg);
        } else {
            this.hideAuthErrors();
        }
        if (this.elements.authModal) this.elements.authModal.classList.remove('hidden');
    }

    closeAuthModal() {
        if (this.elements.authModal) this.elements.authModal.classList.add('hidden');
        this.hideAuthErrors();
    }

    switchAuthTab(tabName) {
        if (tabName === 'login') {
            this.elements.tabLoginBtn?.classList.add('active');
            this.elements.tabRegisterBtn?.classList.remove('active');
            this.elements.loginForm?.classList.remove('hidden');
            this.elements.registerForm?.classList.add('hidden');
        } else {
            this.elements.tabRegisterBtn?.classList.add('active');
            this.elements.tabLoginBtn?.classList.remove('active');
            this.elements.registerForm?.classList.remove('hidden');
            this.elements.loginForm?.classList.add('hidden');
        }
        this.hideAuthErrors();
    }

    showAuthError(tab, msg) {
        const errorEl = tab === 'login' ? this.elements.loginErrorMsg : this.elements.regErrorMsg;
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        }
    }

    hideAuthErrors() {
        if (this.elements.loginErrorMsg) this.elements.loginErrorMsg.classList.add('hidden');
        if (this.elements.regErrorMsg) this.elements.regErrorMsg.classList.add('hidden');
    }

    openSettingsModal() {
        const s = this.state.settings;
        const curUser = this.auth.currentUser;

        if (this.elements.employeeNameInput) {
            this.elements.employeeNameInput.value = curUser ? curUser.employeeName : (s.employeeName || '');
        }
        if (this.elements.userEmailInput) {
            this.elements.userEmailInput.value = curUser ? curUser.email : (s.userEmail || '');
        }
        if (this.elements.hrEmailInput) this.elements.hrEmailInput.value = s.hrEmail || '';
        if (this.elements.smtpHostInput) this.elements.smtpHostInput.value = s.smtpHost || 'smtp.qq.com';
        if (this.elements.smtpPortInput) this.elements.smtpPortInput.value = s.smtpPort || 465;
        if (this.elements.smtpUserInput) this.elements.smtpUserInput.value = s.smtpUser || '';
        if (this.elements.smtpPassInput) this.elements.smtpPassInput.value = s.smtpPass || '';
        if (this.elements.autoEmailToggle) this.elements.autoEmailToggle.checked = s.autoEmail !== false;
        if (this.elements.settingsMsg) this.elements.settingsMsg.classList.add('hidden');
        if (this.elements.settingsModal) this.elements.settingsModal.classList.remove('hidden');
    }

    closeSettingsModal() {
        if (this.elements.settingsModal) this.elements.settingsModal.classList.add('hidden');
    }

    handleSaveSettings(e) {
        e.preventDefault();
        this.state.settings = {
            employeeName: this.elements.employeeNameInput ? this.elements.employeeNameInput.value.trim() : '',
            hrEmail: this.elements.hrEmailInput.value.trim(),
            userEmail: this.elements.userEmailInput.value.trim(),
            smtpHost: this.elements.smtpHostInput.value.trim() || 'smtp.qq.com',
            smtpPort: parseInt(this.elements.smtpPortInput.value, 10) || 465,
            smtpUser: this.elements.smtpUserInput.value.trim(),
            smtpPass: this.elements.smtpPassInput.value.trim(),
            autoEmail: this.elements.autoEmailToggle.checked
        };
        this.saveSettings();
        
        if (this.elements.settingsMsg) {
            this.elements.settingsMsg.textContent = '设置已成功保存！';
            this.elements.settingsMsg.className = 'settings-msg success';
            this.elements.settingsMsg.classList.remove('hidden');
        }

        setTimeout(() => {
            this.closeSettingsModal();
        }, 1000);
    }

    getTodayRecord(type) {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        return this.state.records.find(record => {
            const recordDate = new Date(record.timestamp);
            const recordKey = `${recordDate.getFullYear()}-${recordDate.getMonth()}-${recordDate.getDate()}`;
            return recordKey === todayKey && record.type === type;
        }) || null;
    }

    clockIn(isAuto = false) {
        const currentUser = this.auth.currentUser;
        if (!currentUser && !isAuto) {
            this.openAuthModal('login', '⚠️ 请先登录或注册账号再进行打卡！');
            return;
        }

        const todayRecord = this.getTodayRecord('clock-in');
        if (todayRecord) {
            if (!isAuto) alert('今天已经完成上班打卡，请勿重复打卡！');
            return;
        }

        const now = new Date();
        const record = {
            type: 'clock-in',
            timestamp: now.toISOString(),
            status: this.calculateStatus('clock-in', now),
            emailStatus: 'pending',
            triggeredBy: isAuto ? 'Auto-Engine' : 'Manual'
        };
        
        this.addRecord(record);
        this.calculateNextRandomTarget();
    }

    clockOut(isAuto = false) {
        const currentUser = this.auth.currentUser;
        if (!currentUser && !isAuto) {
            this.openAuthModal('login', '⚠️ 请先登录或注册账号再进行打卡！');
            return;
        }

        const todayClockInRecord = this.getTodayRecord('clock-in');
        if (!todayClockInRecord) {
            if (!isAuto) alert('今天尚未进行上班打卡，无法进行下班打卡！');
            return;
        }

        const todayRecord = this.getTodayRecord('clock-out');
        if (todayRecord) {
            if (!isAuto) alert('今天已经完成下班打卡，请勿重复打卡！');
            return;
        }

        const now = new Date();
        const record = {
            type: 'clock-out',
            timestamp: now.toISOString(),
            status: this.calculateStatus('clock-out', now),
            emailStatus: 'pending',
            triggeredBy: isAuto ? 'Auto-Engine' : 'Manual'
        };
        
        this.addRecord(record);
        this.calculateNextRandomTarget();
    }

    addRecord(record) {
        this.state.records.push(record);
        this.saveState();
        this.renderStats();
        this.renderRecords();

        if (this.state.settings.autoEmail) {
            this.sendEmailNotification(record);
        }
        this.syncToGoogle(record);
    }

    async sendEmailNotification(record) {
        const settings = this.state.settings;
        const curUser = this.auth.currentUser;
        const targetUserEmail = curUser ? curUser.email : settings.userEmail;

        if (!settings.hrEmail || !targetUserEmail) {
            this.showToast('⚠️ 未配置 HR 邮箱或个人邮箱，无法发送邮件。请先登录或在 [系统设置 ⚙️] 中配置。', 'warning');
            record.emailStatus = 'none';
            this.saveState();
            this.renderRecords();
            return;
        }

        this.showToast(`📧 正在向 HR 发送打卡通知并抄送至 ${targetUserEmail}...`, 'info');

        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hrEmail: settings.hrEmail,
                    userEmail: targetUserEmail,
                    smtpConfig: {
                        host: settings.smtpHost || 'smtp.qq.com',
                        port: parseInt(settings.smtpPort, 10) || 465,
                        user: settings.smtpUser || targetUserEmail,
                        pass: settings.smtpPass
                    },
                    record
                })
            });

            const result = await response.json();
            if (result.success) {
                record.emailStatus = 'sent';
                this.saveState();
                this.renderRecords();
                this.showToast(`✅ ${result.message || '打卡邮件已成功发送至 HR！'}`, 'success');
            } else {
                record.emailStatus = 'failed';
                this.saveState();
                this.renderRecords();
                this.showToast(`❌ 邮件发送失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to communicate with /api/send-email endpoint', error);
            record.emailStatus = 'failed';
            this.saveState();
            this.renderRecords();
            this.showToast('ℹ️ 打卡已本地保存（未建立与后端 SMTP 的连接）', 'info');
        }
    }

    async syncToGoogle(record) {
        try {
            const curUser = this.auth.currentUser;
            const payload = {
                ...record,
                employeeName: curUser ? curUser.employeeName : (this.state.settings.employeeName || '従業員'),
                userEmail: curUser ? curUser.email : (this.state.settings.userEmail || 'user@company.com')
            };
            const response = await fetch('/api/google-sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.success) {
                console.log('[GoogleSync] Attendance record synced successfully for user:', payload.employeeName, data);
            } else {
                console.warn('[GoogleSync] Google sync returned error status:', data.error);
            }
        } catch (error) {
            console.error('[GoogleSync] Failed to send sync request to backend:', error);
        }
    }

    showToast(message, type = 'info') {
        const toast = this.elements.emailToast;
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast toast-${type}`;
        toast.classList.remove('hidden');
        
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 4000);
    }

    calculateStatus(type, dateObj) {
        const hour = dateObj.getHours();
        const minute = dateObj.getMinutes();
        const totalMinutes = hour * 60 + minute;

        if (type === 'clock-in') {
            if (totalMinutes > 9 * 60) return 'late';
            return 'normal';
        } else if (type === 'clock-out') {
            if (totalMinutes < 18 * 60) return 'early';
            return 'normal';
        }
        return 'unknown';
    }

    clearRecords() {
        if (this.state.records.length === 0) return;
        if (confirm('确定要清空所有打卡记录吗？')) {
            this.state.records = [];
            this.saveState();
            this.renderStats();
            this.renderRecords();
            this.calculateNextRandomTarget();
        }
    }

    renderStats() {
        const total = this.state.records.length;
        const normal = this.state.records.filter(r => r.status === 'normal').length;
        const late = this.state.records.filter(r => r.status === 'late').length;
        const early = this.state.records.filter(r => r.status === 'early').length;

        this.elements.totalCount.textContent = total;
        this.elements.normalCount.textContent = normal;
        this.elements.lateCount.textContent = late;
        this.elements.earlyDepartureCount.textContent = early;
    }

    renderRecords() {
        this.elements.recordsBody.innerHTML = '';
        
        if (this.state.records.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="4" style="text-align: center; color: var(--text-secondary);">暂无打卡记录</td>';
            this.elements.recordsBody.appendChild(emptyRow);
            return;
        }

        const reversedRecords = [...this.state.records].reverse();
        
        reversedRecords.forEach(record => {
            const row = document.createElement('tr');
            
            const typeCell = document.createElement('td');
            const typeText = record.type === 'clock-in' ? '上班打卡' : '下班打卡';
            const triggerBadge = record.triggeredBy === 'Auto-Engine' || record.triggeredBy === 'GCP-CloudScheduler' 
                ? ' <span style="font-size:0.75rem; color:var(--accent-color);">[自动]</span>' 
                : '';
            typeCell.innerHTML = typeText + triggerBadge;
            
            const timeCell = document.createElement('td');
            const date = new Date(record.timestamp);
            timeCell.textContent = date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `status-badge status-${record.status}`;
            statusBadge.textContent = record.status === 'normal' ? '正常' : (record.status === 'late' ? '迟到' : '早退');
            statusCell.appendChild(statusBadge);

            const emailCell = document.createElement('td');
            const emailBadge = document.createElement('span');
            const emailState = record.emailStatus || 'none';
            emailBadge.className = `email-badge email-${emailState}`;
            emailBadge.textContent = emailState === 'sent' ? '已发送' : (emailState === 'failed' ? '发送失败' : (emailState === 'pending' ? '发送中...' : '未发送'));
            emailCell.appendChild(emailBadge);

            row.appendChild(typeCell);
            row.appendChild(timeCell);
            row.appendChild(statusCell);
            row.appendChild(emailCell);
            this.elements.recordsBody.appendChild(row);
        });
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AttendanceApp();
});
