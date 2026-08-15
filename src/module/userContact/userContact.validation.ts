import z from 'zod/v3';

const createContactValidationSchema = z.object({
  savedUserId: z.string().min(1, 'Saved User ID is required'),
  customName: z.string().max(100, 'Custom name must not exceed 100 characters').optional(),
});

const updateContactValidationSchema = z.object({
  customName: z.string().max(100, 'Custom name must not exceed 100 characters').optional(),
  savedUserId: z.string().min(1, 'Saved User ID is required').optional(),
});

export const userContactValidation = {
  createContactValidationSchema,
  updateContactValidationSchema,
};
