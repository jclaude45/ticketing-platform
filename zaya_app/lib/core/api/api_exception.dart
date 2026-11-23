import 'package:dio/dio.dart';

import '../i18n.dart';

/// Error shown to the buyer: always a sentence, never a stack trace. The backend's own
/// messages for the app are in French; network ones follow the language chosen.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  bool get isOffline => statusCode == null;

  @override
  String toString() => message;

  static ApiException from(Object error) {
    if (error is ApiException) return error;
    final s = S.current;
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return ApiException(s.errTimeout);
        case DioExceptionType.connectionError:
          return ApiException(s.errOffline);
        case DioExceptionType.badResponse:
          final status = error.response?.statusCode;
          final message = _serverMessage(error.response?.data);
          if (status != null && status >= 500 && status != 503) {
            return ApiException(s.errServer, statusCode: status);
          }
          return ApiException(
            message ?? (status == 429 ? s.errTooMany : s.errGeneric),
            statusCode: status,
          );
        default:
          return ApiException(s.errOffline);
      }
    }
    return ApiException(s.errGeneric);
  }

  /// `message`, or the first validation error (`errors`) of a 400
  static String? _serverMessage(dynamic data) {
    if (data is! Map) return null;
    final errors = data['errors'];
    if (errors is List && errors.isNotEmpty) return errors.first.toString();
    final message = data['message'];
    if (message is String && message != 'Validation failed') return message;
    if (message is List && message.isNotEmpty) return message.first.toString();
    return null;
  }
}
