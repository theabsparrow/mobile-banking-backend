import z from 'zod/v3';

const createBusinessRequestValidationSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  reason: z.string().min(1, 'Reason is required').max(255, 'Reason must not exceed 255 characters'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const createPersonalRequestValidationSchema = z.object({
  receiverId: z.string().uuid('Receiver ID must be a valid UUID'),
  amount: z.number().positive('Amount must be a positive number'),
  reason: z.string().min(1, 'Reason is required').max(255, 'Reason must not exceed 255 characters'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const cancelRequestValidationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const deleteRequestValidationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const rejectRequestValidationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  rejectionReason: z
    .string()
    .min(1, 'Rejection reason is required')
    .max(255, 'Rejection reason must not exceed 255 characters'),
});

const processRequestValidationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  adminNote: z.string().max(255, 'Admin note must not exceed 255 characters').optional(),
});

export const requestValidation = {
  createBusinessRequestValidationSchema,
  createPersonalRequestValidationSchema,
  cancelRequestValidationSchema,
  deleteRequestValidationSchema,
  rejectRequestValidationSchema,
  processRequestValidationSchema,
};
