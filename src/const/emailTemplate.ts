export const emailTemplate = (otp: string) => {
  const emailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 30px auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <h2 style="color: #1a202c; text-align: center; margin-bottom: 24px; font-weight: 600;">Email Verification</h2>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">Thank you for registering on our platform. Use the following One-Time Password (OTP) to complete your email verification:</p>
      <div style="font-size: 32px; font-weight: 700; text-align: center; margin: 30px 0; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; letter-spacing: 6px; border-radius: 8px;">
        ${otp}
      </div>
      <p style="color: #e53e3e; font-size: 14px; font-weight: 500; margin-top: 20px;">This OTP is valid for 5 minutes.</p>
      <p style="color: #718096; font-size: 13px; line-height: 1.5; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px;">If you did not request this email, you can safely ignore it.</p>
    </div>
  `;
  return emailHtml;
};
