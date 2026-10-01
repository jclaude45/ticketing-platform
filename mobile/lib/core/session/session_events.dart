import 'dart:async';

/// App-wide session events. The auth interceptor signals an expired session (refresh
/// failed); the app listens and sends the controller back to the login screen.
class SessionEvents {
  SessionEvents._();

  static final StreamController<void> _expired = StreamController<void>.broadcast();

  static Stream<void> get expired => _expired.stream;

  static void notifyExpired() => _expired.add(null);
}
