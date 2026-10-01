import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../providers/auth_provider.dart';

/// Logo + name, then: intro (first launch), welcome, event choice or straight to the event.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..forward();

  @override
  void initState() {
    super.initState();
    Future.wait([_route(), Future<void>.delayed(const Duration(milliseconds: 1600))]).then((results) {
      if (!mounted) return;
      final (String name, Object? args) = results.first as (String, Object?);
      Navigator.pushReplacementNamed(context, name, arguments: args);
    });
  }

  Future<(String, Object?)> _route() async {
    final storage = getIt<SecureStorage>();
    try {
      // Restores the stored controller (and its name) — anything else goes to login
      await ref.read(authNotifierProvider.notifier).checkAuthStatus();
      if (ref.read(authNotifierProvider).status == AuthStatus.authenticated) {
        final eventId = await storage.getSelectedEventId();
        return eventId == null ? ('/events', null) : ('/home', eventId);
      }
      // Stale or non-controller session (older builds logged organizers in): drop it
      await storage.clearAll();
    } catch (_) {}
    return (await storage.onboardingDone) ? ('/welcome', null) : ('/onboarding', null);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fade = CurvedAnimation(parent: _controller, curve: Curves.easeOut);
    return Scaffold(
      backgroundColor: AppColors.page,
      body: Center(
        child: FadeTransition(
          opacity: fade,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.85, end: 1).animate(fade),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const ZcIllustration('logo_z', height: 132),
                const SizedBox(height: 38),
                Text('zcontrole', style: zcText(24, weight: FontWeight.w500)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
