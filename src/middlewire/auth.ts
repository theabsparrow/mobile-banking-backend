/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Role } from '@prisma/client';
import { catchAsync } from '../utills/catchAsync.js';
import type { NextFunction, Request, Response } from 'express';
import AppError from '../error/AppError.js';
import { StatusCodes } from 'http-status-codes';
import { verifyToken } from '../module/auth/auth.utills.js';
import config from '../config/index.js';
import type { JwtPayload } from 'jsonwebtoken';
import { prisma } from '../config/prismaClient.js';

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

    // check user is exists
    const isUserExists = await prisma.user.findFirst({
      where: {
        id: userId,
      },
    });
    if (!isUserExists) {
      throw new AppError(StatusCodes.NOT_FOUND, 'user does not exist');
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
