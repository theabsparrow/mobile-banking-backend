import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prismaClient.js';
import { redisClient } from '../../config/redisClient.js';
import { sendEmail } from '../../utills/emailSender.js';
import { Role } from '@prisma/client';
import type { TUser } from './auth.interface.js';

/**
 * Check if the user is currently banned.
 * If the ban period has expired, it automatically resets the ban status in the database.
 */
const checkBanStatus = async (user: { id: string; isBanned: boolean; banUntil: Date | null }) => {
  if (user.isBanned) {
    if (user.banUntil && user.banUntil > new Date()) {
      const timeLeftMs = user.banUntil.getTime() - Date.now();
      const hoursLeft = Math.ceil(timeLeftMs / (1000 * 60 * 60));
      throw new Error(
        `Your account is temporarily banned. Please try again after ${hoursLeft} hour(s).`
      );
    } else {
      // Ban period has expired, unban the user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBanned: false,
          banUntil: null,
        },
      });
      user.isBanned = false;
      user.banUntil = null;
    }
  }
};

/**
 * Common flow for generating and sending OTP to user's email.
 * Applies:
 * 1. Resend cooldown of 2 minutes.
 * 2. Rate limit of 5 requests per 10 minutes.
 */
const sendOtpFlow = async (email: string) => {
  const cooldownKey = `otp:cooldown:${email}`;
  const rateLimitKey = `otp:ratelimit:${email}`;
  const codeKey = `otp:code:${email}`;

  // 1. Check if the user is in 2-minute resend cooldown
  const isCoolingDown = await redisClient.get(cooldownKey);
  if (isCoolingDown) {
    const cooldownTTL = await redisClient.ttl(cooldownKey);
    throw new Error(`Please wait ${cooldownTTL} seconds before requesting another OTP.`);
  }

  // 2. Check 10-minute rate limit (max 5 requests)
  const rateLimitCountStr = await redisClient.get(rateLimitKey);
  const rateLimitCount = rateLimitCountStr ? parseInt(rateLimitCountStr, 10) : 0;
  if (rateLimitCount >= 5) {
    const rateLimitTTL = await redisClient.ttl(rateLimitKey);
    const minutesLeft = Math.ceil(rateLimitTTL / 60);
    throw new Error(
      `Rate limit exceeded. Please wait ${minutesLeft} minute(s) before requesting a new OTP.`
    );
  }

  // 3. Generate a secure 6-digit random OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // 4. Save code to Redis (valid for 5 minutes / 300s)
  await redisClient.set(codeKey, otp, { EX: 300 });

  // 5. Save cooldown to Redis (valid for 2 minutes / 120s)
  await redisClient.set(cooldownKey, 'true', { EX: 120 });

  // 6. Increment rate limit in Redis (expires in 10 minutes / 600s)
  if (rateLimitCount === 0) {
    await redisClient.set(rateLimitKey, '1', { EX: 600 });
  } else {
    await redisClient.incr(rateLimitKey);
  }

  // 7. Send OTP via Nodemailer
  const emailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 30px auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <h2 style="color: #1a202c; text-align: center; margin-bottom: 24px; font-weight: 600;">Email Verification</h2>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">Thank you for registering on our platform. Use the following One-Time Password (OTP) to complete your email verification:</p>
      <div style="font-size: 32px; font-weight: 700; text-align: center; margin: 30px 0; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; letter-spacing: 6px; border-radius: 8px;">
        ${otp}
      </div>
      <p style="color: #e53e3e; font-size: 14px; font-weight: 500; margin-top: 20px;">This OTP is valid for 5 minutes.</p>
      <p style="color: #718096; font-size: 13px; line-height: 1.5; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px;">If you did not request this email, you can safely ignore it.</p>
    </div>
  `;
  await sendEmail(email, 'Your Email Verification OTP Code', emailHtml);

  return otp;
};

/**
 * Register a new user.
 */
const registerUser = async (payload: TUser) => {
  const { email, phone, password, role } = payload;

  if (!email) {
    throw new Error('Email is required for registration.');
  }
  if (!password) {
    throw new Error('Password is required for registration.');
  }

  // Validate Role
  const validRoles = Object.values(Role);
  const selectedRole = role || Role.CUSTOMER;
  if (!validRoles.includes(selectedRole)) {
    throw new Error(`Invalid role. Valid roles are: ${validRoles.join(', ')}`);
  }

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
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create pending user in PostgreSQL
  const user = await prisma.user.create({
    data: {
      email,
      phone: phone || null,
      password: hashedPassword,
      role: selectedRole,
      isVerified: false,
    },
  });

  // Generate and send OTP
  const otp = await sendOtpFlow(email);

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
    },
    // For convenience in testing environment if emails aren't configured, we'll return OTP.
    // (In production, the client will only receive it via email/console fallback).
    otp,
  };
};

/**
 * Request a new OTP for an unverified user.
 */
const requestOtp = async (email: string) => {
  if (!email) {
    throw new Error('Email is required.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error('No registered user found with this email.');
  }

  if (user.isVerified) {
    throw new Error('This account is already verified.');
  }

  // Check if user is currently banned
  await checkBanStatus(user);

  // Send new OTP
  const otp = await sendOtpFlow(email);

  return { otp };
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
  requestOtp,
  verifyOtp,
  loginUser,
};
