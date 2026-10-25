import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Session kept on the phone in the encrypted store (Android Keystore, iOS Keychain).
class SecureStore {
  SecureStore._();
  static final instance = SecureStore._();

  // Android: values encrypted with a key held in the Keystore (default of the plugin)
  final _s = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  static const _access = 'access_token';
  static const _refresh = 'refresh_token';
  static const _user = 'user';
  static const _workspace = 'workspace';

  Future<String?> get accessToken => _s.read(key: _access);
  Future<String?> get refreshToken => _s.read(key: _refresh);

  Future<void> saveTokens(String access, String? refresh) async {
    await _s.write(key: _access, value: access);
    if (refresh != null) await _s.write(key: _refresh, value: refresh);
  }

  Future<Map<String, dynamic>?> get user async {
    final raw = await _s.read(key: _user);
    return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> saveUser(Map<String, dynamic> user) =>
      _s.write(key: _user, value: jsonEncode(user));

  /// Organizer account worked on as a collaborator (null = one's own account)
  Future<String?> get workspace => _s.read(key: _workspace);

  Future<void> saveWorkspace(String? ownerId) => ownerId == null
      ? _s.delete(key: _workspace)
      : _s.write(key: _workspace, value: ownerId);

  Future<void> clear() => _s.deleteAll();
}
