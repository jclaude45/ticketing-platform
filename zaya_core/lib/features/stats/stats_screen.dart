import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../events/event_dashboard_screen.dart';
import '../events/events_data.dart';
import '../notifications/notifications_screen.dart';

int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
double _dbl(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

/// Figures of the whole account (all events), as on the web Statistiques page
class AccountStats {
  final Map<String, double> revenue;
  final int ticketsSold;
  final int totalTickets;
  final int activeEvents;
  final int totalEvents;
  final int capacity;
  final int issued;
  final int checkedIn;
  final int occupancy;
  final List<({String id, String name, int tickets, int capacity, int rate})>
  topEvents;
  final List<int> scansByHour;
  final ({int now, int before}) ticketsMonth;
  final ({int now, int before}) scansMonth;
  final ({int now, int before}) eventsMonth;

  const AccountStats({
    required this.revenue,
    required this.ticketsSold,
    required this.totalTickets,
    required this.activeEvents,
    required this.totalEvents,
    required this.capacity,
    required this.issued,
    required this.checkedIn,
    required this.occupancy,
    required this.topEvents,
    required this.scansByHour,
    required this.ticketsMonth,
    required this.scansMonth,
    required this.eventsMonth,
  });
}

final statsProvider = FutureProvider.autoDispose<AccountStats>((ref) async {
  ref.watch(
    sessionProvider.select(
      (s) => s is SignedIn ? s.user.workspace?.ownerId : null,
    ),
  );
  final api = ApiClient.instance;
  final r = await Future.wait([
    api.get('/analytics/global'),
    api.get('/analytics/revenue'),
    api.get('/analytics/top-events', query: {'limit': 8}),
  ]);
  final g = r[0] as Map<String, dynamic>;
  final rev = r[1] as Map<String, dynamic>;
  final top = r[2] as List<dynamic>;
  final occ = (g['occupancy'] as Map?)?.cast<String, dynamic>() ?? {};
  final mom = (g['mom'] as Map?)?.cast<String, dynamic>() ?? {};
  // The server counts hours in UTC; Kinshasa is UTC+1
  final hours = List.filled(24, 0);
  for (final h in (g['scansByHour'] as List?) ?? []) {
    final utc =
        int.tryParse((h['hour'] as String? ?? '0').split(':').first) ?? 0;
    hours[(utc + 1) % 24] += _int(h['count']);
  }
  return AccountStats(
    revenue: ((rev['revenueByCurrency'] as Map?) ?? {}).map(
      (k, v) => MapEntry(k as String, _dbl(v)),
    ),
    ticketsSold: _int(rev['totalTicketsSold']),
    totalTickets: _int(g['totalTickets']),
    activeEvents: _int(g['activeEvents']),
    totalEvents: _int(g['totalEvents']),
    capacity: _int(occ['capacity']),
    issued: _int(occ['issued']),
    checkedIn: _int(occ['scanned']),
    occupancy: _int(g['averageOccupancy']),
    topEvents: top
        .map(
          (e) => (
            id: e['id'] as String,
            name: e['name'] as String? ?? '',
            tickets: _int(e['ticketCount']),
            capacity: _int(e['totalCapacity']),
            rate: _int(e['soldRate']),
          ),
        )
        .toList(),
    scansByHour: hours,
    ticketsMonth: (
      now: _int(mom['ticketsThisMonth']),
      before: _int(mom['ticketsLastMonth']),
    ),
    scansMonth: (
      now: _int(mom['scansThisMonth']),
      before: _int(mom['scansLastMonth']),
    ),
    eventsMonth: (
      now: _int(mom['eventsThisMonth']),
      before: _int(mom['eventsLastMonth']),
    ),
  );
});

/// Statistiques tab: money, tickets, entries and fill of all the account's events
class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(statsProvider);
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: ZColors.ink,
          onRefresh: () => ref.refresh(statsProvider.future),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              const ZPageHeader(
                title: 'Statistiques',
                overline: 'Tous vos événements',
                trailing: NotificationBell(),
              ),
              ...stats.when(
                loading: () => [
                  const Padding(
                    padding: EdgeInsets.all(60),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
                error: (e, _) => [
                  SizedBox(
                    height: 420,
                    child: ZMessage.error(
                      e,
                      () => ref.invalidate(statsProvider),
                    ),
                  ),
                ],
                data: (s) => _content(context, ref, s),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, WidgetRef ref, AccountStats s) {
    final checkRatio = s.issued == 0 ? 0.0 : s.checkedIn / s.issued;
    final revenue = s.revenue.entries.where((e) => e.value > 0).toList();
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Column(
          children: [
            _Card(
              highlight: true,
              label: 'Encaissé',
              value: revenue.isEmpty
                  ? '0'
                  : Fmt.money(revenue.first.value, revenue.first.key),
              sub: [
                ...revenue.skip(1).map((e) => '+ ${Fmt.money(e.value, e.key)}'),
                '${Fmt.count(s.ticketsSold)} billet${s.ticketsSold > 1 ? 's' : ''} payé${s.ticketsSold > 1 ? 's' : ''}',
              ].join(' · '),
            ),
            const SizedBox(height: 12),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _Card(
                      label: 'Billets émis',
                      value: Fmt.count(s.totalTickets),
                      sub: s.capacity > 0
                          ? 'Remplissage ${s.occupancy} %'
                          : null,
                      bar: s.capacity > 0 ? s.occupancy / 100 : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _Card(
                      label: 'Entrées',
                      value: Fmt.count(s.checkedIn),
                      sub: s.issued > 0
                          ? '${Fmt.percent(checkRatio)} des billets'
                          : null,
                      bar: s.issued > 0 ? checkRatio : null,
                      barColor: ZColors.green,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _Card(
              label: 'Événements en vente',
              value: '${s.activeEvents}',
              sub:
                  'sur ${s.totalEvents} événement${s.totalEvents > 1 ? 's' : ''} au total',
            ),
          ],
        ),
      ),
      const ZSection('Ce mois-ci'),
      _Trend(label: 'Billets émis', value: s.ticketsMonth),
      _Trend(label: 'Entrées scannées', value: s.scansMonth),
      _Trend(label: 'Événements créés', value: s.eventsMonth),
      if (s.topEvents.isNotEmpty) ...[
        const ZSection('Remplissage par événement'),
        ...s.topEvents.map(
          (e) => InkWell(
            onTap: () async {
              final events = await ref.read(eventsProvider.future);
              final event = events.where((x) => x.id == e.id).firstOrNull;
              if (event != null && context.mounted) {
                await Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => EventDashboardScreen(event: event),
                  ),
                );
              }
            },
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          e.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: zText(ZSize.body, weight: ZWeight.bold),
                        ),
                      ),
                      Text(
                        '${e.rate} %',
                        style: zText(ZSize.small, weight: ZWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ZBar(e.rate / 100, color: e.rate >= 100 ? ZColors.red : null),
                  const SizedBox(height: 4),
                  Text(
                    '${Fmt.count(e.tickets)} billets sur ${Fmt.count(e.capacity)} places',
                    style: zText(ZSize.small, color: ZColors.muted),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
      if (s.scansByHour.any((n) => n > 0)) ...[
        const ZSection('Entrées aujourd’hui, par heure'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _HourBars(s.scansByHour),
        ),
      ],
    ];
  }
}

class _Card extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final double? bar;
  final Color? barColor;
  final bool highlight;

  const _Card({
    required this.label,
    required this.value,
    this.sub,
    this.bar,
    this.barColor,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = highlight ? ZColors.onYellow : ZColors.text;
    final soft = highlight ? ZColors.onYellow : ZColors.muted;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: highlight ? ZColors.yellow : ZColors.card,
        borderRadius: BorderRadius.circular(16),
        border: highlight ? null : Border.all(color: ZColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: zText(ZSize.small, weight: ZWeight.medium, color: soft),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: zText(ZSize.h1, weight: ZWeight.black, color: fg),
            ),
          ),
          if (bar != null) ...[
            const SizedBox(height: 10),
            ZBar(bar!, color: barColor),
          ],
          if (sub != null) ...[
            const SizedBox(height: 6),
            Text(sub!, style: zText(ZSize.small, color: soft)),
          ],
        ],
      ),
    );
  }
}

