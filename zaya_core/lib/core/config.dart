/// Where the app talks to. `--dart-define=API_URL=http://10.0.2.2:3001/api/v1` points a
/// development build at a local backend.
class AppConfig {
  AppConfig._();

  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://app.zaya.live/api/v1',
  );

  /// Host of the API (pictures stored as /uploads/… and the realtime socket live there)
  static String get origin => Uri.parse(
    apiUrl,
  ).replace(path: '').toString().replaceAll(RegExp(r'/$'), '');

  /// Socket.IO namespace of the backend (live sales and entries)
  static String get realtimeUrl => '$origin/realtime';

  static const String appVersion = '1.0.0';
}
