import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/error/exceptions.dart';
import '../../data/sources/accreditation_remote_source.dart';
import '../../domain/entities/accreditation_result.dart';

class AccreditationState {
  final bool isProcessing;
  final AccreditationResult? lastResult;
  final String? eventId;
  final DateTime? lastScanTime;

  const AccreditationState({
    this.isProcessing = false,
    this.lastResult,
    this.eventId,
    this.lastScanTime,
  });

  AccreditationState copyWith({
    bool? isProcessing,
    AccreditationResult? lastResult,
    String? eventId,
    DateTime? lastScanTime,
  }) {
    return AccreditationState(
      isProcessing: isProcessing ?? this.isProcessing,
      lastResult: lastResult ?? this.lastResult,
      eventId: eventId ?? this.eventId,
      lastScanTime: lastScanTime ?? this.lastScanTime,
    );
  }
}

class AccreditationNotifier extends StateNotifier<AccreditationState> {
  AccreditationNotifier() : super(const AccreditationState());

  void setEventId(String eventId) {
    state = state.copyWith(eventId: eventId);
  }

  Future<AccreditationResult?> onQrDetected(String qrCode) async {
    if (state.isProcessing) return null;
    if (state.eventId == null) return null;

    // Debounce
    if (state.lastScanTime != null &&
        DateTime.now().difference(state.lastScanTime!).inMilliseconds < 2000 &&
        state.lastResult?.qrCode == qrCode) {
      return null;
    }

    state = state.copyWith(isProcessing: true, lastScanTime: DateTime.now());

    try {
      final source = getIt<AccreditationRemoteSource>();
      final result = await source.scanAccreditation(
        eventId: state.eventId!,
        qrCode: qrCode,
      );
      state = state.copyWith(isProcessing: false, lastResult: result);
      return result;
    } on NetworkException {
      final result = AccreditationResult.error(
        qrCode: qrCode,
        message: 'Pas de réseau. Vérifiez votre connexion.',
      );
      state = state.copyWith(isProcessing: false, lastResult: result);
      return result;
    } on ServerException catch (e) {
      final result = AccreditationResult.error(qrCode: qrCode, message: e.message);
      state = state.copyWith(isProcessing: false, lastResult: result);
      return result;
    }
  }
}

final accreditationNotifierProvider =
    StateNotifierProvider<AccreditationNotifier, AccreditationState>((ref) {
  return AccreditationNotifier();
});
