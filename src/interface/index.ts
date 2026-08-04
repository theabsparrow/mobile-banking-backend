/* eslint-disable @typescript-eslint/no-namespace */

import type { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
      otpUser?: {
      userId: string;
    };
    }
  }
}
