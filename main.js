const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const dbHelper = require('./database/db');
const excelSyncService = require('./services/excelSyncService');
const emailService = require('./services/emailService');

const APP_NAME = '考勤打卡桌面客户端';

let mainWindow = null;
let tray = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 980,
        height: 720,
        resizable: false,
        maximizable: false,
        frame: true,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    Menu.setApplicationMenu(null);
    mainWindow.loadFile('index.html');

    // Minimize to tray on close
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            showNotification('程序已缩小至右下角系统托盘后台运行');
        }
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'assets/icon.png');
    tray = new Tray(iconPath);
    tray.setToolTip(`${APP_NAME} (后台静默运行中)`);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主界面 ⏰',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: '退出软件 🚪',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function showNotification(bodyMessage) {
    if (Notification.isSupported()) {
        new Notification({ 
            title: APP_NAME, 
            body: bodyMessage 
        }).show();
    }
}

// App Lifecycle Events
app.whenReady().then(async () => {
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);
    const iconPath = path.join(assetsDir, 'icon.png');
    if (!fs.existsSync(iconPath)) {
        fs.writeFileSync(iconPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    }

    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Keep running in tray
    }
});

// IPC Communication Handlers
ipcMain.handle('get-config', async () => {
    return await dbHelper.getAllConfig();
});

ipcMain.handle('save-config', async (event, config) => {
    return await dbHelper.saveConfig(config);
});

ipcMain.handle('get-records', async () => {
    return await dbHelper.getAllRecords();
});

ipcMain.handle('clear-records', async () => {
    const config = await dbHelper.getAllConfig();
    await dbHelper.clearAllRecords();
    await excelSyncService.clearExcelRecords(config.employee_name || '紀標', config.excel_storage_dir);
    return { success: true };
});

ipcMain.handle('open-excel-file', async () => {
    const config = await dbHelper.getAllConfig();
    const storageDir = excelSyncService.resolveStorageDir(config.excel_storage_dir);
    const employeeName = config.employee_name || '紀標';
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fileName = `${employeeName}_${yearMonth}.xlsx`;
    const filePath = path.join(storageDir, fileName);

    if (fs.existsSync(filePath)) {
        await shell.openPath(filePath);
        return { success: true };
    } else {
        return { success: false, message: `当月 Excel 文件尚未在目录 [${storageDir}] 中生成，打卡后将自动创建。` };
    }
});

ipcMain.handle('open-archive-folder', async () => {
    const config = await dbHelper.getAllConfig();
    const storageDir = excelSyncService.resolveStorageDir(config.excel_storage_dir);
    const archiveDir = excelSyncService.ensureArchiveDir(storageDir);
    await shell.openPath(archiveDir);
    return { success: true };
});

