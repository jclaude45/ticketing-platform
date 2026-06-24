import '../repositories/scanner_repository.dart';

class SyncOfflineScans {
  final ScannerRepository repository;

  const SyncOfflineScans({required this.repository});

  Future<void> call() async {
    await repository.syncOfflineScans();
  }

  Future<int> getPendingCount() async {
    return repository.getPendingScanCount();
  }
}
