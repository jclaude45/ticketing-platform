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
  Future<void> downloadEventTickets(String eventId) async {
    // Offline validation needs a server route to export an event's tickets (next batch)
    throw const ServerException(message: 'Le mode hors connexion sera disponible dans une prochaine version.');
  }

  @override
  Future<int> getLocalTicketCount(String eventId) async {
    return localSource.getLocalTicketCount(eventId);
  }
}
