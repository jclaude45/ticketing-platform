import '../repositories/events_repository.dart';

class SyncEvents {
  final EventsRepository repository;

  const SyncEvents({required this.repository});

  Future<void> call() async {
    await repository.syncEvents();
  }
}