// Primary Punch-In / Punch-Out Execution
ipcMain.handle('punch', async (event, params) => {
    const { type } = params;
    const config = await dbHelper.getAllConfig();

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

    const existing = await dbHelper.getTodayRecord(dateStr);

    if (type === 'clock-in' && existing && existing.clock_in_time) {
        return { success: false, message: '今天已经完成上班打卡！' };
    }
    if (type === 'clock-out' && existing && existing.clock_out_time) {
        return { success: false, message: '今天已经完成下班打卡！' };
    }
    if (type === 'clock-out' && (!existing || !existing.clock_in_time)) {
        return { success: false, message: '今天尚未上班打卡，无法进行下班打卡！' };
    }

    let status = 'normal';
    if (type === 'clock-in') {
        const [mHour, mMin] = (config.morning_end_time || '09:30').split(':').map(Number);
        const curMins = now.getHours() * 60 + now.getMinutes();
        if (curMins > mHour * 60 + mMin) status = 'late';
    } else {
        const [eHour, eMin] = (config.evening_start_time || '18:30').split(':').map(Number);
        const curMins = now.getHours() * 60 + now.getMinutes();
        if (curMins < eHour * 60 + eMin) status = 'early';
    }

    const recordUpdate = {
        record_date: dateStr,
        is_manual_entry: 0
    };

    if (type === 'clock-in') {
        recordUpdate.clock_in_time = timeStr;
        recordUpdate.status_in = status;
    } else {
        recordUpdate.clock_out_time = timeStr;
        recordUpdate.status_out = status;
        
        const clockInTime = existing ? existing.clock_in_time : null;
        if (clockInTime) {
            recordUpdate.working_hours = excelSyncService.calculateWorkingHours(clockInTime, timeStr);
        }
    }

    // 1. Save to SQLite
    const savedRecord = await dbHelper.saveAttendanceRecord(recordUpdate);

    // 2. Sync to local Excel in configured storage directory
    try {
        await excelSyncService.syncRecord({
            employeeName: config.employee_name || '紀標',
            configuredStorageDir: config.excel_storage_dir,
            dateStr: dateStr,
            clockInTime: savedRecord.clock_in_time,
            clockOutTime: savedRecord.clock_out_time
        });
    } catch (excelErr) {
        console.error('[Main] Excel sync failed:', excelErr);
    }

    // 3. Send Email if enabled
    let emailResult = { success: false };
    if (config.auto_email_enabled === '1') {
        try {
            emailResult = await emailService.sendAttendanceEmail({
                config,
                record: {
                    type,
                    typeLabel: type === 'clock-in' ? '上班打卡' : '下班打卡',
                    statusLabel: status === 'normal' ? '正常' : (status === 'late' ? '迟到' : '早退'),
                    dateStr,
                    timeStr,
                    workingHours: savedRecord.working_hours || '未下班'
                }
            });
            await dbHelper.saveAttendanceRecord({ record_date: dateStr, email_status: 'sent' });
        } catch (emailErr) {
            console.error('[Main] Email sending failed:', emailErr.message);
            await dbHelper.saveAttendanceRecord({ record_date: dateStr, email_status: 'failed' });
        }
    }

    const punchTypeLabel = type === 'clock-in' ? '上班打卡成功 ⏰' : '下班打卡成功 🌆';
    showNotification(`${punchTypeLabel} | 时间: ${timeStr} | 状态: ${status === 'normal' ? '正常' : status}`);

    return {
        success: true,
        record: savedRecord,
        emailResult
    };
});

// Manual Retroactive Entry
ipcMain.handle('manual-punch', async (event, params) => {
    const { dateStr, clockInTime, clockOutTime, notes, sendEmail } = params;
    const config = await dbHelper.getAllConfig();

    const recordUpdate = {
        record_date: dateStr,
        clock_in_time: clockInTime || null,
        clock_out_time: clockOutTime || null,
        is_manual_entry: 1,
        notes: notes || '补打卡'
    };

    if (clockInTime && clockOutTime) {
        recordUpdate.working_hours = excelSyncService.calculateWorkingHours(clockInTime, clockOutTime);
    }

    const savedRecord = await dbHelper.saveAttendanceRecord(recordUpdate);

    // Sync to Excel in configured storage directory
    await excelSyncService.syncRecord({
        employeeName: config.employee_name || '紀標',
        configuredStorageDir: config.excel_storage_dir,
        dateStr: dateStr,
        clockInTime: savedRecord.clock_in_time,
        clockOutTime: savedRecord.clock_out_time
    });

    if (sendEmail) {
        try {
            await emailService.sendAttendanceEmail({
                config,
                record: {
                    type: 'manual',
                    typeLabel: '补打卡数据修正',
                    statusLabel: '手工补卡',
                    dateStr,
                    timeStr: `${clockInTime || '--'} ~ ${clockOutTime || '--'}`,
                    workingHours: savedRecord.working_hours || '--'
                }
            });
        } catch (e) {
            console.error('[Main] Manual punch email error:', e);
        }
    }

    showNotification(`补打卡数据修正成功 📝 | 已更新 ${dateStr} 的考勤数据`);
    return { success: true, record: savedRecord };
});
