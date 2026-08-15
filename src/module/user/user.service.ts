import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { invalidateAuthUserCache } from '../auth/auth.utills.js';
import type { TCreateUser, TQuery, TUser } from './user.interface.js';
import config from '../../config/index.js';
import { hashData } from '../../utills/hashData.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';
import { sendOtpFlow } from '../../utills/sendOtpFlow.js';
import { Role } from '@prisma/client';
import type { TLoginData } from '../auth/auth.interface.js';

// cretae a users by agent or admin
const createUser = async (payload: TCreateUser, userId: string) => {
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
    createdById: userId,
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

// get all users
const getAllUsers = async (query: TQuery) => {
  const queryBuilder = new QueryBuilder(query)
    .search(['name', 'email', 'phone'])
    .filter(['role', 'status'])
    .sort()
    .paginate();

  const where = queryBuilder.getWhere();
  const orderBy = queryBuilder.getOrderBy();
  const skip = queryBuilder.getSkip();
  const take = queryBuilder.getTake();

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,

      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        address: true,
        image: true,
        role: true,
        isVerified: true,
        isPinSet: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),

    prisma.user.count({
      where,
    }),
  ]);

  return {
    meta: queryBuilder.getPaginationMeta(total),
    data: users,
  };
};

// get user by id
const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      address: true,
      image: true,
      role: true,
      isVerified: true,
      isPinSet: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      maxDeviceAllowed: true,

      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },

      sessions: {
        where: {
          status: 'ACTIVE',
        },
        select: {
          id: true,
          deviceName: true,
          browser: true,
          operatingSystem: true,
          ipAddress: true,
          lastActivity: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: {
          lastActivity: 'desc',
        },
      },
    },
  });
  return user;
};

// update a user
const updateUser = async (userId: string, payload: Partial<TUser>) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Check email uniqueness
  if (payload.email && payload.email === user.email) {
    throw new AppError(StatusCodes.CONFLICT, 'Email is already registered.');
  }

  // Check phone uniqueness
  if (payload.phone && payload.phone === user.phone) {
    throw new AppError(StatusCodes.CONFLICT, 'Phone number is already registered.');
  }

  const emailChanged = payload.email !== undefined && payload.email !== user.email;

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      ...payload,

      ...(emailChanged
        ? {
            isVerified: false,
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      address: true,
      image: true,
      role: true,
      isVerified: true,
      isPinSet: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  await invalidateAuthUserCache(userId);
  if (emailChanged) {
    const otpData = await sendOtpFlow({
      email: updatedUser.email,
      userId: updatedUser.id,
      purpose: 'WHILE_EMAIL_CHANGE',
    });

    return {
      user: updatedUser,
      verificationId: otpData.verificationId,
      requiresEmailVerification: true,
    };
  } else {
    return {
      user: updatedUser,
      verificationId: null,
      requiresEmailVerification: false,
    };
  }
};

const searchUsers = async (query: TQuery) => {
  const search = query.search?.trim();

  // Search query mandatory
  if (!search) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Search query is required.');
  }

  const queryBuilder = new QueryBuilder(query)
    .search(['name', 'email', 'phone'])
    .sort('name')
    .paginate();

  const where = {
    ...queryBuilder.getWhere(),

    // Only CUSTOMER and AGENT can be discovered
    role: {
      in: [Role.CUSTOMER, Role.AGENT],
    },
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: queryBuilder.getSkip(),
      take: queryBuilder.getTake(),

      orderBy: queryBuilder.getOrderBy(),

      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        role: true,
      },
    }),

    prisma.user.count({
      where,
    }),
  ]);

  return {
    data: users,
    meta: queryBuilder.getPaginationMeta(total),
  };
};

const checkUsers = async (payload: TLoginData) => {
  const { email, phone } = payload;
  // find user
  const user = await prisma.user.findFirst({
    where: {
      role: {
        in: [Role.CUSTOMER, Role.AGENT],
      },
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
    select: {
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      isVerified: true,
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  // 2. User status check
  if (user.status !== 'ACTIVE') {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  // 4. Email verification check
  if (!user.isVerified) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }
  return user
};

export const userService = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  searchUsers,
  checkUsers,
};
