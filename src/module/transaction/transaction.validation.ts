import z from 'zod/v3';

const sendMoneyValidationSchema = z.object({
  receiverPhoneOrEmail: z.string().min(1, 'Receiver phone or email is required'),
  amount: z.number().positive('Amount must be a positive number'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const cashOutValidationSchema = z.object({
  agentPhoneOrEmail: z.string().min(1, 'Agent phone or email is required'),
  amount: z.number().positive('Amount must be a positive number'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

export const transactionValidation = {
  sendMoneyValidationSchema,
  cashOutValidationSchema,
};
