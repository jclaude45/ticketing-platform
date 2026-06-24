import '../entities/event_entity.dart';
import '../repositories/events_repository.dart';

class GetAssignedEvents {
  final EventsRepository repository;

  const GetAssignedEvents({required this.repository});

  Future<List<EventEntity>> call({bool forceRefresh = false}) async {
    return repository.getAssignedEvents(forceRefresh: forceRefresh);
  }
}
