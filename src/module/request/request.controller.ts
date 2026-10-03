/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import type { Role } from '@prisma/client';
import type { TCreateRequest, TProcessRequestInput, TRequest } from './request.interface.js';
import { requestService } from './request.service.js';

// create business request by agent
const createBusinessRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.user as TJwtPayload;
    const payload = req.body as TCreateRequest;
    const result = await requestService.createBusinessRequest(userId, payload);
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: 'Request sent successfully',
      data: result,
    });
  }
);

// create common request by user
const createPersonalRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.user as TJwtPayload;
    const payload = req.body as TCreateRequest;
    const result = await requestService.createPersonalRequest(userId, payload);
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: 'Request sent successfully',
      data: result,
    });
  }
);

// get request
const getRequests = catchAsync(async (req: Request, res: Response) => {
  const result = await requestService.getRequests(req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money requests retrieved successfully.',
    meta: result?.meta,
    data: result?.data,
  });
});

// get agent requests for admin
const getAgentRequests = catchAsync(async (req: Request, res: Response) => {
  const result = await requestService.getAgentRequests(req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Agent money requests retrieved successfully.',
    meta: result?.meta,
    data: result?.data,
  });
});

// get my request
const getMyRequests = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await requestService.getMyRequests(userId, req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money requests retrieved successfully.',
    meta: result?.meta,
    data: result?.data,
  });
});

// get received requests (incoming requests sent to this user)
const getReceivedRequests = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await requestService.getReceivedRequests(userId, req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Received money requests retrieved successfully.',
    meta: result?.meta,
    data: result?.data,
  });
});

// get processed requests (requests approved or rejected by the logged-in user)
const getProcessedRequests = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const result = await requestService.getProcessedRequests(userId, req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Processed money requests retrieved successfully.',
    meta: result?.meta,
    data: result?.data,
  });
});

// get request by id
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

// cancell request
const cancelRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TRequest;
  const result = await requestService.cancelRequest(userId, id, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request cancelled successfully.',
    data: result,
  });
});

// reject request
const rejectRequest = catchAsync(async (req: Request, res: Response) => {
  const {userId} = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TRequest;
  const result = await requestService.rejectRequest(userId, id, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request rejected successfully.',
    data: result,
  });
});

// approve request (unified)
const approveRequest = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TProcessRequestInput;
  const result = await requestService.approveRequest(user, id, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request approved and transaction completed.',
    data: result,
  });
});

// approve business request (Agent -> Admin float, CASH_IN)
const approveBusinessRequest = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TProcessRequestInput;
  const result = await requestService.approveBusinessRequest(user, id, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Business request approved and cash-in completed.',
    data: result,
  });
});

// approve personal request (User -> User, SEND_MONEY)
const approvePersonalRequest = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TProcessRequestInput;
  const result = await requestService.approvePersonalRequest(user, id, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Personal request approved and send-money completed.',
    data: result,
  });
});

// delete request
const deleteRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as TRequest;
  await requestService.deleteRequest(userId, id, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Money request deleted successfully.',
  });
});

export const requestController = {
  createBusinessRequest,
  createPersonalRequest,
  getRequests,
  getAgentRequests,
  getMyRequests,
  getReceivedRequests,
  getProcessedRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  rejectRequest,
  approveRequest,
  approveBusinessRequest,
  approvePersonalRequest,
};
