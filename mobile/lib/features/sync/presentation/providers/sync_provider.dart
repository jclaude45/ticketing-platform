import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/sync_usecase.dart';

class SyncState {
  final bool isSyncing;
  final DateTime? lastSyncAt;
  final String? error;
  final int scansUploaded;

  const SyncState({
    this.isSyncing = false,
    this.lastSyncAt,
    this.error,
    this.scansUploaded = 0,
  });

  SyncState copyWith({
    bool? isSyncing,
    DateTime? lastSyncAt,
    String? error,
    int? scansUploaded,
  }) {
    return SyncState(
      isSyncing: isSyncing ?? this.isSyncing,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      error: error,
      scansUploaded: scansUploaded ?? this.scansUploaded,
    );
  }
}

class SyncNotifier extends StateNotifier<SyncState> {
  final SyncUsecase _syncUsecase;

  SyncNotifier({required SyncUsecase syncUsecase})
      : _syncUsecase = syncUsecase,
        super(const SyncState());

  Future<void> sync() async {
    if (state.isSyncing) return;
    state = state.copyWith(isSyncing: true, error: null);

    try {
      final result = await _syncUsecase();
      state = state.copyWith(
        isSyncing: false,
        lastSyncAt: DateTime.now(),
        scansUploaded: result.scansUploaded,
        error: result.error,
      );
    } catch (e) {
      state = state.copyWith(
        isSyncing: false,
        error: e.toString(),
      );
    }
  }
}

final syncNotifierProvider =
    StateNotifierProvider<SyncNotifier, SyncState>((ref) {
  return SyncNotifier(syncUsecase: getIt<SyncUsecase>());
});
