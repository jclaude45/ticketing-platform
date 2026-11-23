import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/i18n.dart';
import 'core/language.dart';
import 'core/navigation.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'features/account/profile_screen.dart';
import 'features/discover/home_screen.dart';
import 'features/discover/search_screen.dart';
import 'features/wallet/wallet_screen.dart';
import 'features/welcome/welcome_screens.dart';

/// The splash stays at least this long on a cold start, so it reads as a screen, not a flash
const _splashAtLeast = Duration(milliseconds: 1200);

class ZayaApp extends ConsumerStatefulWidget {
  const ZayaApp({super.key});

  @override
  ConsumerState<ZayaApp> createState() => _ZayaAppState();
}

class _ZayaAppState extends ConsumerState<ZayaApp> {
  var _splashDone = false;

  @override
  void initState() {
    super.initState();
    Future.delayed(_splashAtLeast, () {
      if (mounted) setState(() => _splashDone = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    // Follows the phone's light / dark mode
    ZColors.isDark =
        MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final session = ref.watch(sessionProvider);
    final welcomed = ref.watch(welcomedProvider);
    final Widget home;
    if (!_splashDone || session is SessionLoading || welcomed == null) {
      home = const SplashScreen();
    } else if (session is SignedOut && welcomed == false) {
      home = const WelcomeScreen();
    } else {
      home = const HomeShell();
    }
    return MaterialApp(
      title: 'ZAYA',
      debugShowCheckedModeBanner: false,
      theme: zTheme(),
      locale: ref.watch(languageProvider),
      supportedLocales: S.locales,
      localizationsDelegates: S.delegates,
      // The phone's text size is followed, up to 130 %: beyond that the cards overflow
      builder: (context, child) =>
          MediaQuery.withClampedTextScaling(maxScaleFactor: 1.3, child: child!),
      home: AnimatedSwitcher(duration: const Duration(milliseconds: 350), child: home),
    );
  }
}

/// Bottom tabs: browsing needs no account, the wallet and the profile ask for one
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final tab = ref.watch(homeTabProvider);
    // Session closed by the server (signed in on another phone): said once
    ref.listen(sessionProvider, (_, next) {
      if (next is SignedOut && next.ended) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.sessionEnded)));
      }
    });
    return Scaffold(
      body: IndexedStack(
        index: tab,
        children: const [HomeScreen(), SearchScreen(), WalletScreen(), ProfileScreen()],
      ),
      bottomNavigationBar: _TabBar(
        index: tab,
        onTap: (i) => ref.read(homeTabProvider.notifier).state = i,
        items: [
          (Icons.home_outlined, Icons.home_rounded, s.tabHome),
          (Icons.search_rounded, Icons.search_rounded, s.tabSearch),
          (Icons.confirmation_number_outlined, Icons.confirmation_number_rounded, s.tabTickets),
          (Icons.person_outline_rounded, Icons.person_rounded, s.tabProfile),
        ],
      ),
    );
  }
}

/// Tab bar of the mockups: an orange line above the tab shown, its icon and name in orange
class _TabBar extends StatelessWidget {
  final int index;
  final ValueChanged<int> onTap;
  final List<(IconData, IconData, String)> items;

  const _TabBar({required this.index, required this.onTap, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: ZColors.page,
        border: Border(top: BorderSide(color: ZColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: InkResponse(
                    onTap: () => onTap(i),
                    radius: 36,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: i == index ? 24 : 0,
                          height: 3,
                          margin: const EdgeInsets.only(bottom: 7),
                          decoration: BoxDecoration(
                            color: ZColors.orange,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        Icon(
                          i == index ? items[i].$2 : items[i].$1,
                          size: 25,
                          color: i == index ? ZColors.orange : ZColors.muted,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          items[i].$3,
                          style: zText(
                            ZSize.caption,
                            weight: i == index ? ZWeight.bold : ZWeight.medium,
                            color: i == index ? ZColors.orangeText : ZColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
