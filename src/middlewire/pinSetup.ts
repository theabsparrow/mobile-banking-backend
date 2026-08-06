import { StatusCodes } from 'http-status-codes';
import AppError from '../error/AppError.js';
import { catchAsync } from '../utills/catchAsync.js';
import { redisClient } from '../redis/redis.client.js';

export type TSetPinData = {
  pinSetupId: string;
};

export type TPinSetupUser = {
  userId: string;
};

export const pinSetupMiddleware = catchAsync(async (req, res, next) => {
  const { pinSetupId } = req.body as TSetPinData;

  if (!pinSetupId) {
    throw new AppError(StatusCodes.NOT_FOUND, 'PIN setup id required');
  }
  const session = await redisClient.get(`pin:setup:${pinSetupId}`);
  if (!session) {
    throw new AppError(StatusCodes.GATEWAY_TIMEOUT, 'PIN setup session expired');
  }

  const { userId } = JSON.parse(session) as TPinSetupUser;
  if (!userId) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  req.otpUser = {
    userId,
  };

  next();
});
