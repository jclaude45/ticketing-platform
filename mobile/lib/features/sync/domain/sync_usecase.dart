import '../../scanner/domain/entities/scan_sync_report.dart';
import '../data/sync_repository_impl.dart';

class SyncUsecase {
  final SyncRepositoryImpl repository;

  const SyncUsecase({required this.repository});

  Future<SyncResult> call() => repository.syncAll();
}

class SyncResult {
  final ScanSyncReport scans;

  /// Scans still on the phone after this attempt
  final int pending;

  const SyncResult({required this.scans, required this.pending});
}
