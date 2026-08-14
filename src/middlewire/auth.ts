/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Role, Status } from '@prisma/client';
import { catchAsync } from '../utills/catchAsync.js';
import type { NextFunction, Request, Response } from 'express';
import AppError from '../error/AppError.js';
import { StatusCodes } from 'http-status-codes';
import { verifyToken } from '../module/auth/auth.utills.js';
import config from '../config/index.js';
import type { JwtPayload } from 'jsonwebtoken';
import { prisma } from '../config/prismaClient.js';
import { redisClient } from '../redis/redis.client.js';

export const auth = (...requiredRoles: Role[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.accessToken || req.headers.authorization;
    if (!token) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'you are not authorized');
    }
    let decoded;
    try {
      decoded = verifyToken(token as string, config.jwt_access_secret as string);
    } catch (err: any) {
      throw new AppError(StatusCodes.UNAUTHORIZED, `you are not authorized ${err}`);
    }
    const { userId, userRole, sessionId } = decoded as JwtPayload;

    const userCacheKey = `auth:user:${userId}`;

    const cachedUser = await redisClient.get(userCacheKey);

    type TUserexistence = {
      id: string;
      isVerified: boolean;
      status: Status;
      isPinSet: boolean;
      isDefaultPassword: boolean;
      defaultPasswordExpiry: Date;
    };

    let isUserExists: TUserexistence;

    if (cachedUser) {
      isUserExists = JSON.parse(cachedUser);
    } else {
      isUserExists = (await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          isVerified: true,
          status: true,
          isPinSet: true,
          isDefaultPassword: true,
          defaultPasswordExpiry: true,
        },
      })) as TUserexistence;

      if (!isUserExists) {
        throw new AppError(StatusCodes.NOT_FOUND, 'user does not exist');
      }

      await redisClient.set(userCacheKey, JSON.stringify(isUserExists), {
        EX: 300,
      });
    }

    // check user is exists

    if (!isUserExists) {
      throw new AppError(StatusCodes.NOT_FOUND, 'user does not exist');
    }

    if (isUserExists?.status !== 'ACTIVE') {
      throw new AppError(StatusCodes.FORBIDDEN, 'your account is not active');
    }

    if (!isUserExists?.isVerified) {
      throw new AppError(StatusCodes.FORBIDDEN, 'your account is not verified');
    }

    if (!isUserExists?.isPinSet) {
      throw new AppError(StatusCodes.FORBIDDEN, 'please set up your pin first');
    }
    if (isUserExists?.isDefaultPassword) {
      const passwordValidityHours = Number(config.default_password_validity_hours);
      const passwordExpiryDate = isUserExists?.defaultPasswordExpiry;
      if (passwordExpiryDate && passwordValidityHours > 0) {
        const isExpired = new Date() > new Date(passwordExpiryDate);
        if (isExpired) {
          throw new AppError(
            StatusCodes.FORBIDDEN,
            'Your default password has expired. Please contact admin.'
          );
        }
      }
    }

    // check if session is exists
    const session = await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Session does not exist or has been revoked.');
    }

    if (session?.userId !== userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid session.');
    }

    if (session?.status !== 'ACTIVE') {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Session has been revoked.');
    }

    if (session?.expiresAt <= new Date()) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Session has expired.');
    }

    if (requiredRoles && !requiredRoles.includes(userRole as Role)) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'you are not authortized');
    }
    req.user = decoded as JwtPayload;
    next();
  });
};
