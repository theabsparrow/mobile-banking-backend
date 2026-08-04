import { router } from '../../config/express.js';
import { otpRequestMiddlewire } from '../../middlewire/otpRequestMiddlewire.js';
import validateRequest from '../../middlewire/validateRequest.js';
import { verifyOtpMiddlewire } from '../../middlewire/verifyOtpMiddlewire.js';
import { AuthController } from './auth.controller.js';
import { AuthValidation } from './auth.validation.js';

router.post(
  '/register',
  validateRequest(AuthValidation.registerValidationSchema),
  AuthController.register
);
router.post(
  '/resend-otp',
  otpRequestMiddlewire,
  validateRequest(AuthValidation.resendOtpValidationSchema),
  AuthController.resendOtp
);
router.post(
  '/verify-otp',
  verifyOtpMiddlewire,
  validateRequest(AuthValidation.verifyOtpValidationSchema),
  AuthController.verifyOtp
);
router.post('/login', validateRequest(AuthValidation.loginValidationSchema), AuthController.login);

export const authRouts = router;
