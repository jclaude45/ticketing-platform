import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Kept on the phone in the encrypted store (Android Keystore, iOS Keychain): the session, the
/// customer, the language, and the wallet's last copy (tickets and their QR, shown offline).
class SecureStore {
  SecureStore._();
  static final instance = SecureStore._();

  final _s = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  static const _access = 'access_token';
  static const _refresh = 'refresh_token';
  static const _customer = 'customer';
  static const _wallet = 'wallet';
  static const _language = 'language';
  static const _welcomed = 'welcomed';

  Future<String?> get accessToken => _s.read(key: _access);
  Future<String?> get refreshToken => _s.read(key: _refresh);

  Future<void> saveTokens(String access, String refresh) async {
    await _s.write(key: _access, value: access);
    await _s.write(key: _refresh, value: refresh);
  }

  Future<Map<String, dynamic>?> get customer => _json(_customer);

  Future<void> saveCustomer(Map<String, dynamic> c) =>
      _s.write(key: _customer, value: jsonEncode(c));

  /// { savedAt, tickets: [...] } as last received
  Future<Map<String, dynamic>?> get wallet => _json(_wallet);

  Future<void> saveWallet(List<dynamic> tickets) => _s.write(
    key: _wallet,
    value: jsonEncode({
      'savedAt': DateTime.now().toIso8601String(),
      'tickets': tickets,
    }),
  );

  /// Chosen before signing in too, so it outlives the session
  Future<String?> get language => _s.read(key: _language);

  Future<void> saveLanguage(String code) =>
      _s.write(key: _language, value: code);

  /// The welcome screen was passed (signed in, or « Explorer sans compte »): not shown again
  Future<bool> get welcomed async => await _s.read(key: _welcomed) == '1';

  Future<void> saveWelcomed() => _s.write(key: _welcomed, value: '1');

  /// Signing out: everything but the language (and the welcome already seen)
  Future<void> clearSession() async {
    for (final k in [_access, _refresh, _customer, _wallet]) {
      await _s.delete(key: k);
    }
  }

  Future<Map<String, dynamic>?> _json(String key) async {
    final raw = await _s.read(key: key);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
