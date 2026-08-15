import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '../../utills/catchAsync.js';
import { sendResponse } from '../../utills/sendResponse.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import type { TCreateContact } from './userContact.interface.js';
import { userContactService } from './userContact.service.js';

const createContact = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const payload = req.body as TCreateContact;

  const result = await userContactService.createContact(userId, payload);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Contact added successfully.',
    data: result,
  });
});

const getContacts = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;

  const result = await userContactService.getContacts(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contacts retrieved successfully.',
    data: result,
  });
});

const getContactById = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;

  const result = await userContactService.getContactById(userId, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contact retrieved successfully.',
    data: result,
  });
});

const updateContact = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;
  const payload = req.body as Partial<TCreateContact>;

  const result = await userContactService.updateContact(userId, id, payload);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contact updated successfully.',
    data: result,
  });
});

const deleteContact = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user as TJwtPayload;
  const id = req.params.id as string;

  await userContactService.deleteContact(userId, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contact deleted successfully.',
  });
});

export const userContactController = {
  createContact,
  getContacts,
  getContactById,
  updateContact,
  deleteContact,
};
