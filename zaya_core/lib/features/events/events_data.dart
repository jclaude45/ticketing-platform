import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/session.dart';

double _num(dynamic v) => v == null
    ? 0
    : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);

/// Event of the organizer (list and header of the dashboard)
class EventSummary {
  final String id;
  final String name;
  final String status;
  final DateTime startDate;
  final DateTime endDate;
  final String venue;
  final String city;
  final String? bannerUrl;
  final String currency;
  final int capacity;
  final int tickets;

  const EventSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.startDate,
    required this.endDate,
    required this.venue,
    required this.city,
    required this.bannerUrl,
    required this.currency,
    required this.capacity,
    required this.tickets,
  });

  factory EventSummary.fromJson(Map<String, dynamic> j) => EventSummary(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    status: j['status'] as String? ?? 'DRAFT',
    startDate: DateTime.parse(j['startDate'] as String),
    endDate: DateTime.parse(j['endDate'] as String),
    venue: j['venue'] as String? ?? '',
    city: j['city'] as String? ?? '',
    bannerUrl: j['bannerUrl'] as String?,
    currency: j['currency'] as String? ?? 'USD',
    capacity: (j['totalCapacity'] as num?)?.toInt() ?? 0,
    tickets: ((j['_count'] as Map?)?['tickets'] as num?)?.toInt() ?? 0,
  );

  bool get isPast => endDate.isBefore(DateTime.now());
  bool get isLive => !isPast && startDate.isBefore(DateTime.now());

  String get statusLabel => switch (status) {
    'PUBLISHED' => isPast ? 'Terminé' : (isLive ? 'En cours' : 'En vente'),
    'DRAFT' => 'Brouillon',
    'CANCELLED' => 'Annulé',
    'COMPLETED' => 'Terminé',
    _ => status,
  };
}

/// One tariff of the event and how much of it is sold
class TariffFill {
  final String name;
  final double price;
  final String currency;
  final int quantity;
  final int sold;

  const TariffFill({
    required this.name,
    required this.price,
    required this.currency,
    required this.quantity,
    required this.sold,
  });

  double get ratio => quantity == 0 ? 0 : sold / quantity;
}

/// Everything the live dashboard of an event shows
class EventDashboard {
  final EventSummary event;
  final List<TariffFill> tariffs;
  final int totalTickets;
  final int checkedIn;
  final int capacity;
  final double revenue;
  final String currency;
  final int onlineOrders;
  final double onlineNet;
  final List<({String name, int count})> byController;
  final List<({String holder, String by, String result, DateTime at})>
  recentScans;

  const EventDashboard({
    required this.event,
    required this.tariffs,
    required this.totalTickets,
    required this.checkedIn,
    required this.capacity,
    required this.revenue,
    required this.currency,
    required this.onlineOrders,
    required this.onlineNet,
    required this.byController,
    required this.recentScans,
  });

  int get sold => tariffs.fold(0, (n, t) => n + t.sold);
  int get onSale => tariffs.fold(0, (n, t) => n + t.quantity);
}

class EventsRepository {
  final _api = ApiClient.instance;

  Future<List<EventSummary>> list() async {
    final page =
        await _api.get('/events', query: {'limit': 100})
            as Map<String, dynamic>;
    final list = (page['data'] as List)
        .map((e) => EventSummary.fromJson(e as Map<String, dynamic>))
        .toList();
    // Coming and running events first (soonest first), then past ones (latest first)
    list.sort((a, b) {
      if (a.isPast != b.isPast) return a.isPast ? 1 : -1;
      return a.isPast
          ? b.startDate.compareTo(a.startDate)
          : a.startDate.compareTo(b.startDate);
    });
    return list;
  }

  Future<EventDashboard> dashboard(String eventId) async {
    final results = await Future.wait([
      _api.get('/events/$eventId'),
      _api.get('/analytics/events/$eventId'),
    ]);
    final ev = results[0] as Map<String, dynamic>;
    final a = results[1] as Map<String, dynamic>;
    final sales = (a['sales'] as Map?)?.cast<String, dynamic>() ?? {};
    final online = (sales['online'] as Map?)?.cast<String, dynamic>() ?? {};
    final tariffs = ((ev['ticketTemplates'] as List?) ?? []).map((t) {
      final m = t as Map<String, dynamic>;
      final qty = (m['quantity'] as num?)?.toInt() ?? 0;
      final left = (m['availableCount'] as num?)?.toInt() ?? qty;
      return TariffFill(
        name: m['name'] as String? ?? '',
        price: _num(m['price']),
        currency: m['currency'] as String? ?? 'USD',
        quantity: qty,
        sold: (qty - left).clamp(0, qty),
      );
    }).toList();
    return EventDashboard(
      event: EventSummary.fromJson(ev),
      tariffs: tariffs,
      totalTickets: (a['totalTickets'] as num?)?.toInt() ?? 0,
      checkedIn: (a['scannedTickets'] as num?)?.toInt() ?? 0,
      capacity: (a['capacity'] as num?)?.toInt() ?? 0,
      revenue: _num(sales['amount']),
      currency:
          sales['currency'] as String? ?? (ev['currency'] as String? ?? 'USD'),
      onlineOrders: (online['orders'] as num?)?.toInt() ?? 0,
      onlineNet: _num(online['net']),
      byController: ((a['scansByController'] as List?) ?? [])
          .map(
            (c) => (
              name: (c as Map)['name'] as String? ?? '—',
              count: (c['count'] as num?)?.toInt() ?? 0,
            ),
          )
          .toList(),
      recentScans: ((a['recentScans'] as List?) ?? []).map((s) {
        final m = s as Map<String, dynamic>;
        final ticket = (m['ticket'] as Map?)?.cast<String, dynamic>() ?? {};
        return (
          holder: (ticket['holderName'] as String?)?.trim().isNotEmpty == true
              ? ticket['holderName'] as String
              : (ticket['serialNumber'] ?? '—').toString(),
          by: ((m['controller'] as Map?)?['name'] ?? '').toString(),
          result: m['isValid'] == true
              ? 'VALID'
              : (m['rejectionReason'] ?? 'INVALID').toString(),
          at:
              DateTime.tryParse((m['timestamp'] ?? '').toString()) ??
              DateTime.now(),
        );
      }).toList(),
    );
  }
}

final eventsRepository = Provider((_) => EventsRepository());

/// Events of the account worked on (reloaded when switching account)
final eventsProvider = FutureProvider.autoDispose<List<EventSummary>>((ref) {
  ref.watch(
    sessionProvider.select(
      (s) => s is SignedIn ? s.user.workspace?.ownerId : null,
    ),
  );
  return ref.watch(eventsRepository).list();
});

final eventDashboardProvider = FutureProvider.autoDispose
    .family<EventDashboard, String>(
      (ref, id) => ref.watch(eventsRepository).dashboard(id),
    );
