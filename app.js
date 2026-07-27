/**
 * Attendance App Renderer Controller for Electron Desktop Application
 */
class DesktopAttendanceApp {
    constructor() {
        this.config = {};
        this.records = [];
        this.autoTimer = null;
        this.targetType = 'clock-in';
        this.targetTime = null;

        this.elements = {
            userDisplay: document.getElementById('user-display'),
            clockDisplay: document.getElementById('clock-display'),
            dateDisplay: document.getElementById('date-display'),
            totalCount: document.getElementById('total-count'),
            normalCount: document.getElementById('normal-count'),
            lateCount: document.getElementById('late-count'),
            earlyDepartureCount: document.getElementById('early-departure-count'),
            recordsBody: document.getElementById('records-body'),
            clockInBtn: document.getElementById('clock-in-btn'),
            clockOutBtn: document.getElementById('clock-out-btn'),
            emailToast: document.getElementById('email-toast'),

            openExcelBtn: document.getElementById('open-excel-btn'),
            openArchiveBtn: document.getElementById('open-archive-btn'),
            manualPunchBtn: document.getElementById('manual-punch-btn'),

            // Manual Modal
            manualModal: document.getElementById('manual-modal'),
            closeManualBtn: document.getElementById('close-manual-btn'),
            cancelManualBtn: document.getElementById('cancel-manual-btn'),
            manualForm: document.getElementById('manual-form'),
            manualDateInput: document.getElementById('manual-date'),
            manualClockInInput: document.getElementById('manual-clock-in'),
            manualClockOutInput: document.getElementById('manual-clock-out'),
            manualNotesInput: document.getElementById('manual-notes'),
            manualEmailToggle: document.getElementById('manual-email-toggle'),

            // Settings Modal
            settingsBtn: document.getElementById('settings-btn'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('close-settings-btn'),
            cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
            settingsForm: document.getElementById('settings-form'),
            settingsMsg: document.getElementById('settings-msg'),

            // Config Form Elements
            cfgEmployeeName: document.getElementById('cfg-employee-name'),
            cfgEmailTo: document.getElementById('cfg-email-to'),
            cfgEmailCc: document.getElementById('cfg-email-cc'),
            cfgEmailSubject: document.getElementById('cfg-email-subject'),
            cfgEmailBody: document.getElementById('cfg-email-body'),
            cfgSmtpHost: document.getElementById('cfg-smtp-host'),
            cfgSmtpPort: document.getElementById('cfg-smtp-port'),
            cfgSmtpUser: document.getElementById('cfg-smtp-user'),
            cfgSmtpPass: document.getElementById('cfg-smtp-pass'),
            cfgAutoEmail: document.getElementById('cfg-auto-email'),
            cfgAutoPunch: document.getElementById('cfg-auto-punch'),
            cfgMorningStart: document.getElementById('cfg-morning-start'),
            cfgMorningEnd: document.getElementById('cfg-morning-end'),
            cfgEveningStart: document.getElementById('cfg-evening-start'),
            cfgEveningEnd: document.getElementById('cfg-evening-end'),
            cfgSkipHolidays: document.getElementById('cfg-skip-holidays'),

            // Auto Punch Controls
            autoCheckinPanel: document.getElementById('auto-checkin-panel'),
            autoCheckinToggle: document.getElementById('auto-checkin-toggle'),
            nextTargetType: document.getElementById('next-target-type'),
            targetTimeDisplay: document.getElementById('target-time-display'),
            countdownDisplay: document.getElementById('countdown-display')
        };

        this.init();
    }

    async init() {
        this.startClock();
        await this.loadConfig();
        await this.loadRecords();
        this.bindEvents();
        this.initAutoPunchEngine();
    }

    startClock() {
        const updateClock = () => {
            const now = new Date();
            this.elements.clockDisplay.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
            this.elements.dateDisplay.textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    async loadConfig() {
        if (window.electronAPI) {
            this.config = await window.electronAPI.getConfig();
            this.updateConfigUI();
        }
    }

    updateConfigUI() {
        const cfg = this.config;
        if (this.elements.userDisplay) {
            this.elements.userDisplay.textContent = `👤 ${cfg.employee_name || '紀標'}`;
        }
        if (this.elements.autoCheckinToggle) {
            this.elements.autoCheckinToggle.checked = cfg.auto_punch_enabled === '1';
        }
    }

    async loadRecords() {
        if (window.electronAPI) {
            this.records = await window.electronAPI.getRecords();
            this.renderStats();
            this.renderRecords();
        }
    }

    bindEvents() {
        // Main Punch Buttons
        this.elements.clockInBtn.addEventListener('click', () => this.handlePunch('clock-in'));
        this.elements.clockOutBtn.addEventListener('click', () => this.handlePunch('clock-out'));

        // Header Navigation Actions
        this.elements.openExcelBtn.addEventListener('click', async () => {
            const res = await window.electronAPI.openExcelFile();
            if (!res.success) this.showToast(`ℹ️ ${res.message}`, 'info');
        });

        this.elements.openArchiveBtn.addEventListener('click', async () => {
            await window.electronAPI.openArchiveFolder();
        });

        this.elements.manualPunchBtn.addEventListener('click', () => this.openManualModal());

        // Manual Punch Modal
        this.elements.closeManualBtn.addEventListener('click', () => this.closeManualModal());
        this.elements.cancelManualBtn.addEventListener('click', () => this.closeManualModal());
        this.elements.manualForm.addEventListener('submit', (e) => this.handleManualSubmit(e));

        // Settings Modal
        this.elements.settingsBtn.addEventListener('click', () => this.openSettingsModal());
        this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
        this.elements.cancelSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
        this.elements.settingsForm.addEventListener('submit', (e) => this.handleSettingsSubmit(e));

        // Auto Punch Toggle in Panel
        if (this.elements.autoCheckinToggle) {
            this.elements.autoCheckinToggle.addEventListener('change', async (e) => {
                const isChecked = e.target.checked ? '1' : '0';
                this.config.auto_punch_enabled = isChecked;
                await window.electronAPI.saveConfig({ auto_punch_enabled: isChecked });
                this.calculateNextRandomTarget();
            });
        }
    }

    async handlePunch(type) {
        this.showToast(`⌛ 正在执行${type === 'clock-in' ? '上班打卡' : '下班打卡'}并同步本地 Excel...`, 'info');
        const res = await window.electronAPI.punch({ type });

        if (res.success) {
            this.showToast(`✅ ${type === 'clock-in' ? '上班' : '下班'}打卡成功！已同步记录至本地 Excel。`, 'success');
            await this.loadRecords();
            this.calculateNextRandomTarget();
        } else {
            this.showToast(`❌ 打卡提示: ${res.message}`, 'warning');
        }
    }

    openManualModal() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        this.elements.manualDateInput.value = `${y}-${m}-${d}`;
        this.elements.manualModal.classList.remove('hidden');
    }

    closeManualModal() {
        this.elements.manualModal.classList.add('hidden');
    }

    async handleManualSubmit(e) {
        e.preventDefault();
        const dateStr = this.elements.manualDateInput.value;
        const selectedType = document.querySelector('input[name="manual-type"]:checked').value;
        const clockInTime = (selectedType === 'in' || selectedType === 'both') ? this.elements.manualClockInInput.value : null;
        const clockOutTime = (selectedType === 'out' || selectedType === 'both') ? this.elements.manualClockOutInput.value : null;
        const notes = this.elements.manualNotesInput.value;
        const sendEmail = this.elements.manualEmailToggle.checked;

        this.showToast('⌛ 正在提交补打卡数据修正...', 'info');
        const res = await window.electronAPI.manualPunch({
            dateStr,
            clockInTime,
            clockOutTime,
            notes,
            sendEmail
        });

        if (res.success) {
            this.showToast('✅ 手工补打卡数据已成功更新至数据库及对应的 Excel 文件！', 'success');
            this.closeManualModal();
            await this.loadRecords();
        }
    }

    openSettingsModal() {
        const cfg = this.config;
        this.elements.cfgEmployeeName.value = cfg.employee_name || '';
        this.elements.cfgEmailTo.value = cfg.email_to || '';
        this.elements.cfgEmailCc.value = cfg.email_cc || '';
        this.elements.cfgEmailSubject.value = cfg.email_subject_tpl || '';
        this.elements.cfgEmailBody.value = cfg.email_body_tpl || '';
        this.elements.cfgSmtpHost.value = cfg.smtp_host || 'smtp.wadax-sv.jp';
        this.elements.cfgSmtpPort.value = cfg.smtp_port || '587';
        this.elements.cfgSmtpUser.value = cfg.smtp_user || '';
        this.elements.cfgSmtpPass.value = cfg.smtp_pass || '';
        this.elements.cfgAutoEmail.checked = cfg.auto_email_enabled === '1';
        this.elements.cfgAutoPunch.checked = cfg.auto_punch_enabled === '1';
        this.elements.cfgMorningStart.value = cfg.morning_start_time || '09:25';
        this.elements.cfgMorningEnd.value = cfg.morning_end_time || '09:30';
        this.elements.cfgEveningStart.value = cfg.evening_start_time || '18:30';
        this.elements.cfgEveningEnd.value = cfg.evening_end_time || '19:00';
        this.elements.cfgSkipHolidays.checked = cfg.skip_holidays_enabled === '1';

        this.elements.settingsMsg.classList.add('hidden');
        this.elements.settingsModal.classList.remove('hidden');
    }

    closeSettingsModal() {
        this.elements.settingsModal.classList.add('hidden');
    }

    async handleSettingsSubmit(e) {
        e.preventDefault();
        const updatedConfig = {
            employee_name: this.elements.cfgEmployeeName.value.trim(),
            email_to: this.elements.cfgEmailTo.value.trim(),
            email_cc: this.elements.cfgEmailCc.value.trim(),
            email_subject_tpl: this.elements.cfgEmailSubject.value,
            email_body_tpl: this.elements.cfgEmailBody.value,
            smtp_host: this.elements.cfgSmtpHost.value.trim(),
            smtp_port: this.elements.cfgSmtpPort.value.trim(),
            smtp_user: this.elements.cfgSmtpUser.value.trim(),
            smtp_pass: this.elements.cfgSmtpPass.value.trim(),
            auto_email_enabled: this.elements.cfgAutoEmail.checked ? '1' : '0',
            auto_punch_enabled: this.elements.cfgAutoPunch.checked ? '1' : '0',
            morning_start_time: this.elements.cfgMorningStart.value,
            morning_end_time: this.elements.cfgMorningEnd.value,
            evening_start_time: this.elements.cfgEveningStart.value,
            evening_end_time: this.elements.cfgEveningEnd.value,
            skip_holidays_enabled: this.elements.cfgSkipHolidays.checked ? '1' : '0'
        };

        this.config = await window.electronAPI.saveConfig(updatedConfig);
        this.updateConfigUI();

        this.elements.settingsMsg.textContent = '设置已成功保存！';
        this.elements.settingsMsg.className = 'settings-msg success';
        this.elements.settingsMsg.classList.remove('hidden');

        setTimeout(() => {
            this.closeSettingsModal();
            this.calculateNextRandomTarget();
        }, 1000);
    }

    initAutoPunchEngine() {
        this.calculateNextRandomTarget();
        this.startAutoCountdownTimer();
    }

    calculateNextRandomTarget() {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        // Holiday / Weekend check for AUTO punch
        const dayOfWeek = now.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const skipHolidays = this.config.skip_holidays_enabled === '1';

        if (skipHolidays && isWeekend) {
            if (this.elements.nextTargetType) this.elements.nextTargetType.textContent = '周末休眠中 (自动暂停，手动仍可用)';
            if (this.elements.targetTimeDisplay) this.elements.targetTimeDisplay.textContent = 'PAUSED';
            this.targetTime = null;
            return;
        }

        const todayRecord = this.records.find(r => r.record_date === todayStr);
        let target = new Date(now);

        const parseTimeRange = (startTimeStr, endTimeStr) => {
            const [sh, sm] = startTimeStr.split(':').map(Number);
            const [eh, em] = endTimeStr.split(':').map(Number);
            const startSecs = sh * 3600 + sm * 60;
            const endSecs = eh * 3600 + em * 60;
            const randomSecs = Math.floor(startSecs + Math.random() * (endSecs - startSecs));
            return {
                hours: Math.floor(randomSecs / 3600),
                mins: Math.floor((randomSecs % 3600) / 60),
                secs: randomSecs % 60
            };
        };

        if (!todayRecord || !todayRecord.clock_in_time) {
            this.targetType = 'clock-in';
            const mRange = parseTimeRange(
                this.config.morning_start_time || '09:25',
                this.config.morning_end_time || '09:30'
            );
            target.setHours(mRange.hours, mRange.mins, mRange.secs, 0);

            if (now > target) {
                target.setDate(target.getDate() + 1);
            }
        } else if (!todayRecord.clock_out_time) {
            this.targetType = 'clock-out';
            const eRange = parseTimeRange(
                this.config.evening_start_time || '18:30',
                this.config.evening_end_time || '19:00'
            );
            target.setHours(eRange.hours, eRange.mins, eRange.secs, 0);

            if (now > target) {
                this.targetType = 'clock-in';
                target.setDate(target.getDate() + 1);
                const mRange = parseTimeRange(
                    this.config.morning_start_time || '09:25',
                    this.config.morning_end_time || '09:30'
                );
                target.setHours(mRange.hours, mRange.mins, mRange.secs, 0);
            }
        } else {
            this.targetType = 'clock-in';
            target.setDate(target.getDate() + 1);
            const mRange = parseTimeRange(
                this.config.morning_start_time || '09:25',
                this.config.morning_end_time || '09:30'
            );
            target.setHours(mRange.hours, mRange.mins, mRange.secs, 0);
        }

        this.targetTime = target;
        this.updateAutoPunchUI();
    }

    startAutoCountdownTimer() {
        if (this.autoTimer) clearInterval(this.autoTimer);

        this.autoTimer = setInterval(() => {
            if (this.config.auto_punch_enabled !== '1' || !this.targetTime) {
                if (this.elements.countdownDisplay) this.elements.countdownDisplay.textContent = 'PAUSED';
                return;
            }

            const now = new Date();
            const diffMs = this.targetTime - now;

            if (diffMs <= 0) {
                this.handlePunch(this.targetType);
            } else if (this.elements.countdownDisplay) {
                const totalSec = Math.floor(diffMs / 1000);
                const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
                const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
                const secs = String(totalSec % 60).padStart(2, '0');
                this.elements.countdownDisplay.textContent = `${hours}:${mins}:${secs}`;
            }
        }, 1000);
    }

    updateAutoPunchUI() {
        if (!this.elements.nextTargetType) return;
        const typeStr = this.targetType === 'clock-in' ? '上班打卡' : '下班打卡';
        this.elements.nextTargetType.textContent = typeStr;

        if (this.targetTime) {
            const t = this.targetTime;
            const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
            this.elements.targetTimeDisplay.textContent = timeStr;
        }
    }

    renderStats() {
        const total = this.records.length;
        const normal = this.records.filter(r => r.status_in === 'normal' && (r.status_out === 'normal' || !r.clock_out_time)).length;
        const late = this.records.filter(r => r.status_in === 'late').length;
        const early = this.records.filter(r => r.status_out === 'early').length;

        this.elements.totalCount.textContent = total;
        this.elements.normalCount.textContent = normal;
        this.elements.lateCount.textContent = late;
        this.elements.earlyDepartureCount.textContent = early;
    }

    renderRecords() {
        this.elements.recordsBody.innerHTML = '';
        
        if (this.records.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" style="text-align: center; color: var(--text-secondary);">暂无考勤历史记录</td>';
            this.elements.recordsBody.appendChild(emptyRow);
            return;
        }

        this.records.forEach(r => {
            const row = document.createElement('tr');

            const dateCell = document.createElement('td');
            dateCell.textContent = r.record_date;

            const inCell = document.createElement('td');
            inCell.innerHTML = r.clock_in_time 
                ? `${r.clock_in_time} ${r.status_in === 'late' ? '<span style="color:var(--danger-color);">(迟到)</span>' : ''}`
                : '--';

            const outCell = document.createElement('td');
            outCell.innerHTML = r.clock_out_time 
                ? `${r.clock_out_time} ${r.status_out === 'early' ? '<span style="color:var(--warning-color);">(早退)</span>' : ''}`
                : '--';

            const hoursCell = document.createElement('td');
            hoursCell.textContent = r.working_hours || '--';

            const emailCell = document.createElement('td');
            const emailState = r.email_status || 'none';
            const emailBadge = document.createElement('span');
            emailBadge.className = `email-badge email-${emailState}`;
            emailBadge.textContent = emailState === 'sent' ? '已发送' : (emailState === 'failed' ? '发送失败' : '未发送');
            emailCell.appendChild(emailBadge);

            row.appendChild(dateCell);
            row.appendChild(inCell);
            row.appendChild(outCell);
            row.appendChild(hoursCell);
            row.appendChild(emailCell);
            this.elements.recordsBody.appendChild(row);
        });
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
}

document.addEventListener('DOMContentLoaded', () => {
    new DesktopAttendanceApp();
});
