import jwt, { type SignOptions } from 'jsonwebtoken';
import { redisClient } from '../../redis/redis.client.js';
import crypto from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import AppError from '../../error/AppError.js';

export type TJwtPayload = {
  userId: string;
  userRole: string;
  sessionId: string
};

export const createToken = (payload: TJwtPayload, secret: string, expiresIn: string) => {
  return jwt.sign(payload, secret, {
    expiresIn,
  } as SignOptions);
};

export const deviceSwitchSession = async (userId: string) => {
  const deviceSwitchId = crypto.randomUUID();
  try {
    await redisClient.set(`device-switch:${deviceSwitchId}`, userId, {
      EX: 5 * 60,
    });

    return deviceSwitchId;
  } catch (error) {
    console.error('Failed to create device switch session:', error);
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Unable to process device switch request. Please try again.'
    );
  }
};

export const deviceSwitchSessionClear = async (deviceSwitchId: string) => {
  await redisClient.del(`device-switch:${deviceSwitchId}`);
};

export const verifyToken = (token: string, secret: string) => {
  return jwt.verify(token, secret);
};
