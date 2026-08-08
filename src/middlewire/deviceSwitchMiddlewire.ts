import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../error/AppError.js';
import { redisClient } from '../redis/redis.client.js';
import { catchAsync } from '../utills/catchAsync.js';

export const deviceSwitchMiddleware = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { deviceSwitchId } = req.body as {
      deviceSwitchId?: string;
    };

    if (!deviceSwitchId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Device switch ID is required.');
    }

    const userId = await redisClient.get(`device-switch:${deviceSwitchId}`);

    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Device switch session expired or invalid.');
    }

    req.user = {
      userId,
    };

    next();
  }
);
