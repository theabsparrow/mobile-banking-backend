import type { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../utills/catchAsync.js';
import { prisma } from '../config/prismaClient.js';
import type { TLoginData } from '../module/auth/auth.interface.js';
import AppError from '../error/AppError.js';
import { StatusCodes } from 'http-status-codes';

export const defaultPasswordCheckMiddlewire = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, phone } = req.body as TLoginData;
    const user = await prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });

    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
    }

    // 2. User status check
    if (user.status !== 'ACTIVE') {
      throw new AppError(StatusCodes.FORBIDDEN, 'Your account is currently inactive.');
    }

    if (user.isDefaultPassword) {
      // Expiry date missing
      if (!user.defaultPasswordExpiry) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Your temporary password is invalid. Please reset your password.'
        );
      }
      if (user.defaultPasswordExpiry.getTime() <= Date.now()) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Your temporary password has expired. Please reset your password.'
        );
      }
    }

    next();
  }
);
