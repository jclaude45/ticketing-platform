import 'package:flutter/material.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../shared/widgets/zc_widgets.dart';

/// The three intro pages, shown on the first launch only.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  static const _pages = [
    (
      image: 'illus_scan',
      height: 196.0,
      text: "Billets scannés à l'entrée pour une expérience événementielle fluide et sécurisée !",
    ),
    (
      image: 'illus_pos',
      height: 156.0,
      text: 'Vente instantanée, expérience optimale. Simplifiez la vente sur place avec notre appli, '
          'rendant chaque achat rapide et facile !',
    ),
    (
      image: 'illus_stats',
      height: 140.0,
      text: 'Des analyses instantanées qui transforment les données en décisions percutantes. '
          'Explorez la puissance des rapports en temps réel, accessible de n\'importe où.',
    ),
  ];

  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _next() async {
    if (_page < _pages.length - 1) {
      await _controller.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
      return;
    }
    await getIt<SecureStorage>().setOnboardingDone();
    if (mounted) Navigator.pushReplacementNamed(context, '/welcome');
  }

  @override
  Widget build(BuildContext context) {
    return ZcPatternScaffold(
      sheetTop: 0.31,
      child: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: _pages.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (_, i) {
                final page = _pages[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 72),
                  child: Column(
                    children: [
                      const Spacer(flex: 2),
                      SizedBox(height: 200, child: Center(child: ZcIllustration(page.image, height: page.height))),
                      const SizedBox(height: 54),
                      Text(page.text, textAlign: TextAlign.center, style: zcText(ZcSize.body, color: AppColors.grey, height: 1.75)),
                      const Spacer(flex: 3),
                    ],
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(42, 0, 42, 70),
            child: ZcButton(label: _page == _pages.length - 1 ? 'Commencez' : 'Suivant', onPressed: _next),
          ),
        ],
      ),
    );
  }
}
