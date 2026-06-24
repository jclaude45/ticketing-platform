class EventEntity {
  final String id;
  final String name;
  final String description;
  final String venue;
  final String? address;
  final DateTime startDate;
  final DateTime endDate;
  final String? bannerUrl;
  final int capacity;
  final int checkedIn;
  final EventStatus status;
  final String? controllerId;
  final String? gate;
  final DateTime? syncedAt;
  final DateTime createdAt;
  final Map<String, dynamic>? extraData;

  const EventEntity({
    required this.id,
    required this.name,
    required this.description,
    required this.venue,
    this.address,
    required this.startDate,
    required this.endDate,
    this.bannerUrl,
    required this.capacity,
    required this.checkedIn,
    required this.status,
    this.controllerId,
    this.gate,
    this.syncedAt,
    required this.createdAt,
    this.extraData,
  });

  double get checkInPercentage =>
      capacity > 0 ? (checkedIn / capacity).clamp(0.0, 1.0) : 0;

  int get remaining => (capacity - checkedIn).clamp(0, capacity);

  bool get isActive => status == EventStatus.active;
  bool get isUpcoming => startDate.isAfter(DateTime.now().toUtc());
  bool get isPast => endDate.isBefore(DateTime.now().toUtc());
  bool get isLive =>
      DateTime.now().toUtc().isAfter(startDate.toUtc()) &&
      DateTime.now().toUtc().isBefore(endDate.toUtc());

  EventEntity copyWith({
    String? id,
    String? name,
    String? description,
    String? venue,
    String? address,
    DateTime? startDate,
    DateTime? endDate,
    String? bannerUrl,
    int? capacity,
    int? checkedIn,
    EventStatus? status,
    String? controllerId,
    String? gate,
    DateTime? syncedAt,
    DateTime? createdAt,
    Map<String, dynamic>? extraData,
  }) {
    return EventEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      venue: venue ?? this.venue,
      address: address ?? this.address,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      bannerUrl: bannerUrl ?? this.bannerUrl,
      capacity: capacity ?? this.capacity,
      checkedIn: checkedIn ?? this.checkedIn,
      status: status ?? this.status,
      controllerId: controllerId ?? this.controllerId,
      gate: gate ?? this.gate,
      syncedAt: syncedAt ?? this.syncedAt,
      createdAt: createdAt ?? this.createdAt,
      extraData: extraData ?? this.extraData,
    );
  }
}

enum EventStatus {
  active,
  upcoming,
  completed,
  cancelled;

  static EventStatus fromString(String value) {
    switch (value.toUpperCase()) {
      case 'PUBLISHED':
      case 'ACTIVE':
        return EventStatus.active;
      case 'DRAFT':
      case 'UPCOMING':
        return EventStatus.upcoming;
      case 'CANCELLED':
      case 'CANCELED':
        return EventStatus.cancelled;
      case 'COMPLETED':
      case 'ENDED':
        return EventStatus.completed;
      default:
        return EventStatus.values.firstWhere(
          (e) => e.name == value.toLowerCase(),
          orElse: () => EventStatus.active,
        );
    }
  }
}
