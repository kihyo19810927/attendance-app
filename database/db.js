const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../attendance_data.db');
let db = null;
let SQL = null;

/**
 * Initialize WebAssembly SQLite database
 */
async function getDb() {
    if (db) return db;

    if (!SQL) {
        SQL = await initSqlJs();
    }

    if (fs.existsSync(dbPath)) {
        const filebuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(filebuffer);
    } else {
        db = new SQL.Database();
    }

    initDatabaseSchema();
    saveDbFile();
    return db;
}

/**
 * Persist SQLite database memory to disk
 */
function saveDbFile() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (e) {
        console.error('[Database] Failed to save db file:', e);
    }
}

/**
 * Initialize database tables & seed default config
 */
function initDatabaseSchema() {
    if (!db) return;

    // 1. System Config Table
    db.run(`
        CREATE TABLE IF NOT EXISTS sys_config (
            config_key TEXT PRIMARY KEY,
            config_value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Attendance Records Table
    db.run(`
        CREATE TABLE IF NOT EXISTS attendance_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_date TEXT UNIQUE NOT NULL,
            clock_in_time TEXT,
            clock_out_time TEXT,
            working_hours TEXT,
            status_in TEXT DEFAULT 'normal',
            status_out TEXT DEFAULT 'normal',
            email_status TEXT DEFAULT 'none',
            is_manual_entry INTEGER DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 3. Holiday Calendar Table
    db.run(`
        CREATE TABLE IF NOT EXISTS holiday_calendar (
            cal_date TEXT PRIMARY KEY,
            day_type TEXT NOT NULL,
            holiday_name TEXT
        );
    `);

    // Seed default configuration if empty
    const checkConfig = db.exec('SELECT COUNT(*) as count FROM sys_config');
    const count = checkConfig.length > 0 ? checkConfig[0].values[0][0] : 0;

    if (count === 0) {
        const defaultConfig = {
            employee_name: '紀標',
            excel_storage_dir: './attendance_files',
            email_to: 'hr@company.com',
            email_cc: '',
            email_subject_tpl: '【考勤打卡通知】{employeeName} - {date} {type} ({status})',
            email_body_tpl: `尊敬的 HR / 主管：\n\n员工【{employeeName}】已完成今日的{type}，详细考勤信息如下：\n\n• 员工姓名：{employeeName}\n• 打卡类型：{type}\n• 打卡日期：{date}\n• 打卡时间：{time}\n• 考勤状态：{status}\n• 今日工作时长：{workingHours}\n\n（此邮件由考勤打卡桌面客户端自动发送，请勿直接回复）`,
            smtp_host: 'smtp.wadax-sv.jp',
            smtp_port: '587',
            smtp_user: 'jibiao@haonova.co.jp',
            smtp_pass: '',
            auto_email_enabled: '1',
            auto_punch_enabled: '1',
            morning_start_time: '09:25',
            morning_end_time: '09:30',
            evening_start_time: '18:30',
            evening_end_time: '19:00',
            skip_holidays_enabled: '1'
        };

        for (const [k, v] of Object.entries(defaultConfig)) {
            db.run('INSERT INTO sys_config (config_key, config_value) VALUES (?, ?)', [k, String(v)]);
        }
    }
}

/**
 * Get all system config key-values
 */
async function getAllConfig() {
    const database = await getDb();
    const res = database.exec('SELECT config_key, config_value FROM sys_config');
    const config = {};
    if (res.length > 0) {
        const values = res[0].values;
        for (const r of values) {
            config[r[0]] = r[1];
        }
    }
    return config;
}

/**
 * Save / Update system config key-values
 */
async function saveConfig(configObject) {
    const database = await getDb();
    for (const [k, v] of Object.entries(configObject)) {
        database.run('INSERT OR REPLACE INTO sys_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [k, String(v)]);
    }
    saveDbFile();
    return await getAllConfig();
}

/**
 * Get attendance record for a specific date
 */
async function getTodayRecord(dateStr) {
    const database = await getDb();
    const stmt = database.prepare('SELECT * FROM attendance_records WHERE record_date = ?');
    stmt.bind([dateStr]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

/**
 * Get all attendance records ordered by date DESC
 */
async function getAllRecords() {
    const database = await getDb();
    const res = database.exec('SELECT * FROM attendance_records ORDER BY record_date DESC');
    if (res.length === 0) return [];
    
    const columns = res[0].columns;
    const values = res[0].values;
    
    return values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });
        return obj;
    });
}

/**
 * Insert or update attendance record
 */
async function saveAttendanceRecord(record) {
    const database = await getDb();
    const existing = await getTodayRecord(record.record_date);

    if (existing) {
        database.run(`
            UPDATE attendance_records 
            SET clock_in_time = COALESCE(?, clock_in_time),
                clock_out_time = COALESCE(?, clock_out_time),
                working_hours = COALESCE(?, working_hours),
                status_in = COALESCE(?, status_in),
                status_out = COALESCE(?, status_out),
                email_status = COALESCE(?, email_status),
                is_manual_entry = COALESCE(?, is_manual_entry),
                notes = COALESCE(?, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE record_date = ?
        `, [
            record.clock_in_time || null,
            record.clock_out_time || null,
            record.working_hours || null,
            record.status_in || null,
            record.status_out || null,
            record.email_status || null,
            record.is_manual_entry !== undefined ? record.is_manual_entry : null,
            record.notes || null,
            record.record_date
        ]);
    } else {
        database.run(`
            INSERT INTO attendance_records 
            (record_date, clock_in_time, clock_out_time, working_hours, status_in, status_out, email_status, is_manual_entry, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            record.record_date,
            record.clock_in_time || null,
            record.clock_out_time || null,
            record.working_hours || null,
            record.status_in || 'normal',
            record.status_out || 'normal',
            record.email_status || 'none',
            record.is_manual_entry || 0,
            record.notes || null
        ]);
    }
    saveDbFile();
    return await getTodayRecord(record.record_date);
}

/**
 * Clear all attendance records from SQLite
 */
async function clearAllRecords() {
    const database = await getDb();
    database.run('DELETE FROM attendance_records');
    saveDbFile();
    return true;
}

module.exports = {
    getDb,
    getAllConfig,
    saveConfig,
    getTodayRecord,
    getAllRecords,
    saveAttendanceRecord,
    clearAllRecords
};
