import { Role } from '@prisma/client';
import { Router } from 'express';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import validateRequest from '../../middlewire/validateRequest.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { requestController } from './request.controller.js';
import { requestValidation } from './request.validation.js';
import { router } from '../../config/express.js';

router.post(
  '/business',
  auth(Role.AGENT),
  rateLimiter({
    keyPrefix: 'rl:req:create-business:',
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.createBusinessRequestValidationSchema),
  requestController.createBusinessRequest
);

router.post(
  '/personal',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:create-personal:',
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.createPersonalRequestValidationSchema),
  requestController.createPersonalRequest
);

router.get(
  '/',
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  rateLimiter({
    keyPrefix: 'rl:req:list:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  requestController.getRequests
);

router.get(
  '/my-request',
  auth(Role.CUSTOMER, Role.AGENT),
  rateLimiter({
    keyPrefix: 'rl:req:my:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  requestController.getMyRequests
);

router.get(
  '/:id',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:get:',
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  requestController.getRequestById
);

router.patch(
  '/:id/cancel',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:cancel:',
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.requestValidationSchema),
  requestController.cancelRequest
);

router.patch(
  '/:id/reject',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:reject:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.rejectRequestValidationSchema),
  requestController.rejectRequest
);

router.patch(
  '/:id/approve',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:approve:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.processRequestValidationSchema),
  requestController.approveRequest
);

router.delete(
  '/:id',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:delete:',
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.requestValidationSchema),
  requestController.deleteRequest
);

export const requestRoutes: Router = router;
