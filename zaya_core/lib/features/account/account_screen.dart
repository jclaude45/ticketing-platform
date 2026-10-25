import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../core/realtime.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../money/payouts_screen.dart';
import '../notifications/notifications_screen.dart';
import 'notification_settings_screen.dart';
import '../team/collaborators_screen.dart';
import '../team/controllers_screen.dart';

final workspacesProvider = FutureProvider.autoDispose<List<Workspace>>(
  (ref) => ref.read(sessionProvider.notifier).workspaces(),
);

/// The signed-in person, the account worked on (own or shared) and sign-out
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (session is! SignedIn) return const SizedBox.shrink();
    final user = session.user;
    final workspaces = ref.watch(workspacesProvider);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          children: [
            const ZPageHeader(title: 'Compte', trailing: NotificationBell()),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: ZColors.yellow,
                    child: Text(
                      (user.firstName.isNotEmpty
                              ? user.firstName[0]
                              : user.email[0])
                          .toUpperCase(),
                      style: zText(
                        ZSize.h2,
                        weight: ZWeight.black,
                        color: ZColors.onYellow,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.fullName.isEmpty ? user.email : user.fullName,
                          style: zText(ZSize.h3, weight: ZWeight.bold),
                        ),
                        Text(
                          user.email,
                          style: zText(ZSize.small, color: ZColors.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const ZSection('Équipe'),
            _NavTile(
              icon: Icons.qr_code_scanner_rounded,
              title: 'Contrôleurs',
              subtitle: 'Scan des billets à l’entrée',
              screen: const ControllersScreen(),
            ),
            _NavTile(
              icon: Icons.groups_outlined,
              title: 'Collaborateurs',
              subtitle: 'Personnes qui gèrent ce compte avec vous',
              screen: const CollaboratorsScreen(),
            ),
            const ZSection('Argent'),
            _NavTile(
              icon: Icons.account_balance_wallet_outlined,
              title: 'Versements',
              subtitle: 'Vos ventes en ligne et quand elles sont versées',
              screen: const PayoutsScreen(),
            ),
            const ZSection('Préférences'),
            const _NavTile(
              icon: Icons.notifications_active_outlined,
              title: 'Notifications',
              subtitle: 'Alertes sur ce téléphone et par e-mail',
              screen: NotificationSettingsScreen(),
            ),
            // Only for people invited to manage another organizer's account: switch between
            // their own events and the accounts shared with them (hidden otherwise)
            ...workspaces.maybeWhen(
              data: (list) => list.isEmpty && user.workspace == null
                  ? <Widget>[]
                  : [
                      const ZSection('Comptes partagés avec vous'),
                      _WorkspaceTile(
                        title: 'Mon compte',
                        subtitle: 'Mes propres événements',
                        selected: user.workspace == null,
                        onTap: () => _switch(context, ref, null),
                      ),
                      ...list.map(
                        (w) => _WorkspaceTile(
                          title: w.ownerName,
                          subtitle:
                              'Vous êtes collaborateur · ${w.permissionLabel}',
                          selected: user.workspace?.ownerId == w.ownerId,
                          onTap: () => _switch(context, ref, w),
                        ),
                      ),
                    ],
              orElse: () => <Widget>[],
            ),
            const SizedBox(height: 36),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: ZButton(
                label: 'Se déconnecter',
                outlined: true,
                onPressed: () async {
                  Realtime.instance.close();
                  await ref.read(sessionProvider.notifier).logout();
                },
              ),
            ),
            const SizedBox(height: 20),
            Center(
              child: Text(
                'ZAYA Core ${AppConfig.appVersion}',
                style: zText(ZSize.caption, color: ZColors.muted),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Future<void> _switch(
    BuildContext context,
    WidgetRef ref,
    Workspace? w,
  ) async {
    // Live rooms are per account: the next screens reconnect with the right one
    Realtime.instance.close();
    await ref.read(sessionProvider.notifier).switchWorkspace(w);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            w == null
                ? 'Vous travaillez sur votre compte.'
                : 'Vous travaillez sur le compte de ${w.ownerName}.',
          ),
        ),
      );
    }
  }
}

class _WorkspaceTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _WorkspaceTile({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
      title: Text(title, style: zText(ZSize.body, weight: ZWeight.bold)),
      subtitle: Text(subtitle, style: zText(ZSize.small, color: ZColors.muted)),
      trailing: selected
          ? const Icon(Icons.check_circle_rounded, color: ZColors.green)
          : Icon(Icons.radio_button_unchecked, color: ZColors.line),
      onTap: selected ? null : onTap,
    );
  }
}

class _NavTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget screen;

  const _NavTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.screen,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
      leading: Icon(icon, color: ZColors.ink),
      title: Text(title, style: zText(ZSize.body, weight: ZWeight.bold)),
      subtitle: Text(subtitle, style: zText(ZSize.small, color: ZColors.muted)),
      trailing: Icon(Icons.chevron_right_rounded, color: ZColors.muted),
      onTap: () =>
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen)),
    );
  }
}
