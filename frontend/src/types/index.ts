// User types
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ORGANIZER' | 'CONTROLLER';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

// Event types
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export interface Event {
  id: string;
  name: string;
  description?: string;
  venue: string;
  address?: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  totalCapacity: number;
  status: EventStatus;
  bannerUrl?: string;
  organizerId: string;
  organizer?: User;
  ticketTemplate?: TicketTemplate;
  ticketTemplates?: TicketTemplate[];
  // These fields do not exist as DB columns. Use _count.tickets for the generated count.
  // ticketsScanned is pushed in real-time via WebSocket scan events only.
  ticketsGenerated?: number;
  ticketsScanned?: number;
  createdAt: string;
  updatedAt: string;
  // Computed aliases used by some UI components
  _count?: { tickets: number; ticketTemplates: number };
}

export interface CreateEventData {
  name: string;
  description?: string;
  venue: string;
  address?: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  totalCapacity: number;
  bannerUrl?: string;
}

// Ticket types
export type TicketStatus = 'PENDING' | 'VALID' | 'USED' | 'CANCELLED' | 'EXPIRED';

export interface Ticket {
  id: string;
  serialNumber: string;
  eventId: string;
  event?: Event;
  status: TicketStatus;
  qrCode: string;
  holderName?: string;
  holderEmail?: string;
  scannedAt?: string;
  scannedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketTemplate {
  id: string;
  eventId: string;
  canvasData: string; // JSON Fabric.js canvas state
  width: number;
  height: number;
  backgroundImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateTicketsData {
  eventId: string;
  count: number;
  prefix?: string;
  holderNames?: string[];
}

// Controller types
export interface Controller {
  id: string;
  userId: string;
  user?: User;
  eventId?: string;
  event?: Event;
  isActive: boolean;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateControllerData {
  email: string;
  firstName: string;
  lastName: string;
  eventId?: string;
}

// Analytics types
export interface ScanEvent {
  id: string;
  ticketId: string;
  ticket?: Ticket;
  eventId: string;
  controllerId: string;
  controller?: Controller;
  timestamp: string;
  isValid: boolean;
  rejectionReason?: string;
}

export interface EventAnalytics {
  eventId: string;
  totalTickets: number;
  scannedTickets: number;
  occupancyRate: number;
  scansByHour: { hour: string; count: number }[];
  scansByController: { controllerId: string; name: string; count: number }[];
  recentScans: ScanEvent[];
}

export interface GlobalAnalytics {
  totalEvents: number;
  activeEvents: number;
  totalTickets: number;
  totalScans: number;
  averageOccupancy: number;
  eventsByMonth: { month: string; count: number }[];
  ticketsByEvent: { eventId: string; name: string; count: number }[];
  scansByHour: { hour: string; count: number }[];
}

// Audit types
export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'event.create'
  | 'event.update'
  | 'event.delete'
  | 'ticket.generate'
  | 'ticket.scan'
  | 'ticket.cancel'
  | 'controller.create'
  | 'controller.delete';

export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// API response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

// UI types
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

export interface FilterState {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Socket types
export interface SocketScanEvent {
  ticketId: string;
  serialNumber: string;
  eventId: string;
  isValid: boolean;
  timestamp: string;
  controllerName: string;
}

export interface SocketConnectionStatus {
  connected: boolean;
  eventId?: string;
}

// Settings types
export interface UserSettings {
  notifications: {
    emailOnScan: boolean;
    emailOnEventFull: boolean;
    smsAlerts: boolean;
  };
  display: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
  };
}

// Subscription types
export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price: number;
  maxTickets: number;
  maxBadges: number;
  maxEvents: number;
  showPoweredBy: boolean;
  allowBulkExport: boolean;
  allowCommunication: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';

export interface OrganizerSubscription {
  id: string;
  organizerId: string;
  planId: string;
  status: SubscriptionStatus;
  ticketsUsed: number;
  badgesUsed: number;
  startsAt: string;
  expiresAt?: string;
  notes?: string;
  plan: SubscriptionPlan;
  organizer?: { id: string; firstName: string; lastName: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerLimits {
  maxTickets: number;
  maxBadges: number;
  maxEvents: number;
  showPoweredBy: boolean;
  allowBulkExport: boolean;
  allowCommunication: boolean;
  ticketsUsed: number;
  badgesUsed: number;
}

// Ticket editor canvas element types
export type CanvasElementType = 'text' | 'qrcode' | 'serial' | 'image' | 'rect' | 'line';

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  properties: Record<string, unknown>;
}
