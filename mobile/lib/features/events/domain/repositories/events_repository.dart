import '../entities/event_entity.dart';

abstract class EventsRepository {
  Future<List<EventEntity>> getAssignedEvents({bool forceRefresh = false});
  Future<EventEntity> getEventDetail(String eventId);
  Future<void> syncEvents();
  Future<void> downloadEventTickets(String eventId);
  Future<int> getLocalTicketCount(String eventId);
}
