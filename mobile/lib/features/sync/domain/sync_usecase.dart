import '../../scanner/domain/entities/scan_sync_report.dart';
import '../data/sync_repository_impl.dart';

class SyncUsecase {
  final SyncRepositoryImpl repository;

  const SyncUsecase({required this.repository});

  Future<SyncResult> call({bool packs = true}) => repository.syncAll(packs: packs);
}

class SyncResult {
  final ScanSyncReport scans;

  /// Scans still on the phone after this attempt
  final int pending;

  /// The ticket lists were brought up to date
  final bool packsRefreshed;

  const SyncResult({required this.scans, required this.pending, this.packsRefreshed = false});
}
