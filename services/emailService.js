const nodemailer = require('nodemailer');

/**
 * Split and clean semicolon/comma separated email string
 * @param {string} emailStr 
 * @returns {Array<string>}
 */
function parseEmailList(emailStr) {
    if (!emailStr) return [];
    return emailStr
        .split(/[;,]/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes('@'));
}

/**
 * Replace template placeholders in email subject and body
 * @param {string} template 
 * @param {Object} vars 
 * @returns {string}
 */
function renderTemplate(template, vars) {
    if (!template) return '';
    let result = template;
    for (const [k, v] of Object.entries(vars)) {
        const regex = new RegExp(`\\{${k}\\}`, 'g');
        result = result.replace(regex, v !== undefined && v !== null ? String(v) : '');
    }
    return result;
}

/**
 * Send Attendance Notification Email
 * @param {Object} params - { config, record }
 */
async function sendAttendanceEmail(params) {
    const { config, record } = params;

    const toList = parseEmailList(config.email_to);
    if (toList.length === 0) {
        throw new Error('未设置收件人邮箱 (To)，请在 [系统设置 ⚙️] 中配置。');
    }

    const ccList = parseEmailList(config.email_cc);

    const transporter = nodemailer.createTransport({
        host: config.smtp_host || 'smtp.wadax-sv.jp',
        port: parseInt(config.smtp_port, 10) || 587,
        secure: parseInt(config.smtp_port, 10) === 465,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const vars = {
        employeeName: config.employee_name || '従業員',
        type: record.typeLabel || (record.type === 'clock-in' ? '上班打卡' : '下班打卡'),
        status: record.statusLabel || (record.status === 'normal' ? '正常' : (record.status === 'late' ? '迟到' : '早退')),
        date: record.dateStr || new Date().toLocaleDateString('zh-CN'),
        time: record.timeStr || new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        workingHours: record.workingHours || '未下班'
    };

    const subject = renderTemplate(
        config.email_subject_tpl || '【考勤打卡通知】{employeeName} - {date} {type} ({status})',
        vars
    );

    const textBody = renderTemplate(
        config.email_body_tpl || `尊敬的 HR / 主管：\n\n员工【{employeeName}】已完成今日的{type}，详细考勤信息如下：\n\n• 员工姓名：{employeeName}\n• 打卡类型：{type}\n• 打卡日期：{date}\n• 打卡时间：{time}\n• 考勤状态：{status}\n• 今日工作时长：{workingHours}\n\n（此邮件由考勤打卡桌面客户端自动发送，请勿直接回复）`,
        vars
    );

    const mailOptions = {
        from: `"${config.employee_name || '考勤打卡系统'}" <${config.smtp_user}>`,
        to: toList.join(', '),
        subject: subject,
        text: textBody
    };

    if (ccList.length > 0) {
        mailOptions.cc = ccList.join(', ');
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('[EmailService] Mail sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId, to: toList, cc: ccList };
}

module.exports = {
    sendAttendanceEmail,
    parseEmailList,
    renderTemplate
};
