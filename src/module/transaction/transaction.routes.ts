import { Role } from '@prisma/client';
import { Router } from 'express';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import validateRequest from '../../middlewire/validateRequest.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { transactionController } from './transaction.controller.js';
import { transactionValidation } from './transaction.validation.js';

const router = Router();

// 1. Send Money (Customer to Customer with per-thousand fee)
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

// 2. Cash In (Agent to Customer OR Admin to Agent)
router.post(
  '/cash-in',
  auth(Role.AGENT, Role.ADMIN, Role.SUPER_ADMIN),
  rateLimiter({
    keyPrefix: 'rl:tx:cash-in:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(transactionValidation.cashInValidationSchema),
  transactionController.cashIn
);

// 3. Dedicated Admin Float Cash In to Agent
router.post(
  '/admin-cash-in',
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  rateLimiter({
    keyPrefix: 'rl:tx:admin-cash-in:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(transactionValidation.adminCashInValidationSchema),
  transactionController.adminCashIn
);

// 4. Cash Out (Customer to Agent)
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

// 5. Admin & Super Admin: Get all transactions (Search sender/receiver name, email, phone; filter by service, date, date range, status; pagination)
router.get(
  '/',
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:tx:all:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.getAllTransactions
);

router.get(
  '/all',
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:tx:all:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.getAllTransactions
);

// 6. Customer & Agent: Get own transactions (Date, date range, status, service, counterparty name/email/phone search, pagination, excludes soft-deleted/hidden)
router.get(
  '/my-transactions',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:tx:my:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.getMyTransactions
);

router.get(
  '/me',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:tx:my:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.getMyTransactions
);

// 7. Agent Commissions & Total Income
router.get(
  '/commissions',
  auth(Role.AGENT, Role.ADMIN, Role.SUPER_ADMIN),
  rateLimiter({
    keyPrefix: 'rl:tx:commissions:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.getAgentCommissions
);

// 8. Dynamic Fee Configuration (GET by any authenticated user, PATCH by Admin/Super Admin)
router.get(
  '/fee-config',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:tx:fee-config:get:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.getFeeConfig
);

router.patch(
  '/fee-config',
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:tx:fee-config:patch:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(transactionValidation.updateFeeConfigValidationSchema),
  transactionController.updateFeeConfig
);

// 9. Soft Delete / Hide Transaction (Per-User)
router.delete(
  '/:id',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:tx:delete:',
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  transactionController.hideTransaction
);

export const transactionRoutes: Router = router;
