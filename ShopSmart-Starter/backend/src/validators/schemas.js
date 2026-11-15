import { z } from 'zod';

export const orderSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  // The order email now comes from the signed-in account; a submitted value is ignored.
  email: z.email().optional(),
  address: z.string().trim().min(10).max(300),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(20)
  })).min(1).max(20).refine(
    (items) => new Set(items.map((item) => item.productId)).size === items.length,
    { message: 'Each product may appear only once in an order.' }
  )
});

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(3).max(300)
});

const emailField = z.string().trim().toLowerCase().pipe(z.email()).refine((value) => value.length <= 254);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailField,
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128)
});
