import { emailTemplate } from '../const/emailTemplate.js';
import { redisClient } from '../redis/redis.client.js';
import { sendEmail } from './emailSender.js';
import { hashData } from './hashData.js';

export type TOtpPurpose = 'WHILE_REGISTRATION' | 'WHILE_LOGIN'  | 'FORGET_PASS';
export type TRedisData = {
  userId: string;
  otpHash: string;
  purpose: TOtpPurpose;
};

type TSendOtpFlowReturn = {
  email: string;
  userId: string;
  verifyId?: string;
  purpose: TOtpPurpose;
};

export const sendOtpFlow = async ({ email, userId, verifyId, purpose }: TSendOtpFlowReturn) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await hashData(otp);
  const verificationId = verifyId || crypto.randomUUID();

  const redisData: TRedisData = {
    userId,
    otpHash,
    purpose
  };

  //   set otp verification session expire in 24 hours
  if (!verifyId) {
    await redisClient.set(
      `verification:session:${verificationId}`,
      JSON.stringify({
        userId,
        purpose,
      }),
      {
        EX: 60 * 60 * 24, // 24 hours
      }
    );
  }

  //   set otp verification code (expire in 5 minutes)

  await redisClient.set(
    `otp:verification:${verificationId}`,
    JSON.stringify(redisData),
    {
      EX: 300,
    }
  );

  // otp req countdown when first req come then the validity set to 24 hours
  const requestKey = `otp:request:${userId}:${purpose}`;
  const requestCount = await redisClient.incr(requestKey);

  if (requestCount === 1) {
    await redisClient.expire(
      requestKey,
      86400 // 24 hours
    );
  }

  //   set otp cooldown that user can`t send another req for otp
  const cooldownKey = `otp:cooldown:${userId}:${purpose}`;
  await redisClient.set(cooldownKey, 'true', {
    EX: 300,
  });

  // 7. Send OTP via Nodemailer
  const emailHtml = emailTemplate(otp);
  await sendEmail(email, 'Your Email Verification OTP Code', emailHtml);

  return { verificationId, otp };
};
