import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/constants/colors.dart';
import '../../../../shared/widgets/zc_result.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../domain/entities/accreditation_result.dart';

/// Team member badge scanned at the door: who, role, zones allowed.
class AccreditationResultScreen extends StatefulWidget {
  final AccreditationResult result;

  const AccreditationResultScreen({super.key, required this.result});

  @override
  State<AccreditationResultScreen> createState() => _AccreditationResultScreenState();
}

class _AccreditationResultScreenState extends State<AccreditationResultScreen> {
  @override
  void initState() {
    super.initState();
    widget.result.isValid ? HapticFeedback.lightImpact() : HapticFeedback.heavyImpact();
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.result;
    if (!r.isValid) {
      return ZcResultView(
        color: AppColors.usedRed,
        icon: Icons.block_rounded,
        title: 'Badge refusé',
        subtitle: r.reason ?? 'Accréditation non valide',
        notice: "Ce badge ne permet pas l'accès.",
        buttonLabel: 'Retour au scanner',
        autoReturnSeconds: AppConstants.resultDisplaySeconds,
      );
    }
    return ZcResultView(
      color: AppColors.validGreen,
      icon: Icons.verified_rounded,
      title: 'Badge valide',
      header: Row(
        children: [
          _Avatar(photoUrl: r.photoUrl, name: r.memberName ?? '?'),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(r.memberName ?? 'Membre inconnu', style: zcText(ZcSize.h3, weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text((r.role ?? 'Staff').toUpperCase(), style: zcText(ZcSize.small, weight: FontWeight.w500, color: AppColors.grey)),
              ],
            ),
          ),
        ],
      ),
      details: [
        if (r.code != null) (label: 'Code', value: r.code!),
        if (r.zones.isNotEmpty) (label: 'Zones', value: r.zones.join(' · ')),
      ],
      buttonLabel: 'Retour au scanner',
      autoReturnSeconds: AppConstants.resultDisplaySeconds,
    );
  }
}

class _Avatar extends StatelessWidget {
  final String? photoUrl;
  final String name;

  const _Avatar({required this.photoUrl, required this.name});

  @override
  Widget build(BuildContext context) {
    final url = photoUrl;
    if (url != null && url.isNotEmpty) {
      final full = url.startsWith('http') ? url : '${AppConstants.baseUrl.replaceAll('/api/v1', '')}$url';
      return CircleAvatar(radius: 32, backgroundColor: AppColors.eventCard, backgroundImage: NetworkImage(full));
    }
    return CircleAvatar(
      radius: 32,
      backgroundColor: AppColors.eventCard,
      child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: zcText(ZcSize.h2, weight: FontWeight.w700, color: const Color(0xFF111111))),
    );
  }
}
