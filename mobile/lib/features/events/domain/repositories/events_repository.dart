import '../entities/event_entity.dart';
import '../entities/offline_pack.dart';

abstract class EventsRepository {
  Future<List<EventEntity>> getAssignedEvents({bool forceRefresh = false});
  Future<EventEntity> getEventDetail(String eventId);
  Future<void> syncEvents();
  /// Downloads (or brings up to date) the event's tickets for offline checks.
  Future<OfflinePackInfo> downloadEventTickets(String eventId);
  Future<OfflinePackInfo?> getOfflinePackInfo(String eventId);

  /// Downloads / brings up to date the ticket lists of every assigned event that is not
  /// over, so scanning keeps working if the network drops. Stops at the first network
  /// error (rethrown); other per-event errors are skipped.
  Future<void> prepareOfflinePacks();
  Future<int> getLocalTicketCount(String eventId);
}
