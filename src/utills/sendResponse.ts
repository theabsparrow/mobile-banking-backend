import type { Response } from 'express';

import type { TSendResponse } from '../interface/global.js';

export const sendResponse = <T>(res: Response, data: TSendResponse<T>) => {
  res.status(data.statusCode).json({
    success: data.success,
    message: data.message,
    meta: data.meta,
    data: data.data,
  });
};
