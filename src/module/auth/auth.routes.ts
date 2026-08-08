import { router } from '../../config/express.js';
import { auth } from '../../middlewire/auth.js';
import { deviceSwitchMiddleware } from '../../middlewire/deviceSwitchMiddlewire.js';
import {
  otpRequestMiddlewire,
  type TResendOtpRequestBody,
} from '../../middlewire/otpRequestMiddlewire.js';
import { pinSetupMiddleware } from '../../middlewire/pinSetup.js';
import { rateLimiter } from '../../middlewire/rateLimiter.js';
import validateRequest from '../../middlewire/validateRequest.js';
import { verifyOtpMiddlewire } from '../../middlewire/verifyOtpMiddlewire.js';
import { AuthController } from './auth.controller.js';
import { AuthValidation } from './auth.validation.js';

router.post(
  '/register',
  rateLimiter({
    keyPrefix: 'register:',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
  }),
  validateRequest(AuthValidation.registerValidationSchema),
  AuthController.register
);

router.post(
  '/resend-otp',
  rateLimiter({
    keyPrefix: 'resend-otp:',
    windowMs: 5 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
      const body = req.body as TResendOtpRequestBody;
      return body.verificationId;
    },
  }),
  otpRequestMiddlewire,
  validateRequest(AuthValidation.resendOtpValidationSchema),
  AuthController.resendOtp
);

router.post(
  '/verify-otp',
  rateLimiter({
    keyPrefix: 'verify-otp:',
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const body = req.body as TResendOtpRequestBody;
      return body.verificationId;
    },
  }),
  verifyOtpMiddlewire,
  validateRequest(AuthValidation.verifyOtpValidationSchema),
  AuthController.verifyOtp
);

router.post(
  '/set-pin',
  rateLimiter({
    keyPrefix: 'set-pin:',
    windowMs: 5 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
      const body = req.body as TResendOtpRequestBody;
      return body.verificationId;
    },
  }),
  pinSetupMiddleware,
  validateRequest(AuthValidation.setPinValidationSchema),
  AuthController.setPin
);

router.post(
  '/login',
  rateLimiter({
    keyPrefix: 'login-user:',
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const body = req.body as {
        email?: string;
        phone?: string;
      };
      return `${req.ip}:${body.email || body.phone}`;
    },
  }),
  validateRequest(AuthValidation.loginValidationSchema),
  AuthController.login
);

router.post(
  '/logout-all',
  rateLimiter({
    keyPrefix: 'rl:logout-all:',
    windowMs: 5 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
      const body = req.body as {
        deviceSwitchId?: string;
      };

      return `${req.ip}:${body.deviceSwitchId}`;
    },
  }),
  deviceSwitchMiddleware,
  validateRequest(AuthValidation.logoutAlValidationSchema),
  AuthController.login
);

router.post(
  '/logout',
  rateLimiter({
    keyPrefix: 'rl:logout-all:',
    windowMs: 5 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
      const body = req.body as {
        deviceSwitchId?: string;
      };

      return `${req.ip}:${body.deviceSwitchId}`;
    },
  }),
  auth(),
  validateRequest(AuthValidation.logoutAlValidationSchema),
  AuthController.login
);

export const authRouts = router;
