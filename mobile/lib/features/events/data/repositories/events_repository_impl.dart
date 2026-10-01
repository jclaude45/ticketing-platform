import '../../domain/entities/event_entity.dart';
import '../../domain/entities/offline_pack.dart';
import '../../domain/repositories/events_repository.dart';
import '../sources/events_local_source.dart';
import '../sources/events_remote_source.dart';
import '../../../../core/error/exceptions.dart';

class EventsRepositoryImpl implements EventsRepository {
  final EventsRemoteSource remoteSource;
  final EventsLocalSource localSource;

  const EventsRepositoryImpl({
    required this.remoteSource,
    required this.localSource,
  });

  @override
  Future<List<EventEntity>> getAssignedEvents({bool forceRefresh = false}) async {
    // Server first (assignments change), the cached list only when offline
    try {
      final remoteEvents = await remoteSource.getAssignedEvents();
      await localSource.saveEvents(remoteEvents);
      return remoteEvents;
    } on NetworkException {
      final localEvents = await localSource.getEvents();
      if (localEvents.isNotEmpty) return localEvents;
      rethrow;
    }
  }

  @override
  Future<EventEntity> getEventDetail(String eventId) async {
    try {
      final remote = await remoteSource.getEventDetail(eventId);
      await localSource.saveEvent(remote);
      return remote;
    } on NetworkException {
      final local = await localSource.getEvent(eventId);
      if (local != null) return local;
      rethrow;
    }
  }

  @override
  Future<void> syncEvents() async {
    final events = await remoteSource.getAssignedEvents();
    await localSource.saveEvents(events);
  }

  @override
  Future<OfflinePackInfo> downloadEventTickets(String eventId) async {
    // Only the changes since the previous list, when there is one
    final since = await localSource.getOfflinePackGeneratedAt(eventId);
    final pack = await remoteSource.getOfflineTickets(eventId, since: since);
    final tickets = (pack['tickets'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
    await localSource.saveOfflinePack(
      eventId,
      tickets,
      full: pack['full'] == true,
      generatedAt: pack['generatedAt'] as String,
    );
    return (await localSource.getOfflinePack(eventId))!;
  }

  @override
  Future<OfflinePackInfo?> getOfflinePackInfo(String eventId) => localSource.getOfflinePack(eventId);

  @override
  Future<void> prepareOfflinePacks() async {
    final events = await remoteSource.getAssignedEvents();
    await localSource.saveEvents(events);
    final cutoff = DateTime.now().subtract(const Duration(hours: 12));
    for (final event in events.where((e) => e.endDate.isAfter(cutoff))) {
      try {
        await downloadEventTickets(event.id);
      } on NetworkException {
        rethrow;
      } catch (_) {
        // e.g. no longer assigned: the other events still get their list
      }
    }
  }

  @override
  Future<int> getLocalTicketCount(String eventId) async {
    return localSource.getLocalTicketCount(eventId);
  }
}
