import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/colors.dart';
import '../../../core/di/injection_container.dart';
import '../../../core/feedback/scan_feedback.dart';
import '../../../core/utils/date_utils.dart';
import '../data/merch_pickup.dart';

/// A shop order found at the stand: what to hand over, then "Remettre" once given.
class MerchPickupScreen extends StatefulWidget {
  final String eventId;
  final MerchPickup order;

  const MerchPickupScreen({super.key, required this.eventId, required this.order});

  @override
  State<MerchPickupScreen> createState() => _MerchPickupScreenState();
}

class _MerchPickupScreenState extends State<MerchPickupScreen> {
  late MerchPickup _order = widget.order;
  bool _handedNow = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _order.canHandOver ? ScanFeedback.instance.accepted() : ScanFeedback.instance.refused();
  }

  Future<void> _handOver() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await getIt<MerchRepository>().handOver(widget.eventId, _order.id);
      ScanFeedback.instance.accepted();
      setState(() {
        _order = updated;
        _handedNow = true;
      });
    } catch (e) {
      ScanFeedback.instance.refused();
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final Color color;
    final IconData icon;
    final String title;
    if (_handedNow) {
      (color, icon, title) = (AppColors.validGreen, Icons.check_circle_rounded, 'COMMANDE REMISE');
    } else if (_order.canHandOver) {
      (color, icon, title) = (AppColors.primary, Icons.shopping_bag_rounded, 'À REMETTRE');
    } else {
      (color, icon, title) = (AppColors.usedRed, Icons.do_not_disturb_rounded, 'NE PAS REMETTRE');
    }

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        leading: CloseButton(color: AppColors.textPrimary),
        title: Text('Retrait boutique', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Icon(icon, size: 72, color: color),
            const SizedBox(height: 12),
            Text(title,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 26, fontWeight: FontWeight.w800, color: color, letterSpacing: 2)),
            const SizedBox(height: 6),
            Text('${_order.code} · ${_order.buyerName}',
                textAlign: TextAlign.center, style: GoogleFonts.inter(fontSize: 15, color: AppColors.textSecondary)),
            if (!_order.canHandOver && !_handedNow && _order.refusal != null) ...[
              const SizedBox(height: 16),
              _Banner(
                color: AppColors.usedRed,
                text: _order.fulfilledAt != null
                    ? '${_order.refusal} (le ${AppDateUtils.formatDateTime(_order.fulfilledAt!)})'
                    : _order.refusal!,
              ),
            ],
            const SizedBox(height: 20),
            Container(
              decoration: BoxDecoration(
                color: AppColors.backgroundCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderDefault),
              ),
              child: Column(
                children: [
                  for (final item in _order.items)
                    ListTile(
                      leading: CircleAvatar(
                        backgroundColor: color.withOpacity(0.15),
                        child: Text('${item.quantity}×',
                            style: GoogleFonts.inter(fontWeight: FontWeight.w800, color: color, fontSize: 13)),
                      ),
                      title: Text(item.productName,
                          style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                      subtitle: item.variant.isEmpty
                          ? null
                          : Text(item.variant, style: GoogleFonts.inter(color: AppColors.textSecondary)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text('${_order.itemCount} article(s) · statut : ${_order.statusLabel}',
                textAlign: TextAlign.center, style: GoogleFonts.inter(fontSize: 12, color: AppColors.textMuted)),
            if (_error != null) ...[
              const SizedBox(height: 16),
              _Banner(color: AppColors.usedRed, text: _error!),
            ],
            const SizedBox(height: 24),
            if (_order.canHandOver && !_handedNow)
              SizedBox(
                height: 56,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.validGreen),
                  onPressed: _busy ? null : _handOver,
                  icon: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check_rounded),
                  label: Text('Articles remis au client', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              )
            else
              SizedBox(
                height: 52,
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text('Scanner la commande suivante', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  final Color color;
  final String text;

  const _Banner({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(text, textAlign: TextAlign.center, style: GoogleFonts.inter(color: color, fontWeight: FontWeight.w600)),
    );
  }
}
