class AppConstants {
  AppConstants._();

  // API Configuration
  // The API lives on app.zaya.live (zaya.live is the public website, its /api/v1 is a 404).
  // Override at build time, e.g. a phone on the local network:
  //   flutter run --dart-define=API_URL=http://192.168.1.20:3001/api/v1
  static const String _prodBaseUrl = 'https://app.zaya.live/api/v1';
  static const String baseUrl = String.fromEnvironment('API_URL', defaultValue: _prodBaseUrl);
  static const int connectTimeout = 10000; // 10 seconds: a dead network must not freeze the door
  static const int receiveTimeout = 30000; // 30 seconds
  static const int sendTimeout = 30000; // 30 seconds
  // A scan waits at most this long for the server before switching to the offline list
  static const Duration scanTimeout = Duration(seconds: 8);

  // Auth
  static const String tokenKey = 'access_token';
  static const String refreshTokenKey = 'refresh_token';
  static const String userKey = 'user_data';
  static const int tokenExpiryBufferSeconds = 300; // 5 minutes

  // Scanner
  static const int scanDebounceMs = 2000; // 2 second debounce between scans
  static const int resultDisplaySeconds = 3; // Auto-return after 3s
  static const int maxOfflineQueueSize = 1000;

  // Sync
  static const int syncIntervalMinutes = 15;
  static const int maxSyncRetries = 3;
  static const int syncBatchSize = 50;

  // Cache
  static const String ticketCacheBox = 'ticket_cache';
  static const String eventCacheBox = 'event_cache';
  static const String pendingScansBox = 'pending_scans';
  static const int cacheExpiryHours = 24;

  // Database
  static const String dbName = 'ticket_scanner.db';
  static const int dbVersion = 4; // v2: offline packs + pending_scans.ticket_id; v3: tickets.is_guest; v4: tickets.valid_days

  // Tables
  static const String eventsTable = 'events';
  static const String ticketsTable = 'tickets';
  static const String pendingScansTable = 'pending_scans';
  static const String scanLogsTable = 'scan_logs';
  static const String offlinePacksTable = 'offline_packs';

  // App Info
  static const String appName = 'ZControle';
  static const String appVersion = '1.0.0';
}
