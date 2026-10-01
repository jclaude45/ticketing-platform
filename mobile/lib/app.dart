import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/presentation/providers/auth_provider.dart';
import 'features/auth/presentation/screens/login_screen.dart';
import 'features/auth/presentation/screens/splash_screen.dart';
import 'features/events/presentation/screens/events_list_screen.dart';
import 'features/events/presentation/screens/event_detail_screen.dart';
import 'features/scanner/presentation/screens/scanner_screen.dart';
import 'features/scanner/presentation/screens/validation_result_screen.dart';
import 'features/scanner/domain/entities/validation_result.dart';
import 'shared/theme/app_theme.dart';
import 'core/session/session_events.dart';
import 'core/di/injection_container.dart';
import 'core/network/network_info.dart';
import 'core/storage/secure_storage.dart';
import 'core/constants/colors.dart';
import 'features/sync/presentation/providers/sync_provider.dart';

/// Lets non-widget code (session expiry) navigate.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<ScaffoldMessengerState> appMessengerKey = GlobalKey<ScaffoldMessengerState>();

class TicketScannerApp extends ConsumerStatefulWidget {
  const TicketScannerApp({super.key});

  @override
  ConsumerState<TicketScannerApp> createState() => _TicketScannerAppState();
}

class _TicketScannerAppState extends ConsumerState<TicketScannerApp> with WidgetsBindingObserver {
  StreamSubscription<void>? _sessionSub;
  Timer? _syncTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    AppColors.isDark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
    _applySystemBars();
    // Every minute: send pending entries; the ticket lists when they are due (3 min)
    _syncTimer = Timer.periodic(const Duration(minutes: 1), (_) => _autoSync());
    // Session could not be renewed: back to the login screen with an explanation
    _sessionSub = SessionEvents.expired.listen((_) {
      ref.read(authNotifierProvider.notifier).sessionExpired();
      appNavigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (_) => false);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _syncTimer?.cancel();
    _sessionSub?.cancel();
    super.dispose();
  }

  /// Phone switched between light and dark: new palette, then every widget rebuilt (many
  /// read [AppColors] directly) while keeping the screens open and their state.
  @override
  void didChangePlatformBrightness() {
    final dark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
    if (dark == AppColors.isDark) return;
    setState(() => AppColors.isDark = dark);
    _applySystemBars();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      void rebuild(Element e) {
        e.markNeedsBuild();
        e.visitChildren(rebuild);
      }
      (context as Element).visitChildren(rebuild);
    });
  }

  /// Status / navigation bar icons readable on the current background
  void _applySystemBars() {
    final dark = AppColors.isDark;
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
      statusBarBrightness: dark ? Brightness.dark : Brightness.light, // iOS
      systemNavigationBarColor: AppColors.backgroundDark,
      systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    ));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _autoSync(packs: true);
  }

  /// Sends the entries validated offline (and refreshes the ticket lists) when the
  /// network is back; only with a session, so the login screen never triggers it.
  Future<void> _autoSync({bool? packs}) async {
    if (!await getIt<SecureStorage>().isLoggedIn) return;
    final report = await ref.read(syncNotifierProvider.notifier).sync(packs: packs);
    final message = report == null ? null : describeSync(report);
    if (message == null) return;
    appMessengerKey.currentState?.showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: report!.conflicts > 0 ? AppColors.fraudOrange : null,
      duration: Duration(seconds: report.conflicts > 0 ? 8 : 4),
    ));
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<bool>>(connectivityStreamProvider, (previous, next) {
      if (next.valueOrNull == true && previous?.valueOrNull != true) _autoSync(packs: true);
    });
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      scaffoldMessengerKey: appMessengerKey,
      title: 'ZControle',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.current,
      initialRoute: '/',
      onGenerateRoute: (settings) {
        switch (settings.name) {
          case '/':
            return MaterialPageRoute(
              builder: (_) => const SplashScreen(),
            );
          case '/login':
            return MaterialPageRoute(
              builder: (_) => const LoginScreen(),
            );
          case '/events':
            return MaterialPageRoute(
              builder: (_) => const EventsListScreen(),
            );
          case '/event-detail':
            final eventId = settings.arguments as String;
            return MaterialPageRoute(
              builder: (_) => EventDetailScreen(eventId: eventId),
            );
          case '/scanner':
            final eventId = settings.arguments as String;
            return MaterialPageRoute(
              builder: (_) => ScannerScreen(eventId: eventId),
            );
          case '/validation-result':
            final result = settings.arguments as ValidationResult;
            return PageRouteBuilder(
              pageBuilder: (_, animation, __) =>
                  ValidationResultScreen(result: result),
              transitionDuration: const Duration(milliseconds: 300),
              transitionsBuilder: (_, animation, __, child) {
                return FadeTransition(
                  opacity: animation,
                  child: ScaleTransition(
                    scale: Tween<double>(begin: 0.9, end: 1.0).animate(
                      CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutBack,
                      ),
                    ),
                    child: child,
                  ),
                );
              },
            );
          default:
            return MaterialPageRoute(
              builder: (_) => const SplashScreen(),
            );
        }
      },
    );
  }
}
