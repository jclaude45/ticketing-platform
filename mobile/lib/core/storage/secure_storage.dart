import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import '../constants/app_constants.dart';
import '../../features/auth/domain/entities/user_entity.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock,
    ),
  );

  // Access Token
  Future<void> saveAccessToken(String token) async {
    await _storage.write(key: AppConstants.tokenKey, value: token);
  }

  Future<String?> getAccessToken() async {
    return _storage.read(key: AppConstants.tokenKey);
  }

  Future<void> deleteAccessToken() async {
    await _storage.delete(key: AppConstants.tokenKey);
  }

  // Refresh Token
  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: AppConstants.refreshTokenKey, value: token);
  }

  Future<String?> getRefreshToken() async {
    return _storage.read(key: AppConstants.refreshTokenKey);
  }

  Future<void> deleteRefreshToken() async {
    await _storage.delete(key: AppConstants.refreshTokenKey);
  }

  // User Data
  Future<void> saveUser(UserEntity user) async {
    final json = jsonEncode(user.toJson());
    await _storage.write(key: AppConstants.userKey, value: json);
  }

  Future<UserEntity?> getUser() async {
    final json = await _storage.read(key: AppConstants.userKey);
    if (json == null) return null;
    try {
      return UserEntity.fromJson(jsonDecode(json) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> deleteUser() async {
    await _storage.delete(key: AppConstants.userKey);
  }

  // Identifies this phone in offline scan uploads (required by the server)
  Future<String> getOrCreateDeviceId() async {
    const key = 'device_id';
    final existing = await _storage.read(key: key);
    if (existing != null && existing.isNotEmpty) return existing;
    final id = 'mobile-${const Uuid().v4()}';
    await _storage.write(key: key, value: id);
    return id;
  }

  // Check if logged in
  Future<bool> get isLoggedIn async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }

  // Clear all stored data
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
