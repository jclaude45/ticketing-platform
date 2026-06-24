class UserEntity {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? avatarUrl;
  final String? badge;
  final List<String> assignedEventIds;
  final String? gate;
  final DateTime createdAt;

  const UserEntity({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.avatarUrl,
    this.badge,
    this.assignedEventIds = const [],
    this.gate,
    required this.createdAt,
  });

  String get displayName => name;
  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    }
    return name.substring(0, name.length > 1 ? 2 : 1).toUpperCase();
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'avatar_url': avatarUrl,
        'badge': badge,
        'assigned_event_ids': assignedEventIds,
        'gate': gate,
        'created_at': createdAt.toIso8601String(),
      };

  factory UserEntity.fromJson(Map<String, dynamic> json) => UserEntity(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        role: json['role'] as String? ?? 'controller',
        avatarUrl: json['avatar_url'] as String?,
        badge: json['badge'] as String?,
        assignedEventIds: (json['assigned_event_ids'] as List<dynamic>?)
                ?.map((e) => e as String)
                .toList() ??
            [],
        gate: json['gate'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  UserEntity copyWith({
    String? id,
    String? name,
    String? email,
    String? role,
    String? avatarUrl,
    String? badge,
    List<String>? assignedEventIds,
    String? gate,
    DateTime? createdAt,
  }) {
    return UserEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      role: role ?? this.role,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      badge: badge ?? this.badge,
      assignedEventIds: assignedEventIds ?? this.assignedEventIds,
      gate: gate ?? this.gate,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
