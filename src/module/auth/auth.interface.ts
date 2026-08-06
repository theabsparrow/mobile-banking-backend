import type { Role } from '@prisma/client';

export type TUser = {
  email: string;
  phone?: string;
  password: string;
  role?: Role;
};

export type TVerifyOtpBody = {
  verificationId: string;
  otp: string;
};

export type TPinData = {
  pinSetupId: string
  newPin: string;
  confirmPin: string;
}

export type TLoginData = {
  email?: string;
  phone?: string;
  password: string;
}