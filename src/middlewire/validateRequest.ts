/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utills/catchAsync.js";
import type { ZodTypeAny } from "zod/v3";

const validateRequest = (schema: ZodTypeAny) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const data = {
      ...req.body,
      ...req.cookies,
    };
    await schema.parseAsync(data);
    next();
  });
};
export default validateRequest;