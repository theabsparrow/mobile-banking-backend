/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NextFunction, Request, Response } from 'express';
import type { TResendOtpRequestBody } from '../../middlewire/otpRequestMiddlewire.js';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TPinData, TUser, TVerifyOtpBody } from './auth.interface.js';
import { AuthService } from './auth.service.js';

type TUserDataBody = { userId: string; otpHash?: string };

const register = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const data = req.body as TUser;
  const result = await AuthService.registerUser(data);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'User registered successfully. An OTP code has been sent to your email.',
    meta: { page: 1, limit: 10, total: 1, totalPage: 1 },
    data: result,
  });
});

const resendOtp = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { verificationId } = req.body as TResendOtpRequestBody;
  const { userId } = req.otpUser as TUserDataBody;
  await AuthService.resendOtp(verificationId, userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'A new OTP code has been successfully generated and sent to your email.',
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { verificationId, otp } = req.body as TVerifyOtpBody;
  const { userId, otpHash } = req.otpUser as TUserDataBody;
  const result = await AuthService.verifyOtp({ verificationId, userId, otp, otpHash: otpHash! });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Email verified successfully. Now set you six digit pin.',
    data: result,
  });
});

const setPin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const data = req.body as TPinData;
  const { userId } = req.otpUser as TUserDataBody;
  const result = await AuthService.setPin(data, userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pin has been set successfully. Now set you six digit pin.',
    data: result,
  });
});

const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body as { email: string; password?: string };
  const result = await AuthService.loginUser({ email, password: password as string });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully.',
    meta: { page: 1, limit: 10, total: 1, totalPage: 1 },
    data: result,
  });
});

export const AuthController = {
  register,
  resendOtp,
  verifyOtp,
  setPin,
  login,
};
