import type { TResendOtpRequestBody } from '../../middlewire/otpRequestMiddlewire.js';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TUser } from './auth.interface.js';
import { AuthService } from './auth.service.js';

const register = catchAsync(async (req, res) => {
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

const resendOtp = catchAsync(async (req, res) => {
 const { verificationId } = req.body as TResendOtpRequestBody;
 const { userId } = req.otpUser as { userId: string };
  await AuthService.resendOtp(verificationId, userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'A new OTP code has been successfully generated and sent to your email.',
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body as { email: string; otp: string };
  const result = await AuthService.verifyOtp(email, otp);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Email verified successfully. You can now log in.',
    meta: { page: 1, limit: 10, total: 1, totalPage: 1 },
    data: result,
  });
});

const login = catchAsync(async (req, res) => {
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
  login,
};
