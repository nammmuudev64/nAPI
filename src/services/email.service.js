const nodemailer = require("nodemailer");
require("dotenv").config();

// Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a password-reset email.
 * @param {string} toEmail   Recipient email address
 * @param {string} toName    Recipient display name
 * @param {string} resetLink Full reset URL with token
 */
const sendResetPasswordEmail = async (toEmail, toName, resetLink) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || `nAPI <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Reset Your Password — nAPI",
    // Plain-text fallback
    text: `Hi ${toName},\n\nYou requested a password reset.\n\nClick the link below to reset your password (valid for 15 minutes):\n${resetLink}\n\nIf you did not request this, please ignore this email.\n\nRegards,\nnAPI Team`,
    // HTML version
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px;">
        <div style="max-width:500px;margin:auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color:#333;margin-top:0;">Password Reset Request</h2>
          <p style="color:#555;">Hi <strong>${toName}</strong>,</p>
          <p style="color:#555;">We received a request to reset your password. Click the button below — this link expires in <strong>15 minutes</strong>.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${resetLink}"
               style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:16px;display:inline-block;">
              Reset My Password
            </a>
          </div>
          <p style="color:#888;font-size:13px;">Or copy and paste this link into your browser:</p>
          <p style="color:#4F46E5;font-size:13px;word-break:break-all;">${resetLink}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="color:#aaa;font-size:12px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendResetPasswordEmail };
