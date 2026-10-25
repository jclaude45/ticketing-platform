import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/api_exception.dart';
import 'push.dart';
import 'storage.dart';

/// Signed-in organizer, and the account they work on (their own or, as a collaborator,
/// another organizer's)
class SessionUser {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;
  final Workspace? workspace;

  const SessionUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
    this.workspace,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory SessionUser.fromJson(
    Map<String, dynamic> j, {
    Workspace? workspace,
  }) => SessionUser(
    id: j['id'] as String,
    email: j['email'] as String? ?? '',
    firstName: j['firstName'] as String? ?? '',
    lastName: j['lastName'] as String? ?? '',
    role: j['role'] as String? ?? 'ORGANIZER',
    workspace: workspace,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'firstName': firstName,
    'lastName': lastName,
    'role': role,
  };

  SessionUser withWorkspace(Workspace? w) => SessionUser(
    id: id,
    email: email,
    firstName: firstName,
    lastName: lastName,
    role: role,
    workspace: w,
  );
}

/// Organizer account shared with the signed-in person (GET /workspaces)
class Workspace {
  final String ownerId;
  final String ownerName;
  final String ownerEmail;
  final String permission;

  const Workspace({
    required this.ownerId,
    required this.ownerName,
    required this.ownerEmail,
    required this.permission,
  });

  factory Workspace.fromJson(Map<String, dynamic> j) => Workspace(
    ownerId: j['ownerId'] as String,
    ownerName: (j['ownerName'] as String?)?.trim().isNotEmpty == true
        ? j['ownerName'] as String
        : j['ownerEmail'] as String? ?? '',
    ownerEmail: j['ownerEmail'] as String? ?? '',
    permission: j['permission'] as String? ?? 'VIEWER',
  );

  String get permissionLabel => switch (permission) {
    'ADMIN' => 'Administrateur',
    'MANAGER' => 'Gestionnaire',
    'TICKETING' => 'Billetterie',
    _ => 'Lecture seule',
  };
}

sealed class SessionState {
  const SessionState();
}

class SessionLoading extends SessionState {
  const SessionLoading();
}

class SignedOut extends SessionState {
  /// Why the person is back on the sign-in screen (session expired…), shown once
  final String? reason;
  const SignedOut([this.reason]);
}

class SignedIn extends SessionState {
  final SessionUser user;
  const SignedIn(this.user);
}

/// Result of the first sign-in step: done, or the 6-digit code of the authenticator app is needed
enum LoginStep { done, needsCode }

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

class SessionController extends Notifier<SessionState> {
  final _api = ApiClient.instance;
  final _store = SecureStore.instance;
  StreamSubscription<void>? _expired;

  @override
  SessionState build() {
    _expired = _api.sessionExpired.stream.listen(
      (_) =>
          state = const SignedOut('Votre session a expiré. Reconnectez-vous.'),
    );
    ref.onDispose(() => _expired?.cancel());
    _restore();
    return const SessionLoading();
  }

  Future<void> _restore() async {
    final saved = await _store.user;
    if (saved == null || await _store.refreshToken == null) {
      state = const SignedOut();
      return;
    }
    final ws = await _store.workspace;
    var user = SessionUser.fromJson(saved);
    if (ws != null) user = user.withWorkspace(await _findWorkspace(ws));
    // Shown at once from the phone (works offline); refreshed from the server behind
    state = SignedIn(user);
    unawaited(Push.instance.register());
    try {
      final me = await _api.get('/auth/me') as Map<String, dynamic>;
      final fresh = SessionUser.fromJson(me, workspace: user.workspace);
      await _store.saveUser(fresh.toJson());
      state = SignedIn(fresh);
    } catch (_) {
      // Offline or expired: an expired session is handled by ApiClient.sessionExpired
    }
  }

  Future<Workspace?> _findWorkspace(String ownerId) async {
    try {
      final list = await workspaces();
      return list.where((w) => w.ownerId == ownerId).firstOrNull;
    } catch (_) {
      return Workspace(
        ownerId: ownerId,
        ownerName: 'Espace partagé',
        ownerEmail: '',
        permission: 'VIEWER',
      );
    }
  }

  Future<LoginStep> login(String email, String password, {String? code}) async {
    try {
      final body =
          await _api.post('/auth/login', {
                'email': email.trim(),
                'password': password,
                if (code != null) 'totpCode': code.trim(),
              })
              as Map<String, dynamic>;
      if (body['requiresTwoFactor'] == true) return LoginStep.needsCode;
      final user = SessionUser.fromJson(body['user'] as Map<String, dynamic>);
      if (user.role == 'CONTROLLER') {
        throw const ApiException(
          'Ce compte est un compte contrôleur : utilisez l’application zcontrole.',
        );
      }
      await _store.saveTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String?,
      );
      await _store.saveUser(user.toJson());
      await _store.saveWorkspace(null);
      state = SignedIn(user);
      unawaited(Push.instance.register());
      return LoginStep.done;
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  Future<List<Workspace>> workspaces() async {
    final list = await _api.get('/workspaces') as List<dynamic>;
    return list
        .map((w) => Workspace.fromJson(w as Map<String, dynamic>))
        .toList();
  }

  /// Work on another organizer's account (as a collaborator), or back on one's own (null)
  Future<void> switchWorkspace(Workspace? w) async {
    final current = state;
    if (current is! SignedIn) return;
    await _store.saveWorkspace(w?.ownerId);
    state = SignedIn(current.user.withWorkspace(w));
  }

  Future<void> logout() async {
    // While the session is still valid: the server forgets this phone
    await Push.instance.unregister();
    try {
      await _api.post('/auth/logout');
    } catch (_) {
      // Signed out on the phone anyway; the server session expires by itself
    }
    await _store.clear();
    state = const SignedOut();
  }
}
