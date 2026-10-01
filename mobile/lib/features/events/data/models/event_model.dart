import 'dart:convert';

import '../../domain/entities/event_entity.dart';

class EventModel extends EventEntity {
  const EventModel({
    required super.id,
    required super.name,
    required super.description,
    required super.venue,
    super.address,
    required super.startDate,
    required super.endDate,
    super.bannerUrl,
    required super.capacity,
    required super.checkedIn,
    required super.status,
    super.controllerId,
    super.gate,
    super.syncedAt,
    required super.createdAt,
    super.extraData,
  });

  factory EventModel.fromJson(Map<String, dynamic> json) {
    // Support both camelCase (backend API) and snake_case (local DB)
    final startDateRaw = json['startDate'] as String? ?? json['start_date'] as String?;
    final endDateRaw = json['endDate'] as String? ?? json['end_date'] as String?;
    final createdAtRaw = json['createdAt'] as String? ?? json['created_at'] as String?;

    // /controller-space/events/:id returns { stats: { checkedIn, totalTickets, myScans, myValidScans } }
    final stats = json['stats'] as Map<String, dynamic>?;
    final checkedIn = stats?['checkedIn'] as int? ?? json['checkedIn'] as int? ?? json['checked_in'] as int? ?? 0;
    final address = [json['address'], json['city']]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .join(', ');

    return EventModel(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      venue: json['venue'] as String? ?? '',
      address: address.isEmpty ? null : address,
      startDate: DateTime.parse(startDateRaw ?? DateTime.now().toIso8601String()),
      endDate: DateTime.parse(endDateRaw ?? DateTime.now().toIso8601String()),
      bannerUrl: json['bannerUrl'] as String? ?? json['banner_url'] as String?,
      capacity: json['totalCapacity'] as int? ?? json['capacity'] as int? ?? 0,
      checkedIn: checkedIn,
      status: EventStatus.fromString(json['status'] as String? ?? 'DRAFT'),
      controllerId: json['controllerId'] as String? ?? json['controller_id'] as String?,
      gate: json['gate'] as String?,
      syncedAt: null,
      createdAt: createdAtRaw != null ? DateTime.parse(createdAtRaw) : DateTime.now(),
      // The controller's own counters, shown on the event screen
      extraData: stats == null
          ? null
          : {
              'myScans': stats['myScans'] as int? ?? 0,
              'myValidScans': stats['myValidScans'] as int? ?? 0,
              // Tickets that can enter (valid + used); absent from older servers
              if (stats['totalTickets'] is int) 'totalTickets': stats['totalTickets'] as int,
            },
    );
  }

  Map<String, dynamic> toDbMap() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'venue': venue,
      'start_date': startDate.toIso8601String(),
      'end_date': endDate.toIso8601String(),
      'banner_url': bannerUrl,
      'capacity': capacity,
      'checked_in': checkedIn,
      'status': status.name,
      'controller_id': controllerId,
      'gate': gate,
      'sync_at': syncedAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
      'data': extraData != null ? jsonEncode(extraData) : null,
    };
  }

  factory EventModel.fromDbMap(Map<String, dynamic> map) {
    Map<String, dynamic>? extraData;
    if (map['data'] != null) {
      try {
        extraData = jsonDecode(map['data'] as String) as Map<String, dynamic>;
      } catch (_) {}
    }

    return EventModel(
      id: map['id'] as String,
      name: map['name'] as String,
      description: map['description'] as String? ?? '',
      venue: map['venue'] as String? ?? '',
      startDate: DateTime.parse(map['start_date'] as String),
      endDate: DateTime.parse(map['end_date'] as String),
      bannerUrl: map['banner_url'] as String?,
      capacity: map['capacity'] as int? ?? 0,
      checkedIn: map['checked_in'] as int? ?? 0,
      status: EventStatus.fromString(map['status'] as String? ?? 'active'),
      controllerId: map['controller_id'] as String?,
      gate: map['gate'] as String?,
      syncedAt: map['sync_at'] != null
          ? DateTime.parse(map['sync_at'] as String)
          : null,
      createdAt: DateTime.parse(map['created_at'] as String),
      extraData: extraData,
    );
  }
}
