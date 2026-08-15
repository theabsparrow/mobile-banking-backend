import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import type { TSendMoneyInput, TCashOutInput } from './transaction.interface.js';
import { transactionService } from './transaction.service.js';

const sendMoney = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TSendMoneyInput;

  const result = await transactionService.sendMoney(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money transferred successfully.',
    data: result,
  });
});

const cashInToUser = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TSendMoneyInput;

  const result = await transactionService.cashInToUser(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Cashed in successfully.',
    data: result,
  });
});

const cashOut = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TCashOutInput;

  const result = await transactionService.cashOut(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Cashed out successfully.',
    data: result,
  });
});

export const transactionController = {
  sendMoney,
  cashInToUser,
  cashOut,
};
