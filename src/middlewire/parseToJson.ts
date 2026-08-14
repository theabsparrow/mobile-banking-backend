/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../error/AppError.js';

export const parseToJsonFormat = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body?.data) {
      req.body = JSON.parse(req.body.data);
    }
    next();
  } catch {
    next(new AppError(StatusCodes.BAD_REQUEST, 'Invalid JSON data.'));
  }
};
