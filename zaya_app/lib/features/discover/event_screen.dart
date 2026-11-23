import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../purchase/choose_screen.dart';
import 'events_data.dart';

/// Event page: poster, when and where, invitation to friends, then the purchase
class EventScreen extends ConsumerWidget {
  final String eventId;

  /// What the list already knows: shown at once while the full page loads
  final PublicEvent? preview;

  const EventScreen({super.key, required this.eventId, this.preview});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final async = ref.watch(eventProvider(eventId));
    final event = async.valueOrNull ?? preview;
    final full = async.valueOrNull;
    return Scaffold(
      appBar: zAppBar(s.eventTitle),
      body: event == null
          ? async.hasError
                ? ZMessage.error(async.error!, () => ref.invalidate(eventProvider(eventId)))
                : const Center(child: CircularProgressIndicator())
          : _Body(event: event, full: full != null),
      bottomNavigationBar: full == null || full.ended || full.categories.isEmpty
          ? null
          : ZActionBar(
              caption: s.startingAt,
              amount: full.isFree || (full.minPrice ?? 0) == 0
                  ? s.free
                  : Fmt.money(full.minPrice!, full.currency),
              label: full.soldOut ? s.soldOut : s.chooseTickets,
              onPressed: full.soldOut
                  ? null
                  : () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => ChooseScreen(event: full)),
                    ),
            ),
    );
  }
}

class _Body extends StatelessWidget {
  final PublicEvent event;

  /// The description and the organizer come with the full page only
  final bool full;

  const _Body({required this.event, required this.full});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final e = event;
    final place = [e.venue, e.address, e.city]
        .whereType<String>()
        .where((p) => p.trim().isNotEmpty)
        .join(', ');
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      children: [
        AspectRatio(aspectRatio: 1, child: EventPoster(url: e.bannerUrl, radius: BorderRadius.circular(20))),
        const SizedBox(height: 20),
        Text(e.name, style: zText(ZSize.display, weight: ZWeight.bold, height: 1.15)),
        const SizedBox(height: 8),
        Text(
          Fmt.dayLongTime(e.start),
          style: zText(ZSize.title, weight: ZWeight.semibold, color: ZColors.orangeText),
        ),
        if (e.performers.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            e.performers.join(' · '),
            style: zText(ZSize.body, weight: ZWeight.medium, color: ZColors.muted),
          ),
        ],
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ZPill(s.eventType(e.type), color: ZColors.orangeSoft, textColor: ZColors.orangeText),
            ZPill(e.venue, color: ZColors.surface),
          ],
        ),
        const SizedBox(height: 18),
        ZCard(
          onTap: () => SharePlus.instance.share(
            ShareParams(text: s.shareText(e.name, AppConfig.eventUrl(e.id))),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(s.inviteFriends, style: zText(ZSize.title, weight: ZWeight.semibold)),
              ),
              Icon(Icons.arrow_forward_rounded, color: ZColors.ink),
            ],
          ),
        ),
        const SizedBox(height: 10),
        ZCard(
          child: Row(
            children: [
              Icon(Icons.place_outlined, color: ZColors.orange),
              const SizedBox(width: 12),
              Expanded(
                child: Text(place, style: zText(ZSize.body, weight: ZWeight.medium, height: 1.4)),
              ),
            ],
          ),
        ),
        if (full && (e.description ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: 26),
          Text(s.about, style: zText(ZSize.h2, weight: ZWeight.bold)),
          const SizedBox(height: 10),
          Text(
            e.description!.trim(),
            style: zText(ZSize.body, color: ZColors.muted, height: 1.6),
          ),
        ],
        if (full && e.organizer != null) ...[
          const SizedBox(height: 26),
          Text(s.organizer, style: zText(ZSize.h3, weight: ZWeight.bold)),
          const SizedBox(height: 10),
          ZCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: ZColors.orangeSoft,
                  child: Text(
                    e.organizer!.characters.first.toUpperCase(),
                    style: zText(ZSize.title, weight: ZWeight.bold, color: ZColors.orangeText),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(e.organizer!, style: zText(ZSize.title, weight: ZWeight.semibold)),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
