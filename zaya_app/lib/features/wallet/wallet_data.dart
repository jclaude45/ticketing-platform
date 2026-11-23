import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/session.dart';
import '../../core/storage.dart';

/// Ticket of the wallet (GET /customer/tickets)
class WalletTicket {
  final String id;
  final String serial;
  final String status;
  final String? holderName;
  final String category;
  final String color;
  final double price;
  final String currency;
  final DateTime? checkedInAt;

  /// What the QR holds; null when the ticket can no longer enter (used, cancelled)
  final String? qr;
  final String eventId;
  final String eventName;
  final String venue;
  final String city;
  final DateTime start;
  final DateTime end;
  final String? bannerUrl;

  const WalletTicket({
    required this.id,
    required this.serial,
    required this.status,
    this.holderName,
    required this.category,
    required this.color,
    required this.price,
    required this.currency,
    this.checkedInAt,
    this.qr,
    required this.eventId,
    required this.eventName,
    required this.venue,
    required this.city,
    required this.start,
    required this.end,
    this.bannerUrl,
  });

  /// Still to come (or on now): over 6 hours after its end it goes to « Passés »
  bool get upcoming =>
      end.add(const Duration(hours: 6)).isAfter(DateTime.now()) &&
      status == 'VALID';

  factory WalletTicket.fromJson(Map<String, dynamic> j) {
    final e = j['event'] as Map<String, dynamic>;
    return WalletTicket(
      id: j['id'] as String,
      serial: j['serialNumber'] as String? ?? '',
      status: j['status'] as String? ?? 'VALID',
      holderName: j['holderName'] as String?,
      category: j['category'] as String? ?? '',
      color: j['color'] as String? ?? '#1a1a2e',
      price: (j['price'] as num?)?.toDouble() ?? 0,
      currency: j['currency'] as String? ?? 'USD',
      checkedInAt: DateTime.tryParse(j['checkedInAt'] as String? ?? ''),
      qr: j['qr'] as String?,
      eventId: e['id'] as String,
      eventName: e['name'] as String? ?? '',
      venue: e['venue'] as String? ?? '',
      city: e['city'] as String? ?? '',
      start: DateTime.parse(e['startDate'] as String),
      end: DateTime.parse(e['endDate'] as String),
      bannerUrl: e['bannerUrl'] as String?,
    );
  }
}

/// The wallet: the last copy kept on the phone, refreshed from the server when it can
class WalletState {
  final bool signedIn;
  final List<WalletTicket> tickets;

  /// When the copy shown was received; null before the first load
  final DateTime? savedAt;
  final bool loading;

  /// Why the last refresh failed (offline…); the copy stays shown
  final ApiException? error;

  const WalletState({
    this.signedIn = true,
    this.tickets = const [],
    this.savedAt,
    this.loading = false,
    this.error,
  });

  static const signedOut = WalletState(signedIn: false);

  WalletState copyWith({
    List<WalletTicket>? tickets,
    DateTime? savedAt,
    bool? loading,
    ApiException? error,
    bool clearError = false,
  }) => WalletState(
    signedIn: signedIn,
    tickets: tickets ?? this.tickets,
    savedAt: savedAt ?? this.savedAt,
    loading: loading ?? this.loading,
    error: clearError ? null : error ?? this.error,
  );
}

final walletProvider = NotifierProvider<WalletController, WalletState>(
  WalletController.new,
);

class WalletController extends Notifier<WalletState> {
  final _store = SecureStore.instance;
  String? _customerId;

  @override
  WalletState build() {
    // A profile change (name, language) is not a new account: the wallet stays as it is
    ref.listen(sessionProvider, (_, next) {
      final wallet = _follow(next);
      if (wallet != null) state = wallet;
    });
    return _follow(ref.read(sessionProvider)) ?? WalletState.signedOut;
  }

  /// The wallet for a session state, or null when it stays the same
  WalletState? _follow(SessionState session) {
    // The saved session is being read: no « sign in » flash before the tickets
    if (session is SessionLoading) return const WalletState(loading: true);
    if (session is! SignedIn) {
      _customerId = null;
      return WalletState.signedOut;
    }
    if (_customerId == session.customer.id) return null;
    _customerId = session.customer.id;
    Future.microtask(_start);
    return const WalletState(loading: true);
  }

  Future<void> _start() async {
    final saved = await _store.wallet;
    if (saved != null) {
      state = state.copyWith(
        tickets: _parse(saved['tickets'] as List? ?? const []),
        savedAt: DateTime.tryParse(saved['savedAt'] as String? ?? ''),
      );
    }
    await refresh();
  }

  Future<void> refresh() async {
    if (!state.signedIn) return;
    state = state.copyWith(loading: true, clearError: true);
    try {
      final list = await ApiClient.instance.get('/customer/tickets') as List;
      await _store.saveWallet(list);
      state = state.copyWith(
        tickets: _parse(list),
        savedAt: DateTime.now(),
        loading: false,
      );
    } catch (e) {
      state = state.copyWith(loading: false, error: ApiException.from(e));
    }
  }

  List<WalletTicket> _parse(List<dynamic> list) => list
      .map((t) => WalletTicket.fromJson(t as Map<String, dynamic>))
      .toList();
}
