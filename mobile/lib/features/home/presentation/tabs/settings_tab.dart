import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/constants/colors.dart';
import '../../../../core/feedback/scan_feedback.dart';
import '../../../../core/scanner/hardware_scanner.dart';
import '../../../../core/network/network_info.dart';
import '../../../../core/utils/date_utils.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../auth/presentation/logout.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../events/presentation/providers/events_provider.dart';
import '../../../sync/presentation/providers/sync_provider.dart';
import '../home_shell.dart';

/// Controller, event, offline mode, scan sound, logout.
class SettingsTab extends ConsumerStatefulWidget {
  final String eventId;

  const SettingsTab({super.key, required this.eventId});

  @override
  ConsumerState<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends ConsumerState<SettingsTab> {
  bool _sound = ScanFeedback.instance.soundEnabled;

  @override
  void initState() {
    super.initState();
    ScanFeedback.instance.init().then((_) {
      if (mounted) setState(() => _sound = ScanFeedback.instance.soundEnabled);
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final event = watchEvent(ref, widget.eventId);
    final online = ref.watch(connectivityStreamProvider).valueOrNull ?? true;
    final pack = ref.watch(offlinePackProvider(widget.eventId)).valueOrNull;
    final sync = ref.watch(syncNotifierProvider);

    final String offlineText;
    if (pack != null) {
      offlineText = '${pack.ticketCount} billets sur le téléphone · mis à jour le ${AppDateUtils.formatDateTime(pack.generatedAt)}';
    } else {
      offlineText = online ? 'Téléchargement de la liste des billets…' : 'Liste téléchargée dès le retour du réseau';
    }

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(11, 0, 11, 24),
        children: [
          const SizedBox(height: 56),
          Text('Paramètres', textAlign: TextAlign.center, style: zcText(28, color: AppColors.grey)),
          const SizedBox(height: 32),
          _Row(
            icon: Icons.person_outline_rounded,
            title: user?.name ?? 'Contrôleur',
            subtitle: user?.email,
          ),
          _Row(
            icon: Icons.event_outlined,
            title: event?.name ?? 'Événement',
            subtitle: "Changer d'événement",
            onTap: () => Navigator.pushNamed(context, '/events'),
            chevron: true,
          ),
          _Row(
            icon: online ? Icons.wifi_rounded : Icons.wifi_off_rounded,
            iconColor: online ? AppColors.statusOnline : AppColors.statusOffline,
            title: online ? 'En ligne' : 'Hors ligne',
            subtitle: online
                ? 'Chaque billet est vérifié en temps réel. Si le réseau coupe, le scan continue hors ligne.'
                : 'Les billets sont vérifiés avec la liste du téléphone.',
          ),
          _Row(
            icon: pack != null ? Icons.offline_pin_outlined : Icons.downloading_rounded,
            title: 'Mode hors ligne',
            subtitle: offlineText,
            trailing: sync.isSyncing && online
                ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ink))
                : null,
          ),
          if (sync.pending > 0)
            _Row(
              icon: Icons.cloud_upload_outlined,
              iconColor: AppColors.fraudOrange,
              title: '${sync.pending} entrée(s) à envoyer',
              subtitle: online ? "Envoi en cours…" : 'Envoyée(s) automatiquement au retour du réseau.',
            ),
          _Row(
            icon: Icons.barcode_reader,
            title: 'Scanner intégré (terminal)',
            subtitle: 'Scanner avec la gâchette du terminal, caméra éteinte. La gâchette marche aussi caméra allumée.',
            trailing: Switch(
              value: ref.watch(hardwareScannerOnlyProvider),
              activeThumbColor: AppColors.onInk,
              activeTrackColor: AppColors.ink,
              onChanged: (v) => ref.read(hardwareScannerOnlyProvider.notifier).set(v),
            ),
          ),
          _Row(
            icon: _sound ? Icons.volume_up_outlined : Icons.volume_off_outlined,
            title: 'Son des scans',
            subtitle: 'Bip pour une entrée validée, buzzer pour un refus',
            trailing: Switch(
              value: _sound,
              activeColor: AppColors.onInk,
              activeTrackColor: AppColors.ink,
              onChanged: (v) {
                ScanFeedback.instance.setSoundEnabled(v);
                setState(() => _sound = v);
              },
            ),
          ),
          _Row(icon: Icons.info_outline_rounded, title: 'zcontrole', subtitle: 'Version ${AppConstants.appVersion}'),
          const SizedBox(height: 36),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 31),
            child: ZcButton(label: 'Déconnexion', onPressed: () => confirmLogout(context, ref)),
          ),
        ],
      ),
    );
  }
}

/// Line of the list, separated like the guest list.
class _Row extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool chevron;

  const _Row({
    required this.icon,
    this.iconColor,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.chevron = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 73),
        padding: const EdgeInsets.fromLTRB(11, 14, 11, 14),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.grey.withValues(alpha: 0.5)))),
        child: Row(
          children: [
            Icon(icon, size: 22, color: iconColor ?? AppColors.ink),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: zcText(14, weight: FontWeight.w500)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(subtitle!, style: zcText(12, color: AppColors.grey, height: 1.4)),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
            if (chevron) Icon(Icons.chevron_right_rounded, color: AppColors.grey),
          ],
        ),
      ),
    );
  }
}
