import z from 'zod/v3';

const sendMoneyValidationSchema = z.object({
  receiverPhoneOrEmail: z.string().min(1, 'Receiver phone or email is required'),
  amount: z.number().positive('Amount must be a positive number'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const cashInValidationSchema = z.object({
  receiverPhoneOrEmail: z.string().min(1, 'Receiver phone or email is required'),
  amount: z.number().positive('Amount must be a positive number'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits').optional(),
  description: z.string().optional(),
});

const adminCashInValidationSchema = z.object({
  agentPhoneOrEmail: z.string().min(1, 'Agent phone or email is required'),
  amount: z.number().positive('Amount must be a positive number'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits').optional(),
  description: z.string().optional(),
});

const cashOutValidationSchema = z.object({
  agentPhoneOrEmail: z.string().min(1, 'Agent phone or email is required'),
  amount: z.number().positive('Amount must be a positive number'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const updateFeeConfigValidationSchema = z.object({
  sendMoneyFeePerThousand: z.number().min(0, 'Send money fee cannot be negative').optional(),
  cashOutFeePerThousand: z.number().min(0, 'Cash out fee cannot be negative').optional(),
  cashInCommissionPerThousand: z.number().min(0, 'Cash in commission cannot be negative').optional(),
  cashOutCommissionPerThousand: z.number().min(0, 'Cash out commission cannot be negative').optional(),
});

export const transactionValidation = {
  sendMoneyValidationSchema,
  cashInValidationSchema,
  adminCashInValidationSchema,
  cashOutValidationSchema,
  updateFeeConfigValidationSchema,
};
