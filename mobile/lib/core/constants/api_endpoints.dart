class ApiEndpoints {
  ApiEndpoints._();

  // Auth
  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';
  static const String me = '/auth/me';

  // Events
  static const String assignedEvents = '/events';
  static String eventDetail(String eventId) => '/events/$eventId';
  static String eventStats(String eventId) => '/events/$eventId/stats';
  static String downloadEventTickets(String eventId) =>
      '/events/$eventId/tickets/export';

  // Tickets / Validation
  static String validateTicket(String eventId) =>
      '/events/$eventId/tickets/validate';
  static String ticketInfo(String ticketCode) => '/tickets/$ticketCode';

  // Accreditations (team member badges)
  static String scanAccreditation(String eventId) =>
      '/events/$eventId/team/accreditation/scan';

  // Sync
  static const String syncScans = '/controllers/me/scans/batch';
  static const String syncStatus = '/controllers/me/sync-status';

  // Health
  static const String health = '/health';
}
