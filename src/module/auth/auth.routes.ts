import { router } from '../../config/express.js';
import validateRequest from '../../middlewire/validateRequest.js';
import { AuthController } from './auth.controller.js';
import { AuthValidation } from './auth.validation.js';

router.post(
  '/register',
  validateRequest(AuthValidation.registerValidationSchema),
  AuthController.register
);
router.post(
  '/request-otp',
  validateRequest(AuthValidation.requestOtpValidationSchema),
  AuthController.requestOtp
);
router.post(
  '/verify-otp',
  validateRequest(AuthValidation.verifyOtpValidationSchema),
  AuthController.verifyOtp
);
router.post('/login', validateRequest(AuthValidation.loginValidationSchema), AuthController.login);

export const authRouts = router;
