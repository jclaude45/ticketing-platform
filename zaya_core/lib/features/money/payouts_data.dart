import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

double _num(dynamic v) => v == null
    ? 0
    : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);

/// One of the two payments of an event's sales: 90 % a few days after it, then the 10 % reserve
class PayoutPart {
  final String part;
  final double amount;
  final DateTime? dueAt;
  final String status;
  final DateTime? paidAt;
  final String? reference;

  const PayoutPart({
    required this.part,
    required this.amount,
    required this.dueAt,
    required this.status,
    required this.paidAt,
    required this.reference,
  });

  factory PayoutPart.fromJson(Map<String, dynamic> j) => PayoutPart(
    part: j['part'] as String? ?? 'MAIN',
    amount: _num(j['amount']),
    dueAt: DateTime.tryParse(j['dueAt']?.toString() ?? ''),
    status: j['status'] as String? ?? 'UPCOMING',
    paidAt: DateTime.tryParse(j['paidAt']?.toString() ?? ''),
    reference: j['reference'] as String?,
  );

  String get label => part == 'MAIN' ? 'Versement (90 %)' : 'Réserve (10 %)';

  String get statusLabel => switch (status) {
    'PAID' => 'Versé',
    'DUE' => 'À verser',
    'OWED' => 'Solde dû à ZAYA',
    _ => 'À venir',
  };
}

/// Sales of one event in one currency and what ZAYA pays the organizer
class EventPayout {
  final String eventId;
  final String eventName;
  final DateTime? eventEnd;
  final String currency;
  final int orders;
  final int refundedOrders;
  final double gross;
  final double fees;
  final double refunded;
  final double net;
  final List<PayoutPart> parts;

  const EventPayout({
    required this.eventId,
    required this.eventName,
    required this.eventEnd,
    required this.currency,
    required this.orders,
    required this.refundedOrders,
    required this.gross,
    required this.fees,
    required this.refunded,
    required this.net,
    required this.parts,
  });

  factory EventPayout.fromJson(Map<String, dynamic> j) => EventPayout(
    eventId: j['eventId'] as String,
    eventName: j['eventName'] as String? ?? '',
    eventEnd: DateTime.tryParse(j['eventEnd']?.toString() ?? ''),
    currency: j['currency'] as String? ?? 'USD',
    orders: (j['orders'] as num?)?.toInt() ?? 0,
    refundedOrders: (j['refundedOrders'] as num?)?.toInt() ?? 0,
    gross: _num(j['gross']),
    fees: _num(j['fees']),
    refunded: _num(j['refunded']),
    net: _num(j['net']),
    parts: ((j['payouts'] as List?) ?? [])
        .map((p) => PayoutPart.fromJson(p as Map<String, dynamic>))
        .toList(),
  );
}

/// Where ZAYA sends the money: Mobile Money or a bank account
class PayoutInfo {
  final String method;
  final String network;
  final String phone;
  final String bankName;
  final String accountNumber;
  final String accountName;

  const PayoutInfo({
    this.method = 'mobile_money',
    this.network = 'M-Pesa',
    this.phone = '',
    this.bankName = '',
    this.accountNumber = '',
    this.accountName = '',
  });

  factory PayoutInfo.fromJson(Map<String, dynamic> j) => PayoutInfo(
    method: j['method'] as String? ?? 'mobile_money',
    network: j['network'] as String? ?? 'M-Pesa',
    phone: j['phone'] as String? ?? '',
    bankName: j['bankName'] as String? ?? '',
    accountNumber: j['accountNumber'] as String? ?? '',
    accountName: j['accountName'] as String? ?? '',
  );

  Map<String, dynamic> toJson() => method == 'bank'
      ? {
          'method': 'bank',
          'bankName': bankName,
          'accountNumber': accountNumber,
          'accountName': accountName,
        }
      : {
          'method': 'mobile_money',
          'network': network,
          'phone': phone,
          'accountName': accountName,
        };

  String get summary =>
      method == 'bank' ? '$bankName · $accountNumber' : '$network · $phone';
}

const mobileNetworks = ['M-Pesa', 'Orange Money', 'Airtel Money', 'Afrimoney'];

class PayoutsRepository {
  final _api = ApiClient.instance;

  Future<List<EventPayout>> payouts() async {
    final list = await _api.get('/billing/payouts') as List<dynamic>;
    return list
        .map((p) => EventPayout.fromJson(p as Map<String, dynamic>))
        .toList();
  }

  Future<PayoutInfo?> info() async {
    final d = await _api.get('/billing/payout-info');
    return d is Map<String, dynamic> && d.isNotEmpty
        ? PayoutInfo.fromJson(d)
        : null;
  }

  Future<void> saveInfo(PayoutInfo info) =>
      _api.put('/billing/payout-info', {'info': info.toJson()});
}

final payoutsRepository = Provider((_) => PayoutsRepository());

final payoutsProvider = FutureProvider.autoDispose<List<EventPayout>>(
  (ref) => ref.watch(payoutsRepository).payouts(),
);

final payoutInfoProvider = FutureProvider.autoDispose<PayoutInfo?>(
  (ref) => ref.watch(payoutsRepository).info(),
);
