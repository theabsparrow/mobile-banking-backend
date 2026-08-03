
import { Role } from '@prisma/client';
import z from 'zod/v3';

const registerValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  role: z.nativeEnum(Role).optional(),
});

const requestOtpValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
});

const verifyOtpValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

const loginValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const AuthValidation = {
  registerValidationSchema,
  requestOtpValidationSchema,
  verifyOtpValidationSchema,
  loginValidationSchema,
};
