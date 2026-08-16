import { StatusCodes } from 'http-status-codes';
import { prisma } from '../config/prismaClient.js';
import AppError from '../error/AppError.js';
import { compareData } from './hashData.js';

export const verifyUserPin = async (userId: string, pin: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isPinSet: true,
      pin: true,
    },
  });
  if (!user || !user.isPinSet || !user?.pin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'User PIN is not set.');
  }
  const isPinMatched = await compareData(pin, user.pin);
  if (!isPinMatched) {
    return false;
  }
  return true;
};
