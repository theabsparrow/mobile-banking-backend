import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prismaClient.js';
import type { TUser } from './auth.interface.js';
import { compareData, hashData } from '../../utills/hashData.js';
import { sendOtpFlow } from '../../utills/sendOtpFlow.js';
import AppError from '../../error/AppError.js';
import { StatusCodes } from 'http-status-codes';
import { handleOtpFailedAttempt } from '../../utills/otpAttempt.js';

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
type TVerifyOtpData = {
  verificationId: string;
  userId: string;
  otp: string;
  otpHash: string;
};
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
    const result = await handleOtpFailedAttempt(verificationId);
    if (result?.isBlocked) {
      throw new AppError(429, 'Too many wrong OTP attempts. Try again after 24 hours.');
    }
    throw new AppError(400, 'Invalid OTP');
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
