import nodemailer from 'nodemailer';
import config from '../config/index.js';

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    // If SMTP details are empty, log to console as a fallback
    if (!config.smtp_user || !config.smtp_pass) {
      console.log('--------------------------------------------------');
      console.log(`[SMTP Not Configured] Logging Email instead:`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body (HTML):\n${html}`);
      console.log('--------------------------------------------------');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_port === 465, // true for port 465, false for other ports
      auth: {
        user: config.smtp_user,
        pass: config.smtp_pass,
      },
    });

    const info = await transporter.sendMail({
      from: config.smtp_from,
      to,
      subject,
      html,
    });

    console.log(`Email sent successfully: ${info.messageId}`);
  } catch (error) {
    console.error('Error sending email via Nodemailer:', error);
    console.log('-----------------------------');
    console.log(`Fallback Log:`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body (HTML):\n${html}`);
    console.log('-----------------------------');
  }
};
