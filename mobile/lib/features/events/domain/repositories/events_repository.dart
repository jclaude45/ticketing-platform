import '../entities/event_entity.dart';
import '../entities/offline_pack.dart';

abstract class EventsRepository {
  Future<List<EventEntity>> getAssignedEvents({bool forceRefresh = false});
  Future<EventEntity> getEventDetail(String eventId);
  Future<void> syncEvents();
  /// Downloads (or brings up to date) the event's tickets for offline checks.
  Future<OfflinePackInfo> downloadEventTickets(String eventId);
  Future<OfflinePackInfo?> getOfflinePackInfo(String eventId);

  /// Brings every downloaded list up to date; failures are ignored (next time).
  Future<void> refreshOfflinePacks();
  Future<int> getLocalTicketCount(String eventId);
}
