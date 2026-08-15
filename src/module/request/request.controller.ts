import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import type { Role } from '@prisma/client';
import type {
  TCreateBusinessRequestInput,
  TCreatePersonalRequestInput,
  TCancelRequestInput,
  TDeleteRequestInput,
  TRejectRequestInput,
  TProcessRequestInput,
} from './request.interface.js';
import { requestService } from './request.service.js';

const createBusinessRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TCreateBusinessRequestInput;

  const result = await requestService.createBusinessRequest(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Business money request created successfully.',
    data: result,
  });
});

const createPersonalRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TCreatePersonalRequestInput;

  const result = await requestService.createPersonalRequest(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Personal money request created successfully.',
    data: result,
  });
});

const getRequests = catchAsync(async (req: Request, res: Response) => {
  const { userId, userRole } = req.user as TJwtPayload;

  const result = await requestService.getRequests(userId, userRole as Role);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money requests retrieved successfully.',
    data: result,
  });
});

const getRequestById = catchAsync(async (req: Request, res: Response) => {
  const { userId, userRole } = req.user as TJwtPayload;
  const id = req.params.id as string;

  const result = await requestService.getRequestById(userId, userRole as Role, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request retrieved successfully.',
    data: result,
  });
});

const cancelRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TCancelRequestInput;

  const result = await requestService.cancelRequest(userId, id, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request cancelled successfully.',
    data: result,
  });
});

const deleteRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TDeleteRequestInput;

  await requestService.deleteRequest(userId, id, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request deleted successfully.',
  });
});

const rejectRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TRejectRequestInput;

  const result = await requestService.rejectRequest(userId, id, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request rejected successfully.',
    data: result,
  });
});

const approveRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TProcessRequestInput;

  const result = await requestService.approveRequest(userId, id, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request approved and transaction completed.',
    data: result,
  });
});

export const requestController = {
  createBusinessRequest,
  createPersonalRequest,
  getRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  rejectRequest,
  approveRequest,
};
