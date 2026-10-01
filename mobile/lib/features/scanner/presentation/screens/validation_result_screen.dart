import 'package:flutter/material.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/constants/colors.dart';
import '../../../../core/utils/date_utils.dart';
import '../../../../shared/widgets/zc_result.dart';
import '../../domain/entities/validation_result.dart';

/// Ticket scan result: valid, already used, fraudulent or not a ticket. Back to the
/// scanner by itself after a few seconds, or on a tap.
class ValidationResultScreen extends StatelessWidget {
  final ValidationResult result;

  const ValidationResultScreen({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final r = result;
    final serial = r.serialNumber;
    final shortCode = r.ticketCode.length > 40 ? '${r.ticketCode.substring(0, 40)}…' : r.ticketCode;

    if (r.isValid) {
      return ZcResultView(
        color: AppColors.validGreen,
        icon: Icons.check_rounded,
        title: 'Billet valide',
        subtitle: 'Entrée autorisée',
        badge: r.isOfflineResult ? 'Validé hors ligne' : null,
        details: [
          if (r.holderName != null) (label: 'Titulaire', value: r.holderName!),
          if (r.ticketType != null) (label: 'Type', value: r.ticketType!),
          if (serial != null) (label: 'N° de série', value: serial),
          if (r.seat != null) (label: 'Place', value: '${r.zone != null ? '${r.zone} · ' : ''}${r.seat}'),
          (label: 'Heure', value: AppDateUtils.formatShortTime(r.scannedAt)),
        ],
        autoReturnSeconds: AppConstants.resultDisplaySeconds,
      );
    }

    if (r.isUsed) {
      return ZcResultView(
        color: AppColors.usedRed,
        icon: Icons.block_rounded,
        title: 'Déjà utilisé',
        subtitle: 'Ce billet a déjà été validé',
        badge: r.isOfflineResult ? 'Vérifié hors ligne' : null,
        details: [
          if (r.holderName != null) (label: 'Titulaire', value: r.holderName!),
          if (serial != null) (label: 'N° de série', value: serial),
          if (r.usedAt != null) (label: 'Entré le', value: AppDateUtils.formatDateTime(r.usedAt!)),
          if (r.usedBy != null) (label: 'Scanné par', value: r.usedBy!),
          if (r.usedAtGate != null) (label: 'À l\'entrée', value: r.usedAtGate!),
        ],
        notice: "Refuser l'accès. Alerter le responsable si la personne insiste.",
        autoReturnSeconds: AppConstants.resultDisplaySeconds,
      );
    }

    if (r.isFraudulent) {
      return ZcResultView(
        color: AppColors.fraudOrange,
        icon: Icons.gpp_bad_rounded,
        title: 'Billet frauduleux',
        subtitle: 'Alerte sécurité',
        details: [
          if (serial != null) (label: 'N° de série', value: serial),
          if (shortCode.isNotEmpty) (label: 'QR code', value: shortCode),
        ],
        notice: '${r.securityNote ?? "Ce QR code n'est pas reconnu comme un billet valide."}\n\n'
            "• Refuser l'entrée immédiatement\n• Conserver le billet si possible\n• Alerter le responsable",
        autoReturnSeconds: AppConstants.resultDisplaySeconds,
      );
    }

    // Not a ticket, refused scan, or no connection: the title says which, so a network
    // problem is never mistaken for a fake ticket
    final String title;
    final String subtitle;
    final IconData icon;
    if (r.networkFailure) {
      (title, subtitle, icon) = ('Pas de connexion', "Le billet n'a pas pu être vérifié", Icons.wifi_off_rounded);
    } else if (r.isOfflineResult && r.isNotFound && r.ticketId == null && (r.errorMessage ?? '').startsWith('Billet absent')) {
      (title, subtitle, icon) = ('Billet inconnu', 'Absent de la liste hors ligne', Icons.help_outline_rounded);
    } else if (r.hasError) {
      (title, subtitle, icon) = ('Scan refusé', 'Ce billet ne peut pas entrer ici', Icons.do_not_disturb_rounded);
    } else {
      (title, subtitle, icon) = ('QR code invalide', 'Ce QR code ne correspond à aucun billet', Icons.qr_code_2_rounded);
    }
    return ZcResultView(
      color: AppColors.ink,
      icon: icon,
      title: title,
      subtitle: subtitle,
      details: [if (shortCode.isNotEmpty) (label: 'Contenu scanné', value: shortCode)],
      notice: '${r.errorMessage ?? "Ce QR code n'est pas un billet valide pour cet événement."}\n\n'
          "• Faire réessayer le scan\n• Vérifier le billet\n• Contacter l'organisateur si besoin",
      autoReturnSeconds: AppConstants.resultDisplaySeconds,
    );
  }
}
