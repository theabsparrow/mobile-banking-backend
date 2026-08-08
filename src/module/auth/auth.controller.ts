/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NextFunction, Request, Response } from 'express';
import type { TResendOtpRequestBody } from '../../middlewire/otpRequestMiddlewire.js';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TLoginData, TLogoutAll, TPinData, TUser, TVerifyOtpBody } from './auth.interface.js';
import { AuthService } from './auth.service.js';
import type { TJwtPayload } from './auth.utills.js';
import config from '../../config/index.js';
import { StatusCodes } from 'http-status-codes';

type TUserDataBody = { userId: string; otpHash?: string };

const register = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const data = req.body as TUser;
  const result = await AuthService.registerUser(data);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
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
    statusCode: StatusCodes.OK,
    success: true,
    message: 'A new OTP code has been successfully generated and sent to your email.',
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { verificationId, otp } = req.body as TVerifyOtpBody;
  const { userId, otpHash } = req.otpUser as TUserDataBody;
  const result = await AuthService.verifyOtp({ verificationId, userId, otp, otpHash: otpHash! });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
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
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Pin has been set successfully. Now set you six digit pin.',
    data: result,
  });
});

const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const data = req.body as TLoginData;
  const result = await AuthService.login(data, req);

  if ('accessToken' in result && 'refreshToken' in result) {
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: config.node_env === 'production',
      sameSite: 'lax',
      maxAge: 1 * 60 * 1000, // 1 minute
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: config.node_env === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully.',
    data: result,
  });
});

const logoutFromAll = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const data = req.body as TLogoutAll;
  const { userId } = req.user as TUserDataBody;
  const result = await AuthService.logoutFromAll(userId, data);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'successfully logout from all device.',
  });
});

const logout = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { sessionId } = req.user as TJwtPayload;
  await AuthService.logout(sessionId);
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'successfully logout.',
  });
});

const accessToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as TJwtPayload;
  const result = await AuthService.accessToken(user);
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: config.node_env === 'production',
    sameSite: 'lax',
    maxAge: 1 * 60 * 1000,
  });
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Access token refreshed successfully.',
    data: result,
  });
});

export const AuthController = {
  register,
  resendOtp,
  verifyOtp,
  setPin,
  login,
  logoutFromAll,
  logout,
  accessToken,
};
