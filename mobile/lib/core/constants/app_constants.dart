class AppConstants {
  AppConstants._();

  // API Configuration
  // Dev: Android emulator → 10.0.2.2, iOS simulator → 127.0.0.1
  // For physical device, replace with your machine's local IP.
  static const String _devBaseUrl = 'http://10.0.2.2:3001/api/v1';
  static const String _prodBaseUrl = 'https://api.ticketing-platform.com/api/v1';
  static const bool _isProduction = bool.fromEnvironment('dart.vm.product');
  static String get baseUrl => _isProduction ? _prodBaseUrl : _devBaseUrl;
  static const int connectTimeout = 30000; // 30 seconds
  static const int receiveTimeout = 30000; // 30 seconds
  static const int sendTimeout = 30000; // 30 seconds

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
  static const int dbVersion = 1;

  // Tables
  static const String eventsTable = 'events';
  static const String ticketsTable = 'tickets';
  static const String pendingScansTable = 'pending_scans';
  static const String scanLogsTable = 'scan_logs';

  // App Info
  static const String appName = 'Ticket Scanner';
  static const String appVersion = '1.0.0';
}
