import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import type {
  TAdminCashInInput,
  TCashInInput,
  TCashOutInput,
  TSendMoneyInput,
} from './transaction.interface.js';
import { transactionService } from './transaction.service.js';

// Send Money (Customer to Customer)
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

// Unified Cash In (Agent to Customer OR Admin to Agent)
const cashIn = catchAsync(async (req: Request, res: Response) => {
  const { userId, userRole } = req.user as TJwtPayload;

  if (userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN) {
    const payload = req.body as TAdminCashInInput;
    // Map receiverPhoneOrEmail to agentPhoneOrEmail if needed
    if (!payload.agentPhoneOrEmail && (req.body as any).receiverPhoneOrEmail) {
      payload.agentPhoneOrEmail = (req.body as any).receiverPhoneOrEmail;
    }
    const result = await transactionService.adminCashIn(userId, payload);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Float cashed in to agent successfully.',
      data: result,
    });
    return;
  }

  // Otherwise caller is AGENT
  const payload = req.body as TCashInInput;
  const result = await transactionService.cashInToUser(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Cashed in to customer successfully. Commission earned.',
    data: result,
  });
});

// Dedicated Admin Cash In to Agent
const adminCashIn = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TAdminCashInInput;

  const result = await transactionService.adminCashIn(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Float allocated to agent successfully.',
    data: result,
  });
});

// Cash Out (Customer to Agent)
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

// Admin / Super Admin: Get all transactions with search, filter, date range, pagination
const getAllTransactions = catchAsync(async (req: Request, res: Response) => {
  const result = await transactionService.getAllTransactions(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Transactions retrieved successfully.',
    meta: result.meta,
    data: result.data,
  });
});

// Customer / Agent: Get own transactions with date filter, status, counterparty search, pagination
const getMyTransactions = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await transactionService.getMyTransactions(userId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Your transactions retrieved successfully.',
    meta: result.meta,
    data: result.data,
  });
});

// Hide / Soft-delete transaction from current user's history
const hideTransaction = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const transactionId = req.params.id as string;

  const result = await transactionService.hideTransaction(userId, transactionId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// Agent Commission & Total Income
const getAgentCommissions = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await transactionService.getAgentCommissions(userId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Agent commissions retrieved successfully.',
    meta: result.meta,
    data: result.data,
  });
});

// Get Current Dynamic Fee & Commission Config
const getFeeConfig = catchAsync(async (_req: Request, res: Response) => {
  const result = await transactionService.getFeeConfig();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Transaction fee configuration retrieved successfully.',
    data: result,
  });
});

// Update Dynamic Fee & Commission Config (Admin/Super Admin only)
const updateFeeConfig = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await transactionService.updateFeeConfig(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Transaction fee configuration updated successfully.',
    data: result,
  });
});

export const transactionController = {
  sendMoney,
  cashIn,
  adminCashIn,
  cashOut,
  getAllTransactions,
  getMyTransactions,
  hideTransaction,
  getAgentCommissions,
  getFeeConfig,
  updateFeeConfig,
};
