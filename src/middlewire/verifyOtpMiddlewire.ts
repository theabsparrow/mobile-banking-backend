import type { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../utills/catchAsync.js';
import AppError from '../error/AppError.js';
import { redisClient } from '../redis/redis.client.js';
import { StatusCodes } from 'http-status-codes';
import type { TOtpPurpose, TRedisData } from '../utills/sendOtpFlow.js';
import type { TVerifyOtpBody } from '../module/auth/auth.interface.js';
import type { TSessionRedisData } from './otpRequestMiddlewire.js';

export const verifyOtpMiddlewire = (...requiredPurpose: TOtpPurpose[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    // 1. verificationId check
    const { verificationId } = req.body as TVerifyOtpBody;
    if (!verificationId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Verification ID is required');
    }

    // 2. session check
    const sessionData = await redisClient.get(`verification:session:${verificationId}`);
    if (!sessionData) {
      throw new AppError(StatusCodes.GATEWAY_TIMEOUT, 'Invalid or expired verification session');
    }

    const session = JSON.parse(sessionData) as TSessionRedisData;
    if (requiredPurpose && !requiredPurpose.includes(session?.purpose)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid verification session');
    }

    // 3. OTP data check
    const otpData = await redisClient.get(`otp:verification:${verificationId}`);
    if (!otpData) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'OTP expired. Please request a new OTP');
    }

    const otp = JSON.parse(otpData) as TRedisData;
    if (otp.userId !== session.userId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid verification session');
    }

    // 6. Check OTP purpose
    if (otp.purpose !== session?.purpose) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid verification session');
    }

    // 4. Check wrong attempt limit
    const attemptKey = `otp:attempt:${verificationId}`;
    const attempts = await redisClient.get(attemptKey);
    if (attempts && Number(attempts) >= 5) {
      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Too many wrong attempts. Try again after 24 hours'
      );
    }

    // attach data
    req.otpUser = {
      userId: otp.userId,
      otpHash: otp.otpHash,
      purpose: otp.purpose,
    };

    next();
  });
};
