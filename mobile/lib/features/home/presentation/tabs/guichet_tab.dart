import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../merch/data/merch_pickup.dart';
import '../../../merch/presentation/merch_pickup_screen.dart';
import '../../../scanner/presentation/screens/scanner_screen.dart';

/// Stand: hand over the shop orders paid online (QR of the order or its code).
class GuichetTab extends StatefulWidget {
  final String eventId;

  const GuichetTab({super.key, required this.eventId});

  @override
  State<GuichetTab> createState() => _GuichetTabState();
}

class _GuichetTabState extends State<GuichetTab> {
  bool _busy = false;

  Future<void> _typeCode() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.page,
        title: Text('Code de la commande', style: zcText(18, weight: FontWeight.w600)),
        content: ZcTextField(
          controller: controller,
          hint: 'B-XXXXXX',
          textCapitalization: TextCapitalization.characters,
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Annuler', style: zcText(14, color: AppColors.grey))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: Text('Rechercher', style: zcText(14, weight: FontWeight.w500)),
          ),
        ],
      ),
    );
    if (code == null || code.trim().isEmpty || !mounted) return;
    setState(() => _busy = true);
    try {
      final order = await getIt<MerchRepository>().lookup(widget.eventId, code: code.trim());
      if (!mounted) return;
      await Navigator.push(context, MaterialPageRoute(builder: (_) => MerchPickupScreen(eventId: widget.eventId, order: order)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: ZcFillScroll(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Spacer(),
          const SizedBox(height: 40),
          const ZcIllustration('illus_pos', height: 156),
          const SizedBox(height: 44),
          Text(
            'Retrait boutique',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.ink, height: 1.2),
          ),
          const SizedBox(height: 14),
          Text(
            'Scannez le QR code de la commande, ou saisissez son code, pour remettre les articles achetés en ligne.',
            textAlign: TextAlign.center,
            style: zcText(14, color: AppColors.grey, height: 1.6),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: ZcButton(
              label: 'Scanner une commande',
              onPressed: () => Navigator.pushNamed(context, '/scanner', arguments: ScannerArgs(widget.eventId, mode: ScanMode.merch)),
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _busy ? null : _typeCode,
            child: _busy
                ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ink))
                : Text('Saisir un code', style: zcText(14, weight: FontWeight.w500)),
          ),
          const Spacer(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
