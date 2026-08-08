/* eslint-disable @typescript-eslint/require-await */
import { prisma } from '../../config/prismaClient.js';
import type { TLoginData, TLogoutAll, TPinData, TUser } from './auth.interface.js';
import { compareData, hashData } from '../../utills/hashData.js';
import { sendOtpFlow } from '../../utills/sendOtpFlow.js';
import AppError from '../../error/AppError.js';
import { StatusCodes } from 'http-status-codes';
import { handleOtpFailedAttempt } from '../../utills/otpAttempt.js';
import { clearOtpSession, clearPinSession } from '../../utills/clearOtpSession.js';
import { setPinSession } from '../../utills/setPinSession.js';
import config from '../../config/index.js';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import {
  createToken,
  deviceSwitchSession,
  deviceSwitchSessionClear,
  type TJwtPayload,
} from './auth.utills.js';

type TVerifyOtpData = {
  verificationId: string;
  userId: string;
  otp: string;
  otpHash: string;
};

/**
 * Register a new user.
 */
const registerUser = async (payload: TUser) => {
  const { email, phone, password } = payload;

  // Check if email already exists
  const existingEmailUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingEmailUser) {
    throw new Error('Email is already registered.');
  }

  // Check if phone already exists
  if (phone) {
    const existingPhoneUser = await prisma.user.findFirst({
      where: { phone },
    });
    if (existingPhoneUser) {
      throw new Error('Phone number is already registered.');
    }
  }

  // Hash password
  const hashedPassword = await hashData(password);
  const data = { ...payload, password: hashedPassword };

  // Create pending user in PostgreSQL
  const user = await prisma.user.create({
    data,
  });

  // Generate and send OTP
  const registerData = await sendOtpFlow({ email: user?.email, userId: user?.id });
  return registerData?.verificationId;
};

//Request a new OTP for an unverified user.

const resendOtp = async (verificationId: string, id: string) => {
  if (!verificationId) {
    throw new Error('Verification ID is required.');
  }

  if (!id) {
    throw new Error('User ID is required.');
  }

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No registered user found');
  }

  if (user.isVerified) {
    throw new AppError(StatusCodes.CONFLICT, 'This account is already verified.');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.FORBIDDEN, 'User account is not active');
  }

  // Send new OTP
  const registerData = await sendOtpFlow({
    email: user?.email,
    userId: user?.id,
    verifyId: verificationId,
  });
  return registerData?.verificationId;
};

// verify otp
const verifyOtp = async ({ verificationId, userId, otp, otpHash }: TVerifyOtpData) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  // check if user exists verified or active
  if (!user) {
    throw new Error('User not found.');
  }
  if (user?.isVerified) {
    throw new Error('Email is already verified.');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.FORBIDDEN, 'User account is not active');
  }

  // If OTP is correct
  const isMatch = await compareData(otp, otpHash);
  if (!isMatch) {
    const result = await handleOtpFailedAttempt(verificationId, user?.id);
    if (result?.isBlocked) {
      throw new AppError(429, 'Too many wrong OTP attempts. Try again after 24 hours.');
    }
    throw new AppError(400, 'Invalid OTP');
  }

  // Update user to verified
  const updatedUser = await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      isVerified: true,
    },
    select: {
      id: true,
      isVerified: true,
    },
  });

  // clear redis otp session
  await clearOtpSession(verificationId);

  // pin setup id settting
  const pinSetupId = await setPinSession(user?.id);

  return { ...updatedUser, pinSetupId };
};

// set pit
export const setPin = async (payload: TPinData, userId: string) => {
  const { newPin, confirmPin, pinSetupId } = payload;
  if (newPin !== confirmPin) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'pin not matched');
  }
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // 3. Check active status
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.FORBIDDEN, 'User account is not active');
  }

  // 4. Check OTP verification
  if (!user.isVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Please verify OTP first');
  }

  // 5. Check already pin set
  if (user.isPinSet) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'PIN already set');
  }

  // 6. Hash PIN
  const hashedPin = await hashData(newPin);

  // update otp status form the database
  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      pin: hashedPin,
      isPinSet: true,
    },
    select: {
      id: true,
      isPinSet: true,
    },
  });

  // clear the pin session and return the data
  await clearPinSession(pinSetupId);
  return updatedUser;
};

/**
 * Login user.
 */
const login = async (payload: TLoginData, req: Request) => {
  const { email, phone, password } = payload;
  const parser = new UAParser(req.headers['user-agent']);
  const uaResult = parser.getResult();
  const { browser, os, device } = uaResult;

  // find user
  const user = await prisma.user.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  // 2. User status check
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.FORBIDDEN, 'Your account is currently inactive.');
  }

  // 4. Email verification check
  if (!user.isVerified) {
    const registerData = await sendOtpFlow({ email: user?.email, userId: user?.id });
    return {
      requiresEmailVerification: true,
      verificationId: registerData?.verificationId,
    };
  }

  // 5. PIN setup check
  if (!user.isPinSet) {
    const pinSetupId = await setPinSession(user?.id);
    return {
      requiresPinSetup: true,
      pinSetupId,
    };
  }

  // if password matched
  const isPasswordMatched = await compareData(password, user.password);
  if (!isPasswordMatched) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  // active session check
  const activeSessionCount = await prisma.session.count({
    where: {
      userId: user.id,
      status: 'ACTIVE',
    },
  });

  if (activeSessionCount >= user.maxDeviceAllowed) {
    const deviceSwitchId = await deviceSwitchSession(user?.id);
    return {
      deviceLimitExceeded: true,
      deviceSwitchId,
    };
  }

  const sessionId = crypto.randomUUID();

  const jwtPayload: TJwtPayload = {
    userId: user?.id,
    userRole: user?.role,
    sessionId,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string
  );

  const refreshToken = createToken(
    jwtPayload,
    config.jwt_refresh_secret as string,
    config.jwt_refresh_expires_in as string
  );
  const refreshTokenHash = await hashData(refreshToken);

  const data = {
    id: sessionId,
    userId: user.id,
    refreshTokenHash,
    deviceName: device.model || device.vendor || 'Unknown',
    browser: browser.name || 'Unknown',
    operatingSystem: os.name || 'Unknown',
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  const result = await prisma.session.create({
    data,
  });

  return { accessToken, refreshToken, sessionId: result.id };
};

const logoutFromAll = async (userId: string, payload: TLogoutAll) => {
  const { deviceSwitchId, pin } = payload;

  // 1. Find user
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // 2. Check user status
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.FORBIDDEN, 'Your account is currently inactive.');
  }

  // 3. Check PIN is set
  if (!user.isPinSet || !user.pin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'PIN is not set for this account.');
  }

  // 4. Verify PIN
  const isPinMatched = await compareData(pin, user.pin);

  if (!isPinMatched) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }

  await prisma.session.updateMany({
    where: {
      userId: user.id,
      status: 'ACTIVE',
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });
  await deviceSwitchSessionClear(deviceSwitchId);
};

const logout = async (sessionId: string) => {
  await prisma.session.update({
    where: {
      id: sessionId,
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });
};

const accessToken = async (user: TJwtPayload) => {
  const jwtPayload: TJwtPayload = {
    userId: user?.userId,
    userRole: user?.userRole,
    sessionId: user?.sessionId,
  };
  const newAccessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string
  );
  return newAccessToken;
};

export const AuthService = {
  registerUser,
  resendOtp,
  verifyOtp,
  setPin,
  login,
  logoutFromAll,
  logout,
  accessToken,
};
