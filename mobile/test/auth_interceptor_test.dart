// Session renewal: concurrent 401s share one refresh and are all retried; a failed refresh
// ends the session instead of leaving requests hanging (former deadlock).
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_scanner/core/network/interceptors/auth_interceptor.dart';
import 'package:ticketing_scanner/core/session/session_events.dart';
import 'package:ticketing_scanner/core/storage/secure_storage.dart';

class MemoryStorage extends SecureStorage {
  String? access = 'old-token';
  String? refresh = 'refresh-token';
  bool cleared = false;

  @override
  Future<String?> getAccessToken() async => access;
  @override
  Future<String?> getRefreshToken() async => refresh;
  @override
  Future<void> saveAccessToken(String token) async => access = token;
  @override
  Future<void> saveRefreshToken(String token) async => refresh = token;
  @override
  Future<void> clearAll() async {
    access = null;
    refresh = null;
    cleared = true;
  }
}

/// Fake server: 401 for the old token, 200 for the new one; counts refresh calls.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter({required this.refreshSucceeds});
  final bool refreshSucceeds;
  int refreshCalls = 0;

  ResponseBody _json(Object body, int status) => ResponseBody.fromString(
        jsonEncode(body),
        status,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (options.path.contains('/auth/refresh')) {
      refreshCalls++;
      await Future<void>.delayed(const Duration(milliseconds: 50));
      return refreshSucceeds
          ? _json({'data': {'accessToken': 'new-token', 'refreshToken': 'new-refresh'}}, 200)
          : _json({'message': 'Invalid refresh token'}, 401);
    }
    final auth = options.headers['Authorization'];
    return auth == 'Bearer new-token' ? _json({'data': {'ok': true}}, 200) : _json({'message': 'Unauthorized'}, 401);
  }

  @override
  void close({bool force = false}) {}
}

(Dio, MemoryStorage, FakeAdapter) build({required bool refreshSucceeds}) {
  final storage = MemoryStorage();
  final adapter = FakeAdapter(refreshSucceeds: refreshSucceeds);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final refreshDio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  dio.interceptors.add(AuthInterceptor(secureStorage: storage, dio: dio, refreshDio: refreshDio));
  return (dio, storage, adapter);
}

void main() {
  test('three requests expiring together: one refresh, all succeed', () async {
    final (dio, storage, adapter) = build(refreshSucceeds: true);
    final results = await Future.wait([
      dio.get('/controller-space/events'),
      dio.get('/controller-space/events/a'),
      dio.post('/validation/events/a/scan'),
    ]).timeout(const Duration(seconds: 5));
    expect(results.map((r) => r.statusCode), everyElement(200));
    expect(adapter.refreshCalls, 1);
    expect(storage.access, 'new-token');
    expect(storage.refresh, 'new-refresh');
  });

  test('refresh refused: requests fail fast, session cleared, app notified', () async {
    final (dio, storage, adapter) = build(refreshSucceeds: false);
    final expired = SessionEvents.expired.first.timeout(const Duration(seconds: 5));
    final outcomes = await Future.wait([
      dio.get('/controller-space/events').then((_) => 'ok', onError: (_) => 'error'),
      dio.get('/controller-space/events/a').then((_) => 'ok', onError: (_) => 'error'),
    ]).timeout(const Duration(seconds: 5)); // a hang would fail here
    expect(outcomes, ['error', 'error']);
    expect(adapter.refreshCalls, 1);
    expect(storage.cleared, isTrue);
    await expired;
  });
}
