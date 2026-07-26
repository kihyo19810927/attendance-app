const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const googleSyncService = require('./services/googleSyncService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/**
 * Task 1: POST /api/send-email
 * Send check-in email to HR with CC to employee via SMTP
 */
app.post('/api/send-email', async (req, res) => {
    try {
        const { hrEmail, userEmail, smtpConfig, record } = req.body;

        if (!hrEmail || !userEmail) {
            return res.status(400).json({
                success: false,
                error: 'HR 接收邮箱与个人邮箱均为必填项'
            });
        }

        if (!record || !record.type || !record.timestamp) {
            return res.status(400).json({
                success: false,
                error: '打卡记录有效数据缺失'
            });
        }

        const host = smtpConfig?.host || process.env.SMTP_HOST || 'smtp.qq.com';
        const port = Number(smtpConfig?.port || process.env.SMTP_PORT || 465);
        const user = smtpConfig?.user || process.env.SMTP_USER || userEmail;
        const pass = smtpConfig?.pass || process.env.SMTP_PASS;

        if (!pass && !process.env.SMTP_PASS) {
            return res.status(400).json({
                success: false,
                error: '未配置 SMTP 授权码/密码，无法建立 SMTP 账号连接。请前往 [系统设置 ⚙️] 输入 SMTP 密码。'
            });
        }

        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
                user,
                pass: pass || process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        const typeText = record.type === 'clock-in' ? '上班打卡' : '下班打卡';
        const dateObj = new Date(record.timestamp);
        const formattedTime = dateObj.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let statusText = '正常';
        let statusColor = '#4caf50';
        if (record.status === 'late') {
            statusText = '迟到';
            statusColor = '#ff9800';
        } else if (record.status === 'early') {
            statusText = '早退';
            statusColor = '#f44336';
        }

        const subject = `【考勤打卡通知】${typeText} - ${formattedTime} (${statusText})`;
        
        const htmlContent = `
        <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #00bcd4, #0097c4); padding: 20px; text-align: center; color: #ffffff;">
                <h2 style="margin: 0; font-size: 22px;">⏰ 考勤打卡通知</h2>
            </div>
            <div style="padding: 24px; background-color: #ffffff; color: #333333;">
                <p style="font-size: 15px; line-height: 1.6;">尊敬的 HR 团队与团队成员：</p>
                <p style="font-size: 15px; line-height: 1.6;">您好！员工打卡记录已成功提交，具体考勤数据如下：</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 12px; border: 1px solid #eeeeee; font-weight: bold; width: 30%;">打卡类型</td>
                        <td style="padding: 12px; border: 1px solid #eeeeee;">${typeText}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #eeeeee; font-weight: bold;">打卡时间</td>
                        <td style="padding: 12px; border: 1px solid #eeeeee;">${formattedTime}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 12px; border: 1px solid #eeeeee; font-weight: bold;">考勤状态</td>
                        <td style="padding: 12px; border: 1px solid #eeeeee;">
                            <span style="display: inline-block; padding: 4px 12px; background-color: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor}; border-radius: 4px; font-weight: bold;">
                                ${statusText}
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #eeeeee; font-weight: bold;">员工邮箱 (CC)</td>
                        <td style="padding: 12px; border: 1px solid #eeeeee;">${userEmail}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 12px; border: 1px solid #eeeeee; font-weight: bold;">HR 邮箱 (To)</td>
                        <td style="padding: 12px; border: 1px solid #eeeeee;">${hrEmail}</td>
                    </tr>
                </table>

                <p style="font-size: 13px; color: #777777; margin-top: 20px;">
                    * 此邮件由系统自动送出，无需回复。
                </p>
            </div>
            <div style="background-color: #f4f4f4; padding: 12px; text-align: center; font-size: 12px; color: #999999;">
                考勤打卡系统 © ${new Date().getFullYear()}
            </div>
        </div>
        `;

        const mailOptions = {
            from: `"考勤系统" <${user}>`,
            to: hrEmail,
            cc: userEmail,
            subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('[SMTP Email] Sent successfully, messageId:', info.messageId);

        return res.status(200).json({
            success: true,
            message: '打卡邮件发送成功！已成功发送给 HR 并抄送至您的个人邮箱。',
            messageId: info.messageId
        });
    } catch (err) {
        console.error('[SMTP Email] Error:', err);
        return res.status(500).json({
            success: false,
            error: `邮件发送失败: ${err.message}`
        });
    }
});

/**
 * Task 2: POST /api/google-sync
 * Endpoint to append clock-in/out record to Google Sheets / Docs
 */
app.post('/api/google-sync', async (req, res) => {
    try {
        const { type, timestamp, status, employeeId, employeeName, userEmail, notes } = req.body;

        if (!type || !timestamp || !status) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: type, timestamp, or status.'
            });
        }

        const syncResults = await googleSyncService.syncAttendance({
            type,
            timestamp,
            status,
            employeeId,
            employeeName,
            userEmail,
            notes
        });

        return res.status(200).json({
            success: true,
            message: 'Attendance record sync processed.',
            data: syncResults
        });
    } catch (error) {
        console.error('[API Server] /api/google-sync error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while syncing to Google Services.',
            details: error.message
        });
    }
});

/**
 * Task 3: POST & GET /api/cron-checkin
 * Endpoint triggered by GCP Cloud Scheduler for offline random automated check-in
 */
const handleCronCheckin = async (req, res) => {
    try {
        const now = new Date();
        const type = req.body?.type || req.query?.type || 'auto';
        
        let targetType = type;
        if (type === 'auto') {
            const hour = now.getHours();
            targetType = hour < 12 ? 'clock-in' : 'clock-out';
        }

        const hour = now.getHours();
        const min = now.getMinutes();
        const totalMin = hour * 60 + min;

        let status = 'normal';
        if (targetType === 'clock-in') {
            status = totalMin > 9 * 60 ? 'late' : 'normal';
        } else {
            status = totalMin < 18 * 60 ? 'early' : 'normal';
        }

        const record = {
            type: targetType,
            timestamp: now.toISOString(),
            status,
            triggeredBy: 'GCP-CloudScheduler'
        };

        // Sync to Google Sheets/Docs
        const googleSyncResult = await googleSyncService.syncAttendance(record);

        return res.status(200).json({
            success: true,
            message: `GCP Cloud Scheduler triggered auto ${targetType} successfully.`,
            record,
            googleSyncResult
        });
    } catch (error) {
        console.error('[GCP Cron] Automated checkin error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process automated checkin trigger.',
            details: error.message
        });
    }
};

app.post('/api/cron-checkin', handleCronCheckin);
app.get('/api/cron-checkin', handleCronCheckin);

app.listen(PORT, () => {
    console.log(`[Attendance App Server] Listening on http://localhost:${PORT}`);
});
