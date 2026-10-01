import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Sound + vibration after a scan, so the controller knows the outcome without looking:
/// a short rising beep for "enter", a low buzz and a long vibration for "stop".
class ScanFeedback {
  ScanFeedback._();
  static final instance = ScanFeedback._();

  static const _soundKey = 'scan_sound_enabled';
  static const _storage = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  // Low-latency players (SoundPool on Android), loaded once
  final _valid = AudioPlayer()..setPlayerMode(PlayerMode.lowLatency);
  final _refused = AudioPlayer()..setPlayerMode(PlayerMode.lowLatency);
  bool _loaded = false;
  bool soundEnabled = true;

  Future<void> init() async {
    if (_loaded) return;
    _loaded = true;
    try {
      soundEnabled = (await _storage.read(key: _soundKey)) != 'false';
      await _valid.setSource(AssetSource('sounds/valid.wav'));
      await _refused.setSource(AssetSource('sounds/refused.wav'));
      // Scanner sounds must not stop the music of another app for long
      await AudioPlayer.global.setAudioContext(AudioContextConfig(focus: AudioContextConfigFocus.mixWithOthers).build());
    } catch (_) {
      // No sound is not a reason to stop scanning
    }
  }

  Future<void> setSoundEnabled(bool enabled) async {
    soundEnabled = enabled;
    try {
      await _storage.write(key: _soundKey, value: '$enabled');
    } catch (_) {}
  }

  Future<void> accepted() async {
    HapticFeedback.lightImpact();
    await _play(_valid);
  }

  Future<void> refused() async {
    HapticFeedback.vibrate();
    await _play(_refused);
  }

  Future<void> _play(AudioPlayer player) async {
    if (!soundEnabled) return;
    try {
      await player.stop();
      await player.resume();
    } catch (_) {}
  }
}
