import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/api_exception.dart';
import 'storage.dart';

/// Signed-in buyer (GET /customer/me)
class Customer {
  final String id;
  final String phone;
  final String? firstName;
  final String? lastName;
  final String? email;
  final String language;
  final String? commune;
  final List<String> interests;
  final bool promoNotifications;
  final bool locationInUse;
  final bool locationAlways;
  final bool visibleToFriends;

  const Customer({
    required this.id,
    required this.phone,
    this.firstName,
    this.lastName,
    this.email,
    this.language = 'fr',
    this.commune,
    this.interests = const [],
    this.promoNotifications = false,
    this.locationInUse = false,
    this.locationAlways = false,
    this.visibleToFriends = false,
  });

  String get fullName => [firstName, lastName].whereType<String>().join(' ').trim();

  factory Customer.fromJson(Map<String, dynamic> j) {
    final c = (j['consents'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Customer(
      id: j['id'] as String,
      phone: j['phone'] as String? ?? '',
      firstName: j['firstName'] as String?,
      lastName: j['lastName'] as String?,
      email: j['email'] as String?,
      language: j['language'] as String? ?? 'fr',
      commune: j['commune'] as String?,
      interests: (j['interests'] as List?)?.cast<String>() ?? const [],
      promoNotifications: c['promoNotifications'] == true,
      locationInUse: c['locationInUse'] == true,
      locationAlways: c['locationAlways'] == true,
      visibleToFriends: c['visibleToFriends'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'phone': phone,
    'firstName': firstName,
    'lastName': lastName,
    'email': email,
    'language': language,
    'commune': commune,
    'interests': interests,
    'consents': {
      'promoNotifications': promoNotifications,
      'locationInUse': locationInUse,
      'locationAlways': locationAlways,
      'visibleToFriends': visibleToFriends,
    },
  };
}

sealed class SessionState {
  const SessionState();
}

class SessionLoading extends SessionState {
  const SessionLoading();
}

/// Browsing without an account; `ended` when the server closed the session (another phone)
class SignedOut extends SessionState {
  final bool ended;
  const SignedOut({this.ended = false});
}

class SignedIn extends SessionState {
  final Customer customer;
  const SignedIn(this.customer);
}

/// Result of a right code: the account, and whether a name is still to be asked
typedef VerifyResult = ({Customer customer, bool needsName});

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
      (_) => state = const SignedOut(ended: true),
    );
    ref.onDispose(() => _expired?.cancel());
    _restore();
    return const SessionLoading();
  }

  Customer? get customer => switch (state) {
    SignedIn(:final customer) => customer,
    _ => null,
  };

  Future<void> _restore() async {
    final saved = await _store.customer;
    if (saved == null || await _store.refreshToken == null) {
      state = const SignedOut();
      return;
    }
    // Shown at once from the phone (works offline); refreshed from the server behind
    state = SignedIn(Customer.fromJson(saved));
    try {
      await _apply(await _api.get('/customer/me') as Map<String, dynamic>);
    } catch (_) {
      // Offline, or the session is over (handled through sessionExpired)
    }
  }

  /// Sends the code; returns the number in international form and the seconds before a resend
  Future<({String phone, int resendIn})> requestCode(String phone) async {
    try {
      final r = await _api.post('/customer/auth/code', {'phone': phone.trim()})
          as Map<String, dynamic>;
      return (
        phone: r['phone'] as String,
        resendIn: (r['resendIn'] as num?)?.toInt() ?? 60,
      );
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  Future<VerifyResult> verify(String phone, String code) async {
    try {
      final r = await _api.post('/customer/auth/verify', {
        'phone': phone,
        'code': code.trim(),
        'platform': defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios'
            : 'android',
      }) as Map<String, dynamic>;
      await _store.saveTokens(
        r['accessToken'] as String,
        r['refreshToken'] as String,
      );
      final customer = await _apply(r['customer'] as Map<String, dynamic>);
      return (customer: customer, needsName: r['isNew'] == true);
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Changes a part of the profile (only the fields given)
  Future<Customer> update(Map<String, dynamic> fields) async {
    try {
      return await _apply(
        await _api.patch('/customer/me', fields) as Map<String, dynamic>,
      );
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  Future<void> logout() async {
    try {
      await _api.post('/customer/auth/logout');
    } catch (_) {
      // Signed out on the phone anyway; the server session expires by itself
    }
    await _store.clearSession();
    state = const SignedOut();
  }

  Future<void> deleteAccount() async {
    try {
      await _api.delete('/customer/me');
    } catch (e) {
      throw ApiException.from(e);
    }
    await _store.clearSession();
    state = const SignedOut();
  }

  Future<Customer> _apply(Map<String, dynamic> json) async {
    final c = Customer.fromJson(json);
    await _store.saveCustomer(c.toJson());
    state = SignedIn(c);
    return c;
  }
}
