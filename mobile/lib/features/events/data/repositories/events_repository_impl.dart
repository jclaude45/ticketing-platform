import '../../domain/entities/event_entity.dart';
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
    if (!forceRefresh) {
      // Try local first
      try {
        final localEvents = await localSource.getEvents();
        if (localEvents.isNotEmpty) {
          return localEvents;
        }
      } catch (_) {}
    }

    // Fetch from remote
    try {
      final remoteEvents = await remoteSource.getAssignedEvents();
      await localSource.saveEvents(remoteEvents);
      return remoteEvents;
    } on NetworkException {
      // Fall back to local on network error
      final localEvents = await localSource.getEvents();
      return localEvents;
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
  Future<void> downloadEventTickets(String eventId) async {
    // Stub for downloading ticket list for offline validation
    // The actual implementation saves tickets to the local DB
    await remoteSource.downloadEventTickets(eventId);
  }

  @override
  Future<int> getLocalTicketCount(String eventId) async {
    return localSource.getLocalTicketCount(eventId);
  }
}
