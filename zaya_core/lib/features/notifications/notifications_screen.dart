import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

class AppNotification {
  final String id;
  final String title;
  final String message;
  final String type;
  final bool read;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    message: j['message'] as String? ?? '',
    type: j['type'] as String? ?? 'info',
    read: j['read'] as bool? ?? false,
    createdAt:
        DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
  );
}

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>(
  (ref) async {
    final list =
        await ApiClient.instance.get('/notifications') as List<dynamic>;
    return list
        .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
        .toList();
  },
);

/// Unread count, shown on the tab
final unreadCountProvider = Provider.autoDispose<int>(
  (ref) =>
      ref
          .watch(notificationsProvider)
          .valueOrNull
          ?.where((n) => !n.read)
          .length ??
      0,
);

/// Notifications of the account (sales, publication, plan…), the same as the web bell
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _markAllRead(WidgetRef ref) async {
    await ApiClient.instance.patch('/notifications/read-all');
    ref.invalidate(notificationsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadCountProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Notifications',
          style: zText(ZSize.h2, weight: ZWeight.black),
        ),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: () => _markAllRead(ref),
              child: Text(
                'Tout lire',
                style: zText(ZSize.body, weight: ZWeight.medium),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: notifications.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              SizedBox(
                height: 400,
                child: ZMessage.error(
                  e,
                  () => ref.invalidate(notificationsProvider),
                ),
              ),
            ],
          ),
          data: (list) => list.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(
                      height: 420,
                      child: ZMessage(
                        icon: Icons.notifications_none_rounded,
                        title: 'Rien de nouveau',
                        text:
                            'Vos ventes et les nouvelles de vos événements s’afficheront ici.',
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, _) =>
                      const Divider(indent: 20, endIndent: 20),
                  itemBuilder: (_, i) {
                    final n = list[i];
                    final color = switch (n.type) {
                      'success' => ZColors.green,
                      'warning' => ZColors.orange,
                      'error' => ZColors.red,
                      _ => ZColors.muted,
                    };
                    return ListTile(
                      contentPadding: const EdgeInsets.fromLTRB(20, 6, 20, 6),
                      leading: Icon(
                        Icons.circle,
                        size: 10,
                        color: n.read ? Colors.transparent : color,
                      ),
                      minLeadingWidth: 10,
                      title: Text(
                        n.title,
                        style: zText(
                          ZSize.body,
                          weight: n.read ? ZWeight.medium : ZWeight.bold,
                        ),
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          '${n.message}\n${Fmt.ago(n.createdAt)}',
                          style: zText(
                            ZSize.small,
                            color: ZColors.muted,
                            height: 1.4,
                          ),
                        ),
                      ),
                      onTap: n.read
                          ? null
                          : () async {
                              await ApiClient.instance.patch(
                                '/notifications/${n.id}/read',
                              );
                              ref.invalidate(notificationsProvider);
                            },
                    );
                  },
                ),
        ),
      ),
    );
  }
}
