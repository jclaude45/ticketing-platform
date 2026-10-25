import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/config.dart';
import '../../core/realtime.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

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
      appBar: AppBar(
        title: Text('Compte', style: zText(ZSize.h2, weight: ZWeight.black)),
      ),
      body: ListView(
        children: [
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
          const ZSection('Espace de travail'),
          _WorkspaceTile(
            title: 'Mon compte',
            subtitle: 'Mes événements',
            selected: user.workspace == null,
            onTap: () => _switch(context, ref, null),
          ),
          ...workspaces.when(
            loading: () => [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (e, _) => [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Text(
                  ApiException.from(e).message,
                  style: zText(ZSize.small, color: ZColors.muted),
                ),
              ),
            ],
            data: (list) => list
                .map(
                  (w) => _WorkspaceTile(
                    title: w.ownerName,
                    subtitle: 'Collaborateur · ${w.permissionLabel}',
                    selected: user.workspace?.ownerId == w.ownerId,
                    onTap: () => _switch(context, ref, w),
                  ),
                )
                .toList(),
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
