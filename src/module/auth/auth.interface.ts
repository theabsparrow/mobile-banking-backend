import type { Role } from '@prisma/client';

export type TUser = {
  email: string;
  phone?: string;
  password: string;
  role?: Role;
};
