/**
 * Attendance App Controller
 * Manages state, logic, and DOM updates for the attendance system.
 */
class AttendanceApp {
    constructor() {
        this.state = {
            records: []
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
            clearBtn: document.getElementById('clear-btn')
        };

        this.init();
    }

    init() {
        this.loadState();
        this.startClock();
        this.renderStats();
        this.renderRecords();
        this.bindEvents();
    }

    /**
     * Load state from localStorage
     */
    loadState() {
        try {
            const savedRecords = localStorage.getItem('attendance_records');
            if (savedRecords) {
                this.state.records = JSON.parse(savedRecords);
            }
        } catch (e) {
            console.error('Failed to load state from localStorage', e);
        }
    }

    /**
     * Save state to localStorage
     */
    saveState() {
        try {
            localStorage.setItem('attendance_records', JSON.stringify(this.state.records));
        } catch (e) {
            console.error('Failed to save state to localStorage', e);
        }
    }

    /**
     * Start the clock interval
     */
    startClock() {
        const updateClock = () => {
            const now = new Date();
            this.elements.clockDisplay.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
            this.elements.dateDisplay.textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        this.elements.clockInBtn.addEventListener('click', () => this.clockIn());
        this.elements.clockOutBtn.addEventListener('click', () => this.clockOut());
        this.elements.clearBtn.addEventListener('click', () => this.clearRecords());
    }

    /**
     * Helper method to find today's record of a specific type.
     * @param {string} type - 'clock-in' or 'clock-out'
     * @returns {object|null} The record object or null if not found.
     */
    getTodayRecord(type) {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

        return this.state.records.find(record => {
            const recordDate = new Date(record.timestamp);
            const recordKey = `${recordDate.getFullYear()}-${recordDate.getMonth()}-${recordDate.getDate()}`;
            return recordKey === todayKey && record.type === type;
        }) || null;
    }

    /**
     * Clock In Logic with Phase 2 validation
     */
    clockIn() {
        const todayRecord = this.getTodayRecord('clock-in');
        if (todayRecord) {
            alert('今天已经完成上班打卡，请勿重复打卡！');
            return;
        }

        const now = new Date();
        const record = {
            type: 'clock-in',
            timestamp: now.toISOString(),
            status: this.calculateStatus('clock-in', now)
        };
        
        this.addRecord(record);
    }

    /**
     * Clock Out Logic with Phase 2 validation
     */
    clockOut() {
        const todayClockInRecord = this.getTodayRecord('clock-in');
        if (!todayClockInRecord) {
            alert('今天尚未进行上班打卡，无法进行下班打卡！');
            return;
        }

        const todayRecord = this.getTodayRecord('clock-out');
        if (todayRecord) {
            alert('今天已经完成下班打卡，请勿重复打卡！');
            return;
        }

        const now = new Date();
        const record = {
            type: 'clock-out',
            timestamp: now.toISOString(),
            status: this.calculateStatus('clock-out', now)
        };
        
        this.addRecord(record);
    }

    /**
     * Add record to state and save
     */
    addRecord(record) {
        this.state.records.push(record);
        this.saveState();
        this.renderStats();
        this.renderRecords();
    }

    /**
     * Calculate status based on type and time
     */
    calculateStatus(type, dateObj) {
        const hour = dateObj.getHours();
        const minute = dateObj.getMinutes();
        const totalMinutes = hour * 60 + minute;

        if (type === 'clock-in') {
            // Clock in after 09:00 is late
            if (totalMinutes > 9 * 60) {
                return 'late';
            }
            return 'normal';
        } else if (type === 'clock-out') {
            // Clock out before 18:00 is early departure
            if (totalMinutes < 18 * 60) {
                return 'early';
            }
            return 'normal';
        }
        return 'unknown';
    }

    /**
     * Clear records with Phase 2 confirmation dialog
     */
    clearRecords() {
        if (this.state.records.length === 0) {
            return;
        }
        if (confirm('确定要清空所有打卡记录吗？')) {
            this.state.records = [];
            this.saveState();
            this.renderStats();
            this.renderRecords();
        }
    }

    /**
     * Render statistics
     */
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

    /**
     * Render records table
     */
    renderRecords() {
        this.elements.recordsBody.innerHTML = '';
        
        if (this.state.records.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="3" style="text-align: center; color: var(--text-secondary);">暂无打卡记录</td>';
            this.elements.recordsBody.appendChild(emptyRow);
            return;
        }

        // Display records in reverse order (newest first)
        const reversedRecords = [...this.state.records].reverse();
        
        reversedRecords.forEach(record => {
            const row = document.createElement('tr');
            
            const typeCell = document.createElement('td');
            typeCell.textContent = record.type === 'clock-in' ? '上班打卡' : '下班打卡';
            
            const timeCell = document.createElement('td');
            const date = new Date(record.timestamp);
            timeCell.textContent = date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `status-badge status-${record.status}`;
            statusBadge.textContent = record.status === 'normal' ? '正常' : (record.status === 'late' ? '迟到' : '早退');
            statusCell.appendChild(statusBadge);
            
            row.appendChild(typeCell);
            row.appendChild(timeCell);
            row.appendChild(statusCell);
            this.elements.recordsBody.appendChild(row);
        });
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AttendanceApp();
});
