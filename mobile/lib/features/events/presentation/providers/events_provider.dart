import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/entities/event_entity.dart';
import '../../domain/usecases/get_assigned_events.dart';
import '../../domain/usecases/sync_events.dart';

// Events list state
class EventsState {
  final List<EventEntity> events;
  final bool isLoading;
  final bool isSyncing;
  final String? error;
  final DateTime? lastSyncAt;

  const EventsState({
    this.events = const [],
    this.isLoading = false,
    this.isSyncing = false,
    this.error,
    this.lastSyncAt,
  });

  EventsState copyWith({
    List<EventEntity>? events,
    bool? isLoading,
    bool? isSyncing,
    String? error,
    DateTime? lastSyncAt,
  }) {
    return EventsState(
      events: events ?? this.events,
      isLoading: isLoading ?? this.isLoading,
      isSyncing: isSyncing ?? this.isSyncing,
      error: error,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
    );
  }
}

class EventsNotifier extends StateNotifier<EventsState> {
  final GetAssignedEvents _getEvents;
  final SyncEvents _syncEvents;

  EventsNotifier({
    required GetAssignedEvents getEvents,
    required SyncEvents syncEvents,
  })  : _getEvents = getEvents,
        _syncEvents = syncEvents,
        super(const EventsState());

  Future<void> loadEvents({bool forceRefresh = false}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final events = await _getEvents(forceRefresh: forceRefresh);
      state = state.copyWith(
        events: events,
        isLoading: false,
        lastSyncAt: forceRefresh ? DateTime.now() : state.lastSyncAt,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString().replaceAll('Exception: ', ''),
      );
    }
  }

  Future<void> sync() async {
    state = state.copyWith(isSyncing: true, error: null);
    try {
      await _syncEvents();
      final events = await _getEvents(forceRefresh: true);
      state = state.copyWith(
        events: events,
        isSyncing: false,
        lastSyncAt: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        isSyncing: false,
        error: e.toString().replaceAll('Exception: ', ''),
      );
    }
  }

  Future<void> downloadTickets(String eventId) async {
    try {
      await _syncEvents.downloadTickets(eventId);
    } catch (e) {
      state = state.copyWith(
        error: 'Failed to download tickets: ${e.toString()}',
      );
    }
  }

  EventEntity? getEvent(String id) {
    try {
      return state.events.firstWhere((e) => e.id == id);
    } catch (_) {
      return null;
    }
  }

  void clearError() => state = state.copyWith(error: null);
}

final eventsNotifierProvider =
    StateNotifierProvider<EventsNotifier, EventsState>((ref) {
  return EventsNotifier(
    getEvents: getIt<GetAssignedEvents>(),
    syncEvents: getIt<SyncEvents>(),
  );
});

final selectedEventProvider = StateProvider<String?>((ref) => null);

final eventByIdProvider = Provider.family<EventEntity?, String>((ref, id) {
  return ref.watch(eventsNotifierProvider.notifier).getEvent(id);
});
