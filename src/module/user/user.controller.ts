/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../../utills/catchAsync.js';
import type { TCreateUser, TUser } from './user.interface.js';
import { sendResponse } from '../../utills/sendResponse.js';
import { StatusCodes } from 'http-status-codes';
import { userService } from './user.service.js';
import type { TJwtPayload } from '../auth/auth.utills.js';

const createUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const data = req.body as TCreateUser;
  const { userId } = req.user as { userId: string };
  const result = await userService.createUser(data, userId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User created successfully.',
    meta: { page: 1, limit: 10, total: 1, totalPage: 1 },
    data: result,
  });
});

const getAllUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const query = req.query;
  const result = await userService.getAllUsers(query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'users retrived successfully.',
    meta: result?.meta,
    data: result?.data,
  });
});

const getUserById = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id as string;
  const result = await userService.getUserById(id);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User retrieved successfully.',
    data: result,
  });
});

const getMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.user as { userId: string };
  const result = await userService.getUserById(userId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Profile retrieved successfully.',
    data: result,
  });
});

const updateUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as Partial<TUser>;
  const result = await userService.updateUser(userId, payload);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result?.requiresEmailVerification
      ? 'User updated successfully. Please verify your new email address.'
      : 'User updated successfully.',
    data: result,
  });
});

export const userController = {
  createUser,
  getAllUser,
  getUserById,
  getMe,
  updateUser,
};
