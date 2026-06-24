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

  Future<SyncResult> syncAll() async {
    int scansUploaded = 0;
    int eventsUpdated = 0;
    String? error;

    // Sync offline scans first
    try {
      final pendingBefore = await scannerRepository.getPendingScanCount();
      await scannerRepository.syncOfflineScans();
      final pendingAfter = await scannerRepository.getPendingScanCount();
      scansUploaded = pendingBefore - pendingAfter;
    } catch (e) {
      error = 'Scan sync failed: ${e.toString()}';
    }

    // Sync events
    try {
      await eventsRepository.syncEvents();
      eventsUpdated = 1; // At least events were updated
    } catch (e) {
      error = error != null
          ? '$error\nEvent sync failed: ${e.toString()}'
          : 'Event sync failed: ${e.toString()}';
    }

    return SyncResult(
      success: error == null,
      scansUploaded: scansUploaded,
      eventsUpdated: eventsUpdated,
      error: error,
    );
  }
}
