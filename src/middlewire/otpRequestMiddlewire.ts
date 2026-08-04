import type { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../utills/catchAsync.js';
import AppError from '../error/AppError.js';
import { redisClient } from '../redis/redis.client.js';
import { StatusCodes } from 'http-status-codes';

export type TResendOtpRequestBody = {
  verificationId: string;
};

type TSessionRedisData = {
  userId: string;
}

export const otpRequestMiddlewire = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // check if the verificationId is present in the request body
    const { verificationId } = req.body as TResendOtpRequestBody;
    if (!verificationId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Verification ID is required');
    }

    // check if the verificationId is valid and not expired
    const sessionData = await redisClient.get(`verification:session:${verificationId}`);
    if (!sessionData) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid or expired verification session');
    }

    // check if the user has exceeded the OTP request limit (5 requests in 24 hours)
    const { userId } = JSON.parse(sessionData) as TSessionRedisData;

    const requestKey = `otp:request:${userId}`;
    const requestCount = await redisClient.get(requestKey);
    if (requestCount && Number(requestCount) >= 5) {
      throw new AppError(StatusCodes.TOO_MANY_REQUESTS, 'OTP request limit exceeded. Try again after 24 hours.');
    }

    // check if the existing OTP is still valid for the given verificationId
    const existingOtpData = await redisClient.get(`otp:verification:${verificationId}`);
    if (existingOtpData) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Previous OTP is still valid. Please wait until it expires.');
    }

    // set user id to the req object
    req.otpUser = {
      userId,
    };

    next();
  }
);
