import 'package:dio/dio.dart';

/// Error shown to the organizer: always a French sentence, never a stack trace.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;

  /// French message for any error thrown by a request
  static ApiException from(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return const ApiException(
            'Le serveur met trop de temps à répondre. Vérifiez votre connexion.',
          );
        case DioExceptionType.connectionError:
          return const ApiException('Pas de connexion internet.');
        case DioExceptionType.badResponse:
          final status = error.response?.statusCode;
          final message = _serverMessage(error.response?.data);
          if (status == 429) {
            return ApiException(
              'Trop de tentatives. Patientez une minute.',
              statusCode: status,
            );
          }
          if (status != null && status >= 500) {
            return ApiException(
              'Le serveur rencontre un problème. Réessayez dans un instant.',
              statusCode: status,
            );
          }
          if (status == 401) {
            return ApiException(
              message ?? 'Session expirée. Reconnectez-vous.',
              statusCode: status,
            );
          }
          if (status == 403) {
            return ApiException(message ?? 'Accès refusé.', statusCode: status);
          }
          return ApiException(
            message ?? 'Requête refusée par le serveur.',
            statusCode: status,
          );
        default:
          return const ApiException(
            'Problème de connexion. Vérifiez votre réseau.',
          );
      }
    }
    return const ApiException('Une erreur inattendue est survenue.');
  }

  static String? _serverMessage(dynamic data) {
    if (data is! Map) return null;
    final message = data['message'];
    if (message is String) return _translate(message);
    if (message is List && message.isNotEmpty) return message.first.toString();
    return null;
  }

  /// The few English messages of the backend an organizer can meet at sign-in
  static String _translate(String m) => switch (m) {
    'Invalid email or password' => 'E-mail ou mot de passe incorrect.',
    'Please verify your email before logging in' =>
      'Confirmez d’abord votre adresse e-mail (lien reçu à l’inscription).',
    'Invalid two-factor authentication code' =>
      'Code de vérification incorrect.',
    'TOTP code already used — wait for the next code' =>
      'Ce code a déjà servi : attendez le suivant.',
    'Too many failed attempts — please try again in 15 minutes' =>
      'Trop d’essais. Réessayez dans 15 minutes.',
    'End date must be after start date' => 'La fin doit être après le début.',
    'Cannot update a cancelled event' =>
      'Un événement annulé ne peut plus être modifié.',
    'Only draft events can be published' =>
      'Seul un brouillon peut être publié.',
    'Cannot publish event without ticket templates' =>
      'Ajoutez au moins un tarif avant de publier.',
    'Event is already cancelled' => 'L’événement est déjà annulé.',
    _ => m,
  };
}
