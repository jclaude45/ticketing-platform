import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../models/event_model.dart';

abstract class EventsRemoteSource {
  Future<List<EventModel>> getAssignedEvents();
  Future<EventModel> getEventDetail(String eventId);
  Future<List<Map<String, dynamic>>> downloadEventTickets(String eventId);
}

class EventsRemoteSourceImpl implements EventsRemoteSource {
  final DioClient dioClient;

  const EventsRemoteSourceImpl({required this.dioClient});

  @override
  Future<List<EventModel>> getAssignedEvents() async {
    try {
      final response = await dioClient.get(ApiEndpoints.assignedEvents);
      final wrapper = response.data as Map<String, dynamic>? ?? {};
      // Backend: TransformInterceptor wraps as { data: { data: [...], meta: {} } }
      final payload = wrapper['data'];
      List<dynamic> list;
      if (payload is List) {
        list = payload;
      } else if (payload is Map) {
        list = payload['data'] as List<dynamic>? ??
            payload['events'] as List<dynamic>? ?? [];
      } else {
        list = [];
      }
      return list
          .map((e) => EventModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      if (e is ServerException || e is NetworkException) rethrow;
      throw ServerException(message: 'Failed to fetch events: ${e.toString()}');
    }
  }

  @override
  Future<EventModel> getEventDetail(String eventId) async {
    try {
      final response = await dioClient.get(ApiEndpoints.eventDetail(eventId));
      final wrapper = response.data as Map<String, dynamic>? ?? {};
      final payload = wrapper['data'] as Map<String, dynamic>? ?? wrapper;
      return EventModel.fromJson(payload);
    } catch (e) {
      if (e is ServerException || e is NetworkException) rethrow;
      throw ServerException(
          message: 'Failed to fetch event detail: ${e.toString()}');
    }
  }

  @override
  Future<List<Map<String, dynamic>>> downloadEventTickets(
      String eventId) async {
    try {
      final response = await dioClient.get(
        ApiEndpoints.downloadEventTickets(eventId),
      );
      final wrapper = response.data as Map<String, dynamic>? ?? {};
      final payload = wrapper['data'];
      List<dynamic> list;
      if (payload is List) {
        list = payload;
      } else if (payload is Map) {
        list = payload['data'] as List<dynamic>? ??
            payload['tickets'] as List<dynamic>? ?? [];
      } else {
        list = [];
      }
      return list.map((e) => e as Map<String, dynamic>).toList();
    } catch (e) {
      if (e is ServerException || e is NetworkException) rethrow;
      throw ServerException(
          message: 'Failed to download tickets: ${e.toString()}');
    }
  }
}
