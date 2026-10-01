import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Scanner built into a PDA terminal (trigger instead of the camera). Codes arrive two ways:
/// - typed like a keyboard ("keyboard wedge", default on most terminals): characters much
///   faster than a person, usually ended by Enter;
/// - broadcast by the scanner service (Zebra DataWedge, Sunmi, Urovo, Newland...), passed on
///   by the Android side (MainActivity).
/// A terminal set to do both sends each code twice: repeats within [_dedupeWindow] are dropped.
class HardwareScanner {
  HardwareScanner._();
  static final instance = HardwareScanner._();

  static const _channel = EventChannel('zcontrole/hardware_scanner');
  static const _dedupeWindow = Duration(milliseconds: 1500);

  /// A scanner types faster than this between two characters; a person never does
  static const _machineGap = Duration(milliseconds: 35);

  /// Codes without an Enter at the end are taken after this silence
  static const _idleFlush = Duration(milliseconds: 120);

  final _controller = StreamController<String>.broadcast();
  StreamSubscription<dynamic>? _native;
  bool _started = false;

  final _buffer = StringBuffer();
  DateTime? _firstKeyAt;
  DateTime? _lastKeyAt;
  Timer? _flushTimer;

  String? _lastCode;
  DateTime? _lastCodeAt;

  /// Codes read with the trigger, whatever the way they arrived.
  Stream<String> get scans {
    _start();
    return _controller.stream;
  }

  void _start() {
    if (_started) return;
    _started = true;
    HardwareKeyboard.instance.addHandler(_onKey);
    // Broadcasts exist on Android terminals only (not on iOS, nor in tests)
    if (!Platform.isAndroid) return;
    try {
      _native = _channel.receiveBroadcastStream().listen(
            (code) => code is String ? _emit(code) : null,
            onError: (_) {}, // keyboard mode still works
          );
    } catch (_) {}
  }

  /// Never consumes the key: a text field being typed in still gets it.
  bool _onKey(KeyEvent event) {
    if (event is KeyUpEvent) return false;
    final now = DateTime.now();
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.numpadEnter || key == LogicalKeyboardKey.tab) {
      _flush(fromTerminator: true);
      return false;
    }
    final char = event.character;
    if (char == null || char.isEmpty || char.codeUnitAt(0) < 0x20) return false;
    // A pause ends the previous sequence (normally already done by the idle timer)
    if (_lastKeyAt != null && now.difference(_lastKeyAt!) > _idleFlush) _flush();
    _firstKeyAt ??= now;
    _lastKeyAt = now;
    _buffer.write(char);
    _flushTimer?.cancel();
    _flushTimer = Timer(_idleFlush, _flush);
    return false;
  }

  void _flush({bool fromTerminator = false}) {
    _flushTimer?.cancel();
    final text = _buffer.toString();
    final chars = text.length;
    final span = _firstKeyAt != null && _lastKeyAt != null ? _lastKeyAt!.difference(_firstKeyAt!) : Duration.zero;
    _reset();
    if (chars < 4) return;
    // Typed at machine speed: a scan (a person typing a code ends up here too slowly)
    final machine = span.inMicroseconds / (chars - 1) <= _machineGap.inMicroseconds;
    if (machine) _emit(text);
  }

  void _reset() {
    _buffer.clear();
    _firstKeyAt = null;
    _lastKeyAt = null;
  }

  void _emit(String raw) {
    final code = raw.trim();
    if (code.isEmpty) return;
    final now = DateTime.now();
    if (code == _lastCode && _lastCodeAt != null && now.difference(_lastCodeAt!) < _dedupeWindow) return;
    _lastCode = code;
    _lastCodeAt = now;
    _controller.add(code);
  }

  /// For tests: a code as the keyboard path would deliver it.
  @visibleForTesting
  void debugEmit(String code) => _emit(code);

  /// For tests: the test framework drops keyboard handlers between tests.
  @visibleForTesting
  void debugReset() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    _started = false;
    _flushTimer?.cancel();
    _reset();
    _lastCode = null;
  }

  Future<void> dispose() async {
    HardwareKeyboard.instance.removeHandler(_onKey);
    await _native?.cancel();
    _started = false;
  }
}

/// "Scanner intégré": the terminal's trigger only, the camera stays off (battery, no
/// camera on some PDAs). The trigger works in both cases.
class ScannerModeNotifier extends StateNotifier<bool> {
  static const _key = 'hardware_scanner_only';
  static const _storage = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  /// Read before the first screen ([load]) so the camera never starts for nothing
  static bool _saved = false;

  static Future<void> load() async {
    try {
      _saved = await _storage.read(key: _key) == 'true';
    } catch (_) {}
  }

  ScannerModeNotifier() : super(_saved);

  Future<void> set(bool hardwareOnly) async {
    state = hardwareOnly;
    _saved = hardwareOnly;
    try {
      await _storage.write(key: _key, value: '$hardwareOnly');
    } catch (_) {}
  }
}

final hardwareScannerOnlyProvider = StateNotifierProvider<ScannerModeNotifier, bool>((ref) => ScannerModeNotifier());
