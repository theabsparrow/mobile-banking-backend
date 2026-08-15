import { Router } from 'express';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import validateRequest from '../../middlewire/validateRequest.js';
import { userContactController } from './userContact.controller.js';
import { userContactValidation } from './userContact.validation.js';

const router = Router();

router.post(
  '/',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:contacts:create:',
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 creations per minute
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(userContactValidation.createContactValidationSchema),
  userContactController.createContact
);

router.get(
  '/',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:contacts:list:',
    windowMs: 60 * 1000,
    max: 60, // 60 requests per minute
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  userContactController.getContacts
);

router.get(
  '/:id',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:contacts:get:',
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  userContactController.getContactById
);

router.patch(
  '/:id',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:contacts:update:',
    windowMs: 60 * 1000,
    max: 20, // 20 updates per minute
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  validateRequest(userContactValidation.updateContactValidationSchema),
  userContactController.updateContact
);

router.delete(
  '/:id',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:contacts:delete:',
    windowMs: 60 * 1000,
    max: 20, // 20 deletions per minute
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  userContactController.deleteContact
);

export const userContactRoutes: Router = router;
