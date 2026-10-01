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
  // Offline pack: the event's tickets (only the changed ones with ?since=)
  static String offlineTickets(String eventId) => '/controller-space/events/$eventId/tickets';

  // Tickets / Validation
  static String validateTicket(String eventId) =>
      '/validation/events/$eventId/scan';

  // Accreditations (team member badges)
  static String scanAccreditation(String eventId) =>
      '/events/$eventId/team/accreditation/scan';

  // Upload of the scans validated without network
  static String syncScans(String eventId) => '/validation/events/$eventId/sync';

  // Health
  static const String health = '/health';
}
