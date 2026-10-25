import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

double _num(dynamic v) => v == null
    ? 0
    : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);

/// Event types of the API, as shown on zaya.live
const eventTypeLabels = {
  'CONCERT': 'Concert',
  'CONFERENCE': 'Conférence',
  'FESTIVAL': 'Festival',
  'SPORT': 'Sport',
  'PARTY': 'Soirée',
  'EXHIBITION': 'Exposition',
  'THEATER': 'Théâtre',
  'WORKSHOP': 'Atelier',
  'GALA': 'Gala',
  'COMEDY': 'Humour',
  'WORSHIP': 'Culte & gospel',
  'FAIR': 'Salon',
  'OTHER': 'Autre',
};

const currencies = ['USD', 'CDF', 'EUR'];

/// Everything the edit form needs
class EventDetail {
  final String id;
  final String name;
  final String description;
  final List<String> performers;
  final String venue;
  final String address;
  final String city;
  final String country;
  final DateTime startDate;
  final DateTime endDate;
  final int capacity;
  final String status;
  final String type;
  final String currency;
  final String feePayer;
  final String? bannerUrl;

  const EventDetail({
    required this.id,
    required this.name,
    required this.description,
    required this.performers,
    required this.venue,
    required this.address,
    required this.city,
    required this.country,
    required this.startDate,
    required this.endDate,
    required this.capacity,
    required this.status,
    required this.type,
    required this.currency,
    required this.feePayer,
    required this.bannerUrl,
  });

  factory EventDetail.fromJson(Map<String, dynamic> j) => EventDetail(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    description: j['description'] as String? ?? '',
    performers: ((j['performers'] as List?) ?? [])
        .map((p) => p.toString())
        .toList(),
    venue: j['venue'] as String? ?? '',
    address: j['address'] as String? ?? '',
    city: j['city'] as String? ?? '',
    country: j['country'] as String? ?? 'RDC',
    startDate: DateTime.parse(j['startDate'] as String),
    endDate: DateTime.parse(j['endDate'] as String),
    capacity: (j['totalCapacity'] as num?)?.toInt() ?? 0,
    status: j['status'] as String? ?? 'DRAFT',
    type: j['type'] as String? ?? 'OTHER',
    currency: j['currency'] as String? ?? 'USD',
    feePayer: j['feePayer'] as String? ?? 'BUYER',
    bannerUrl: j['bannerUrl'] as String?,
  );
}

/// A tariff and how many tickets it already has
class Tariff {
  final String id;
  final String name;
  final String description;
  final double price;
  final String currency;
  final int quantity;
  final int available;
  final int tickets;

  const Tariff({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.currency,
    required this.quantity,
    required this.available,
    required this.tickets,
  });

  factory Tariff.fromJson(Map<String, dynamic> j) => Tariff(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    description: j['description'] as String? ?? '',
    price: _num(j['price']),
    currency: j['currency'] as String? ?? 'USD',
    quantity: (j['quantity'] as num?)?.toInt() ?? 0,
    available: (j['availableCount'] as num?)?.toInt() ?? 0,
    tickets: ((j['_count'] as Map?)?['tickets'] as num?)?.toInt() ?? 0,
  );
}

/// Paid order of the online ticketing
class Order {
  final String id;
  final String reference;
  final DateTime date;
  final String holderName;
  final String holderEmail;
  final String? holderPhone;
  final String paymentMethod;
  final double amount;
  final double net;
  final String currency;
  final String status;
  final int tickets;
  final String? refundStatus;

  const Order({
    required this.id,
    required this.reference,
    required this.date,
    required this.holderName,
    required this.holderEmail,
    required this.holderPhone,
    required this.paymentMethod,
    required this.amount,
    required this.net,
    required this.currency,
    required this.status,
    required this.tickets,
    required this.refundStatus,
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
    id: j['id'] as String,
    reference: j['reference'] as String? ?? '',
    date: DateTime.tryParse(j['date']?.toString() ?? '') ?? DateTime.now(),
    holderName: j['holderName'] as String? ?? '',
    holderEmail: j['holderEmail'] as String? ?? '',
    holderPhone: j['holderPhone'] as String?,
    paymentMethod: j['paymentMethod'] as String? ?? '',
    amount: _num(j['amount']),
    net: _num(j['net']),
    currency: j['currency'] as String? ?? 'USD',
    status: j['status'] as String? ?? '',
    tickets: j['tickets'] is List
        ? (j['tickets'] as List).length
        : (j['tickets'] as num?)?.toInt() ?? 0,
    refundStatus: (j['refund'] as Map?)?['status'] as String?,
  );

  bool get refundable => status == 'COMPLETED';

  String get methodLabel => switch (paymentMethod) {
    'mobile_money' => 'Mobile Money',
    'card' => 'Carte bancaire',
    _ => paymentMethod,
  };
}

class EventAdminRepository {
  final _api = ApiClient.instance;

  Future<EventDetail> detail(String id) async => EventDetail.fromJson(
    await _api.get('/events/$id') as Map<String, dynamic>,
  );

  Future<EventDetail> create(Map<String, dynamic> body) async =>
      EventDetail.fromJson(
        await _api.post('/events', body) as Map<String, dynamic>,
      );

  Future<EventDetail> update(String id, Map<String, dynamic> body) async =>
      EventDetail.fromJson(
        await _api.patch('/events/$id', body) as Map<String, dynamic>,
      );

  Future<void> uploadPoster(String id, String filePath) async {
    final name = filePath.split('/').last;
    final ext = name.split('.').last.toLowerCase();
    final mime = switch (ext) {
      'png' => 'png',
      'webp' => 'webp',
      _ => 'jpeg',
    };
    await _api.post(
      '/events/$id/banner',
      FormData.fromMap({
        'banner': await MultipartFile.fromFile(
          filePath,
          filename: name,
          contentType: DioMediaType('image', mime),
        ),
      }),
    );
  }

  Future<void> publish(String id) => _api.post('/events/$id/publish');
  Future<void> unpublish(String id) => _api.post('/events/$id/unpublish');
  Future<void> cancel(String id) => _api.post('/events/$id/cancel');

  Future<List<Tariff>> tariffs(String eventId) async {
    final list = await _api.get('/events/$eventId/templates') as List<dynamic>;
    return list.map((t) => Tariff.fromJson(t as Map<String, dynamic>)).toList();
  }

  Future<void> saveTariff(
    String eventId,
    String? tariffId,
    Map<String, dynamic> body,
  ) => tariffId == null
      ? _api.post('/events/$eventId/templates', body)
      : _api.patch('/events/$eventId/templates/$tariffId', body);

  Future<void> deleteTariff(String eventId, String tariffId) =>
      _api.delete('/events/$eventId/templates/$tariffId');

  Future<List<Order>> orders(String eventId) async {
    final list = await _api.get('/events/$eventId/orders') as List<dynamic>;
    return list.map((o) => Order.fromJson(o as Map<String, dynamic>)).toList();
  }

  Future<void> refund(String eventId, String paymentId, String? reason) =>
      _api.post('/events/$eventId/orders/$paymentId/refund', {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      });
}

final eventAdminRepository = Provider((_) => EventAdminRepository());

final tariffsProvider = FutureProvider.autoDispose.family<List<Tariff>, String>(
  (ref, id) => ref.watch(eventAdminRepository).tariffs(id),
);

final ordersProvider = FutureProvider.autoDispose.family<List<Order>, String>(
  (ref, id) => ref.watch(eventAdminRepository).orders(id),
);
