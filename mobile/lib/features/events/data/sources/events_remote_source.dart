import 'package:dio/dio.dart';

import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../models/event_model.dart';

abstract class EventsRemoteSource {
  Future<List<EventModel>> getAssignedEvents();
  Future<EventModel> getEventDetail(String eventId);
  Future<Map<String, dynamic>> getOfflineTickets(String eventId, {String? since});
}

/// Events assigned to the logged-in controller (`/controller-space`, the only event
/// routes a CONTROLLER session may call).
class EventsRemoteSourceImpl implements EventsRemoteSource {
  final DioClient dioClient;

  const EventsRemoteSourceImpl({required this.dioClient});

  @override
  Future<List<EventModel>> getAssignedEvents() async {
    try {
      final response = await dioClient.get(ApiEndpoints.assignedEvents);
      final body = response.data as Map<String, dynamic>? ?? {};
      final list = body['data'] as List<dynamic>? ?? const [];
      return list.map((e) => EventModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (e) {
      throw toAppException(e);
    }
  }

  @override
  Future<EventModel> getEventDetail(String eventId) async {
    try {
      final response = await dioClient.get(ApiEndpoints.eventDetail(eventId));
      final body = response.data as Map<String, dynamic>? ?? {};
      return EventModel.fromJson(body['data'] as Map<String, dynamic>? ?? body);
    } catch (e) {
      throw toAppException(e);
    }
  }

  @override
  Future<Map<String, dynamic>> getOfflineTickets(String eventId, {String? since}) async {
    try {
      final response = await dioClient.get(
        ApiEndpoints.offlineTickets(eventId),
        queryParameters: {if (since != null) 'since': since},
        // A large event can be several thousand tickets on a slow network
        options: Options(receiveTimeout: const Duration(minutes: 2)),
      );
      final body = response.data as Map<String, dynamic>? ?? {};
      return body['data'] as Map<String, dynamic>? ?? body;
    } catch (e) {
      throw toAppException(e);
    }
  }
}
