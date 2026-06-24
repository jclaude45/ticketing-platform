import '../../domain/entities/user_entity.dart';

class AuthResponseModel {
  final String accessToken;
  final String refreshToken;
  final UserModel user;

  const AuthResponseModel({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory AuthResponseModel.fromJson(Map<String, dynamic> json) {
    // Handle TransformInterceptor wrapper: { success, statusCode, data, timestamp }
    final payload = json['data'] as Map<String, dynamic>? ?? json;
    return AuthResponseModel(
      accessToken: payload['accessToken'] as String,
      refreshToken: payload['refreshToken'] as String? ?? '',
      user: UserModel.fromJson(payload['user'] as Map<String, dynamic>),
    );
  }
}

class UserModel extends UserEntity {
  const UserModel({
    required super.id,
    required super.name,
    required super.email,
    required super.role,
    super.avatarUrl,
    super.badge,
    super.assignedEventIds,
    super.gate,
    required super.createdAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    final firstName = json['firstName'] as String? ?? '';
    final lastName = json['lastName'] as String? ?? '';
    final name = json['name'] as String? ?? '$firstName $lastName'.trim();

    return UserModel(
      id: json['id'] as String,
      name: name.isEmpty ? json['email'] as String : name,
      email: json['email'] as String,
      role: (json['role'] as String? ?? 'controller').toLowerCase(),
      avatarUrl: json['avatar'] as String? ?? json['avatarUrl'] as String?,
      badge: json['badge'] as String?,
      assignedEventIds:
          (json['assigned_event_ids'] as List<dynamic>?)
                  ?.map((e) => e as String)
                  .toList() ??
              [],
      gate: json['gate'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'] as String)
          : json['created_at'] != null
              ? DateTime.parse(json['created_at'] as String)
              : DateTime.now(),
    );
  }

  @override
  Map<String, dynamic> toJson() => super.toJson();
}
