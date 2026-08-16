/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../../utills/catchAsync.js';
import type { TCreateUser, TUser } from './user.interface.js';
import { sendResponse } from '../../utills/sendResponse.js';
import { StatusCodes } from 'http-status-codes';
import { userService } from './user.service.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import AppError from '../../error/AppError.js';
import type { TLoginData } from '../auth/auth.interface.js';

// create user
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

// get all user
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

// get user by id
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

// get me route
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

// update user
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

// search user
const searchUsers = catchAsync(async (req: Request, res: Response) => {
  const query = req.query;
  if (
    typeof query.name !== 'string' &&
    typeof query.email !== 'string' &&
    typeof query.phone !== 'string'
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'At least one search query is required.');
  }
  const result = await userService.searchUsers(query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Users retrieved successfully.',
    data: result,
  });
});

// check user
const checkUsers = catchAsync(async (req: Request, res: Response) => {
  const data = req.body as TLoginData;
  const result = await userService.checkUsers(data);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User retrieved successfully.',
    data: result,
  });
});

export const userController = {
  createUser,
  getAllUser,
  getUserById,
  getMe,
  updateUser,
  searchUsers,
  checkUsers,
};
