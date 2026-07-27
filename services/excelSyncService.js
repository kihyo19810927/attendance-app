const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class ExcelSyncService {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
    }

    /**
     * Resolve base storage directory configured in System Settings
     * Default: ./attendance_files
     * @param {string} configuredDir
     * @returns {string} Absolute directory path
     */
    resolveStorageDir(configuredDir) {
        let targetDir = configuredDir || './attendance_files';
        if (!path.isAbsolute(targetDir)) {
            targetDir = path.resolve(this.projectRoot, targetDir);
        }
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        return targetDir;
    }

    /**
     * Ensure archive directory exists inside storage directory
     * @param {string} storageDir
     * @returns {string} Archive directory path
     */
    ensureArchiveDir(storageDir) {
        const archiveDir = path.join(storageDir, 'archive');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }
        return archiveDir;
    }

    /**
     * Auto archive previous months' Excel files into {storageDir}/archive/
     * @param {string} employeeName
     * @param {string} storageDir
     */
    archiveOldFiles(employeeName, storageDir) {
        const archiveDir = this.ensureArchiveDir(storageDir);
        const safeName = (employeeName || '紀標').trim();
        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

        try {
            const files = fs.readdirSync(storageDir);
            const pattern = new RegExp(`^${safeName}_(\\d{6})\\.xlsx$`);

            files.forEach(file => {
                const match = file.match(pattern);
                if (match) {
                    const fileYearMonth = match[1];
                    if (fileYearMonth < currentYearMonth) {
                        const oldPath = path.join(storageDir, file);
                        const newPath = path.join(archiveDir, file);
                        fs.renameSync(oldPath, newPath);
                        console.log(`[ExcelSync] Archived file: ${file} -> archive/${file}`);
                    }
                }
            });
        } catch (e) {
            console.error('[ExcelSync] Error archiving old files:', e);
        }
    }

    /**
     * Calculate working hours between clock-in and clock-out
     * @param {string} clockInStr - HH:mm:ss
     * @param {string} clockOutStr - HH:mm:ss
     * @returns {string} - e.g. "09小时13分钟"
     */
    calculateWorkingHours(clockInStr, clockOutStr) {
        if (!clockInStr || !clockOutStr) return '';

        try {
            const [h1, m1, s1] = clockInStr.split(':').map(Number);
            const [h2, m2, s2] = clockOutStr.split(':').map(Number);

            const startSec = h1 * 3600 + m1 * 60 + (s1 || 0);
            const endSec = h2 * 3600 + m2 * 60 + (s2 || 0);

            let diffSec = endSec - startSec;
            if (diffSec < 0) diffSec += 24 * 3600;

            const hours = Math.floor(diffSec / 3600);
            const mins = Math.floor((diffSec % 3600) / 60);

            return `${String(hours).padStart(2, '0')}小时${String(mins).padStart(2, '0')}分钟`;
        } catch (e) {
            return '';
        }
    }

    /**
     * Get or create Excel workbook file for the record's date inside storageDir
     * @param {string} employeeName
     * @param {Date} dateObj
     * @param {string} configuredStorageDir
     * @returns {{ filePath: string, workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet }}
     */
    async getOrCreateWorkbook(employeeName, dateObj, configuredStorageDir) {
        const storageDir = this.resolveStorageDir(configuredStorageDir);
        const safeName = (employeeName || '紀標').trim();
        const year = dateObj.getFullYear();
        const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}${monthStr}`;
        const fileName = `${safeName}_${yearMonth}.xlsx`;

        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        let targetFilePath = path.join(storageDir, fileName);
        if (yearMonth < currentYearMonth) {
            const archiveDir = this.ensureArchiveDir(storageDir);
            targetFilePath = path.join(archiveDir, fileName);
        } else {
            this.archiveOldFiles(safeName, storageDir);
        }

        const workbook = new ExcelJS.Workbook();
        let worksheet;

        if (fs.existsSync(targetFilePath)) {
            await workbook.xlsx.readFile(targetFilePath);
            worksheet = workbook.getWorksheet('考勤記録') || workbook.worksheets[0];
        } else {
            worksheet = workbook.addWorksheet('考勤記録');
            
            worksheet.columns = [
                { header: '日期', key: 'date', width: 16 },
                { header: '出社時間', key: 'clock_in', width: 16 },
                { header: '退社時間', key: 'clock_out', width: 16 },
                { header: '工作時間', key: 'working_hours', width: 18 }
            ];

            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2575FC' }
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        return { filePath: targetFilePath, workbook, worksheet };
    }

    /**
     * Append or update attendance row in local Excel file
     * Columns: [日期, 出社時間, 退社時間, 工作時間]
     * @param {Object} params - { employeeName, configuredStorageDir, dateStr, clockInTime, clockOutTime }
     */
    async syncRecord(params) {
        const { employeeName, configuredStorageDir, dateStr, clockInTime, clockOutTime } = params;

        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const formattedDate = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;

        const { filePath, workbook, worksheet } = await this.getOrCreateWorkbook(employeeName, dateObj, configuredStorageDir);

        let targetRowIndex = -1;
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const cellVal = String(row.getCell(1).value || '').trim();
                if (cellVal === formattedDate) {
                    targetRowIndex = rowNumber;
                }
            }
        });

        if (targetRowIndex > 1) {
            const row = worksheet.getRow(targetRowIndex);
            
            let finalClockIn = clockInTime || row.getCell(2).value || '';
            let finalClockOut = clockOutTime || row.getCell(3).value || '';

            row.getCell(1).value = formattedDate;
            row.getCell(2).value = finalClockIn;
            row.getCell(3).value = finalClockOut;
            row.getCell(4).value = this.calculateWorkingHours(finalClockIn, finalClockOut);

            row.alignment = { vertical: 'middle', horizontal: 'center' };
            row.commit();
        } else {
            const newClockIn = clockInTime || '';
            const newClockOut = clockOutTime || '';
            const workingHours = this.calculateWorkingHours(newClockIn, newClockOut);

            const newRow = worksheet.addRow([
                formattedDate,
                newClockIn,
                newClockOut,
                workingHours
            ]);
            newRow.alignment = { vertical: 'middle', horizontal: 'center' };
            newRow.commit();
        }

        await workbook.xlsx.writeFile(filePath);
        console.log(`[ExcelSync] Updated Excel record in: ${filePath}`);
        return { success: true, filePath };
    }

    /**
     * Clear Excel data rows
     * @param {string} employeeName 
     * @param {string} configuredStorageDir 
     */
    async clearExcelRecords(employeeName, configuredStorageDir) {
        const storageDir = this.resolveStorageDir(configuredStorageDir);
        const safeName = (employeeName || '紀標').trim();
        const now = new Date();
        const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const fileName = `${safeName}_${yearMonth}.xlsx`;
        const filePath = path.join(storageDir, fileName);

        if (fs.existsSync(filePath)) {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('考勤記録');
            worksheet.columns = [
                { header: '日期', key: 'date', width: 16 },
                { header: '出社時間', key: 'clock_in', width: 16 },
                { header: '退社時間', key: 'clock_out', width: 16 },
                { header: '工作時間', key: 'working_hours', width: 18 }
            ];
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2575FC' }
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            await workbook.xlsx.writeFile(filePath);
        }
    }
}

module.exports = new ExcelSyncService();
