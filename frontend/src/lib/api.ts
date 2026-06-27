import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setTokens, clearTokens } from './auth';
import type {
  ApiResponse,
  PaginatedResponse,
  AuthTokens,
  User,
  LoginCredentials,
  RegisterData,
  Event,
  CreateEventData,
  Ticket,
  TicketTemplate,
  GenerateTicketsData,
  Controller,
  CreateControllerData,
  EventAnalytics,
  GlobalAnalytics,
  AuditLog,
  FilterState,
  UserSettings,
  SubscriptionPlan,
  OrganizerSubscription,
  OrganizerLimits,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const MEDIA_BASE = BASE_URL.replace(/\/api\/v1\/?$/, '');

/** Remplace localhost:PORT par le vrai host du backend (utile en mobile/réseau) */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/^https?:\/\/localhost:\d+/, MEDIA_BASE);
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  // C2: send the httpOnly refresh_token cookie automatically on every request
  withCredentials: true,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Never retry these endpoints — they handle their own auth logic
    const skipRetryUrls = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'];
    const shouldSkipRetry = skipRetryUrls.some(u => originalRequest.url?.includes(u));

    if (error.response?.status === 401 && !originalRequest._retry && !shouldSkipRetry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // C2: no body needed — the httpOnly cookie is sent automatically (withCredentials)
        const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newAccessToken = data.data.accessToken;
        setTokens({ accessToken: newAccessToken });
        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        // Don't redirect if already on an auth page
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
          window.location.href = '/auth/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// --- Auth API ---
export const authApi = {
  login: (credentials: LoginCredentials) =>
    apiClient.post<ApiResponse<{ user: User; tokens: AuthTokens }>>(
      '/auth/login',
      credentials
    ),

  register: (data: RegisterData) =>
    apiClient.post<ApiResponse<{ user: User; tokens: AuthTokens }>>(
      '/auth/register',
      data
    ),

  logout: () => apiClient.post('/auth/logout'),

  refreshToken: (refreshToken: string) =>
    apiClient.post<ApiResponse<AuthTokens>>('/auth/refresh', { refreshToken }),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post('/auth/reset-password', { token, newPassword: password }),

  verifyEmail: (token: string) =>
    apiClient.post('/auth/verify-email', { token }),

  setupTwoFactor: () =>
    apiClient.post<ApiResponse<{ qrCode: string; secret: string }>>(
      '/auth/2fa/setup'
    ),

  verifyTwoFactor: (code: string) =>
    apiClient.post<ApiResponse<{ backupCodes: string[] }>>(
      '/auth/2fa/verify',
      { code }
    ),

  disableTwoFactor: (code: string) =>
    apiClient.post('/auth/2fa/disable', { code }),

  getProfile: () => apiClient.get<ApiResponse<User>>('/auth/profile'),

  updateProfile: (data: Partial<User>) =>
    apiClient.patch<ApiResponse<User>>('/users/me', data),

  uploadAvatar: (formData: FormData) =>
    apiClient.post<ApiResponse<User>>('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  updateSettings: (settings: UserSettings) =>
    apiClient.patch<ApiResponse<UserSettings>>('/auth/settings', settings),
};

// --- Events API ---
export const eventsApi = {
  list: (filters?: FilterState & { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<Event>>('/events', { params: filters }),

  get: (id: string) => apiClient.get<ApiResponse<Event>>(`/events/${id}`),

  create: (data: CreateEventData) =>
    apiClient.post<ApiResponse<Event>>('/events', data),

  update: (id: string, data: Partial<CreateEventData>) =>
    apiClient.patch<ApiResponse<Event>>(`/events/${id}`, data),

  delete: (id: string) => apiClient.delete(`/events/${id}`),

  publish: (id: string) =>
    apiClient.post<ApiResponse<Event>>(`/events/${id}/publish`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<Event>>(`/events/${id}/cancel`),
};

// --- Ticket template payload (design + tarif metadata) ---
export interface TemplateMeta {
  name: string;
  description?: string;
  price: number;
  currency: string;
  quantity: number;
  color?: string;
}
export interface TemplatePayload {
  meta: TemplateMeta;
  customFields: {
    canvas: string;
    width: number;
    height: number;
    preview?: string;
    qrBounds?: { left: number; top: number; width: number; height: number };
    serialBounds?: { left: number; top: number; width: number; height: number };
    nameBounds?: { left: number; top: number; width: number; height: number; fontSize: number; fontFamily: string; fontWeight: string; fill: string; textAlign: string };
    presetWidth?: number;
    presetHeight?: number;
  };
}

// --- Tickets API ---
export const ticketsApi = {
  list: (
    eventId: string,
    filters?: FilterState & { page?: number; limit?: number }
  ) =>
    apiClient.get<PaginatedResponse<Ticket>>(`/events/${eventId}/tickets`, {
      params: filters,
    }),

  get: (id: string) => apiClient.get<ApiResponse<Ticket>>(`/tickets/${id}`),

  generate: (data: GenerateTicketsData) =>
    apiClient.post<ApiResponse<{ tickets: Ticket[]; count: number }>>(
      '/tickets/generate',
      data
    ),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<Ticket>>(`/tickets/${id}/cancel`),

  exportPdf: (eventId: string) =>
    apiClient.get(`/events/${eventId}/tickets/export/pdf`, {
      responseType: 'blob',
    }),

  exportCsv: (eventId: string) =>
    apiClient.get(`/events/${eventId}/tickets/export/csv`, {
      responseType: 'blob',
    }),

  getTemplates: (eventId: string) =>
    apiClient.get<ApiResponse<TicketTemplate[]>>(
      `/events/${eventId}/templates`
    ),

  getTemplate: (eventId: string, templateId: string) =>
    apiClient.get<ApiResponse<TicketTemplate>>(
      `/events/${eventId}/templates/${templateId}`
    ),

  createTemplate: (eventId: string, payload: TemplatePayload) =>
    apiClient.post<ApiResponse<TicketTemplate>>(
      `/events/${eventId}/templates`,
      {
        name: payload.meta.name,
        description: payload.meta.description,
        price: payload.meta.price,
        currency: payload.meta.currency,
        quantity: payload.meta.quantity,
        color: payload.meta.color,
        customFields: payload.customFields,
      }
    ),

  updateTemplate: (eventId: string, templateId: string, payload: TemplatePayload) =>
    apiClient.patch<ApiResponse<TicketTemplate>>(
      `/events/${eventId}/templates/${templateId}`,
      {
        name: payload.meta.name,
        description: payload.meta.description,
        price: payload.meta.price,
        currency: payload.meta.currency,
        quantity: payload.meta.quantity,
        color: payload.meta.color,
        customFields: payload.customFields,
      }
    ),

  deleteTemplate: (eventId: string, templateId: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(
      `/events/${eventId}/templates/${templateId}`
    ),
};

// --- Controllers API ---
export const controllersApi = {
  list: (filters?: FilterState & { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<Controller>>('/controllers', {
      params: filters,
    }),

  get: (id: string) =>
    apiClient.get<ApiResponse<Controller>>(`/controllers/${id}`),

  create: (data: CreateControllerData) =>
    apiClient.post<ApiResponse<Controller>>('/controllers', data),

  update: (id: string, data: Partial<CreateControllerData>) =>
    apiClient.patch<ApiResponse<Controller>>(`/controllers/${id}`, data),

  delete: (id: string) => apiClient.delete(`/controllers/${id}`),

  assignEvent: (controllerId: string, eventId: string) =>
    apiClient.post<ApiResponse<Controller>>(
      `/controllers/${controllerId}/assign`,
      { eventId }
    ),
};

// --- Analytics API ---
export const analyticsApi = {
  getEventAnalytics: (eventId: string) =>
    apiClient.get<ApiResponse<EventAnalytics>>(
      `/analytics/events/${eventId}`
    ),

  getGlobalAnalytics: () =>
    apiClient.get<ApiResponse<GlobalAnalytics>>('/analytics/global'),

  getScanHistory: (
    eventId: string,
    filters?: { from?: string; to?: string }
  ) =>
    apiClient.get(`/analytics/events/${eventId}/scans`, { params: filters }),
};

// --- Audit API ---
export const auditApi = {
  list: (filters?: FilterState & { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<AuditLog>>('/audit', { params: filters }),
};

// --- Team API ---
export const teamApi = {
  list:   (eventId: string) => apiClient.get(`/events/${eventId}/team`),
  create: (eventId: string, data: any) => apiClient.post(`/events/${eventId}/team`, data),
  update: (eventId: string, memberId: string, data: any) => apiClient.patch(`/events/${eventId}/team/${memberId}`, data),
  remove: (eventId: string, memberId: string) => apiClient.delete(`/events/${eventId}/team/${memberId}`),
  uploadPhoto: (eventId: string, memberId: string, file: File) => {
    const form = new FormData();
    form.append('photo', file);
    // Set Content-Type to undefined to remove the default 'application/json' from the axios
    // instance — the browser then sets multipart/form-data with the correct boundary
    return apiClient.post(`/events/${eventId}/team/${memberId}/photo`, form, {
      headers: { 'Content-Type': undefined },
    });
  },
  createAccreditation: (eventId: string, memberId: string, data: any) =>
    apiClient.post(`/events/${eventId}/team/${memberId}/accreditation`, data),
  updateAccreditation: (eventId: string, memberId: string, data: any) =>
    apiClient.patch(`/events/${eventId}/team/${memberId}/accreditation`, data),
  revokeAccreditation: (eventId: string, memberId: string) =>
    apiClient.delete(`/events/${eventId}/team/${memberId}/accreditation`),
  downloadBadge: (eventId: string, memberId: string) =>
    apiClient.get(`/events/${eventId}/team/${memberId}/accreditation/badge`, { responseType: 'arraybuffer' }),
};

// --- Super Admin API ---
export const adminApi = {
  getOverview: () => apiClient.get('/admin/overview'),
  getOrganizers: (search?: string) => apiClient.get('/admin/organizers', { params: search ? { search } : {} }),
  getOrganizerDetail: (id: string) => apiClient.get(`/admin/organizers/${id}`),
  activateOrganizer: (id: string) => apiClient.post(`/admin/organizers/${id}/activate`),
  deactivateOrganizer: (id: string) => apiClient.post(`/admin/organizers/${id}/deactivate`),
};

// --- Subscription API ---
export const subscriptionApi = {
  // Plans (super admin)
  listPlans: () => apiClient.get<ApiResponse<SubscriptionPlan[]>>('/subscriptions/plans'),
  createPlan: (data: Partial<SubscriptionPlan>) => apiClient.post<ApiResponse<SubscriptionPlan>>('/subscriptions/plans', data),
  updatePlan: (id: string, data: Partial<SubscriptionPlan>) => apiClient.put<ApiResponse<SubscriptionPlan>>(`/subscriptions/plans/${id}`, data),
  deletePlan: (id: string) => apiClient.delete(`/subscriptions/plans/${id}`),

  // Organizer subscriptions (super admin)
  listSubscriptions: () => apiClient.get<ApiResponse<OrganizerSubscription[]>>('/subscriptions/organizers'),
  assignPlan: (organizerId: string, data: { planId: string; expiresAt?: string; notes?: string }) =>
    apiClient.post<ApiResponse<OrganizerSubscription>>(`/subscriptions/organizers/${organizerId}/assign`, data),
  updateSubscription: (organizerId: string, data: any) =>
    apiClient.put<ApiResponse<OrganizerSubscription>>(`/subscriptions/organizers/${organizerId}`, data),
  resetQuota: (organizerId: string) =>
    apiClient.post<ApiResponse<OrganizerSubscription>>(`/subscriptions/organizers/${organizerId}/reset-quota`, {}),

  // Current organizer
  getMySubscription: () =>
    apiClient.get<ApiResponse<{ subscription: OrganizerSubscription | null; limits: OrganizerLimits }>>('/subscriptions/me'),

  subscribePlan: (planId: string) =>
    apiClient.post<ApiResponse<OrganizerSubscription>>('/subscriptions/me/subscribe', { planId }),
};

// --- Project API ---
export const projectApi = {
  // Tasks
  getTasks: (eventId: string) =>
    apiClient.get(`/events/${eventId}/project/tasks`),

  createTask: (
    eventId: string,
    data: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      category?: string;
      assigneeName?: string;
      assigneeIds?: string[];
      startDate?: string;
      dueDate?: string;
    }
  ) => apiClient.post(`/events/${eventId}/project/tasks`, data),

  updateTask: (
    eventId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      category?: string;
      assigneeName?: string;
      assigneeIds?: string[];
      startDate?: string;
      dueDate?: string;
    }
  ) => apiClient.patch(`/events/${eventId}/project/tasks/${taskId}`, data),

  deleteTask: (eventId: string, taskId: string) =>
    apiClient.delete(`/events/${eventId}/project/tasks/${taskId}`),

  // Budget
  getBudget: (eventId: string) =>
    apiClient.get(`/events/${eventId}/project/budget`),

  createLine: (
    eventId: string,
    data: { category: string; label: string; plannedAmount: number }
  ) => apiClient.post(`/events/${eventId}/project/budget/lines`, data),

  updateLine: (
    eventId: string,
    lineId: string,
    data: { category?: string; label?: string; plannedAmount?: number }
  ) => apiClient.patch(`/events/${eventId}/project/budget/lines/${lineId}`, data),

  deleteLine: (eventId: string, lineId: string) =>
    apiClient.delete(`/events/${eventId}/project/budget/lines/${lineId}`),

  addExpense: (
    eventId: string,
    lineId: string,
    data: { label: string; amount: number; date?: string; notes?: string }
  ) =>
    apiClient.post(
      `/events/${eventId}/project/budget/lines/${lineId}/expenses`,
      data
    ),

  updateExpense: (
    eventId: string,
    lineId: string,
    expenseId: string,
    data: { label?: string; amount?: number; date?: string; notes?: string }
  ) =>
    apiClient.patch(
      `/events/${eventId}/project/budget/lines/${lineId}/expenses/${expenseId}`,
      data
    ),

  deleteExpense: (eventId: string, lineId: string, expenseId: string) =>
    apiClient.delete(
      `/events/${eventId}/project/budget/lines/${lineId}/expenses/${expenseId}`
    ),

  // Members
  getMembers: (eventId: string) =>
    apiClient.get(`/events/${eventId}/project/members`),

  inviteMember: (eventId: string, data: { email: string; firstName: string; lastName: string; projectRole?: string }) =>
    apiClient.post(`/events/${eventId}/project/members/invite`, data),

  removeMember: (eventId: string, memberId: string) =>
    apiClient.delete(`/events/${eventId}/project/members/${memberId}`),
};

export const communicationApi = {
  // Channels
  getChannelStatus: () =>
    apiClient.get('/communication/channels/status'),

  // Templates
  getTemplates: () =>
    apiClient.get('/communication/templates'),
  initDefaultTemplates: () =>
    apiClient.post('/communication/templates/init-defaults'),
  createTemplate: (data: any) =>
    apiClient.post('/communication/templates', data),
  updateTemplate: (id: string, data: any) =>
    apiClient.put(`/communication/templates/${id}`, data),
  deleteTemplate: (id: string) =>
    apiClient.delete(`/communication/templates/${id}`),

  // Campaigns
  getCampaigns: (eventId: string) =>
    apiClient.get(`/communication/events/${eventId}/campaigns`),
  getEventStats: (eventId: string) =>
    apiClient.get(`/communication/events/${eventId}/stats`),
  createCampaign: (eventId: string, data: any) =>
    apiClient.post(`/communication/events/${eventId}/campaigns`, data),
  setupAutoReminders: (eventId: string) =>
    apiClient.post(`/communication/events/${eventId}/auto-reminders`),
  getCampaign: (id: string) =>
    apiClient.get(`/communication/campaigns/${id}`),
  updateCampaign: (id: string, data: any) =>
    apiClient.put(`/communication/campaigns/${id}`, data),
  deleteCampaign: (id: string) =>
    apiClient.delete(`/communication/campaigns/${id}`),
  sendCampaign: (id: string) =>
    apiClient.post(`/communication/campaigns/${id}/send`),
  scheduleCampaign: (id: string, scheduledAt: string) =>
    apiClient.post(`/communication/campaigns/${id}/schedule`, { scheduledAt }),
  getCampaignStats: (id: string) =>
    apiClient.get(`/communication/campaigns/${id}/stats`),
};

export const invitationApi = {
  getInvitation: (token: string) =>
    apiClient.get(`/project/invitations/${token}`),

  acceptInvitation: (token: string, data: { password: string }) =>
    apiClient.post(`/project/invitations/${token}/accept`, data),
};

export const notificationsApi = {
  getAll: () => apiClient.get('/notifications'),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
  remove: (id: string) => apiClient.delete(`/notifications/${id}`),
};

// ─── Public ticketing API (no auth required) ─────────────────────────────────

const publicClient = axios.create({ baseURL: BASE_URL });

export const publicApi = {
  listEvents: (params?: { page?: number; limit?: number; search?: string; city?: string }) =>
    publicClient.get('/public/events', { params }),
  getCities: () =>
    publicClient.get('/public/events/cities'),
  getEvent: (id: string) =>
    publicClient.get(`/public/events/${id}`),
  purchaseTicket: (eventId: string, data: {
    holderName: string;
    holderEmail: string;
    holderPhone?: string;
    items: { templateId: string; quantity: number }[];
  }) =>
    publicClient.post(`/public/events/${eventId}/register`, data),

  initiatePayment: (eventId: string, data: {
    holderName: string;
    holderEmail: string;
    holderPhone?: string;
    items: { templateId: string; quantity: number }[];
    paymentMethod: 'mobile_money' | 'card';
    currency?: string;
  }) =>
    publicClient.post(`/public/events/${eventId}/initiate-payment`, data),

  getPaymentStatus: (reference: string) =>
    publicClient.get(`/public/payments/${reference}/status`),
};

export default apiClient;
