import { Role } from '@prisma/client';
import { Router } from 'express';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import validateRequest from '../../middlewire/validateRequest.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { requestController } from './request.controller.js';
import { requestValidation } from './request.validation.js';
import { router } from '../../config/express.js';

// agent request to admin to refill his wallet
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

// any user can request to anybody to  get money
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

// get all requests - accessible only by super admin
router.get(
  '/',
  auth(Role.SUPER_ADMIN),
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

// get agent requests - accessible only by admin
router.get(
  '/agent-requests',
  auth(Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:req:agent-list:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  requestController.getAgentRequests
);

// agent and the customers can get their own requests
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

// user can get requests received by them (incoming requests)
router.get(
  '/received-requests',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:received:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  requestController.getReceivedRequests
);

// user can get requests processed by them (approved or rejected)
router.get(
  '/processed-requests',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:processed:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  requestController.getProcessedRequests
);

// user can get his requests by request by id
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

// user can cancel the request which is sent by his own
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

// request can be rejected by the user which is sent for him
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

// request can be approved by the user which is sent for him (unified)
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

// business request approval by admin (CASH_IN, fee: 0)
router.patch(
  '/:id/approve-business',
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  rateLimiter({
    keyPrefix: 'rl:req:approve-bus:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.processRequestValidationSchema),
  requestController.approveBusinessRequest
);

// personal request approval by receiver (SEND_MONEY, fee applied)
router.patch(
  '/:id/approve-personal',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:req:approve-per:',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(requestValidation.processRequestValidationSchema),
  requestController.approvePersonalRequest
);

// request can be delete by the users
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
