import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/entities/validation_result.dart';
import '../../domain/usecases/scan_ticket.dart';
import '../../domain/usecases/sync_offline_scans.dart';

enum ScannerState {
  idle,
  scanning,
  processing,
  result,
  error,
}

class ScannerStateData {
  final ScannerState state;
  final ValidationResult? lastResult;
  final String? error;
  final int pendingScanCount;
  final bool isProcessing;
  final String? eventId;

  const ScannerStateData({
    this.state = ScannerState.idle,
    this.lastResult,
    this.error,
    this.pendingScanCount = 0,
    this.isProcessing = false,
    this.eventId,
  });

  ScannerStateData copyWith({
    ScannerState? state,
    ValidationResult? lastResult,
    String? error,
    int? pendingScanCount,
    bool? isProcessing,
    String? eventId,
  }) {
    return ScannerStateData(
      state: state ?? this.state,
      lastResult: lastResult ?? this.lastResult,
      error: error,
      pendingScanCount: pendingScanCount ?? this.pendingScanCount,
      isProcessing: isProcessing ?? this.isProcessing,
      eventId: eventId ?? this.eventId,
    );
  }
}

class ScannerNotifier extends StateNotifier<ScannerStateData> {
  final ScanTicket _scanTicket;
  final SyncOfflineScans _syncOfflineScans;
  String? _currentEventId;
  DateTime? _lastScanTime;

  ScannerNotifier({
    required ScanTicket scanTicket,
    required SyncOfflineScans syncOfflineScans,
  })  : _scanTicket = scanTicket,
        _syncOfflineScans = syncOfflineScans,
        super(const ScannerStateData());

  void setEventId(String eventId) {
    _currentEventId = eventId;
    state = state.copyWith(eventId: eventId);
    _loadPendingCount();
  }

  Future<void> _loadPendingCount() async {
    try {
      final count = await _syncOfflineScans.getPendingCount();
      state = state.copyWith(pendingScanCount: count);
    } catch (_) {}
  }

  Future<ValidationResult?> onQrDetected(
    String qrCode, {
    String? gate,
  }) async {
    if (state.isProcessing) return null;
    if (_currentEventId == null) return null;

    // Debounce: don't process same code too quickly
    final now = DateTime.now();
    if (_lastScanTime != null &&
        now.difference(_lastScanTime!).inMilliseconds < 2000) {
      return null;
    }
    _lastScanTime = now;

    state = state.copyWith(
      isProcessing: true,
      state: ScannerState.processing,
      error: null,
    );

    try {
      final result = await _scanTicket(
        eventId: _currentEventId!,
        qrCode: qrCode,
        gate: gate,
      );

      state = state.copyWith(
        isProcessing: false,
        state: ScannerState.result,
        lastResult: result,
      );

      // Refresh pending count
      await _loadPendingCount();

      return result;
    } catch (e) {
      state = state.copyWith(
        isProcessing: false,
        state: ScannerState.error,
        error: e.toString(),
      );
      return null;
    }
  }

  void resetToScanning() {
    state = state.copyWith(
      state: ScannerState.scanning,
      isProcessing: false,
      error: null,
    );
  }

  Future<void> syncOfflineScans() async {
    try {
      await _syncOfflineScans();
      await _loadPendingCount();
    } catch (_) {}
  }
}

final scannerNotifierProvider =
    StateNotifierProvider<ScannerNotifier, ScannerStateData>((ref) {
  return ScannerNotifier(
    scanTicket: getIt<ScanTicket>(),
    syncOfflineScans: getIt<SyncOfflineScans>(),
  );
});
