import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../constants/api_endpoints.dart';
import '../../constants/app_constants.dart';
import '../../session/session_events.dart';
import '../../storage/secure_storage.dart';

/// Adds the access token and transparently renews it once on a 401.
///
/// Concurrent 401s share a single refresh; each request is then retried once with the new
/// token. When the refresh fails the session is cleared and [SessionEvents] tells the app
/// to go back to the login screen — no request is ever left hanging.
class AuthInterceptor extends Interceptor {
  final SecureStorage _secureStorage;
  final Dio _dio;
  // Separate client for the refresh call: it must not go through these interceptors
  final Dio _refreshDio;
  Future<bool>? _refreshing;

  AuthInterceptor({required SecureStorage secureStorage, required Dio dio, Dio? refreshDio})
      : _secureStorage = secureStorage,
        _dio = dio,
        _refreshDio = refreshDio ??
            Dio(BaseOptions(
              baseUrl: AppConstants.baseUrl,
              connectTimeout: const Duration(milliseconds: AppConstants.connectTimeout),
              receiveTimeout: const Duration(milliseconds: AppConstants.receiveTimeout),
              headers: {'Content-Type': 'application/json', 'X-Platform': 'mobile'},
            ));

  bool _isAuthCall(RequestOptions o) =>
      o.path.contains(ApiEndpoints.login) || o.path.contains(ApiEndpoints.refreshToken);

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (!_isAuthCall(options)) {
      final token = await _secureStorage.getAccessToken();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    if (err.response?.statusCode != 401 || _isAuthCall(options) || options.extra['retried'] == true) {
      return handler.next(err);
    }

    final refreshed = await (_refreshing ??= _refresh().whenComplete(() => _refreshing = null));
    if (!refreshed) {
      await _secureStorage.clearAll();
      SessionEvents.notifyExpired();
      return handler.next(err);
    }

    try {
      final token = await _secureStorage.getAccessToken();
      options.headers['Authorization'] = 'Bearer $token';
      options.extra['retried'] = true;
      handler.resolve(await _dio.fetch(options));
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  Future<bool> _refresh() async {
    final refreshToken = await _secureStorage.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final response = await _refreshDio.post(ApiEndpoints.refreshToken, data: {'refreshToken': refreshToken});
      final body = response.data as Map<String, dynamic>;
      final payload = body['data'] as Map<String, dynamic>? ?? body;
      final access = payload['accessToken'] as String?;
      if (access == null) return false;
      await _secureStorage.saveAccessToken(access);
      final newRefresh = payload['refreshToken'] as String?;
      if (newRefresh != null) await _secureStorage.saveRefreshToken(newRefresh);
      return true;
    } catch (e) {
      if (kDebugMode) debugPrint('Session refresh failed: $e');
      return false;
    }
  }
}
