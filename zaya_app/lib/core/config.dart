/// Where the app talks to. `--dart-define=API_URL=http://localhost:3001/api/v1` points a
/// development build at a local backend (iOS simulator; 10.0.2.2 on the Android emulator).
class AppConfig {
  AppConfig._();

  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://app.zaya.live/api/v1',
  );

  /// Host of the API (pictures stored as /uploads/… live there)
  static String get origin => Uri.parse(
    apiUrl,
  ).replace(path: '').toString().replaceAll(RegExp(r'/$'), '');

  /// Public site: event pages shared and, until payment is in the app, the checkout
  static const String siteUrl = 'https://zaya.live';

  static String eventUrl(String id) => '$siteUrl/billetterie/$id';

  static const String appVersion = '1.0.0';
}
