import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

/// Ticket scanner of the organizer (zcontrole app)
class ControllerMember {
  final String id;
  final String name;
  final String email;
  final bool isActive;
  final bool invitationPending;
  final DateTime? lastLoginAt;
  final int eventsCount;
  final int totalScans;

  const ControllerMember({
    required this.id,
    required this.name,
    required this.email,
    required this.isActive,
    required this.invitationPending,
    required this.lastLoginAt,
    required this.eventsCount,
    required this.totalScans,
  });

  factory ControllerMember.fromJson(Map<String, dynamic> j) => ControllerMember(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    email: j['email'] as String? ?? '',
    isActive: j['isActive'] as bool? ?? false,
    invitationPending: j['invitationPending'] as bool? ?? false,
    lastLoginAt: DateTime.tryParse(j['lastLoginAt']?.toString() ?? ''),
    eventsCount:
        (j['eventsCount'] as num?)?.toInt() ??
        ((j['controllerEvents'] as List?)?.length ?? 0),
    totalScans:
        (j['totalScans'] as num?)?.toInt() ??
        ((j['_count'] as Map?)?['scanValidations'] as num?)?.toInt() ??
        0,
  );
}

/// Person invited to work on the organizer's account
class Collaborator {
  final String id;
  final String email;
  final String? name;
  final String permission;
  final bool pending;

  const Collaborator({
    required this.id,
    required this.email,
    required this.name,
    required this.permission,
    required this.pending,
  });

  factory Collaborator.fromJson(Map<String, dynamic> j) => Collaborator(
    id: j['id'] as String,
    email: j['email'] as String? ?? '',
    name: (j['name'] as String?)?.trim().isEmpty == true
        ? null
        : j['name'] as String?,
    permission: j['permission'] as String? ?? 'VIEWER',
    pending: j['status'] == 'PENDING',
  );
}

const permissionLabels = {
  'ADMIN': 'Administrateur',
  'MANAGER': 'Gestionnaire',
  'TICKETING': 'Billetterie',
  'VIEWER': 'Lecture seule',
};

const permissionHints = {
  'ADMIN':
      'Tout, y compris supprimer des événements et gérer les collaborateurs',
  'MANAGER': 'Événements, équipe, contrôleurs, communication, billets',
  'TICKETING': 'Billets, invitations, exports et scan — consulte le reste',
  'VIEWER': 'Consulte tout, ne modifie rien',
};

class TeamRepository {
  final _api = ApiClient.instance;

  Future<List<ControllerMember>> controllers() async {
    final page =
        await _api.get('/controllers', query: {'limit': 100})
            as Map<String, dynamic>;
    return (page['data'] as List)
        .map((c) => ControllerMember.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  /// Ids of the events a controller is assigned to
  Future<Set<String>> controllerEvents(String id) async {
    final c = await _api.get('/controllers/$id') as Map<String, dynamic>;
    return ((c['controllerEvents'] as List?) ?? [])
        .map((e) => ((e as Map)['event'] as Map)['id'] as String)
        .toSet();
  }

  /// The person gets an e-mail to choose a password (or uses their ZAYA account)
  Future<void> inviteController(
    String name,
    String email,
    List<String> eventIds,
  ) => _api.post('/controllers/invite', {
    'name': name.trim(),
    'email': email.trim().toLowerCase(),
    if (eventIds.isNotEmpty) 'eventIds': eventIds,
  });

  Future<void> setControllerActive(String id, bool active) =>
      _api.patch('/controllers/$id', {'isActive': active});

  Future<void> assign(String id, String eventId) =>
      _api.post('/controllers/$id/events', {'eventId': eventId});

  Future<void> unassign(String id, String eventId) =>
      _api.delete('/controllers/$id/events/$eventId');

  /// Message of the server: removed, or switched off when they already scanned
  Future<String> deleteController(String id) async {
    final r = await _api.delete('/controllers/$id');
    return r is Map && r['message'] is String
        ? r['message'] as String
        : 'Contrôleur retiré.';
  }

  Future<List<Collaborator>> collaborators() async {
    final list = await _api.get('/account/collaborators') as List<dynamic>;
    return list
        .map((c) => Collaborator.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  Future<void> inviteCollaborator(String email, String permission) => _api.post(
    '/account/collaborators',
    {'email': email.trim().toLowerCase(), 'permission': permission},
  );

  Future<void> setPermission(String id, String permission) =>
      _api.patch('/account/collaborators/$id', {'permission': permission});

  Future<void> removeCollaborator(String id) =>
      _api.delete('/account/collaborators/$id');
}

final teamRepository = Provider((_) => TeamRepository());

final controllersProvider = FutureProvider.autoDispose<List<ControllerMember>>(
  (ref) => ref.watch(teamRepository).controllers(),
);

final collaboratorsProvider = FutureProvider.autoDispose<List<Collaborator>>(
  (ref) => ref.watch(teamRepository).collaborators(),
);