/// This month against the previous one
class _Trend extends StatelessWidget {
  final String label;
  final ({int now, int before}) value;
  const _Trend({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final diff = value.now - value.before;
    final pct = value.before == 0 ? null : (diff * 100 / value.before).round();
    final color = diff > 0
        ? ZColors.green
        : (diff < 0 ? ZColors.red : ZColors.muted);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: zText(ZSize.body))),
          Text(
            Fmt.count(value.now),
            style: zText(ZSize.title, weight: ZWeight.bold),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 92,
            child: Text(
              diff == 0
                  ? '= mois dernier'
                  : '${diff > 0 ? '+' : '−'}${pct == null ? Fmt.count(diff.abs()) : '${pct.abs()} %'}',
              textAlign: TextAlign.right,
              style: zText(ZSize.small, weight: ZWeight.medium, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// 24 thin bars, one per hour of the day (Kinshasa time)
class _HourBars extends StatelessWidget {
  final List<int> counts;
  const _HourBars(this.counts);

  @override
  Widget build(BuildContext context) {
    final max = counts.reduce((a, b) => a > b ? a : b).clamp(1, 1 << 30);
    return Column(
      children: [
        SizedBox(
          height: 110,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var h = 0; h < 24; h++)
                Expanded(
                  child: Tooltip(
                    message: '${h}h : ${counts[h]}',
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 1.5),
                      height: counts[h] == 0 ? 2 : 4 + 106 * counts[h] / max,
                      decoration: BoxDecoration(
                        color: counts[h] == 0 ? ZColors.track : ZColors.ink,
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(3),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (final l in ['0h', '6h', '12h', '18h', '23h'])
              Text(l, style: zText(ZSize.caption, color: ZColors.muted)),
          ],
        ),
      ],
    );
  }
}
