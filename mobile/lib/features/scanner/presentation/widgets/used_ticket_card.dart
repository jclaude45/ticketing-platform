import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/validation_result.dart';

class UsedTicketCard extends StatefulWidget {
  final ValidationResult result;

  const UsedTicketCard({super.key, required this.result});

  @override
  State<UsedTicketCard> createState() => _UsedTicketCardState();
}

class _UsedTicketCardState extends State<UsedTicketCard>
    with TickerProviderStateMixin {
  late AnimationController _iconController;
  late AnimationController _cardController;
  late Animation<double> _iconScale;
  late Animation<double> _iconOpacity;
  late Animation<double> _cardOpacity;
  late Animation<Offset> _cardSlide;

  @override
  void initState() {
    super.initState();

    _iconController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _cardController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _iconScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _iconController, curve: Curves.easeOutBack),
    );
    _iconOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
          parent: _iconController,
          curve: const Interval(0.0, 0.4)),
    );
    _cardOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _cardController, curve: Curves.easeIn),
    );
    _cardSlide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _cardController, curve: Curves.easeOutCubic),
    );

    _iconController.forward();
    Future.delayed(const Duration(milliseconds: 200), () {
      if (mounted) _cardController.forward();
    });
  }

  @override
  void dispose() {
    _iconController.dispose();
    _cardController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Warning icon
        AnimatedBuilder(
          animation: _iconController,
          builder: (_, __) => Opacity(
            opacity: _iconOpacity.value,
            child: Transform.scale(
              scale: _iconScale.value,
              child: Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.usedRed.withOpacity(0.12),
                  border: Border.all(
                    color: AppColors.usedRed.withOpacity(0.4),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.usedRed.withOpacity(0.3),
                      blurRadius: 30,
                      spreadRadius: 8,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.do_not_disturb_rounded,
                  color: AppColors.usedRed,
                  size: 64,
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 24),

        // Status label
        AnimatedBuilder(
          animation: _iconController,
          builder: (_, __) => Opacity(
            opacity: _iconOpacity.value,
            child: Column(
              children: [
                Text(
                  'ALREADY USED',
                  style: GoogleFonts.rajdhani(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: AppColors.usedRed,
                    letterSpacing: 4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'This ticket has been validated',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    color: AppColors.usedRedLight.withOpacity(0.7),
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 28),

        // Details card
        FadeTransition(
          opacity: _cardOpacity,
          child: SlideTransition(
            position: _cardSlide,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.usedRed.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.usedRed.withOpacity(0.25),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Warning header
                  Row(
                    children: [
                      const Icon(
                        Icons.warning_amber_rounded,
                        color: AppColors.usedRedLight,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'First Use Details',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.usedRedLight,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  if (widget.result.holderName != null)
                    _DetailRow(
                      label: 'Holder',
                      value: widget.result.holderName!,
                    ),
                  if (widget.result.serialNumber != null) ...[
                    const SizedBox(height: 10),
                    _DetailRow(
                      label: 'Serial',
                      value: widget.result.serialNumber!,
                    ),
                  ],
                  if (widget.result.usedAt != null) ...[
                    const SizedBox(height: 10),
                    _DetailRow(
                      label: 'Used at',
                      value: AppDateUtils.formatDateTime(widget.result.usedAt!),
                      highlight: true,
                    ),
                  ],
                  if (widget.result.usedBy != null) ...[
                    const SizedBox(height: 10),
                    _DetailRow(
                      label: 'Scanned by',
                      value: widget.result.usedBy!,
                    ),
                  ],
                  if (widget.result.usedAtGate != null) ...[
                    const SizedBox(height: 10),
                    _DetailRow(
                      label: 'At gate',
                      value: widget.result.usedAtGate!,
                    ),
                  ],

                  const SizedBox(height: 14),

                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.usedRed.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.info_outline_rounded,
                          size: 14,
                          color: AppColors.usedRedLight,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Deny entry. Alert supervisor if persistent.',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: AppColors.usedRedLight.withOpacity(0.8),
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _DetailRow({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 12,
              color: AppColors.usedRed.withOpacity(0.6),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: highlight
                  ? AppColors.usedRedLight
                  : Colors.white.withOpacity(0.9),
              fontWeight: highlight ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
