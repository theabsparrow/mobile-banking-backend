/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { NextFunction, Request, Response } from "express";

export const parseToJsonFormat = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.body?.data) {
    req.body = JSON.parse(req.body.data);
  }
  next();
};