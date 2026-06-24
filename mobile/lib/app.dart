import 'package:flutter/material.dart';
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

class TicketScannerApp extends ConsumerWidget {
  const TicketScannerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(authStateProvider);

    return MaterialApp(
      title: 'Ticket Scanner',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
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
