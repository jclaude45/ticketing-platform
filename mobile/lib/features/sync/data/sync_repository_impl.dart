import '../../scanner/domain/entities/scan_sync_report.dart';
import '../domain/sync_usecase.dart';
import '../../scanner/domain/repositories/scanner_repository.dart';
import '../../events/domain/repositories/events_repository.dart';

class SyncRepositoryImpl {
  final ScannerRepository scannerRepository;
  final EventsRepository eventsRepository;

  const SyncRepositoryImpl({
    required this.scannerRepository,
    required this.eventsRepository,
  });

  /// Uploads the offline scans (in batches, until nothing moves), then brings the
  /// downloaded ticket lists up to date so they include the other doors' entries.
  Future<SyncResult> syncAll() async {
    var report = ScanSyncReport.empty;
    for (var round = 0; round < 20; round++) {
      final r = await scannerRepository.syncOfflineScans();
      report = ScanSyncReport(
        accepted: report.accepted + r.accepted,
        conflicts: report.conflicts + r.conflicts,
        rejected: report.rejected + r.rejected,
      );
      if (r.sent == 0) break;
    }
    final pending = await scannerRepository.getPendingScanCount();
    // Network still there: refresh the lists (failures ignored, next sync retries)
    if (pending == 0 || report.sent > 0) await eventsRepository.refreshOfflinePacks();
    return SyncResult(scans: report, pending: pending);
  }
}
