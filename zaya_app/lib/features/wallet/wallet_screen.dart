import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/navigation.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../auth/sign_in_screens.dart';
import 'access_screen.dart';
import 'wallet_data.dart';

/// « Billets »: tickets issued to the customer's number, shown offline from the last copy
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final w = ref.watch(walletProvider);
    final header = ZPageHeader(
      overline: s.walletOverline,
      title: s.walletTitle,
      subtitle: s.walletSubtitle,
    );

    if (!w.signedIn) {
      return SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            header,
            Expanded(
              child: ZMessage(
                icon: Icons.confirmation_number_outlined,
                title: s.walletTitle,
                text: s.walletSignedOut,
                actionLabel: s.signIn,
                onAction: () => signIn(context),
              ),
            ),
          ],
        ),
      );
    }

    // One card per event: upcoming first (soonest first), then the past ones (latest first)
    final groups = <String, List<WalletTicket>>{};
    for (final t in w.tickets) {
      groups.putIfAbsent(t.eventId, () => []).add(t);
    }
    final upcoming = groups.values.where((g) => g.any((t) => t.upcoming)).toList();
    final past = groups.values.where((g) => !g.any((t) => t.upcoming)).toList().reversed.toList();
    final offline = w.error != null && w.savedAt != null;

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: ZColors.orange,
        onRefresh: () => ref.read(walletProvider.notifier).refresh(),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: header),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 4),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  decoration: BoxDecoration(
                    color: ZColors.orangeSoft,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        offline ? Icons.cloud_off_rounded : Icons.offline_pin_rounded,
                        size: 18,
                        color: ZColors.orangeText,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          offline ? s.offlineSince(Fmt.ago(w.savedAt!)) : s.offlineNotice,
                          style: zText(ZSize.small, weight: ZWeight.semibold, color: ZColors.orangeText),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (w.tickets.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: w.loading
                    ? const Center(child: CircularProgressIndicator())
                    : w.error != null && w.savedAt == null
                    ? ZMessage.error(w.error!, () => ref.read(walletProvider.notifier).refresh())
                    : ZMessage(
                        icon: Icons.confirmation_number_outlined,
                        title: s.walletEmpty,
                        text: s.walletEmptyText,
                        actionLabel: s.findOuting,
                        onAction: () => ref.read(homeTabProvider.notifier).state = HomeTab.home,
                      ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(24, 14, 24, 28),
                sliver: SliverList.separated(
                  itemCount: upcoming.length + past.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 16),
                  itemBuilder: (_, i) {
                    final g = i < upcoming.length ? upcoming[i] : past[i - upcoming.length];
                    return _EventTickets(tickets: g, upcoming: i < upcoming.length);
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _EventTickets extends StatelessWidget {
  final List<WalletTicket> tickets;
  final bool upcoming;

  const _EventTickets({required this.tickets, required this.upcoming});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final first = tickets.first;
    final status = !upcoming
        ? (first.status == 'CANCELLED' ? s.statusCancelled : first.status == 'USED' ? s.statusUsed : s.statusPast)
        : s.statusValid;
    void open() => Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AccessScreen(tickets: tickets)),
    );
    return ZCard(
      padding: const EdgeInsets.all(12),
      onTap: open,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: EventPoster(url: first.bannerUrl, radius: BorderRadius.circular(14)),
              ),
              Positioned(
                left: 10,
                top: 10,
                child: ZPill(
                  '${s.ticketWord} · $status',
                  color: upcoming ? const Color(0xFFE8F6EE) : const Color(0xFFF1ECE7),
                  textColor: upcoming ? const Color(0xFF15703F) : const Color(0xFF5E5650),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 14, 6, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  first.eventName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: zText(ZSize.h2, weight: ZWeight.bold, height: 1.2),
                ),
                const SizedBox(height: 4),
                Text(
                  [Fmt.dayLongYear(first.start), if (tickets.length > 1) s.ticketCount(tickets.length)].join(' · '),
                  style: zText(ZSize.small, color: ZColors.muted),
                ),
                const SizedBox(height: 14),
                ZButton(
                  height: 46,
                  label: upcoming ? (tickets.length > 1 ? s.showTickets : s.showTicket) : s.seeDetails,
                  style: upcoming ? ZButtonStyle.primary : ZButtonStyle.secondary,
                  onPressed: open,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
