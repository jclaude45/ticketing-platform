import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/realtime.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'events_data.dart';

/// Live dashboard of one event: sales, fill per tariff, entries. Updates by itself on every
/// sale and every scan (realtime channel), and on pull-to-refresh.
class EventDashboardScreen extends ConsumerStatefulWidget {
  final EventSummary event;
  const EventDashboardScreen({super.key, required this.event});

  @override
  ConsumerState<EventDashboardScreen> createState() =>
      _EventDashboardScreenState();
}

class _EventDashboardScreenState extends ConsumerState<EventDashboardScreen> {
  StreamSubscription<LiveEvent>? _live;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _live = Realtime.instance.watch(widget.event.id).listen(_onLive);
  }

  @override
  void dispose() {
    _live?.cancel();
    _debounce?.cancel();
    super.dispose();
  }

  void _onLive(LiveEvent e) {
    if (e.kind == 'sale' && mounted) {
      final n = (e.data['tickets'] as num?)?.toInt() ?? 0;
      final amount = Fmt.money(
        (e.data['amount'] as num?) ?? 0,
        e.data['currency'] as String? ?? '',
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Nouvelle vente : $n billet${n > 1 ? 's' : ''} · $amount',
          ),
        ),
      );
    }
    // Entries can come by the dozen at the door: one reload for a burst of scans
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) ref.invalidate(eventDashboardProvider(widget.event.id));
    });
  }

  @override
  Widget build(BuildContext context) {
    final dash = ref.watch(eventDashboardProvider(widget.event.id));
    final event = dash.valueOrNull?.event ?? widget.event;
    return Scaffold(
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () =>
            ref.refresh(eventDashboardProvider(widget.event.id).future),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar(
              pinned: true,
              expandedHeight: 210,
              backgroundColor: ZColors.page,
              surfaceTintColor: Colors.transparent,
              leading: Padding(
                padding: const EdgeInsets.all(8),
                child: CircleAvatar(
                  backgroundColor: ZColors.page.withValues(alpha: 0.85),
                  child: BackButton(color: ZColors.ink),
                ),
              ),
              flexibleSpace: FlexibleSpaceBar(
                background: EventPoster(
                  url: event.bannerUrl,
                  radius: BorderRadius.zero,
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.name,
                      style: zText(
                        ZSize.h1,
                        weight: ZWeight.black,
                        height: 1.15,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${Fmt.dayTime(event.startDate)} · ${[event.venue, event.city].where((s) => s.isNotEmpty).join(', ')}',
                      style: zText(ZSize.body, color: ZColors.muted),
                    ),
                    const SizedBox(height: 10),
                    const _LiveBadge(),
                  ],
                ),
              ),
            ),
            ...dash.when(
              skipLoadingOnRefresh: true,
              skipLoadingOnReload: true,
              loading: () => [
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
              ],
              error: (e, _) => [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ZMessage.error(
                    e,
                    () =>
                        ref.invalidate(eventDashboardProvider(widget.event.id)),
                  ),
                ),
              ],
              data: (d) => _content(d),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ],
        ),
      ),
    );
  }

  List<Widget> _content(EventDashboard d) {
    final soldRatio = d.onSale == 0 ? 0.0 : d.sold / d.onSale;
    final entryRatio = d.totalTickets == 0 ? 0.0 : d.checkedIn / d.totalTickets;
    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
        sliver: SliverToBoxAdapter(
          child: Column(
            children: [
              // Same height for both cards, whatever their content
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: _Kpi(
                        label: 'Billets vendus',
                        value: Fmt.count(d.sold),
                        sub: d.onSale > 0
                            ? 'sur ${Fmt.count(d.onSale)} · ${Fmt.percent(soldRatio)}'
                            : null,
                        bar: d.onSale > 0 ? soldRatio : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _Kpi(
                        label: 'Encaissé',
                        value: Fmt.money(d.revenue, d.currency),
                        sub: d.onlineOrders > 0
                            ? '${Fmt.count(d.onlineOrders)} commande${d.onlineOrders > 1 ? 's' : ''} en ligne'
                            : 'billets payés',
                        highlight: true,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _Kpi(
                label: 'Entrées',
                value:
                    '${Fmt.count(d.checkedIn)} / ${Fmt.count(d.totalTickets)}',
                sub: d.totalTickets > 0
                    ? '${Fmt.percent(entryRatio)} des billets scannés'
                    : 'aucun billet émis',
                bar: d.totalTickets > 0 ? entryRatio : null,
                barColor: ZColors.green,
              ),
            ],
          ),
        ),
      ),
      if (d.tariffs.isNotEmpty) ...[
        const SliverToBoxAdapter(child: ZSection('Tarifs')),
        SliverList.separated(
          itemCount: d.tariffs.length,
          separatorBuilder: (_, _) => const SizedBox(height: 16),
          itemBuilder: (_, i) {
            final t = d.tariffs[i];
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          t.name,
                          style: zText(ZSize.body, weight: ZWeight.bold),
                        ),
                      ),
                      Text(
                        Fmt.money(t.price, t.currency),
                        style: zText(ZSize.small, color: ZColors.muted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ZBar(
                    t.ratio,
                    color: t.sold >= t.quantity && t.quantity > 0
                        ? ZColors.red
                        : null,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    t.sold >= t.quantity && t.quantity > 0
                        ? 'Complet · ${Fmt.count(t.quantity)} billets'
                        : '${Fmt.count(t.sold)} vendus sur ${Fmt.count(t.quantity)} · reste ${Fmt.count(t.quantity - t.sold)}',
                    style: zText(ZSize.small, color: ZColors.muted),
                  ),
                ],
              ),
            );
          },
        ),
      ],
      if (d.recentScans.isNotEmpty) ...[
        const SliverToBoxAdapter(child: ZSection('Derniers scans')),
        SliverList.builder(
          itemCount: d.recentScans.length.clamp(0, 10),
          itemBuilder: (_, i) {
            final s = d.recentScans[i];
            final (label, color) = switch (s.result) {
              'VALID' => ('Entrée validée', ZColors.green),
              'ALREADY_USED' => ('Déjà utilisé', ZColors.orange),
              'FRAUDULENT' => ('Frauduleux', ZColors.red),
              'EXPIRED' => ('Hors date', ZColors.orange),
              _ => ('Refusé', ZColors.red),
            };
            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              leading: CircleAvatar(radius: 6, backgroundColor: color),
              minLeadingWidth: 12,
              title: Text(
                s.holder,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: zText(ZSize.body, weight: ZWeight.medium),
              ),
              subtitle: Text(
                [label, if (s.by.isNotEmpty) s.by].join(' · '),
                style: zText(ZSize.small, color: ZColors.muted),
              ),
              trailing: Text(
                Fmt.time(s.at),
                style: zText(ZSize.small, color: ZColors.muted),
              ),
            );
          },
        ),
      ],
      if (d.byController.isNotEmpty) ...[
        const SliverToBoxAdapter(child: ZSection('Contrôleurs')),
        SliverList.builder(
          itemCount: d.byController.length,
          itemBuilder: (_, i) {
            final c = d.byController[i];
            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              leading: CircleAvatar(
                backgroundColor: ZColors.surface,
                child: Text(
                  c.name.isEmpty ? '?' : c.name[0].toUpperCase(),
                  style: zText(ZSize.body, weight: ZWeight.bold),
                ),
              ),
              title: Text(
                c.name,
                style: zText(ZSize.body, weight: ZWeight.medium),
              ),
              trailing: Text(
                '${Fmt.count(c.count)} scan${c.count > 1 ? 's' : ''}',
                style: zText(ZSize.small, color: ZColors.muted),
              ),
            );
          },
        ),
      ],
    ];
  }
}

class _Kpi extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final double? bar;
  final Color? barColor;
  final bool highlight;

  const _Kpi({
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
    return Container(
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
            style: zText(
              ZSize.small,
              weight: ZWeight.medium,
              color: highlight ? fg : ZColors.muted,
            ),
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
            Text(
              sub!,
              style: zText(ZSize.small, color: highlight ? fg : ZColors.muted),
            ),
          ],
        ],
      ),
    );
  }
}

/// « En direct » with a pulsing dot: the screen follows sales and entries as they happen
class _LiveBadge extends StatefulWidget {
  const _LiveBadge();

  @override
  State<_LiveBadge> createState() => _LiveBadgeState();
}

class _LiveBadgeState extends State<_LiveBadge>
    with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        FadeTransition(
          opacity: Tween(begin: 0.3, end: 1.0).animate(_pulse),
          child: const CircleAvatar(radius: 4, backgroundColor: ZColors.green),
        ),
        const SizedBox(width: 6),
        Text(
          'En direct',
          style: zText(
            ZSize.small,
            weight: ZWeight.medium,
            color: ZColors.green,
          ),
        ),
      ],
    );
  }
}
