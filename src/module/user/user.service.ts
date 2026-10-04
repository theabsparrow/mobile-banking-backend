/* eslint-disable @typescript-eslint/no-explicit-any */
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

  const user = await prisma.user.create({
    data: {
      email: payload.email,
      password: hashedPassword,
      createdById: userId,
      isDefaultPassword,
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
      ...(defaultPasswordExpiry !== null ? { defaultPasswordExpiry } : {}),
      profile: {
        create: {
          name: payload.name ?? payload.email.split('@')[0] ?? '',
        },
      },
      wallet: {
        create: {
          balance: 0.0,
        },
      },
    },
    select: {
      id: true,
      profile: {
        select: {
          name: true,
        },
      },
    },
  });
  return {
    id: user.id,
    name: user.profile?.name ?? '',
  };
};

// get all users
const getAllUsers = async (query: TQuery) => {
  const queryBuilder = new QueryBuilder(query)
    .search(['email', 'phone'])
    .filter(['role', 'status'])
    .sort()
    .paginate();

  const where = queryBuilder.getWhere() as any;
  if (query.search) {
    if (where.OR) {
      where.OR.push({
        profile: {
          name: { contains: String(query.search), mode: 'insensitive' },
        },
      });
    } else {
      where.OR = [
        {
          profile: {
            name: { contains: String(query.search), mode: 'insensitive' },
          },
        },
      ];
    }
  }

  let orderBy = queryBuilder.getOrderBy() as any;
  if (orderBy.name) {
    orderBy = {
      profile: {
        name: orderBy.name,
      },
    };
  }

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
        role: true,
        isVerified: true,
        isPinSet: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            name: true,
            address: true,
            image: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            role: true,
            profile: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),

    prisma.user.count({
      where,
    }),
  ]);

  const mappedUsers = users.map((user) => ({
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.profile?.name ?? null,
    address: user.profile?.address ?? null,
    image: user.profile?.image ?? null,
    role: user.role,
    isVerified: user.isVerified,
    isPinSet: user.isPinSet,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    createdBy: user.createdBy
      ? {
          id: user.createdBy.id,
          email: user.createdBy.email,
          role: user.createdBy.role,
          name: user.createdBy.profile?.name ?? null,
        }
      : null,
  }));

  return {
    meta: queryBuilder.getPaginationMeta(total),
    data: mappedUsers,
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
      role: true,
      isVerified: true,
      isPinSet: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      maxDeviceAllowed: true,
      profile: {
        select: {
          name: true,
          address: true,
          image: true,
        },
      },

      createdBy: {
        select: {
          id: true,
          email: true,
          role: true,
          profile: {
            select: {
              name: true,
            },
          },
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

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.profile?.name ?? null,
    address: user.profile?.address ?? null,
    image: user.profile?.image ?? null,
    role: user.role,
    isVerified: user.isVerified,
    isPinSet: user.isPinSet,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    maxDeviceAllowed: user.maxDeviceAllowed,
    createdBy: user.createdBy
      ? {
          id: user.createdBy.id,
          email: user.createdBy.email,
          role: user.createdBy.role,
          name: user.createdBy.profile?.name ?? null,
        }
      : null,
    sessions: user.sessions,
  };
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
      profile: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Check email uniqueness
  if (payload.email && payload.email !== user.email) {
    const existingEmail = await prisma.user.findUnique({
      where: {
        email: payload.email,
      },
    });
    if (existingEmail) {
      throw new AppError(StatusCodes.CONFLICT, 'Email is already registered.');
    }
  }

  // Check phone uniqueness
  if (payload.phone && payload.phone !== user.phone) {
    const existingPhone = await prisma.user.findUnique({
      where: {
        phone: payload.phone,
      },
    });
    if (existingPhone) {
      throw new AppError(StatusCodes.CONFLICT, 'Phone number is already registered.');
    }
  }

  const emailChanged = payload.email !== undefined && payload.email !== user.email;

  const userFields: Record<string, any> = {};
  if (payload.email !== undefined) userFields.email = payload.email;
  if (payload.phone !== undefined) userFields.phone = payload.phone;
  if (emailChanged) userFields.isVerified = false;

  const profileFields: Record<string, any> = {};
  if (payload.name !== undefined) profileFields.name = payload.name;
  if (payload.address !== undefined) profileFields.address = payload.address;
  if (payload.image !== undefined) profileFields.image = payload.image;

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      ...userFields,
      ...(Object.keys(profileFields).length > 0
        ? {
            profile: {
              upsert: {
                create: profileFields,
                update: profileFields,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      isVerified: true,
      isPinSet: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      profile: {
        select: {
          name: true,
          address: true,
          image: true,
        },
      },
    },
  });

  const mappedUpdatedUser = {
    id: updatedUser.id,
    email: updatedUser.email,
    phone: updatedUser.phone,
    name: updatedUser.profile?.name ?? null,
    address: updatedUser.profile?.address ?? null,
    image: updatedUser.profile?.image ?? null,
    role: updatedUser.role,
    isVerified: updatedUser.isVerified,
    isPinSet: updatedUser.isPinSet,
    status: updatedUser.status,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt,
  };

  await invalidateAuthUserCache(userId);
  if (emailChanged) {
    const otpData = await sendOtpFlow({
      email: updatedUser.email,
      userId: updatedUser.id,
      purpose: 'WHILE_EMAIL_CHANGE',
    });

    return {
      user: mappedUpdatedUser,
      verificationId: otpData.verificationId,
      requiresEmailVerification: true,
    };
  } else {
    return {
      user: mappedUpdatedUser,
      verificationId: null,
      requiresEmailVerification: false,
    };
  }
};

const searchUsers = async (query: TQuery) => {
  const name = typeof query.name === 'string' ? query.name.trim() : '';
  const email = typeof query.email === 'string' ? query.email.trim() : '';
  const phone = typeof query.phone === 'string' ? query.phone.trim() : '';
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  if (!name && !email && !phone && !search) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Search query is required.');
  }

  const queryBuilder = new QueryBuilder(query)
    .sort('name')
    .paginate();

  const orConditions: any[] = [];
  if (name) {
    orConditions.push({
      profile: {
        name: { contains: name, mode: 'insensitive' },
      },
    });
  }
  if (email) {
    orConditions.push({
      email: { contains: email, mode: 'insensitive' },
    });
  }
  if (phone) {
    orConditions.push({
      phone: { contains: phone, mode: 'insensitive' },
    });
  }
  if (search) {
    orConditions.push(
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      {
        profile: {
          name: { contains: search, mode: 'insensitive' },
        },
      }
    );
  }

  const where = {
    role: {
      in: [Role.CUSTOMER, Role.AGENT],
    },
    OR: orConditions,
  } as any;

  let orderBy = queryBuilder.getOrderBy() as any;
  if (orderBy.name) {
    orderBy = {
      profile: {
        name: orderBy.name,
      },
    };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: queryBuilder.getSkip(),
      take: queryBuilder.getTake(),

      orderBy,

      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        profile: {
          select: {
            name: true,
            image: true,
          },
        },
      },
    }),

    prisma.user.count({
      where,
    }),
  ]);

  const mappedUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone,
    role: u.role,
    name: u.profile?.name ?? null,
    image: u.profile?.image ?? null,
  }));

  return {
    data: mappedUsers,
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
      email: true,
      phone: true,
      role: true,
      status: true,
      isVerified: true,
      profile: {
        select: {
          name: true,
        },
      },
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
  return {
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    isVerified: user.isVerified,
    name: user.profile?.name ?? null,
  };
};

export const userService = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  searchUsers,
  checkUsers,
};
