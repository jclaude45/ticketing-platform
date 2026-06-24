import 'package:dio/dio.dart';
import 'package:logger/logger.dart';

import '../../constants/api_endpoints.dart';
import '../../storage/secure_storage.dart';

class AuthInterceptor extends Interceptor {
  final SecureStorage _secureStorage;
  final Dio _dio;
  final Logger _logger = Logger();
  bool _isRefreshing = false;
  final List<RequestOptions> _pendingRequests = [];

  AuthInterceptor({
    required SecureStorage secureStorage,
    required Dio dio,
  })  : _secureStorage = secureStorage,
        _dio = dio;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Skip auth for login and refresh endpoints
    if (options.path.contains(ApiEndpoints.login) ||
        options.path.contains(ApiEndpoints.refreshToken)) {
      return handler.next(options);
    }

    final token = await _secureStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    return handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      if (_isRefreshing) {
        // Queue the request
        _pendingRequests.add(err.requestOptions);
        return;
      }

      _isRefreshing = true;
      try {
        final refreshed = await _refreshToken();
        if (refreshed) {
          // Retry pending requests
          for (final pending in _pendingRequests) {
            final token = await _secureStorage.getAccessToken();
            pending.headers['Authorization'] = 'Bearer $token';
            await _dio.fetch(pending);
          }
          _pendingRequests.clear();

          // Retry original request
          final token = await _secureStorage.getAccessToken();
          err.requestOptions.headers['Authorization'] = 'Bearer $token';
          final response = await _dio.fetch(err.requestOptions);
          return handler.resolve(response);
        }
      } catch (e) {
        _logger.e('Token refresh failed', error: e);
        await _secureStorage.clearAll();
      } finally {
        _isRefreshing = false;
      }
    }
    return handler.next(err);
  }

  Future<bool> _refreshToken() async {
    final refreshToken = await _secureStorage.getRefreshToken();
    if (refreshToken == null) return false;

    try {
      final response = await _dio.post(
        ApiEndpoints.refreshToken,
        // Backend strategy reads from body.refreshToken (mobile path)
        data: {'refreshToken': refreshToken},
        options: Options(headers: {'Authorization': null}),
      );

      if (response.statusCode == 200) {
        // Handle TransformInterceptor wrapper
        final body = response.data as Map<String, dynamic>;
        final payload = body['data'] as Map<String, dynamic>? ?? body;
        await _secureStorage.saveAccessToken(payload['accessToken'] as String);
        if (payload['refreshToken'] != null) {
          await _secureStorage.saveRefreshToken(
              payload['refreshToken'] as String);
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}
