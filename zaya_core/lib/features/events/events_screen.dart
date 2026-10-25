import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'event_dashboard_screen.dart';
import 'event_form_screen.dart';
import 'events_data.dart';

/// Home tab: the events of the account, coming ones first
class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsProvider);
    final session = ref.watch(sessionProvider);
    final user = session is SignedIn ? session.user : null;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: ZColors.ink,
        foregroundColor: ZColors.onInk,
        onPressed: () => Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => const EventFormScreen())),
        icon: const Icon(Icons.add),
        label: const Text('Créer'),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: ZColors.ink,
          onRefresh: () => ref.refresh(eventsProvider.future),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.workspace != null
                            ? user!.workspace!.ownerName
                            : 'Bonjour ${user?.firstName ?? ''}',
                        style: zText(
                          ZSize.small,
                          weight: ZWeight.medium,
                          color: ZColors.muted,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Événements',
                        style: zText(
                          ZSize.display,
                          weight: ZWeight.black,
                          height: 1.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              ...events.when(
                loading: () => [
                  const SliverFillRemaining(
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
                error: (e, _) => [
                  SliverFillRemaining(
                    child: ZMessage.error(
                      e,
                      () => ref.invalidate(eventsProvider),
                    ),
                  ),
                ],
                data: (list) => list.isEmpty
                    ? [
                        const SliverFillRemaining(
                          child: ZMessage(
                            icon: Icons.event_available_rounded,
                            title: 'Aucun événement',
                            text:
                                'Créez votre premier événement avec le bouton « Créer ».',
                          ),
                        ),
                      ]
                    : [
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                          sliver: SliverList.separated(
                            itemCount: list.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 14),
                            itemBuilder: (_, i) => _EventCard(list[i]),
                          ),
                        ),
                      ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  final EventSummary event;
  const _EventCard(this.event);

  @override
  Widget build(BuildContext context) {
    final pill = switch (event.statusLabel) {
      'En vente' => ZPill('En vente', color: ZColors.green),
      'En cours' => const ZPill(
        'En cours',
        color: ZColors.yellow,
        textColor: ZColors.onYellow,
      ),
      'Brouillon' => ZPill('Brouillon', color: ZColors.muted),
      'Annulé' => const ZPill('Annulé', color: ZColors.red),
      _ => ZPill(
        event.statusLabel,
        color: ZColors.ink,
        textColor: ZColors.onInk,
      ),
    };
    return Material(
      color: ZColors.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => EventDashboardScreen(event: event)),
        ),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ZColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Opacity(
                opacity: event.isPast ? 0.55 : 1,
                child: EventPoster(
                  url: event.bannerUrl,
                  height: 150,
                  radius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            event.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: zText(ZSize.h3, weight: ZWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 10),
                        pill,
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${Fmt.day(event.startDate)} · ${[event.venue, event.city].where((s) => s.isNotEmpty).join(', ')}',
                      style: zText(ZSize.small, color: ZColors.muted),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Icon(
                          Icons.confirmation_number_outlined,
                          size: 16,
                          color: ZColors.muted,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '${Fmt.count(event.tickets)} billet${event.tickets > 1 ? 's' : ''}'
                          '${event.capacity > 0 ? ' sur ${Fmt.count(event.capacity)}' : ''}',
                          style: zText(ZSize.small, weight: ZWeight.medium),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
