import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const totpSchema = z.object({
  code: z
    .string()
    .length(6, 'TOTP code must be 6 digits')
    .regex(/^\d+$/, 'Must be numeric'),
});

export const EVENT_TYPES = [
  { value: 'CONCERT',    label: 'Concert / Musique',   emoji: '🎵' },
  { value: 'CONFERENCE', label: 'Conférence',           emoji: '🎤' },
  { value: 'FESTIVAL',   label: 'Festival',             emoji: '🎪' },
  { value: 'SPORT',      label: 'Sport',                emoji: '⚽' },
  { value: 'PARTY',      label: 'Soirée / Fête',        emoji: '🥂' },
  { value: 'EXHIBITION', label: 'Exposition',           emoji: '🖼️' },
  { value: 'THEATER',    label: 'Théâtre / Spectacle',  emoji: '🎭' },
  { value: 'WORKSHOP',   label: 'Atelier / Formation',  emoji: '🛠️' },
  { value: 'OTHER',      label: 'Autre',                emoji: '📌' },
] as const;

export type EventTypeValue = typeof EVENT_TYPES[number]['value'];

export const createEventSchema = z.object({
  name: z.string().min(3, 'Event name must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000).optional().or(z.literal('')),
  type: z.enum(['CONCERT','CONFERENCE','FESTIVAL','SPORT','PARTY','EXHIBITION','THEATER','WORKSHOP','OTHER']).default('OTHER'),
  venue: z.string().min(2, 'Venue is required').max(200),
  address: z.string().max(300).optional(),
  city: z.string().min(1, 'City is required').max(100),
  country: z.string().min(1, 'Country is required').max(100),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  totalCapacity: z.number().int().positive('Capacity must be a positive number'),
  bannerUrl: z.string().optional(),
});

export const generateTicketsSchema = z.object({
  count: z
    .number()
    .int()
    .positive('Count must be positive')
    .max(10000, 'Cannot generate more than 10,000 tickets at once'),
  prefix: z.string().max(10, 'Prefix too long').optional(),
});

export const createControllerSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  eventId: z.string().optional(),
});

export const settingsSchema = z.object({
  notifications: z.object({
    emailOnScan: z.boolean(),
    emailOnEventFull: z.boolean(),
    smsAlerts: z.boolean(),
  }),
  display: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string(),
    timezone: z.string(),
  }),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type TotpFormData = z.infer<typeof totpSchema>;
export type CreateEventFormData = z.infer<typeof createEventSchema>;
export type GenerateTicketsFormData = z.infer<typeof generateTicketsSchema>;
export type CreateControllerFormData = z.infer<typeof createControllerSchema>;
export type SettingsFormData = z.infer<typeof settingsSchema>;
