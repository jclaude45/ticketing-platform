import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/feedback/scan_feedback.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../guests/data/guests_repository.dart';
import '../../../sync/presentation/providers/sync_provider.dart';
import '../home_shell.dart';
import 'add_guest_view.dart';

/// Guests of the event (invitation tickets) with their entry time; tap one who is not in
/// yet to let them in. "Ajouter invité" (invitation form) is hidden for now: see
/// [GuestsTab.invitesEnabled].
class GuestsTab extends ConsumerStatefulWidget {
  final String eventId;

  const GuestsTab({super.key, required this.eventId});

  /// Sending invitations from the app is switched off (organizer's side only for now)
  static const invitesEnabled = false;

  @override
  ConsumerState<GuestsTab> createState() => _GuestsTabState();
}

class _GuestsTabState extends ConsumerState<GuestsTab> {
  final _search = TextEditingController();
  bool _adding = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _checkIn(Guest guest) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.page,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(42, 28, 42, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(guest.name, textAlign: TextAlign.center, style: zcText(20, weight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(
                [guest.ticketType, guest.serialNumber].whereType<String>().join(' · '),
                textAlign: TextAlign.center,
                style: zcText(12, color: AppColors.grey),
              ),
              const SizedBox(height: 24),
              ZcButton(label: "Valider l'entrée", onPressed: () => Navigator.pop(ctx, true)),
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text('Annuler', style: zcText(14, color: AppColors.grey)),
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed != true || !mounted) return;

    final result = await getIt<GuestsRepository>().checkIn(widget.eventId, guest);
    result.isValid ? ScanFeedback.instance.accepted() : ScanFeedback.instance.refused();
    if (result.isOfflineResult) ref.read(syncNotifierProvider.notifier).refreshPending();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(result.isValid ? 'Entrée validée : ${guest.name}' : (result.errorMessage ?? 'Entrée refusée')),
      backgroundColor: result.isValid ? AppColors.validGreen : AppColors.usedRed,
    ));
    await refreshEvent(ref, widget.eventId);
  }

  @override
  Widget build(BuildContext context) {
    if (_adding) {
      return AddGuestView(
        eventId: widget.eventId,
        onClose: () => setState(() => _adding = false),
      );
    }

    final event = watchEvent(ref, widget.eventId);
    final entries = watchEntries(ref, widget.eventId);
    final guests = ref.watch(eventGuestsProvider(widget.eventId));
    final query = _search.text.trim().toLowerCase();

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          if (GuestsTab.invitesEnabled)
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 12, 14, 8),
                child: TextButton(
                  onPressed: () => setState(() => _adding = true),
                  child: Text('Ajouter invité', style: zcText(14, color: AppColors.grey)),
                ),
              ),
            )
          else
            const SizedBox(height: 56), // same place for the card as on the Scanner tab
          if (event != null) ZcEventCard(name: event.name, checkedIn: entries.checkedIn, total: entries.total),
          const SizedBox(height: 40),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 11),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.grey))),
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              style: zcText(14),
              cursorColor: AppColors.ink,
              decoration: InputDecoration(
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                prefixIcon: Icon(Icons.search_rounded, size: 22, color: AppColors.grey),
                hintText: 'Rechercher',
                hintStyle: zcText(14, color: AppColors.hint),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.ink,
              onRefresh: () => refreshEvent(ref, widget.eventId),
              child: guests.when(
                loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                error: (e, _) => _Message(e.toString()),
                data: (all) {
                  final list = query.isEmpty
                      ? all
                      : all.where((g) => g.name.toLowerCase().contains(query) || g.serialNumber.toLowerCase().contains(query)).toList();
                  if (all.isEmpty) {
                    return const _Message(
                        "Aucun invité pour cet événement.\nLa liste se met à jour automatiquement.");
                  }
                  if (list.isEmpty) return const _Message('Aucun invité ne correspond à la recherche.');
                  return ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 16),
                    itemCount: list.length,
                    itemBuilder: (_, i) => _GuestRow(guest: list[i], onTap: list[i].checkedIn ? null : () => _checkIn(list[i])),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GuestRow extends StatelessWidget {
  static final _format = DateFormat('dd/MM/yyyy HH:mm');

  final Guest guest;
  final VoidCallback? onTap;

  const _GuestRow({required this.guest, this.onTap});

  @override
  Widget build(BuildContext context) {
    final at = guest.checkedInAt;
    final time = at == null ? '__/__/____ __:__' : (at.millisecondsSinceEpoch == 0 ? 'Entré(e)' : _format.format(at.toLocal()));
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 73,
        margin: const EdgeInsets.symmetric(horizontal: 11),
        padding: const EdgeInsets.only(left: 11, right: 30),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.grey))),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(guest.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: zcText(14, color: AppColors.grey)),
                  const SizedBox(height: 4),
                  Text(time, style: zcText(11, color: AppColors.grey.withValues(alpha: 0.48))),
                ],
              ),
            ),
            if (guest.checkedIn) Icon(Icons.check_rounded, size: 22, color: AppColors.ink),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final String text;

  const _Message(this.text);

  @override
  Widget build(BuildContext context) {
    // Scrollable so pull-to-refresh works on an empty list
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(40, 48, 40, 0),
      children: [Text(text, textAlign: TextAlign.center, style: zcText(14, color: AppColors.grey, height: 1.6))],
    );
  }
}
