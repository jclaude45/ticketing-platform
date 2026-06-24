import 'dart:convert';

import 'package:crypto/crypto.dart';

class CryptoUtils {
  CryptoUtils._();

  /// Hash QR code content for local lookup
  static String hashQrCode(String qrCode) {
    final bytes = utf8.encode(qrCode);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Compute HMAC-SHA256 for data integrity
  static String computeHmac(String key, String data) {
    final keyBytes = utf8.encode(key);
    final dataBytes = utf8.encode(data);
    final hmac = Hmac(sha256, keyBytes);
    return hmac.convert(dataBytes).toString();
  }

  /// Verify HMAC — constant-time to prevent timing attacks
  static bool verifyHmac(String key, String data, String expectedHmac) {
    final computed = computeHmac(key, data);
    return _constantTimeEquals(computed, expectedHmac);
  }

  static bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var result = 0;
    for (var i = 0; i < a.length; i++) {
      result |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return result == 0;
  }

  /// Decode JWT payload (without verification)
  static Map<String, dynamic>? decodeJwtPayload(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;

      var payload = parts[1];
      while (payload.length % 4 != 0) {
        payload += '=';
      }

      final decoded = utf8.decode(base64Url.decode(payload));
      return jsonDecode(decoded) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Check if JWT is expired
  static bool isJwtExpired(String token, {int bufferSeconds = 0}) {
    final payload = decodeJwtPayload(token);
    if (payload == null) return true;

    final exp = payload['exp'] as int?;
    if (exp == null) return true;

    final expiryTime = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
    final now = DateTime.now().add(Duration(seconds: bufferSeconds));
    return now.isAfter(expiryTime);
  }
}
