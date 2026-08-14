import { Role } from '@prisma/client';
import z from 'zod/v3';

const registerValidationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(16, 'Password must not exceed 16 characters')
    .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),
  confirmPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(16, 'Password must not exceed 16 characters'),
  role: z.nativeEnum(Role).default(Role.CUSTOMER),
});

const resendOtpValidationSchema = z.object({
  verificationId: z.string().min(1, 'Verification ID is required'),
});

const verifyOtpValidationSchema = z.object({
  verificationId: z.string().min(1, 'Verification ID is required'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const setPinValidationSchema = z.object({
  pinSetupId: z.string().min(1, 'Pin Setup ID is required'),
  newPin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  confirmPin: z.string().regex(/^\d{6}$/, 'Confirm PIN must be exactly 6 digits'),
});

const loginValidationSchema = z
  .object({
    email: z.string().email('Invalid email format').optional(),
    phone: z.string().min(10, 'Phone number is invalid').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Email or phone number is required',
    path: ['email'],
  });

const logoutAlValidationSchema = z.object({
  deviceSwitchId: z.string().min(1, 'device switch ID is required'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const forgetPasswordValidationSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(10).optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Email or phone is required.',
  });

const resetPasswordValidationSchema = z.object({
  passwordResetId: z.string().min(1, 'password reset ID is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(16, 'Password must not exceed 16 characters')
    .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),

  confirmNewPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(16, 'Password must not exceed 16 characters'),
});

// change password
const changePasswordValidationSchema = z.object({
  pin: z.string().min(1, 'pin is required'),
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(16, 'Password must not exceed 16 characters')
    .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),
  confirmNewPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(16, 'Password must not exceed 16 characters'),
});

export const AuthValidation = {
  registerValidationSchema,
  resendOtpValidationSchema,
  verifyOtpValidationSchema,
  loginValidationSchema,
  setPinValidationSchema,
  logoutAlValidationSchema,
  forgetPasswordValidationSchema,
  resetPasswordValidationSchema,
  changePasswordValidationSchema,
};
