import type { Role } from '@prisma/client';

export type TUser = {
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  role?: Role;
};

export type TVerifyOtpBody = {
  verificationId: string;
  otp: string;
};

export type TPinData = {
  pinSetupId: string;
  newPin: string;
  confirmPin: string;
};

export type TLoginData = {
  email?: string;
  phone?: string;
  password: string;
};

export type TLogoutAll = {
  deviceSwitchId: string;
  pin: string;
};

export type TForgetPassword = {
  email?: string;
  phone?: string;
};

export type TResetPassword = {
  newPassword: string;
  confirmNewPassword: string;
  passwordResetId: string;
};

export type TChangePassword = {
  pin: string;
  oldPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};
