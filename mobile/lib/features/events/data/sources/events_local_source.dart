import '../../../../core/storage/local_database.dart';
import '../../domain/entities/offline_pack.dart';
import '../models/event_model.dart';

abstract class EventsLocalSource {
  Future<List<EventModel>> getEvents();
  Future<EventModel?> getEvent(String id);
  Future<void> saveEvents(List<EventModel> events);
  Future<void> saveEvent(EventModel event);
  Future<void> updateCheckedIn(String eventId, int checkedIn);
  Future<int> getLocalTicketCount(String eventId);
  Future<void> saveOfflinePack(String eventId, List<Map<String, dynamic>> tickets, {required bool full, required String generatedAt});
  Future<OfflinePackInfo?> getOfflinePack(String eventId);
  Future<String?> getOfflinePackGeneratedAt(String eventId);
  Future<List<String>> getOfflinePackEventIds();
}

class EventsLocalSourceImpl implements EventsLocalSource {
  final LocalDatabase database;

  const EventsLocalSourceImpl({required this.database});

  @override
  Future<List<EventModel>> getEvents() async {
    final maps = await database.getEvents();
    return maps.map(EventModel.fromDbMap).toList();
  }

  @override
  Future<EventModel?> getEvent(String id) async {
    final map = await database.getEvent(id);
    if (map == null) return null;
    return EventModel.fromDbMap(map);
  }

  @override
  Future<void> saveEvents(List<EventModel> events) async {
    final maps = events.map((e) => e.toDbMap()).toList();
    await database.insertEvents(maps);
  }

  @override
  Future<void> saveEvent(EventModel event) async {
    await database.insertEvent(event.toDbMap());
  }

  @override
  Future<void> updateCheckedIn(String eventId, int checkedIn) async {
    await database.updateEventStats(eventId, checkedIn: checkedIn);
  }

  @override
  Future<int> getLocalTicketCount(String eventId) async {
    return database.getTicketCount(eventId);
  }

  @override
  Future<void> saveOfflinePack(String eventId, List<Map<String, dynamic>> tickets, {required bool full, required String generatedAt}) {
    return database.saveOfflinePack(eventId, tickets, full: full, generatedAt: generatedAt);
  }

  @override
  Future<String?> getOfflinePackGeneratedAt(String eventId) async {
    return (await database.getOfflinePack(eventId))?['generated_at'] as String?;
  }

  @override
  Future<OfflinePackInfo?> getOfflinePack(String eventId) async {
    final generatedAt = await getOfflinePackGeneratedAt(eventId);
    if (generatedAt == null) return null;
    return OfflinePackInfo(
      ticketCount: await database.getTicketCount(eventId),
      generatedAt: DateTime.parse(generatedAt).toLocal(),
    );
  }

  @override
  Future<List<String>> getOfflinePackEventIds() => database.getOfflinePackEventIds();
}
