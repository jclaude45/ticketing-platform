import '../data/sync_repository_impl.dart';

class SyncUsecase {
  final SyncRepositoryImpl repository;

  const SyncUsecase({required this.repository});

  Future<SyncResult> call() async {
    return repository.syncAll();
  }
}

class SyncResult {
  final bool success;
  final int scansUploaded;
  final int eventsUpdated;
  final String? error;

  const SyncResult({
    required this.success,
    required this.scansUploaded,
    required this.eventsUpdated,
    this.error,
  });

  const SyncResult.empty()
      : success = true,
        scansUploaded = 0,
        eventsUpdated = 0,
        error = null;
}
