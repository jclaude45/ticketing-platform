import 'package:flutter/material.dart';

import '../../../core/constants/colors.dart';
import '../../../core/di/injection_container.dart';
import '../../../core/feedback/scan_feedback.dart';
import '../../../core/utils/date_utils.dart';
import '../../../shared/widgets/zc_result.dart';
import '../../../shared/widgets/zc_widgets.dart';
import '../data/merch_pickup.dart';

/// A shop order found at the stand: what to hand over, then confirm once given.
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
      (color, icon, title) = (AppColors.validGreen, Icons.check_rounded, 'Commande remise');
    } else if (_order.canHandOver) {
      (color, icon, title) = (AppColors.eventCard, Icons.shopping_bag_outlined, 'À remettre');
    } else {
      (color, icon, title) = (AppColors.usedRed, Icons.do_not_disturb_rounded, 'Ne pas remettre');
    }

    final refusal = !_order.canHandOver && !_handedNow && _order.refusal != null
        ? (_order.fulfilledAt != null ? '${_order.refusal} (le ${AppDateUtils.formatDateTime(_order.fulfilledAt!)})' : _order.refusal!)
        : null;
    final canGive = _order.canHandOver && !_handedNow;

    return ZcResultView(
      color: color,
      icon: icon,
      title: title,
      subtitle: '${_order.code} · ${_order.buyerName}',
      details: [
        for (final item in _order.items)
          (label: '${item.quantity} ×', value: item.variant.isEmpty ? item.productName : '${item.productName}\n${item.variant}'),
        (label: 'Statut', value: _order.statusLabel),
      ],
      notice: _error ?? refusal,
      footer: canGive
          ? null
          : Text('${_order.itemCount} article(s)', textAlign: TextAlign.center, style: zcText(ZcSize.small, color: AppColors.grey)),
      buttonLabel: canGive ? 'Articles remis au client' : 'Scanner la commande suivante',
      buttonLoading: _busy,
      onButton: canGive ? _handOver : null,
    );
  }
}
