const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

class GoogleSyncService {
    constructor() {
        this.auth = null;
        this.sheets = null;
        this.initialized = false;
    }

    /**
     * Initialize Google Auth & Sheets API client using Service Account credentials or GCP ADC
     */
    async init() {
        if (this.initialized) return;

        try {
            const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                path.join(__dirname, '../credentials/service-account.json');

            const authConfig = {
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets'
                ]
            };

            if (process.env.GOOGLE_CREDENTIALS_JSON) {
                authConfig.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
                console.log('[GoogleSyncService] Using credentials from GOOGLE_CREDENTIALS_JSON env var.');
            } else if (process.env.GOOGLE_CREDENTIALS_BASE64) {
                const decodedJson = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8');
                authConfig.credentials = JSON.parse(decodedJson);
                console.log('[GoogleSyncService] Using credentials from GOOGLE_CREDENTIALS_BASE64 env var.');
            } else if (fs.existsSync(keyFilePath)) {
                authConfig.keyFile = keyFilePath;
                console.log('[GoogleSyncService] Using local keyFile:', keyFilePath);
            } else {
                console.log('[GoogleSyncService] Using GCP Application Default Credentials (ADC).');
            }

            this.auth = new google.auth.GoogleAuth(authConfig);

            const authClient = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            this.initialized = true;
            console.log('[GoogleSyncService] Successfully initialized Google Auth clients.');
        } catch (error) {
            console.error('[GoogleSyncService] Initialization failed:', error.message);
            throw new Error(`Google API Authentication Failed: ${error.message}`);
        }
    }

    /**
     * Append attendance record to Google Sheets matching '出退社記録' schema
     * Columns: [時間表記, 名前, 勤怠, 電子メールアドレス]
     * @param {Object} record - { type, timestamp, status, employeeName, userEmail }
     */
    async appendToSheets(record) {
        const rawSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || process.env['GOOGLE SPREADSHEET ID'] || '';
        const spreadsheetId = rawSpreadsheetId.trim();

        if (!spreadsheetId || spreadsheetId.includes('your_google_spreadsheet_id')) {
            console.warn('[GoogleSyncService] GOOGLE_SPREADSHEET_ID is not configured.');
            return { status: 'skipped', reason: 'Spreadsheet ID missing' };
        }

        await this.init();

        console.log(`[GoogleSyncService] Target Spreadsheet ID: "${spreadsheetId}"`);

        const dateObj = new Date(record.timestamp);
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1;
        const date = dateObj.getDate();
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');

        // Match format from screenshot: YYYY/M/D HH:mm:ss (e.g., 2025/7/2 18:33:27)
        const formattedTime = `${year}/${month}/${date} ${hours}:${minutes}:${seconds}`;

        // Status mapping: clock-in -> 出社, clock-out -> 退社
        const statusLabel = record.type === 'clock-in' ? '出社' : '退社';
        const employeeName = record.employeeName || '従業員';
        const userEmail = record.userEmail || record.email || 'user@company.com';

        // 4 Columns: [時間表記, 名前, 勤怠, 電子メールアドレス]
        const values = [
            [formattedTime, employeeName, statusLabel, userEmail]
        ];

        // Diagnostic: Get spreadsheet info first to check tab names
        try {
            const info = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheetTitles = info.data.sheets.map(s => s.properties.title);
            console.log('[GoogleSyncService] Spreadsheet title:', info.data.properties.title);
            console.log('[GoogleSyncService] Available Sheet Tabs:', sheetTitles);

            // Find target tab title or use first tab title
            const targetTab = sheetTitles.find(t => t.includes('出退社')) || sheetTitles[0];
            const targetRange = `'${targetTab}'!A:D`;

            console.log(`[GoogleSyncService] Appending to range: ${targetRange}`);

            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: targetRange,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: {
                    values: values
                }
            });

            console.log('[GoogleSyncService] Append SUCCESS! Updated range:', response.data.updates?.updatedRange);
            return { status: 'success', updatedRange: response.data.updates?.updatedRange };
        } catch (err) {
            console.error('[GoogleSyncService] Sheets API Error Code:', err.code || err.status);
            console.error('[GoogleSyncService] Sheets API Error Message:', err.message);
            if (err.response?.data) {
                console.error('[GoogleSyncService] Sheets API Detailed Response:', JSON.stringify(err.response.data));
            }
            throw err;
        }
    }

    /**
     * Main method to synchronize record to Sheets
     * @param {Object} record
     */
    async syncAttendance(record) {
        const results = {
            sheets: null,
            docs: { status: 'skipped', reason: 'Doc sync disabled' }
        };

        try {
            results.sheets = await this.appendToSheets(record);
        } catch (err) {
            results.sheets = { status: 'error', error: err.message };
        }

        return results;
    }
}

module.exports = new GoogleSyncService();
