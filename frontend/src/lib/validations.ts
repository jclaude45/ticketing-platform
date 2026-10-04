import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
  totpCode: z.string().optional(),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères'),
    lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    email: z.string().email('Adresse e-mail invalide'),
    password: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
      .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
      .regex(/[0-9]/, 'Doit contenir au moins un chiffre')
      .regex(/[^A-Za-z0-9]/, 'Doit contenir au moins un caractère spécial'),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
      .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
      .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const totpSchema = z.object({
  code: z
    .string()
    .length(6, 'Le code doit contenir 6 chiffres')
    .regex(/^\d+$/, 'Uniquement des chiffres'),
});

export const EVENT_TYPES = [
  { value: 'CONCERT',    label: 'Concert / Musique'  },
  { value: 'CONFERENCE', label: 'Conférence'          },
  { value: 'FESTIVAL',   label: 'Festival'            },
  { value: 'SPORT',      label: 'Sport'               },
  { value: 'PARTY',      label: 'Soirée / Fête'       },
  { value: 'EXHIBITION', label: 'Exposition'          },
  { value: 'THEATER',    label: 'Théâtre / Spectacle' },
  { value: 'WORKSHOP',   label: 'Atelier / Formation' },
  { value: 'OTHER',      label: 'Autre'               },
] as const;

export const EVENT_CURRENCIES = [
  { value: 'CDF', label: 'CDF — Franc congolais'   },
  { value: 'USD', label: 'USD — Dollar américain'  },
  { value: 'EUR', label: 'EUR — Euro'               },
  { value: 'XAF', label: 'XAF — Franc CFA'         },
  { value: 'GBP', label: 'GBP — Livre sterling'    },
] as const;

export type EventTypeValue = typeof EVENT_TYPES[number]['value'];

export const createEventSchema = z.object({
  name: z.string().min(3, 'Le nom doit contenir au moins 3 caractères').max(200),
  description: z.string().min(10, 'La description doit contenir au moins 10 caractères').max(2000).optional().or(z.literal('')),
  type: z.enum(['CONCERT','CONFERENCE','FESTIVAL','SPORT','PARTY','EXHIBITION','THEATER','WORKSHOP','OTHER']).default('OTHER'),
  currency: z.enum(['CDF','USD','EUR','XAF','GBP']).default('USD'),
  /** Who pays ZAYA's 9 % on paid tickets */
  feePayer: z.enum(['ORGANIZER', 'BUYER']).default('ORGANIZER'),
  venue: z.string().min(2, 'Le lieu est requis').max(200),
  address: z.string().max(300).optional(),
  city: z.string().min(1, 'La ville est requise').max(100),
  country: z.string().min(1, 'Le pays est requis').max(100),
  startDate: z.string().min(1, 'La date de début est requise'),
  endDate: z.string().min(1, 'La date de fin est requise'),
  totalCapacity: z.number().int().positive('La capacité doit être un nombre positif'),
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
