import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/constants/colors.dart';
import 'zc_widgets.dart';

/// One line of details under a scan result ("Titulaire", "N° de série"...).
typedef ZcDetail = ({String label, String value});

/// Result of a scan in the zcontrole charter: status colour in a big disc readable from
/// a distance, title, details listed like the guest list, then the dark button. With
/// [autoReturnSeconds] the screen goes back to the scanner by itself (tap anywhere too).
class ZcResultView extends StatefulWidget {
  final Color color;
  final IconData icon;
  final String title;
  final String? subtitle;

  /// Small line under the title ("Validé hors ligne")
  final String? badge;
  final Widget? header;
  final List<ZcDetail> details;

  /// What the controller should do, in a tinted box
  final String? notice;
  final String buttonLabel;
  final VoidCallback? onButton;
  final bool buttonLoading;
  final int? autoReturnSeconds;
  final Widget? footer;

  const ZcResultView({
    super.key,
    required this.color,
    required this.icon,
    required this.title,
    this.subtitle,
    this.badge,
    this.header,
    this.details = const [],
    this.notice,
    this.buttonLabel = 'Scanner le suivant',
    this.onButton,
    this.buttonLoading = false,
    this.autoReturnSeconds,
    this.footer,
  });

  @override
  State<ZcResultView> createState() => _ZcResultViewState();
}

class _ZcResultViewState extends State<ZcResultView> with SingleTickerProviderStateMixin {
  late final AnimationController _countdown = AnimationController(
    vsync: this,
    duration: Duration(seconds: widget.autoReturnSeconds ?? 1),
  );
  Timer? _timer;
  late int _left = widget.autoReturnSeconds ?? 0;

  @override
  void initState() {
    super.initState();
    if (widget.autoReturnSeconds != null) {
      _countdown.forward();
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) return t.cancel();
        setState(() => _left--);
        if (_left <= 0) {
          t.cancel();
          _close();
        }
      });
    }
  }

  void _close() {
    if (mounted && Navigator.canPop(context)) Navigator.pop(context);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _countdown.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auto = widget.autoReturnSeconds != null;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: auto ? _close : null,
      child: Scaffold(
        backgroundColor: AppColors.page,
        body: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  tooltip: 'Fermer',
                  icon: Icon(Icons.close_rounded, color: AppColors.ink, size: 26),
                  onPressed: _close,
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(32, 0, 32, 16),
                  children: [
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0.6, end: 1),
                      duration: const Duration(milliseconds: 450),
                      curve: Curves.elasticOut,
                      builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
                      child: Center(
                        child: Container(
                          width: 128,
                          height: 128,
                          decoration: BoxDecoration(
                            color: widget.color,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(color: widget.color.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 8)),
                            ],
                          ),
                          child: Icon(
                            widget.icon,
                            size: 72,
                            // Ink is light in dark mode: the icon follows
                            color: widget.color.computeLuminance() > 0.5 ? const Color(0xFF14110A) : Colors.white,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 28),
                    Text(widget.title, textAlign: TextAlign.center, style: zcText(ZcSize.h1,
                        weight: ZcWeight.bold,
                        height: 1.2,
                        // A light status colour (yellow) is unreadable as text on white
                        color: widget.color.computeLuminance() > 0.5 ? AppColors.ink : widget.color,
                      )),
                    if (widget.subtitle != null) ...[
                      const SizedBox(height: 8),
                      Text(widget.subtitle!, textAlign: TextAlign.center, style: zcText(ZcSize.body, color: AppColors.grey, height: 1.5)),
                    ],
                    if (widget.badge != null) ...[
                      const SizedBox(height: 10),
                      Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.statusOffline.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(widget.badge!, style: zcText(ZcSize.small, weight: ZcWeight.medium, color: AppColors.statusOffline)),
                        ),
                      ),
                    ],
                    if (widget.header != null) ...[const SizedBox(height: 24), widget.header!],
                    if (widget.details.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      for (final d in widget.details)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          decoration: BoxDecoration(
                            border: Border(bottom: BorderSide(color: AppColors.grey.withValues(alpha: 0.4))),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(width: 110, child: Text(d.label, style: zcText(ZcSize.small, color: AppColors.grey))),
                              Expanded(child: Text(d.value, style: zcText(ZcSize.body, weight: ZcWeight.medium))),
                            ],
                          ),
                        ),
                    ],
                    if (widget.notice != null) ...[
                      const SizedBox(height: 20),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: widget.color.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(widget.notice!, style: zcText(ZcSize.body, color: AppColors.ink, height: 1.5)),
                      ),
                    ],
                    if (widget.footer != null) ...[const SizedBox(height: 16), widget.footer!],
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(42, 8, 42, 20),
                child: Column(
                  children: [
                    if (auto) ...[
                      AnimatedBuilder(
                        animation: _countdown,
                        builder: (_, __) => ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: LinearProgressIndicator(
                            value: 1 - _countdown.value,
                            minHeight: 3,
                            color: widget.color,
                            backgroundColor: AppColors.grey.withValues(alpha: 0.2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                    ZcButton(
                      label: auto ? '${widget.buttonLabel} ($_left)' : widget.buttonLabel,
                      loading: widget.buttonLoading,
                      onPressed: widget.onButton ?? _close,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
