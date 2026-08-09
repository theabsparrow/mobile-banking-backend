/* eslint-disable @typescript-eslint/no-namespace */

import type { JwtPayload } from 'jsonwebtoken';
import type { TOtpPurpose } from '../utills/sendOtpFlow.js';

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
      otpUser?: {
        userId: string;
        otpHash?: string;
        purpose?: TOtpPurpose;
      };
    }
  }
}
