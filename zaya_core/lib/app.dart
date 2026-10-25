import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/push.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'features/account/account_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/events/event_dashboard_screen.dart';
import 'features/events/events_data.dart';
import 'features/events/events_screen.dart';
import 'features/notifications/notifications_screen.dart';

class ZayaCoreApp extends ConsumerWidget {
  const ZayaCoreApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Follows the phone's light / dark mode
    ZColors.isDark =
        MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final session = ref.watch(sessionProvider);
    return MaterialApp(
      title: 'ZAYA Core',
      debugShowCheckedModeBanner: false,
      theme: zTheme(),
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: switch (session) {
        SessionLoading() => const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
        SignedOut(:final reason) => LoginScreen(
          key: ValueKey(reason),
          notice: reason,
        ),
        // A new key per account worked on: every tab reloads its data
        SignedIn(:final user) => HomeShell(
          key: ValueKey('${user.id}:${user.workspace?.ownerId}'),
        ),
      },
    );
  }
}

/// Bottom tabs once signed in
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;
  final _subs = <StreamSubscription<Object>>[];

  @override
  void initState() {
    super.initState();
    // A notification while the app is open: shown as a bar, and the screens reload
    _subs.add(
      Push.instance.foreground.stream.listen((m) {
        ref.invalidate(notificationsProvider);
        final eventId = m.data['eventId']?.toString();
        if (eventId != null) ref.invalidate(eventDashboardProvider(eventId));
        final title = m.notification?.title;
        if (title != null && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                [title, m.notification?.body].whereType<String>().join(' — '),
              ),
            ),
          );
        }
      }),
    );
    // A tapped notification opens its event (or the notifications)
    _subs.add(Push.instance.taps.stream.listen(_open));
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  Future<void> _open(PushTap tap) async {
    if (tap.eventId == null) {
      setState(() => _tab = 1);
      return;
    }
    try {
      final events = await ref.read(eventsProvider.future);
      final event = events.where((e) => e.id == tap.eventId).firstOrNull;
      if (event == null || !mounted) return;
      setState(() => _tab = 0);
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => EventDashboardScreen(event: event)),
      );
    } catch (_) {
      if (mounted) setState(() => _tab = 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(unreadCountProvider);
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: const [
          EventsScreen(),
          NotificationsScreen(),
          AccountScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i == 1) ref.invalidate(notificationsProvider);
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.event_outlined),
            selectedIcon: Icon(Icons.event),
            label: 'Événements',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
            selectedIcon: const Icon(Icons.notifications_rounded),
            label: 'Notifications',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Compte',
          ),
        ],
      ),
    );
  }
}
