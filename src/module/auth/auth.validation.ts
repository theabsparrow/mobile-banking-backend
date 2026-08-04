
import { Role } from '@prisma/client';
import z from 'zod/v3';

const registerValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  role: z.nativeEnum(Role).default(Role.CUSTOMER),
});

const resendOtpValidationSchema = z.object({
  verificationId: z.string().min(1, 'Verification ID is required'),
});

const verifyOtpValidationSchema = z.object({
  verificationId: z.string().min(1, 'Verification ID is required'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

const loginValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const AuthValidation = {
  registerValidationSchema,
  resendOtpValidationSchema,
  verifyOtpValidationSchema,
  loginValidationSchema,
};
