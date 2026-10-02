import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/network/network_info.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../events/presentation/providers/events_provider.dart';
import '../../../sync/presentation/providers/sync_provider.dart';
import '../home_shell.dart';

/// "Prêt à scanner vos billets": event card, then the camera on "Commencer".
class ScannerTab extends ConsumerWidget {
  final String eventId;

  /// The tab is on screen: the scan drawing only runs while it is
  final bool active;

  const ScannerTab({super.key, required this.eventId, this.active = true});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final event = watchEvent(ref, eventId);
    final detail = ref.watch(eventDetailProvider(eventId));
    final entries = watchEntries(ref, eventId);

    return SafeArea(
      bottom: false,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final qrSize = math.min(250.0, constraints.maxHeight * 0.33);
          return RefreshIndicator(
            color: AppColors.ink,
            onRefresh: () => refreshEvent(ref, eventId),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: IntrinsicHeight(
                  child: Column(
                    children: [
                      const SizedBox(height: 56),
                      if (event != null)
                        ZcEventCard(name: event.name, checkedIn: entries.checkedIn, total: entries.total)
                      else if (detail.hasError)
                        _EventError(message: detail.error.toString())
                      else
                        const SizedBox(height: 80, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
                      const SizedBox(height: 10),
                      _OfflineLine(eventId: eventId),
                      const Spacer(),
                      ZcAnimatedIllustration('scanner_qr_boucle', height: qrSize, active: active, loop: true, keepColors: true),
                      const SizedBox(height: 40),
                      Text(
                        'Prêt à scanner\nvos billets',
                        textAlign: TextAlign.center,
                        style: zcText(ZcSize.h1, weight: ZcWeight.bold, height: 1.2),
                      ),
                      const SizedBox(height: 25),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 42),
                        child: ZcButton(
                          label: 'Commencer',
                          onPressed: event == null
                              ? null
                              : () => Navigator.pushNamed(context, '/scanner', arguments: eventId)
                                  // Back from scanning: the counters and the guest list follow
                                  .then((_) => refreshEvent(ref, eventId)),
                        ),
                      ),
                      const Spacer(),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Only when it matters: no network, or entries validated offline not sent yet.
class _OfflineLine extends ConsumerWidget {
  final String eventId;

  const _OfflineLine({required this.eventId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityStreamProvider).valueOrNull ?? true;
    final pending = ref.watch(syncNotifierProvider.select((s) => s.pending));
    final pack = ref.watch(offlinePackProvider(eventId)).valueOrNull;
    final String? text;
    if (!online && pack == null) {
      text = 'Hors ligne · liste des billets pas encore téléchargée';
    } else if (!online) {
      text = pending > 0 ? 'Hors ligne · $pending entrée(s) à envoyer' : 'Hors ligne · vérification avec la liste du téléphone';
    } else if (pending > 0) {
      text = 'Envoi de $pending entrée(s) validée(s) hors ligne…';
    } else {
      text = null;
    }
    if (text == null) return const SizedBox(height: 18);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(online ? Icons.cloud_upload_outlined : Icons.wifi_off_rounded, size: 14, color: AppColors.statusOffline),
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: zcText(ZcSize.small, color: AppColors.grey))),
      ],
    );
  }
}

class _EventError extends StatelessWidget {
  final String message;

  const _EventError({required this.message});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          Text(message, textAlign: TextAlign.center, style: zcText(ZcSize.body, color: AppColors.grey)),
          TextButton(
            onPressed: () => Navigator.pushNamed(context, '/events'),
            child: Text("Changer d'événement", style: zcText(ZcSize.body, weight: ZcWeight.medium)),
          ),
        ],
      ),
    );
  }
}
