import 'package:dio/dio.dart';

class ServerException implements Exception {
  final String message;
  final int? statusCode;

  const ServerException({
    required this.message,
    this.statusCode,
  });

  @override
  String toString() => message;
}

class NetworkException implements Exception {
  final String message;

  const NetworkException({required this.message});

  @override
  String toString() => message;
}

class AuthException implements Exception {
  final String message;

  const AuthException({required this.message});

  @override
  String toString() => message;
}

class CacheException implements Exception {
  final String message;

  const CacheException({required this.message});

  @override
  String toString() => message;
}

class ValidationException implements Exception {
  final String message;

  const ValidationException({required this.message});

  @override
  String toString() => message;
}

class BiometricException implements Exception {
  final String message;

  const BiometricException({required this.message});

  @override
  String toString() => message;
}

/// The app exception carried by a Dio error (set by ErrorInterceptor), or a generic one.
/// Dio wraps anything thrown inside an interceptor, so data sources unwrap it here.
Exception toAppException(Object error) {
  if (error is ServerException || error is NetworkException || error is AuthException) {
    return error as Exception;
  }
  if (error is DioException) {
    final inner = error.error;
    if (inner is ServerException || inner is NetworkException || inner is AuthException) {
      return inner as Exception;
    }
    return const NetworkException(message: 'Problème de connexion. Vérifiez votre réseau.');
  }
  return const ServerException(message: 'Une erreur inattendue est survenue.');
}
