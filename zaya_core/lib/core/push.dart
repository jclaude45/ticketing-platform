import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api/api_client.dart';

/// What a tapped notification asks the app to open (`kind`, `eventId`… sent by the server)
class PushTap {
  final String kind;
  final String? eventId;
  const PushTap(this.kind, this.eventId);
}

/// Push notifications (Firebase Cloud Messaging): this phone is registered with the server
/// after sign-in and forgotten at sign-out. Android only for now (iPhone needs the Apple key).
class Push {
  Push._();
  static final instance = Push._();

  // Firebase project « zaya-core ». The API key comes from dart_defines.json (kept out of
  // git): flutter run / build --dart-define-from-file=dart_defines.json
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _android = FirebaseOptions(
    apiKey: _apiKey,
    appId: '1:983185612082:android:25f8ce341738141e7d4b2b',
    messagingSenderId: '983185612082',
    projectId: 'zaya-core-1ad60',
    storageBucket: 'zaya-core-1ad60.firebasestorage.app',
  );

  bool _ready = false;
  StreamSubscription<String>? _refresh;

  /// Notification received while the app is open (Android shows nothing by itself then)
  final foreground = StreamController<RemoteMessage>.broadcast();

  /// Notification tapped by the person
  final taps = StreamController<PushTap>.broadcast();

  bool get supported => !kIsWeb && Platform.isAndroid;

  Future<void> init() async {
    if (!supported || _ready || _apiKey.isEmpty) return;
    try {
      await Firebase.initializeApp(options: _android);
      _ready = true;
      FirebaseMessaging.onMessage.listen(foreground.add);
      FirebaseMessaging.onMessageOpenedApp.listen(_tapped);
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _tapped(initial);
    } catch (e) {
      if (kDebugMode) debugPrint('Push unavailable: $e');
    }
  }

  void _tapped(RemoteMessage m) => taps.add(
    PushTap(m.data['kind']?.toString() ?? '', m.data['eventId']?.toString()),
  );

  /// After sign-in: asks permission (Android 13+), then gives this phone's token to the server
  Future<void> register() async {
    if (!_ready) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      // Classic registration token: what the server's FCM v1 « token » target expects. The newer
      // register()/onRegistered gives an installation ID meant for another sending mode.
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _send(token);
      // ignore: deprecated_member_use
      _refresh ??= FirebaseMessaging.instance.onTokenRefresh.listen(_send);
    } catch (e) {
      if (kDebugMode) debugPrint('Push registration failed: $e');
    }
  }

  Future<void> _send(String token) => ApiClient.instance.post(
    '/notifications/devices',
    {'token': token, 'platform': 'android'},
  );

  /// Before sign-out: this phone stops receiving the account's notifications
  Future<void> unregister() async {
    if (!_ready) return;
    try {
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await ApiClient.instance.post('/notifications/devices/remove', {
          'token': token,
        });
      }
      await _refresh?.cancel();
      _refresh = null;
      // ignore: deprecated_member_use
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      if (kDebugMode) debugPrint('Push unregistration failed: $e');
    }
  }
}
