import type { NextFunction, Request, Response } from 'express';
import { redisClient } from '../redis/redis.client.js';
import { catchAsync } from '../utills/catchAsync.js';

interface RateLimitOptions {
  windowMs?: number; // time window in milliseconds
  max?: number; // maximum request count
  keyPrefix?: string;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export const rateLimiter = (options: RateLimitOptions = {}) => {
  const {
    windowMs = 5 * 60 * 1000, // default 5 minute
    max = 10,
    keyPrefix = 'rl:',
    message = 'Too many requests. Please try again later.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
  } = options;

  const windowSeconds = Math.ceil(windowMs / 1000);

  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const identifier = keyGenerator(req);

    const key = `${keyPrefix}${identifier}`;

    const requestCount = await redisClient.incr(key);

    // first request হলে expiry set হবে
    if (requestCount === 1) {
      await redisClient.expire(key, windowSeconds);
    }

    // limit cross করলে block
    if (requestCount > max) {
      return res.status(429).json({
        success: false,
        message,
      });
    }

    next();
  });
};
