/* eslint-disable @typescript-eslint/require-await */
import { prisma } from '../../config/prismaClient.js';
import type {
  TChangePassword,
  TForgetPassword,
  TLoginData,
  TLogoutAll,
  TPinData,
  TResetPassword,
  TUser,
} from './auth.interface.js';
import { compareData, hashData } from '../../utills/hashData.js';
import { sendOtpFlow, type TOtpPurpose } from '../../utills/sendOtpFlow.js';
import AppError from '../../error/AppError.js';
import { StatusCodes } from 'http-status-codes';
import { handleOtpFailedAttempt } from '../../utills/otpAttempt.js';
import { clearOtpSession, clearPinSession } from '../../utills/clearOtpSession.js';
import { passwordReset, setPinSession } from '../../utills/setPinSession.js';
import config from '../../config/index.js';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import {
  createToken,
  deviceSwitchSession,
  deviceSwitchSessionClear,
  invalidateAuthUserCache,
  resetPasswordSessionClear,
  type TJwtPayload,
} from './auth.utills.js';

type TVerifyOtpData = {
  verificationId: string;
  userId: string;
  otp: string;
  otpHash: string;
  purpose?: TOtpPurpose;
};

// register a new user
const registerUser = async (payload: TUser) => {
  const { email, phone, password, confirmPassword } = payload;
  if (password !== confirmPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'password and the confirm password is not same.');
  }

  // Check if email already exists
  const existingEmailUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingEmailUser) {
    throw new AppError(StatusCodes.CONFLICT, 'Email is already registered.');
  }

  // Check if phone already exists
  if (phone) {
    const existingPhoneUser = await prisma.user.findFirst({
      where: { phone },
    });
    if (existingPhoneUser) {
      throw new AppError(StatusCodes.CONFLICT, 'Phone number is already registered.');
    }
  }

  // Hash password
  const hashedPassword = await hashData(password);
  const data = {
    email,
    password: hashedPassword,
    name: email.split('@')[0] ?? '',
  };

  // Create pending user in PostgreSQL
  const user = await prisma.user.create({
    data,
  });

  // Generate and send OTP
  const registerData = await sendOtpFlow({
    email: user?.email,
    userId: user?.id,
    purpose: 'WHILE_REGISTRATION',
  });
  return registerData?.verificationId;
};

//Request a new OTP for an unverified user.
const resendOtp = async ({
  verificationId,
  id,
  purpose,
}: {
  verificationId: string;
  id: string;
  purpose: TOtpPurpose;
}) => {
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
    purpose,
  });
  return registerData?.verificationId;
};

// verify otp
const verifyOtp = async ({ verificationId, userId, otp, otpHash, purpose }: TVerifyOtpData) => {
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

  if (purpose && purpose === 'FORGET_PASS') {
    // clear redis otp session
    const passwordResetId = await passwordReset(userId);
    await clearOtpSession(verificationId);
    return passwordResetId;
  } else {
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
    await invalidateAuthUserCache(userId)
    // pin setup id settting
    const pinSetupId = await setPinSession({ userId: updatedUser?.id });

    return pinSetupId;
  }

  // Update user to verified
};

// set pit
const setPin = async (payload: TPinData, userId: string) => {
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
   await invalidateAuthUserCache(userId)
  return updatedUser;
};

// login
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
    const registerData = await sendOtpFlow({
      email: user?.email,
      userId: user?.id,
      purpose: 'WHILE_LOGIN',
    });
    return {
      requiresEmailVerification: true,
      verificationId: registerData?.verificationId,
    };
  }

  // 5. PIN setup check
  if (!user.isPinSet) {
    const pinSetupId = await setPinSession({ userId: user?.id });
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

// logout from all device
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

// logout
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

// accesstoken
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

// forget password
const forgetPassword = async (data: TForgetPassword) => {
  const { email, phone } = data;

  const user = await prisma.user.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
  });

  // Don't reveal whether the account exists
  if (!user) {
    return {
      message: 'If an account exists with this information, a verification code has been sent.',
    };
  }

  // Account must be active
  if (user.status !== 'ACTIVE') {
    return {
      message: 'If an account exists with this information, a verification code has been sent.',
    };
  }

  const verificationId = await sendOtpFlow({
    email: user.email,
    userId: user.id,
    purpose: 'FORGET_PASS',
  });

  return {
    verificationId,
    requiresEmailVerification: !user.isVerified,
  };
};

// set new password
const resetPassword = async (payload: TResetPassword, userId: string) => {
  const { passwordResetId, newPassword, confirmNewPassword } = payload;
  if (newPassword !== confirmNewPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'New password and confirm password do not match.');
  }

  // 2. Find user
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // 3. Check account status
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.FORBIDDEN, 'Your account is currently inactive.');
  }

  const hashedPassword = await hashData(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
        isDefaultPassword: false,
        defaultPasswordExpiry: null,
      },
    });

    await tx.session.updateMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  });

  // 7. Clear password-reset Redis session
  await resetPasswordSessionClear(passwordResetId);
   await invalidateAuthUserCache(userId)
};

// change password
const changePassword = async (payload: TChangePassword, userId: string) => {
  const { pin, oldPassword, newPassword, confirmNewPassword } = payload;
  if (newPassword !== confirmNewPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'New password and confirm password do not match.');
  }
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  const compare = await compareData(pin, user?.pin as string);
  if (!compare) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }
  const isOldPasswordMatched = await compareData(oldPassword, user.password);
  if (!isOldPasswordMatched) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Old password is incorrect.');
  }

  const hashedPassword = await hashData(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
        isDefaultPassword: false,
        defaultPasswordExpiry: null,
      },
    });

    await tx.session.updateMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  });
   await invalidateAuthUserCache(userId)
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
  forgetPassword,
  resetPassword,
  changePassword,
};
