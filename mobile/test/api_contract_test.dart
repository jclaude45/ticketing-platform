// Parses real responses of the ZAYA API (captured from the backend, tokens redacted) with
// the app's models, so a backend change that breaks the scanner shows up here.
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_scanner/core/error/exceptions.dart';
import 'package:ticketing_scanner/core/network/interceptors/error_interceptor.dart';
import 'package:ticketing_scanner/features/auth/data/models/auth_model.dart';
import 'package:ticketing_scanner/features/events/data/models/event_model.dart';
import 'package:ticketing_scanner/features/scanner/data/models/validation_result_model.dart';
import 'package:ticketing_scanner/features/scanner/domain/entities/validation_result.dart';

Map<String, dynamic> fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  test('controller login response gives a controller session', () {
    final auth = AuthResponseModel.fromJson(fixture('login'));
    expect(auth.accessToken, isNotEmpty);
    expect(auth.refreshToken, isNotEmpty);
    expect(auth.user.role, 'controller');
    expect(auth.user.name, 'Amina Contrôle');
  });

  test('login response without token is rejected cleanly', () {
    expect(() => AuthResponseModel.fromJson({'data': {'requiresTwoFactor': true}}), throwsFormatException);
  });

  test('assigned events list parses from /controller-space/events', () {
    final list = (fixture('events')['data'] as List).map((e) => EventModel.fromJson(e as Map<String, dynamic>)).toList();
    expect(list, hasLength(1));
    expect(list.first.name, 'Concert Mobile');
    expect(list.first.address, '12 av. du Commerce, Kinshasa');
  });

  test('event detail carries the entry counters', () {
    final event = EventModel.fromJson(fixture('detail')['data'] as Map<String, dynamic>);
    expect(event.checkedIn, 0);
    expect(event.extraData, {'myScans': 0, 'myValidScans': 0});
  });

  test('invalid QR scan is shown in French', () {
    final result = ValidationResultModel.fromJson(fixture('scan_invalid')['data'] as Map<String, dynamic>, ticketCode: 'pas-un-billet');
    expect(result.status, ValidationStatus.notFound);
    expect(result.errorMessage, "Ce QR code n'est pas un billet ZAYA.");
  });

  test('a 403 on scan becomes a readable "not assigned" error, not an invalid QR', () {
    final body = fixture('scan_403');
    final err = DioException(
      requestOptions: RequestOptions(path: '/validation/events/x/scan'),
      response: Response(requestOptions: RequestOptions(path: ''), statusCode: 403, data: body),
      type: DioExceptionType.badResponse,
    );
    late DioException rejected;
    ErrorInterceptor().onError(err, _CaptureHandler((e) => rejected = e));
    final app = toAppException(rejected);
    expect(app, isA<AuthException>());
    expect(ValidationResultModel.translate((app as AuthException).message), "Vous n'êtes pas assigné(e) à cet événement.");
  });

  test('no network maps to a NetworkException in French', () {
    final err = DioException(requestOptions: RequestOptions(path: '/x'), type: DioExceptionType.connectionError);
    late DioException rejected;
    ErrorInterceptor().onError(err, _CaptureHandler((e) => rejected = e));
    expect(toAppException(rejected), isA<NetworkException>());
    expect(toAppException(rejected).toString(), 'Pas de connexion internet.');
  });
}

class _CaptureHandler extends ErrorInterceptorHandler {
  _CaptureHandler(this.onReject);
  final void Function(DioException) onReject;

  @override
  void reject(DioException error, [bool callFollowingErrorInterceptor = false]) => onReject(error);

  @override
  void next(DioException error) => onReject(error);
}
