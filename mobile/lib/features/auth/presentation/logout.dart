import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/colors.dart';
import '../../../shared/widgets/zc_widgets.dart';
import '../../sync/presentation/providers/sync_provider.dart';
import 'providers/auth_provider.dart';

/// Asks before logging out — offline entries not sent yet would be lost — then back to
/// the welcome screen.
Future<void> confirmLogout(BuildContext context, WidgetRef ref) async {
  // Offline entries are deleted with the session: try to send them first
  final sync = ref.read(syncNotifierProvider.notifier);
  await sync.refreshPending();
  if (ref.read(syncNotifierProvider).pending > 0) await sync.sync();
  if (!context.mounted) return;
  final pending = ref.read(syncNotifierProvider).pending;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.page,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text('Déconnexion', style: zcText(18, weight: FontWeight.w600)),
      content: Text(
        pending > 0
            ? "$pending entrée(s) validée(s) hors ligne n'ont pas encore été envoyées au serveur. "
                "Si vous vous déconnectez maintenant, elles seront perdues. Reconnectez-vous au réseau et attendez l'envoi."
            : 'Voulez-vous vraiment vous déconnecter ?',
        style: zcText(14, color: pending > 0 ? AppColors.fraudOrange : AppColors.grey),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: Text('Annuler', style: zcText(14, color: AppColors.grey)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(pending > 0 ? 'Se déconnecter quand même' : 'Se déconnecter',
              style: zcText(14, weight: FontWeight.w500, color: AppColors.usedRed)),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return;
  await ref.read(authNotifierProvider.notifier).logout();
  if (context.mounted) Navigator.pushNamedAndRemoveUntil(context, '/welcome', (_) => false);
}
