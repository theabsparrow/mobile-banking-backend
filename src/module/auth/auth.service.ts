import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prismaClient.js';
import type { TUser } from './auth.interface.js';
import { hashData } from '../../utills/hashData.js';
import { sendOtpFlow } from '../../utills/sendOtpFlow.js';
import AppError from '../../error/AppError.js';
import { StatusCodes } from 'http-status-codes';

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
  const registerData = await sendOtpFlow({ email: user.email, userId: user.id });
  return registerData?.verificationId;
};

/**
 * Request a new OTP for an unverified user.
 */
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

/**
 * Verify OTP.
 * If verified successfully, user state changes to verified.
 * If 5 failed attempts are made consecutively, user is banned for 24 hours.
 */
const verifyOtp = async (email: string, submittedOtp: string) => {
  if (!email || !submittedOtp) {
    throw new Error('Email and OTP code are required.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  if (user.isVerified) {
    throw new Error('Email is already verified.');
  }

  // Check ban status
  await checkBanStatus(user);

  const codeKey = `otp:code:${email}`;
  const failedKey = `otp:failed:${email}`;

  const storedOtp = await redisClient.get(codeKey);

  // If OTP is correct
  if (storedOtp && storedOtp === submittedOtp) {
    // Update user to verified
    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        isBanned: false,
        banUntil: null,
      },
    });

    // Clear OTP states in Redis
    await redisClient.del(codeKey);
    await redisClient.del(failedKey);

    return {
      id: verifiedUser.id,
      email: verifiedUser.email,
      phone: verifiedUser.phone,
      role: verifiedUser.role,
      isVerified: verifiedUser.isVerified,
    };
  }

  // If OTP is incorrect or expired/null
  const failedAttemptsStr = await redisClient.get(failedKey);
  const failedAttempts = failedAttemptsStr ? parseInt(failedAttemptsStr, 10) : 0;
  const newFailedAttempts = failedAttempts + 1;

  if (newFailedAttempts >= 5) {
    // Ban user for 24 hours
    const banUntil = new Date();
    banUntil.setHours(banUntil.getHours() + 24);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isBanned: true,
        banUntil,
      },
    });

    // Clear OTP states since they are banned
    await redisClient.del(codeKey);
    await redisClient.del(failedKey);

    throw new Error('Too many failed OTP submissions. Your account has been banned for 24 hours.');
  } else {
    // Store incremented failed attempts (expire in 24 hours)
    await redisClient.set(failedKey, newFailedAttempts.toString(), { EX: 86400 });
    const attemptsLeft = 5 - newFailedAttempts;
    throw new Error(
      `Invalid or expired OTP code. You have ${attemptsLeft} attempt(s) remaining before a 24-hour ban.`
    );
  }
};

/**
 * Login user.
 */
const loginUser = async (payload: { email: string; password?: string }) => {
  const { email, password } = payload;

  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error('Invalid email or password.');
  }

  // Check ban status
  await checkBanStatus(user);

  // Check verification status
  if (!user.isVerified) {
    throw new Error('Please verify your email address before logging in.');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid email or password.');
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
    },
  };
};

export const AuthService = {
  registerUser,
  resendOtp,
  verifyOtp,
  loginUser,
};
