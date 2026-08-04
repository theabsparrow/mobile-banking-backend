import type { NextFunction, Request, Response } from 'express';
import type { TRateLimit } from '../interface/global.js';
import { catchAsync } from '../utills/catchAsync.js';
import { redisClient } from '../redis/redis.client.js';
import config from '../config/index.js';

export const rateLimiter = (options: TRateLimit) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip;
    const key = `${options.keyPrefix}:${ip}`;
    const requestCount = await redisClient.incr(key);
    if (requestCount === 1) {
      await redisClient.expire(key, Number(config.rate_limiting_window));
    }

    if (requestCount > options.limit) {
      return res.status(429).json({
        message: 'Too many requests',
      });
    }
    
    next();
  });
};
