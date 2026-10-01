import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../error/exceptions.dart';

/// Turns Dio errors into the app's typed exceptions (with French messages), carried in
/// `DioException.error` — use `toAppException()` to get them back in data sources.
class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode) debugPrint('API ${err.requestOptions.method} ${err.requestOptions.path} → ${err.type} ${err.response?.statusCode ?? ''}');
    if (err.type == DioExceptionType.cancel) return handler.next(err);
    handler.reject(err.copyWith(error: _map(err)));
  }

  Exception _map(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const NetworkException(message: 'Le serveur met trop de temps à répondre. Vérifiez votre connexion.');
      case DioExceptionType.connectionError:
        return const NetworkException(message: 'Pas de connexion internet.');
      case DioExceptionType.badResponse:
        final status = err.response?.statusCode;
        final message = _serverMessage(err.response);
        if (status == 401) return AuthException(message: message ?? 'Session expirée. Reconnectez-vous.');
        if (status == 403) return AuthException(message: message ?? 'Accès refusé.');
        if (status == 429) return ServerException(message: 'Trop de requêtes. Patientez quelques secondes.', statusCode: status);
        if (status != null && status >= 500) {
          return ServerException(message: 'Le serveur rencontre un problème. Réessayez dans un instant.', statusCode: status);
        }
        return ServerException(message: message ?? 'Requête refusée par le serveur.', statusCode: status);
      default:
        return const NetworkException(message: 'Problème de connexion. Vérifiez votre réseau.');
    }
  }

  String? _serverMessage(Response? response) {
    final data = response?.data;
    if (data is! Map) return null;
    final message = data['message'];
    if (message is String) return message;
    if (message is List && message.isNotEmpty) return message.first.toString();
    return null;
  }
}
