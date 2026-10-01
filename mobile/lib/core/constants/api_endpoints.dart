class ApiEndpoints {
  ApiEndpoints._();

  // Auth
  // Controllers have their own session (CONTROLLER role), restricted to the routes below
  static const String login = '/auth/controller-login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';
  static const String me = '/auth/me';

  // Events assigned to the controller (basics + entry counters)
  static const String assignedEvents = '/controller-space/events';
  static String eventDetail(String eventId) => '/controller-space/events/$eventId';
  static String myScans(String eventId) => '/controller-space/events/$eventId/scans';

  // Tickets / Validation
  static String validateTicket(String eventId) =>
      '/validation/events/$eventId/scan';

  // Accreditations (team member badges)
  static String scanAccreditation(String eventId) =>
      '/events/$eventId/team/accreditation/scan';

  // Offline scans upload (offline mode is reworked in a later batch)
  static String syncScans(String eventId) => '/validation/events/$eventId/sync';

  // Health
  static const String health = '/health';
}
