/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

const notFound = (req: Request, res: Response, next: NextFunction) => {
  const statusCode = StatusCodes.NOT_FOUND;
  const message = 'API not found';
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    error: '',
  });
};
export default notFound;
