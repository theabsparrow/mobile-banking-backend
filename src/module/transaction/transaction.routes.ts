import { Role } from '@prisma/client';
import { Router } from 'express';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import validateRequest from '../../middlewire/validateRequest.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { transactionController } from './transaction.controller.js';
import { transactionValidation } from './transaction.validation.js';
import { router } from '../../config/express.js';

router.post(
  '/send-money',
  auth(Role.CUSTOMER),
  rateLimiter({
    keyPrefix: 'rl:tx:send-money:',
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(transactionValidation.sendMoneyValidationSchema),
  transactionController.sendMoney
);

router.post(
  '/cash-in',
  auth(Role.AGENT),
  rateLimiter({
    keyPrefix: 'rl:tx:cash-in:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(transactionValidation.sendMoneyValidationSchema),
  transactionController.cashInToUser
);

router.post(
  '/cash-out',
  auth(Role.CUSTOMER),
  rateLimiter({
    keyPrefix: 'rl:tx:cash-out:',
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(transactionValidation.cashOutValidationSchema),
  transactionController.cashOut
);

export const transactionRoutes: Router = router;
