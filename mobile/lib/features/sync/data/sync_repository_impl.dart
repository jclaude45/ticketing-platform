import '../../../core/network/network_info.dart';
import '../../scanner/domain/entities/scan_sync_report.dart';
import '../domain/sync_usecase.dart';
import '../../scanner/domain/repositories/scanner_repository.dart';
import '../../events/domain/repositories/events_repository.dart';

class SyncRepositoryImpl {
  final ScannerRepository scannerRepository;
  final EventsRepository eventsRepository;
  final NetworkInfo networkInfo;

  const SyncRepositoryImpl({
    required this.scannerRepository,
    required this.eventsRepository,
    required this.networkInfo,
  });

  /// Uploads the offline scans (in batches, until nothing moves), then, with [packs],
  /// downloads / refreshes the ticket lists of the assigned events.
  Future<SyncResult> syncAll({bool packs = true}) async {
    if (!await networkInfo.isConnected) {
      return SyncResult(scans: ScanSyncReport.empty, pending: await scannerRepository.getPendingScanCount());
    }
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
    var packsRefreshed = false;
    if (packs) {
      try {
        await eventsRepository.prepareOfflinePacks();
        packsRefreshed = true;
      } catch (_) {
        // network lost meanwhile: next attempt
      }
    }
    return SyncResult(scans: report, pending: pending, packsRefreshed: packsRefreshed);
  }
}
