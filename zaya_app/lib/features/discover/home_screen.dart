import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'event_screen.dart';
import 'events_data.dart';

/// « Accueil »: what to do tonight in one screen, without an account
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  var _window = Window.tonight;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final query = EventsQuery(window: _window);
    final events = ref.watch(eventsProvider(query));
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: ZColors.orange,
        onRefresh: () => ref.refresh(eventsProvider(query).future),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                child: Row(
                  children: [
                    const ZLogo(size: 26),
                    const Spacer(),
                    ZPill(
                      s.city,
                      color: ZColors.orangeSoft,
                      textColor: ZColors.orangeText,
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: ZPageHeader(title: s.homeTitle, subtitle: s.homeSubtitle),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                child: Row(
                  children: [
                    for (final w in Window.values) ...[
                      if (w != Window.values.first) const SizedBox(width: 8),
                      Expanded(
                        child: ZChip(
                          label: switch (w) {
                            Window.tonight => s.tonight,
                            Window.weekend => s.weekend,
                            Window.upcoming => s.upcoming,
                          },
                          selected: _window == w,
                          fill: true,
                          onTap: () => setState(() => _window = w),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            ...events.when(
              loading: () => [
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
              error: (e, _) => [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ZMessage.error(e, () => ref.invalidate(eventsProvider(query))),
                ),
              ],
              data: (list) => list.isEmpty
                  ? [
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: ZMessage(
                          icon: Icons.nightlife_rounded,
                          title: s.noEvents,
                          text: _window == Window.upcoming ? null : s.noEventsHint,
                        ),
                      ),
                    ]
                  : [
                      SliverToBoxAdapter(child: ZSection(s.featured)),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: FeaturedCard(event: list.first),
                        ),
                      ),
                      if (list.length > 1) ...[
                        SliverToBoxAdapter(
                          child: ZSection(s.discoverMore, subtitle: s.discoverMoreText),
                        ),
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
                          sliver: SliverGrid.builder(
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              mainAxisSpacing: 14,
                              crossAxisSpacing: 14,
                              childAspectRatio: 0.66,
                            ),
                            itemCount: list.length - 1,
                            itemBuilder: (_, i) => GridEventCard(event: list[i + 1]),
                          ),
                        ),
                      ] else
                        const SliverToBoxAdapter(child: SizedBox(height: 28)),
                    ],
            ),
          ],
        ),
      ),
    );
  }
}

void openEvent(BuildContext context, PublicEvent e) => Navigator.of(context).push(
  MaterialPageRoute(builder: (_) => EventScreen(eventId: e.id, preview: e)),
);

/// « Gratuit », « Dès 10 $ », or nothing to sell yet
String priceLabel(S s, PublicEvent e) {
  if (e.isFree) return s.free;
  final min = e.minPrice;
  if (min == null) return '';
  return min == 0 ? s.free : s.from(Fmt.money(min, e.currency));
}

/// The big card of « À la une »
class FeaturedCard extends StatelessWidget {
  final PublicEvent event;
  const FeaturedCard({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final e = event;
    return ZCard(
      padding: const EdgeInsets.all(12),
      onTap: () => openEvent(context, e),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              AspectRatio(aspectRatio: 1, child: EventPoster(url: e.bannerUrl)),
              if (e.soldOut || e.ended)
                Positioned(left: 10, top: 10, child: _StatusPill(event: e)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 14, 6, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: zText(ZSize.h2, weight: ZWeight.bold, height: 1.2),
                ),
                const SizedBox(height: 6),
                Text(
                  '${Fmt.dayLongYear(e.start)} · ${e.venue}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: zText(ZSize.small, color: ZColors.muted),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        priceLabel(s, e),
                        style: zText(ZSize.h3, weight: ZWeight.bold),
                      ),
                    ),
                    SizedBox(
                      width: 130,
                      child: ZButton(
                        label: s.book,
                        height: 40,
                        onPressed: () => openEvent(context, e),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A card of the « À découvrir aussi » grid
class GridEventCard extends StatelessWidget {
  final PublicEvent event;
  const GridEventCard({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    final e = event;
    return ZCard(
      padding: const EdgeInsets.all(8),
      onTap: () => openEvent(context, e),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: EventPoster(url: e.bannerUrl, radius: BorderRadius.circular(12)),
              ),
              if (e.soldOut || e.ended)
                Positioned(left: 6, top: 6, child: _StatusPill(event: e)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
            child: Text(
              e.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: zText(ZSize.body, weight: ZWeight.bold, height: 1.25),
            ),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
            child: Text(
              Fmt.dayLong(e.start),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: zText(ZSize.small, color: ZColors.muted),
            ),
          ),
        ],
      ),
    );
  }
}

/// A row of the search lists: small poster, name, date in orange, place
class EventRow extends StatelessWidget {
  final PublicEvent event;
  const EventRow({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    final e = event;
    return ZCard(
      padding: const EdgeInsets.all(10),
      onTap: () => openEvent(context, e),
      child: Row(
        children: [
          SizedBox(
            width: 62,
            height: 62,
            child: EventPoster(url: e.bannerUrl, radius: BorderRadius.circular(12)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: zText(ZSize.title, weight: ZWeight.bold),
                ),
                const SizedBox(height: 3),
                Text(
                  Fmt.dayLong(e.start),
                  style: zText(ZSize.small, weight: ZWeight.semibold, color: ZColors.orangeText),
                ),
                const SizedBox(height: 2),
                Text(
                  [e.venue, e.city].where((p) => p.isNotEmpty).join(', '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: zText(ZSize.small, color: ZColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final PublicEvent event;
  const _StatusPill({required this.event});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return event.ended
        ? ZPill(s.ended, color: ZColors.surface)
        : ZPill(s.soldOut, color: ZColors.red, textColor: Colors.white);
  }
}
