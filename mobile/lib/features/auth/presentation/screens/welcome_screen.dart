import 'package:flutter/material.dart';

import '../../../../core/constants/colors.dart';
import '../../../../shared/widgets/zc_widgets.dart';

/// Presentation of zcontrole, then the login form.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ZcPatternScaffold(
      sheetTop: 0.42,
      child: ZcFillScroll(
        children: [
          const SizedBox(height: 38),
          Text('zcontrole', textAlign: TextAlign.center, style: zcText(24, weight: FontWeight.w500)),
          const SizedBox(height: 40),
          Text(
            "Découvrez l'excellence en gestion d'événements avec zcontrole ! Des analyses instantanées, "
            'des billets sécurisés, et une expérience inégalée. Transformez vos événements en succès mémorables.',
            textAlign: TextAlign.center,
            style: zcText(14, color: AppColors.ink, height: 1.75),
          ),
          const Spacer(),
          const SizedBox(height: 32),
          ZcButton(label: 'Connexion', onPressed: () => Navigator.pushNamed(context, '/login')),
          const SizedBox(height: 60),
        ],
      ),
    );
  }
}
