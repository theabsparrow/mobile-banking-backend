

import type { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utills/catchAsync.js";
import type { ZodTypeAny } from "zod/v3";

const validateRequest = (schema: ZodTypeAny) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const data = {
      ...req.body,
      ...req.cookies,
    };
    const parsed = await schema.parseAsync(data);
    req.body = parsed;
    next();
  });
};
export default validateRequest;