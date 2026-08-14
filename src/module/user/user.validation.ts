import z from "zod/v3";


const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(16, 'Password must not exceed 16 characters')
  .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least 1 number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least 1 special character'
  );

const createUserValidationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),

  phone: z
    .string()
    .min(10, 'Phone number must be at least 10 characters')
    .max(15, 'Phone number must not exceed 15 characters')
    .optional(),

  name: z
    .string()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters')
    .optional(),

  password: passwordSchema.optional(),
});

export const userValidation = {
  createUserValidationSchema,
};