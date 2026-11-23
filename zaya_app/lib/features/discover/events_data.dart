import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

/// Ticket category of an event, at the price the buyer pays (fees included)
class Category {
  final String id;
  final String name;
  final String? description;
  final double price;
  final String currency;
  final int available;

  const Category({
    required this.id,
    required this.name,
    this.description,
    required this.price,
    required this.currency,
    required this.available,
  });

  factory Category.fromJson(Map<String, dynamic> j) => Category(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    description: j['description'] as String?,
    price: (j['price'] as num?)?.toDouble() ?? 0,
    currency: j['currency'] as String? ?? 'USD',
    available: (j['availableCount'] as num?)?.toInt() ?? 0,
  );
}

/// Published event (GET /public/events, /public/events/:id)
class PublicEvent {
  final String id;
  final String name;
  final String? description;
  final List<String> performers;
  final String venue;
  final String? address;
  final String city;
  final String type;
  final DateTime start;
  final DateTime end;
  final String? bannerUrl;
  final String? organizer;
  final List<Category> categories;
  final double? minPrice;
  final bool soldOut;
  final bool ended;

  const PublicEvent({
    required this.id,
    required this.name,
    this.description,
    this.performers = const [],
    required this.venue,
    this.address,
    required this.city,
    this.type = 'OTHER',
    required this.start,
    required this.end,
    this.bannerUrl,
    this.organizer,
    this.categories = const [],
    this.minPrice,
    this.soldOut = false,
    this.ended = false,
  });

  String get currency =>
      categories.isEmpty ? 'USD' : categories.first.currency;

  bool get isFree => categories.isNotEmpty && categories.every((c) => c.price == 0);

  factory PublicEvent.fromJson(Map<String, dynamic> j) {
    final org = j['organizer'] as Map<String, dynamic>?;
    final orgName = org == null
        ? null
        : '${org['firstName'] ?? ''} ${org['lastName'] ?? ''}'.trim();
    return PublicEvent(
      id: j['id'] as String,
      name: j['name'] as String? ?? '',
      description: j['description'] as String?,
      performers: (j['performers'] as List?)?.cast<String>() ?? const [],
      venue: j['venue'] as String? ?? '',
      address: j['address'] as String?,
      city: j['city'] as String? ?? '',
      type: j['type'] as String? ?? 'OTHER',
      start: DateTime.parse(j['startDate'] as String),
      end: DateTime.parse(j['endDate'] as String),
      bannerUrl: j['bannerUrl'] as String?,
      organizer: orgName == null || orgName.isEmpty ? null : orgName,
      categories: ((j['ticketTemplates'] as List?) ?? const [])
          .map((t) => Category.fromJson(t as Map<String, dynamic>))
          .toList(),
      minPrice: (j['minPrice'] as num?)?.toDouble(),
      soldOut: j['soldOut'] == true,
      ended: j['ended'] == true,
    );
  }
}

/// The three tabs of the home screen
enum Window { tonight, weekend, upcoming }

/// Start and end of a tab, in Kinshasa time (UTC+1 all year). « Ce soir » runs until 6 a.m.;
/// « Ce week-end » from Friday 6 p.m. to Sunday night (from now once it has started).
({DateTime? from, DateTime? to}) windowRange(Window w, [DateTime? now]) {
  final utcNow = (now ?? DateTime.now()).toUtc();
  // Kinshasa wall clock expressed as a UTC DateTime, converted back at the end
  final k = utcNow.add(const Duration(hours: 1));
  DateTime toUtc(DateTime kin) => kin.subtract(const Duration(hours: 1));
  final day = DateTime.utc(k.year, k.month, k.day);
  switch (w) {
    case Window.tonight:
      // After midnight, « ce soir » is still the night that began yesterday
      final night = k.hour < 6 ? day : day.add(const Duration(days: 1));
      return (from: utcNow, to: toUtc(night.add(const Duration(hours: 6))));
    case Window.weekend:
      // This week's Friday: ahead from Monday to Thursday, behind on Saturday and Sunday
      final friday = day.add(Duration(days: DateTime.friday - k.weekday));
      final start = toUtc(friday.add(const Duration(hours: 18)));
      final end = toUtc(friday.add(const Duration(days: 3, hours: 6)));
      return (from: start.isBefore(utcNow) ? utcNow : start, to: end);
    case Window.upcoming:
      return (from: null, to: null);
  }
}

/// What the home and the search ask for: a time window, words, a category, a top price
class EventsQuery {
  final Window window;
  final String search;
  final String? type;

  /// Highest « Dès » price; 0 = free events only
  final double? maxPrice;

  const EventsQuery({
    this.window = Window.upcoming,
    this.search = '',
    this.type,
    this.maxPrice,
  });

  @override
  bool operator ==(Object other) =>
      other is EventsQuery &&
      other.window == window &&
      other.search == search &&
      other.type == type &&
      other.maxPrice == maxPrice;

  @override
  int get hashCode => Object.hash(window, search, type, maxPrice);
}

final eventsProvider = FutureProvider.autoDispose
    .family<List<PublicEvent>, EventsQuery>((ref, q) async {
      final range = windowRange(q.window);
      final body = await ApiClient.instance.get(
        '/public/events',
        query: {
          'limit': 50,
          if (q.search.trim().isNotEmpty) 'search': q.search.trim(),
          if (q.type != null) 'type': q.type,
          if (range.from != null) 'from': range.from!.toIso8601String(),
          if (range.to != null) 'to': range.to!.toIso8601String(),
        },
      );
      // The list comes as { data: [...], meta } inside the envelope
      final list = body is Map ? body['data'] as List : body as List;
      final events = list
          .map((e) => PublicEvent.fromJson(e as Map<String, dynamic>))
          .toList();
      final max = q.maxPrice;
      // The price filter is on the lowest price shown, « Dès … »
      return max == null
          ? events
          : events.where((e) => (e.minPrice ?? 0) <= max).toList();
    });

/// Rails of the search screen (GET /public/events/highlights): this week, best sellers
class Highlights {
  final List<PublicEvent> thisWeek;
  final List<PublicEvent> popular;
  const Highlights({required this.thisWeek, required this.popular});
}

final highlightsProvider = FutureProvider.autoDispose<Highlights>((ref) async {
  final j = await ApiClient.instance.get('/public/events/highlights') as Map<String, dynamic>;
  List<PublicEvent> list(String k) => ((j[k] as List?) ?? const [])
      .map((e) => PublicEvent.fromJson(e as Map<String, dynamic>))
      .toList();
  // Best sellers first, then the most seen, without repeating an event
  final seen = <String>{};
  final popular = [...list('bestSellers'), ...list('mostViewed')]
      .where((e) => seen.add(e.id))
      .toList();
  return Highlights(thisWeek: list('thisWeek'), popular: popular);
});

final eventProvider = FutureProvider.autoDispose.family<PublicEvent, String>(
  (ref, id) async => PublicEvent.fromJson(
    await ApiClient.instance.get('/public/events/$id') as Map<String, dynamic>,
  ),
);
