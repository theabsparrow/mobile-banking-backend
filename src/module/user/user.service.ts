import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import type { TCreateUser } from './user.interface.js';
import config from '../../config/index.js';
import { hashData } from '../../utills/hashData.js';

const createUser = async (payload: TCreateUser, creator: TJwtPayload) => {
  const existingEmail = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (existingEmail) {
    throw new AppError(StatusCodes.CONFLICT, 'Email is already registered.');
  }
  if (payload?.phone) {
    const existingPhone = await prisma.user.findUnique({
      where: {
        phone: payload.phone,
      },
    });
    if (existingPhone) {
      throw new AppError(StatusCodes.CONFLICT, 'Phone number is already registered.');
    }
  }

  const userPassword = payload?.password || config.default_password;
  if (!userPassword) {
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, 'Default password is not configured.');
  }

  const isDefaultPassword = !payload?.password;

  const defaultPasswordExpiry = isDefaultPassword
    ? new Date(Date.now() + Number(config.default_password_validity_hours) * 60 * 60 * 1000)
    : null;

  const hashedPassword = await hashData(userPassword);

  const data = {
    email: payload.email,
    password: hashedPassword,
    name: payload.name ?? payload.email.split('@')[0] ?? '',
    createdById: creator.userId,
    isDefaultPassword,
    ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
    ...(defaultPasswordExpiry !== null ? { defaultPasswordExpiry } : {}),
  };

  const user = await prisma.user.create({
    data,
    select: {
      id: true,
      name: true,
    },
  });
  return user;
};

export const userService = {
  createUser,
};
