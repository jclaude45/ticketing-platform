import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api/api_client.dart';
import 'config.dart';
import 'storage.dart';

/// Something that happened on an event, pushed by the server as it happens
class LiveEvent {
  /// `sale` (paid order) or `scan` (ticket checked at the entrance)
  final String kind;
  final String eventId;
  final Map<String, dynamic> data;

  const LiveEvent(this.kind, this.eventId, this.data);
}

/// Connection to the backend's realtime channel (Socket.IO, /realtime). Screens subscribe to
/// one event at a time; the connection opens on first use and renews its token when the
/// server refuses it.
class Realtime {
  Realtime._();
  static final instance = Realtime._();

  io.Socket? _socket;
  final _events = StreamController<LiveEvent>.broadcast();
  final _rooms = <String>{};

  /// Live events of one event (the room is joined while someone listens)
  Stream<LiveEvent> watch(String eventId) {
    late final StreamController<LiveEvent> c;
    StreamSubscription<LiveEvent>? sub;
    c = StreamController<LiveEvent>(
      onListen: () async {
        sub = _events.stream.where((e) => e.eventId == eventId).listen(c.add);
        _rooms.add(eventId);
        await _connect();
        _socket?.emit('join:event', {'eventId': eventId});
      },
      onCancel: () async {
        await sub?.cancel();
        _rooms.remove(eventId);
        _socket?.emit('leave:event', {'eventId': eventId});
      },
    );
    return c.stream;
  }

  Future<void> _connect() async {
    if (_socket != null) return;
    final token = await SecureStore.instance.accessToken;
    final socket = io.io(
      AppConfig.realtimeUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );
    _socket = socket;
    socket.onConnect((_) {
      for (final id in _rooms) {
        socket.emit('join:event', {'eventId': id});
      }
    });
    // The server closes connections with an expired token: renew it, then reconnect
    socket.onDisconnect((reason) async {
      if (reason == 'io server disconnect' &&
          await ApiClient.instance.refresh()) {
        socket.auth = {'token': await SecureStore.instance.accessToken};
        socket.connect();
      }
    });
    socket.onConnectError((e) {
      if (kDebugMode) debugPrint('Realtime connection error: $e');
    });
    socket.on('sale:new', (d) => _emit('sale', d));
    socket.on('ticket:scanned', (d) => _emit('scan', d));
    socket.connect();
  }

  void _emit(String kind, dynamic d) {
    if (d is! Map) return;
    final data = Map<String, dynamic>.from(d);
    final eventId = data['eventId'] as String?;
    if (eventId != null) _events.add(LiveEvent(kind, eventId, data));
  }

  /// On sign-out: the next account opens its own connection
  void close() {
    _socket?.dispose();
    _socket = null;
    _rooms.clear();
  }
}
