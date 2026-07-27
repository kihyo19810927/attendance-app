const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class ExcelSyncService {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.archiveDir = path.join(this.projectRoot, 'archive');
    }

    /**
     * Ensure archive directory exists
     */
    ensureArchiveDir() {
        if (!fs.existsSync(this.archiveDir)) {
            fs.mkdirSync(this.archiveDir, { recursive: true });
        }
    }

    /**
     * Auto archive previous months' Excel files into archive/ directory
     * Pattern: {username}_{YYYYMM}.xlsx
     * @param {string} employeeName
     */
    archiveOldFiles(employeeName) {
        this.ensureArchiveDir();
        const safeName = (employeeName || '紀標').trim();
        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

        try {
            const files = fs.readdirSync(this.projectRoot);
            const pattern = new RegExp(`^${safeName}_(\\d{6})\\.xlsx$`);

            files.forEach(file => {
                const match = file.match(pattern);
                if (match) {
                    const fileYearMonth = match[1];
                    if (fileYearMonth < currentYearMonth) {
                        const oldPath = path.join(this.projectRoot, file);
                        const newPath = path.join(this.archiveDir, file);
                        fs.renameSync(oldPath, newPath);
                        console.log(`[ExcelSync] Archived old file: ${file} -> archive/${file}`);
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
            if (diffSec < 0) diffSec += 24 * 3600; // Handle overnight

            const hours = Math.floor(diffSec / 3600);
            const mins = Math.floor((diffSec % 3600) / 60);

            return `${String(hours).padStart(2, '0')}小时${String(mins).padStart(2, '0')}分钟`;
        } catch (e) {
            return '';
        }
    }

    /**
     * Get or create Excel workbook file for the record's date
     * @param {string} employeeName
     * @param {Date} dateObj
     * @returns {{ filePath: string, workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet }}
     */
    async getOrCreateWorkbook(employeeName, dateObj) {
        const safeName = (employeeName || '紀標').trim();
        const year = dateObj.getFullYear();
        const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}${monthStr}`;
        const fileName = `${safeName}_${yearMonth}.xlsx`;

        // Check if file is for current month or past month
        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        let targetFilePath = path.join(this.projectRoot, fileName);
        if (yearMonth < currentYearMonth) {
            this.ensureArchiveDir();
            targetFilePath = path.join(this.archiveDir, fileName);
        } else {
            this.archiveOldFiles(safeName);
        }

        const workbook = new ExcelJS.Workbook();
        let worksheet;

        if (fs.existsSync(targetFilePath)) {
            await workbook.xlsx.readFile(targetFilePath);
            worksheet = workbook.getWorksheet('考勤記録') || workbook.worksheets[0];
        } else {
            worksheet = workbook.addWorksheet('考勤記録');
            
            // Header columns (No 1, 2, 3, 4 numbers)
            worksheet.columns = [
                { header: '日期', key: 'date', width: 16 },
                { header: '出社時間', key: 'clock_in', width: 16 },
                { header: '退社時間', key: 'clock_out', width: 16 },
                { header: '工作時間', key: 'working_hours', width: 18 }
            ];

            // Style headers
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
     * @param {Object} params - { employeeName, dateStr, clockInTime, clockOutTime }
     */
    async syncRecord(params) {
        const { employeeName, dateStr, clockInTime, clockOutTime } = params;

        // Parse date
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const formattedDate = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;

        const { filePath, workbook, worksheet } = await this.getOrCreateWorkbook(employeeName, dateObj);

        // Find existing row by Date (Column 1)
        let targetRowIndex = -1;
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Skip header
                const cellVal = String(row.getCell(1).value || '').trim();
                if (cellVal === formattedDate) {
                    targetRowIndex = rowNumber;
                }
            }
        });

        if (targetRowIndex > 1) {
            // Update existing row
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
            // Add new row at bottom
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
        console.log(`[ExcelSync] Successfully updated Excel record in: ${filePath}`);
        return { success: true, filePath };
    }
}

module.exports = new ExcelSyncService();
