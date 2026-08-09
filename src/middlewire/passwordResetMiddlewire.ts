import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../config/prismaClient.js';
import AppError from '../error/AppError.js';
import { redisClient } from '../redis/redis.client.js';
import { catchAsync } from '../utills/catchAsync.js';

export type TPasswordResetRedisData = {
  userId: string;
};

export const passwordResetMiddleware = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { passwordResetId } = req.body as {
      passwordResetId?: string;
    };

    // 1. Check password reset ID
    if (!passwordResetId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Password reset ID is required.'
      );
    }

    // 2. Find password reset session in Redis
    const resetSession = await redisClient.get(
      `password:reset:${passwordResetId}`
    );

    if (!resetSession) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        'Password reset session is invalid or expired.'
      );
    }

    // 3. Parse Redis data
    let resetData: TPasswordResetRedisData;

    try {
      resetData = JSON.parse(resetSession) as TPasswordResetRedisData;
    } catch {
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Invalid password reset session.'
      );
    }

    // 4. Check user ID
    if (!resetData.userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        'Invalid password reset session.'
      );
    }

    // 5. Find user
    const user = await prisma.user.findUnique({
      where: {
        id: resetData.userId,
      },
    });

    if (!user) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'User not found.'
      );
    }

    // 6. Check account status
    if (user.status !== 'ACTIVE') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Your account is currently inactive.'
      );
    }

    // 7. Attach data to request
    req.otpUser = {
      userId: user.id,
    };

    next();
  }
);