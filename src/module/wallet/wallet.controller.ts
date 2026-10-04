import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { walletService } from './wallet.service.js';

const getMyWallet = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await walletService.getMyWallet(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Wallet retrieved successfully.',
    data: result,
  });
});

const getWalletByUserId = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await walletService.getWalletByUserId(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User wallet retrieved successfully.',
    data: result,
  });
});

export const walletController = {
  getMyWallet,
  getWalletByUserId,
};
