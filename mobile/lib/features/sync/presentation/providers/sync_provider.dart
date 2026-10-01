import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/injection_container.dart';
import '../../../events/presentation/providers/events_provider.dart';
import '../../../scanner/domain/entities/scan_sync_report.dart';
import '../../../scanner/domain/repositories/scanner_repository.dart';
import '../../domain/sync_usecase.dart';

class SyncState {
  final bool isSyncing;
  final int pending;
  final DateTime? lastSyncAt;
  final ScanSyncReport? lastReport;
  final String? error;

  const SyncState({this.isSyncing = false, this.pending = 0, this.lastSyncAt, this.lastReport, this.error});

  SyncState copyWith({bool? isSyncing, int? pending, DateTime? lastSyncAt, ScanSyncReport? lastReport, String? error}) {
    return SyncState(
      isSyncing: isSyncing ?? this.isSyncing,
      pending: pending ?? this.pending,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      lastReport: lastReport ?? this.lastReport,
      error: error,
    );
  }
}

/// Upload of the scans validated without network, shared by the whole app (connectivity
/// back, scanner opened, "Synchroniser" button).
class SyncNotifier extends StateNotifier<SyncState> {
  final SyncUsecase _syncUsecase;
  final ScannerRepository _scanner;
  final Ref _ref;

  SyncNotifier(this._ref, {required SyncUsecase syncUsecase, required ScannerRepository scanner})
      : _syncUsecase = syncUsecase,
        _scanner = scanner,
        super(const SyncState()) {
    refreshPending();
  }

  Future<void> refreshPending() async {
    try {
      final count = await _scanner.getPendingScanCount();
      if (mounted) state = state.copyWith(pending: count, error: state.error);
    } catch (_) {}
  }

  /// Returns the report of this run, null when one was already running.
  Future<ScanSyncReport?> sync() async {
    if (state.isSyncing) return null;
    state = state.copyWith(isSyncing: true);
    try {
      final result = await _syncUsecase();
      state = state.copyWith(isSyncing: false, pending: result.pending, lastSyncAt: DateTime.now(), lastReport: result.scans);
      _ref.invalidate(offlinePackProvider);
      return result.scans;
    } catch (e) {
      state = state.copyWith(isSyncing: false, error: e.toString());
      await refreshPending();
      return null;
    }
  }
}

final syncNotifierProvider = StateNotifierProvider<SyncNotifier, SyncState>((ref) {
  return SyncNotifier(ref, syncUsecase: getIt<SyncUsecase>(), scanner: getIt<ScannerRepository>());
});

/// One French line summing up a sync, null when there is nothing to say.
String? describeSync(ScanSyncReport r) {
  if (r.sent == 0) return null;
  final parts = <String>['${r.accepted} entrée${r.accepted > 1 ? 's' : ''} hors ligne envoyée${r.accepted > 1 ? 's' : ''}'];
  if (r.conflicts > 0) {
    parts.add('${r.conflicts} billet${r.conflicts > 1 ? 's' : ''} déjà utilisé${r.conflicts > 1 ? 's' : ''} à une autre porte');
  }
  if (r.rejected > 0) parts.add('${r.rejected} refusé${r.rejected > 1 ? 's' : ''} par le serveur');
  return parts.join(' · ');
}
