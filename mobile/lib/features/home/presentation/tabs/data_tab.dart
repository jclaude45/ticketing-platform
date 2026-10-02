import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/colors.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../home_shell.dart';

/// "Rapport contrôle": share of the tickets already checked at the door.
class DataTab extends ConsumerWidget {
  final String eventId;

  const DataTab({super.key, required this.eventId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = watchEntries(ref, eventId);
    final event = watchEvent(ref, eventId);
    final total = entries.total ?? entries.checkedIn;
    final done = entries.checkedIn;
    final rest = math.max(0, total - done);
    final share = total == 0 ? 0.0 : done / total;
    final donePct = (share * 100).round();
    final mine = event?.extraData;

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: AppColors.ink,
        onRefresh: () => refreshEvent(ref, eventId),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          children: [
            const SizedBox(height: 56),
            Text('Rapport contrôle', textAlign: TextAlign.center, style: zcText(ZcSize.h1, color: AppColors.grey)),
            const SizedBox(height: 40),
            Center(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final size = math.min(272.0, constraints.maxWidth - 40);
                  return SizedBox.square(
                    dimension: size,
                    child: CustomPaint(
                      painter: _DonutPainter(share: share, rest: AppColors.chartRest),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('$donePct %', style: zcText(ZcSize.h1, weight: ZcWeight.bold, height: 1.2)),
                            Text('contrôlé', style: zcText(ZcSize.small, color: AppColors.grey)),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 44),
            Center(
              child: Column(
                children: [
                  _LegendRow(color: AppColors.chartDone, label: 'Contrôlé', percent: '$donePct%', count: done),
                  _LegendRow(color: AppColors.chartRest, label: 'À contrôler', percent: total == 0 ? '0%' : '${100 - donePct}%', count: rest),
                  _LegendRow(label: 'Total', count: total, emphasis: true),
                ],
              ),
            ),
            if (mine != null && mine['myScans'] != null) ...[
              const SizedBox(height: 24),
              Text(
                'Vos scans : ${mine['myScans']} · dont ${mine['myValidScans'] ?? 0} entrée(s) validée(s)',
                textAlign: TextAlign.center,
                style: zcText(ZcSize.small, color: AppColors.grey),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  final Color? color;
  final String label;
  final String? percent;
  final int count;

  /// The total line: its label in medium ink
  final bool emphasis;

  const _LegendRow({this.color, required this.label, this.percent, required this.count, this.emphasis = false});

  @override
  Widget build(BuildContext context) {
    final labelStyle = emphasis ? zcText(ZcSize.small, weight: ZcWeight.medium) : zcText(ZcSize.small, color: AppColors.grey);
    return SizedBox(
      height: 34,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 23,
            child: color == null
                ? null
                : Container(width: 23, height: 23, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          ),
          const SizedBox(width: 12),
          SizedBox(width: 90, child: Text(label, style: labelStyle)),
          SizedBox(width: 70, child: Text(percent ?? '', style: zcText(ZcSize.small, weight: ZcWeight.medium))),
          SizedBox(width: 50, child: Text('$count', textAlign: TextAlign.right, style: zcText(ZcSize.small, weight: ZcWeight.bold))),
        ],
      ),
    );
  }
}

/// Ring of the mockup: outer radius 136, inner 93 (thickness 43), checked share in yellow
/// from the top, clockwise.
class _DonutPainter extends CustomPainter {
  final double share;
  final Color rest;

  const _DonutPainter({required this.share, required this.rest});

  @override
  void paint(Canvas canvas, Size size) {
    final outer = size.shortestSide / 2;
    final thickness = outer * 43 / 136;
    final rect = Rect.fromCircle(center: size.center(Offset.zero), radius: outer - thickness / 2);
    Paint ring(Color c) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness;
    canvas.drawArc(rect, 0, math.pi * 2, false, ring(rest));
    if (share > 0) canvas.drawArc(rect, -math.pi / 2, math.pi * 2 * share.clamp(0.0, 1.0), false, ring(AppColors.chartDone));
  }

  @override
  bool shouldRepaint(_DonutPainter old) => old.share != share || old.rest != rest;
}
