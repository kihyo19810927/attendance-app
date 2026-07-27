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
            clearRecordsBtn: document.getElementById('clear-records-btn'),

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
            exportJsonBtn: document.getElementById('export-json-btn'),
            importJsonBtn: document.getElementById('import-json-btn'),
            jsonFileInput: document.getElementById('json-file-input'),

            // Config Form Elements
            cfgEmployeeName: document.getElementById('cfg-employee-name'),
            cfgExcelStorageDir: document.getElementById('cfg-excel-storage-dir'),
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

        if (this.elements.autoCheckinPanel) {
            if (cfg.auto_punch_enabled === '1') {
                this.elements.autoCheckinPanel.classList.remove('hidden');
            } else {
                this.elements.autoCheckinPanel.classList.add('hidden');
            }
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

        // Clear Records Button
        if (this.elements.clearRecordsBtn) {
            this.elements.clearRecordsBtn.addEventListener('click', () => this.handleClearRecords());
        }

        // Manual Punch Modal
        this.elements.closeManualBtn.addEventListener('click', () => this.closeManualModal());
        this.elements.cancelManualBtn.addEventListener('click', () => this.closeManualModal());
        this.elements.manualForm.addEventListener('submit', (e) => this.handleManualSubmit(e));

        // Settings Modal
        this.elements.settingsBtn.addEventListener('click', () => this.openSettingsModal());
        this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
        this.elements.cancelSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
        this.elements.settingsForm.addEventListener('submit', (e) => this.handleSettingsSubmit(e));

        // JSON Config Import & Export
        if (this.elements.exportJsonBtn) {
            this.elements.exportJsonBtn.addEventListener('click', () => this.exportConfigJson());
        }
        if (this.elements.importJsonBtn && this.elements.jsonFileInput) {
            this.elements.importJsonBtn.addEventListener('click', () => this.elements.jsonFileInput.click());
            this.elements.jsonFileInput.addEventListener('change', (e) => this.importConfigJson(e));
        }
    }

    async handleClearRecords() {
        if (confirm('⚠️ 警告：确定要清空所有 SQLite 及 Excel 考勤打卡历史记录吗？此操作无法撤销！')) {
            this.showToast('⌛ 正在清空打卡历史记录...', 'info');
            await window.electronAPI.clearRecords();
            await this.loadRecords();
            this.showToast('🗑️ 所有考勤打卡记录已成功清空！', 'success');
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
        this.elements.cfgExcelStorageDir.value = cfg.excel_storage_dir || './attendance_files';
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
            excel_storage_dir: this.elements.cfgExcelStorageDir.value.trim() || './attendance_files',
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

    exportConfigJson() {
        const jsonStr = JSON.stringify(this.config, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_config_${this.config.employee_name || 'settings'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('📤 设置文件 (JSON) 导出成功！', 'success');
    }

    importConfigJson(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (typeof imported === 'object') {
                    this.config = await window.electronAPI.saveConfig(imported);
                    this.openSettingsModal();
                    this.updateConfigUI();
                    this.elements.settingsMsg.textContent = '📥 设置 JSON 文件已成功导入并保存！';
                    this.elements.settingsMsg.className = 'settings-msg success';
                    this.elements.settingsMsg.classList.remove('hidden');
                }
            } catch (err) {
                alert('解析 JSON 配置文件失败，请检查文件格式。');
            }
        };
        reader.readAsText(file);
    }

    initAutoPunchEngine() {
        this.calculateNextRandomTarget();
        this.startAutoCountdownTimer();
    }

    calculateNextRandomTarget() {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
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
        let totalPunches = 0;
        let normalCount = 0;
        let lateCount = 0;
        let earlyCount = 0;

        this.records.forEach(r => {
            if (r.clock_in_time) {
                totalPunches++;
                if (r.status_in === 'late') lateCount++;
                else normalCount++;
            }
            if (r.clock_out_time) {
                totalPunches++;
                if (r.status_out === 'early') earlyCount++;
                else normalCount++;
            }
        });

        this.elements.totalCount.textContent = totalPunches;
        this.elements.normalCount.textContent = normalCount;
        this.elements.lateCount.textContent = lateCount;
        this.elements.earlyDepartureCount.textContent = earlyCount;
    }

    renderRecords() {
        this.elements.recordsBody.innerHTML = '';

        const punchEvents = [];

        this.records.forEach(r => {
            const isManual = r.is_manual_entry === 1;

            if (r.clock_in_time) {
                punchEvents.push({
                    typeLabel: `上班打卡${isManual ? ' (手工补卡)' : ''}`,
                    dateTimeStr: `${r.record_date} ${r.clock_in_time}`,
                    status: r.status_in || 'normal',
                    statusLabel: r.status_in === 'late' ? '迟到' : '正常',
                    emailStatus: r.email_status || 'none',
                    sortKey: `${r.record_date}T${r.clock_in_time}`
                });
            }

            if (r.clock_out_time) {
                punchEvents.push({
                    typeLabel: `下班打卡${isManual ? ' (手工补卡)' : ''}`,
                    dateTimeStr: `${r.record_date} ${r.clock_out_time}`,
                    status: r.status_out || 'normal',
                    statusLabel: r.status_out === 'early' ? '早退' : '正常',
                    emailStatus: r.email_status || 'none',
                    sortKey: `${r.record_date}T${r.clock_out_time}`
                });
            }
        });

        punchEvents.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
        
        if (punchEvents.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="4" style="text-align: center; color: var(--text-secondary);">暂无考勤历史记录</td>';
            this.elements.recordsBody.appendChild(emptyRow);
            return;
        }

        punchEvents.forEach(p => {
            const row = document.createElement('tr');

            const typeCell = document.createElement('td');
            typeCell.textContent = p.typeLabel;

            const timeCell = document.createElement('td');
            timeCell.textContent = p.dateTimeStr;

            const statusCell = document.createElement('td');
            let colorStyle = 'color:var(--success-color)';
            if (p.status === 'late') colorStyle = 'color:var(--danger-color)';
            if (p.status === 'early') colorStyle = 'color:var(--warning-color)';
            statusCell.innerHTML = `<span style="${colorStyle}; font-weight: 500;">${p.statusLabel}</span>`;

            const emailCell = document.createElement('td');
            const emailState = p.emailStatus;
            const emailBadge = document.createElement('span');
            emailBadge.className = `email-badge email-${emailState}`;
            emailBadge.textContent = emailState === 'sent' ? '已发送' : (emailState === 'failed' ? '发送失败' : '未发送');
            emailCell.appendChild(emailBadge);

            row.appendChild(typeCell);
            row.appendChild(timeCell);
            row.appendChild(statusCell);
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
