import 'package:dio/dio.dart';
import 'package:logger/logger.dart';

import '../../error/exceptions.dart';

class ErrorInterceptor extends Interceptor {
  final Logger _logger = Logger();

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _logger.e(
      'DioException: ${err.type} - ${err.message}',
      error: err,
    );

    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        throw NetworkException(
          message: 'Connection timed out. Please check your internet connection.',
        );

      case DioExceptionType.connectionError:
        throw NetworkException(
          message: 'No internet connection. Working in offline mode.',
        );

      case DioExceptionType.badResponse:
        final statusCode = err.response?.statusCode;
        final message = _extractErrorMessage(err.response);

        switch (statusCode) {
          case 400:
            throw ServerException(
              message: message ?? 'Bad request.',
              statusCode: statusCode,
            );
          case 401:
            throw AuthException(
              message: message ?? 'Authentication failed. Please login again.',
            );
          case 403:
            throw AuthException(
              message: message ?? 'Access denied.',
            );
          case 404:
            throw ServerException(
              message: message ?? 'Resource not found.',
              statusCode: statusCode,
            );
          case 422:
            throw ServerException(
              message: message ?? 'Validation error.',
              statusCode: statusCode,
            );
          case 429:
            throw ServerException(
              message: 'Too many requests. Please slow down.',
              statusCode: statusCode,
            );
          case 500:
          case 502:
          case 503:
            throw ServerException(
              message: 'Server error. Please try again later.',
              statusCode: statusCode,
            );
          default:
            throw ServerException(
              message: message ?? 'An unexpected error occurred.',
              statusCode: statusCode,
            );
        }

      case DioExceptionType.cancel:
        // Request was cancelled - don't throw
        break;

      default:
        throw NetworkException(
          message: 'Network error: ${err.message}',
        );
    }

    handler.next(err);
  }

  String? _extractErrorMessage(Response? response) {
    if (response?.data == null) return null;
    try {
      final data = response!.data as Map<String, dynamic>;
      return data['message'] as String? ??
          data['error'] as String? ??
          data['detail'] as String?;
    } catch (_) {
      return response?.data?.toString();
    }
  }
}
