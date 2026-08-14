import { Role } from '@prisma/client';
import { router } from '../../config/express.js';
import { auth } from '../../middlewire/auth.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import type { TJwtPayload } from '../auth/auth.utills.js';
import { userController } from './user.controller.js';
import { parseToJsonFormat } from '../../middlewire/parseToJson.js';
import validateRequest from '../../middlewire/validateRequest.js';
import { userValidation } from './user.validation.js';

router.get(
  '/',
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:users:list:',
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  userController.getAllUser
);

router.get(
  '/:id',
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  rateLimiter({
    keyPrefix: 'rl:users:get:',
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return user.userId;
    },
  }),
  userController.getUserById
);

router.post(
  '/',
  auth(Role.SUPER_ADMIN, Role.ADMIN, Role.AGENT),
  rateLimiter({
    keyPrefix: 'rl:users:create:',
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return `${user.userId}:${user.sessionId}`;
    },
  }),
  validateRequest(userValidation.createUserValidationSchema),
  userController.createUser
);

router.patch(
  '/update-me',
  auth(),
  rateLimiter({
    keyPrefix: 'rl:users:update:',
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const user = req.user as TJwtPayload;
      return `${user.userId}:${user.sessionId}`;
    },
  }),
  parseToJsonFormat,
  validateRequest(userValidation.updateUserValidationSchema),
  userController.updateUser
);

export const userRoutes = router;
