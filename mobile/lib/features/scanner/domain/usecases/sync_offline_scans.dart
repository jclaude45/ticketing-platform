import '../entities/scan_sync_report.dart';
import '../repositories/scanner_repository.dart';

class SyncOfflineScans {
  final ScannerRepository repository;

  const SyncOfflineScans({required this.repository});

  Future<ScanSyncReport> call() => repository.syncOfflineScans();

  Future<int> getPendingCount() async {
    return repository.getPendingScanCount();
  }
}
