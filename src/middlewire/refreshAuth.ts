import type { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../utills/catchAsync.js';
import AppError from '../error/AppError.js';
import { StatusCodes } from 'http-status-codes';
import type { JwtPayload } from 'jsonwebtoken';
import { verifyToken } from '../module/auth/auth.utills.js';
import config from '../config/index.js';
import { prisma } from '../config/prismaClient.js';
import type { Role } from '@prisma/client';
import { hashData } from '../utills/hashData.js';

export const refreshAuth = (...requiredRoles: Role[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.accessToken || req.headers.authorization;

    if (!token) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Refresh token is required.');
    }

    let decoded: JwtPayload;

    try {
      decoded = verifyToken(token as string, config.jwt_refresh_secret as string) as JwtPayload;
    } catch {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid or expired refresh token.');
    }

    const { userId, userRole, sessionId } = decoded;
    const refreshTokenHash = await hashData(token as string);

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

    if (session?.refreshTokenHash !== refreshTokenHash) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token.');
    }

    if (session?.expiresAt <= new Date()) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Session has expired.');
    }

    if (requiredRoles && !requiredRoles.includes(userRole as Role)) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'you are not authortized');
    }

    req.user = decoded;

    next();
  });
};
