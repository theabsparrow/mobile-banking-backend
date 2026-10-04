import { Role } from '@prisma/client';
import { Router } from 'express';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { walletController } from './wallet.controller.js';

const router = Router();

// Logged in user can view their wallet (cached in Redis)
router.get(
  '/my-wallet',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:wallet:me:',
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  walletController.getMyWallet
);

router.get(
  '/me',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:wallet:me:',
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  walletController.getMyWallet
);

// Admin / Super Admin can view any user's wallet
router.get(
  '/user/:id',
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:wallet:user:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  walletController.getWalletByUserId
);

export const walletRoutes: Router = router;
