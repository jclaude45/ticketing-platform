import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config.dart';
import '../storage.dart';

/// HTTP client of the app. Adds the session token (and the collaborator workspace), renews
/// the session once on a 401 — concurrent 401s share one renewal — and unwraps the
/// backend's `{ success, data }` envelope.
class ApiClient {
  ApiClient._() {
    _dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }
  static final instance = ApiClient._();

  final _store = SecureStore.instance;
  final _dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiUrl,
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Accept': 'application/json',
        'X-Platform': 'mobile',
        'X-App-Version': AppConfig.appVersion,
      },
    ),
  );
  // The renewal itself must not go through the interceptors
  final _plain = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiUrl,
      connectTimeout: const Duration(seconds: 20),
      headers: {'X-Platform': 'mobile'},
    ),
  );
  Future<bool>? _refreshing;

  /// Called when the session cannot be renewed (the app goes back to the sign-in screen)
  final sessionExpired = StreamController<void>.broadcast();

  static bool _isAuthCall(RequestOptions o) =>
      o.path.startsWith('/auth/login') || o.path.startsWith('/auth/refresh');

  Future<void> _onRequest(RequestOptions o, RequestInterceptorHandler h) async {
    if (!_isAuthCall(o)) {
      final token = await _store.accessToken;
      if (token != null) o.headers['Authorization'] = 'Bearer $token';
      final ws = await _store.workspace;
      if (ws != null) o.headers['X-Workspace'] = ws;
    }
    h.next(o);
  }

  Future<void> _onError(DioException e, ErrorInterceptorHandler h) async {
    final o = e.requestOptions;
    if (e.response?.statusCode != 401 ||
        _isAuthCall(o) ||
        o.extra['retried'] == true) {
      return h.next(e);
    }
    final ok = await (_refreshing ??= refresh().whenComplete(
      () => _refreshing = null,
    ));
    if (!ok) {
      await _store.clear();
      sessionExpired.add(null);
      return h.next(e);
    }
    try {
      o.headers['Authorization'] = 'Bearer ${await _store.accessToken}';
      o.extra['retried'] = true;
      h.resolve(await _dio.fetch(o));
    } on DioException catch (err) {
      h.next(err);
    }
  }

  /// New tokens for this phone's session; false when the session is over
  Future<bool> refresh() async {
    final token = await _store.refreshToken;
    if (token == null) return false;
    try {
      final r = await _plain.post(
        '/auth/refresh',
        data: {'refreshToken': token},
      );
      final d = unwrap(r.data) as Map<String, dynamic>;
      final access = d['accessToken'] as String?;
      if (access == null) return false;
      await _store.saveTokens(access, d['refreshToken'] as String?);
      return true;
    } catch (err) {
      if (kDebugMode) debugPrint('Session renewal failed: $err');
      return false;
    }
  }

  static dynamic unwrap(dynamic body) =>
      body is Map && body.containsKey('data') && body.containsKey('success')
      ? body['data']
      : body;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async =>
      unwrap((await _dio.get(path, queryParameters: query)).data);

  Future<dynamic> post(String path, [Object? data]) async =>
      unwrap((await _dio.post(path, data: data)).data);

  Future<dynamic> patch(String path, [Object? data]) async =>
      unwrap((await _dio.patch(path, data: data)).data);

  Future<dynamic> put(String path, [Object? data]) async =>
      unwrap((await _dio.put(path, data: data)).data);

  Future<dynamic> delete(String path, [Object? data]) async =>
      unwrap((await _dio.delete(path, data: data)).data);
}
