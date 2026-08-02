const nodemailer = require('nodemailer');

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass
      }
    });
  }
  return null;
}

async function sendVerificationEmail({ email, username, token, baseUrl }) {
  const transporter = createTransporter();
  const verifyUrl = `${baseUrl || 'http://localhost:3000'}/api/auth/verify-email?token=${token}`;
  
  const from = process.env.SMTP_FROM || '"Personal NAS" <noreply@personalnas.local>';
  const subject = 'Verify your Personal NAS Account';
  const text = `Hello ${username},\n\nPlease verify your email address for Personal NAS by clicking the link below:\n\n${verifyUrl}\n\nIf you did not request this, please ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #0f172a; color: #f8fafc;">
      <h2 style="color: #00bcd4; margin-top: 0;">Personal NAS Email Verification</h2>
      <p style="color: #cbd5e1;">Hello <strong>${username}</strong>,</p>
      <p style="color: #cbd5e1;">Thank you for registering on Personal NAS. Please click the button below to verify your email address and activate your account:</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${verifyUrl}" style="background-color: #00bcd4; color: #000; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a>
      </div>
      <p style="font-size: 13px; color: #94a3b8;">Or copy and paste this URL into your browser:<br/><a href="${verifyUrl}" style="color: #38bdf8;">${verifyUrl}</a></p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html
      });
      console.log(`[SMTP] Verification email sent to ${email}`);
      return { sent: true, mode: 'smtp' };
    } catch (err) {
      console.error(`[SMTP Error] Failed to send email to ${email}:`, err.message);
      return { sent: false, error: err.message, devLink: verifyUrl };
    }
  } else {
    console.log('====================================================');
    console.log(`[DEV EMAIL VERIFICATION LINK FOR ${username} (${email})]:`);
    console.log(verifyUrl);
    console.log('====================================================');
    return { sent: true, mode: 'dev', devLink: verifyUrl };
  }
}

module.exports = {
  sendVerificationEmail
};
