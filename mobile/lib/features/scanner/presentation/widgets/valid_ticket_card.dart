import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/validation_result.dart';

class ValidTicketCard extends StatefulWidget {
  final ValidationResult result;

  const ValidTicketCard({super.key, required this.result});

  @override
  State<ValidTicketCard> createState() => _ValidTicketCardState();
}

class _ValidTicketCardState extends State<ValidTicketCard>
    with TickerProviderStateMixin {
  late AnimationController _checkController;
  late AnimationController _slideController;
  late AnimationController _pulseController;

  late Animation<double> _checkScale;
  late Animation<double> _checkOpacity;
  late Animation<Offset> _cardSlide;
  late Animation<double> _cardOpacity;
  late Animation<double> _pulseScale;

  @override
  void initState() {
    super.initState();

    _checkController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _slideController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);

    _checkScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _checkController, curve: Curves.elasticOut),
    );
    _checkOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _checkController,
        curve: const Interval(0.0, 0.3),
      ),
    );
    _cardSlide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _slideController, curve: Curves.easeOutCubic),
    );
    _cardOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _slideController, curve: Curves.easeIn),
    );
    _pulseScale = Tween<double>(begin: 1.0, end: 1.06).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _checkController.forward();
    Future.delayed(const Duration(milliseconds: 200), () {
      if (mounted) _slideController.forward();
    });
  }

  @override
  void dispose() {
    _checkController.dispose();
    _slideController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Animated checkmark
        AnimatedBuilder(
          animation: _checkController,
          builder: (_, __) => Opacity(
            opacity: _checkOpacity.value,
            child: Transform.scale(
              scale: _checkScale.value,
              child: AnimatedBuilder(
                animation: _pulseController,
                builder: (_, __) => Transform.scale(
                  scale: _pulseScale.value,
                  child: Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.validGreen.withOpacity(0.15),
                      border: Border.all(
                        color: AppColors.validGreen.withOpacity(0.4),
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.validGreen.withOpacity(0.3),
                          blurRadius: 30,
                          spreadRadius: 10,
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      color: AppColors.validGreen,
                      size: 64,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 24),

        // Valid label
        AnimatedBuilder(
          animation: _checkController,
          builder: (_, __) => Opacity(
            opacity: _checkOpacity.value,
            child: Column(
              children: [
                Text(
                  'TICKET VALIDE',
                  style: GoogleFonts.rajdhani(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: AppColors.validGreen,
                    letterSpacing: 4,
                  ),
                ),
                if (widget.result.isOfflineResult) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.statusOffline.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Validé hors ligne',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: AppColors.statusOffline,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),

        const SizedBox(height: 32),

        // Ticket info card
        FadeTransition(
          opacity: _cardOpacity,
          child: SlideTransition(
            position: _cardSlide,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.validGreen.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.validGreen.withOpacity(0.25),
                ),
              ),
              child: Column(
                children: [
                  if (widget.result.holderName != null)
                    _InfoRow(
                      icon: Icons.person_outline_rounded,
                      label: 'Titulaire',
                      value: widget.result.holderName!,
                      color: AppColors.validGreen,
                    ),
                  if (widget.result.serialNumber != null) ...[
                    const SizedBox(height: 12),
                    _InfoRow(
                      icon: Icons.confirmation_number_outlined,
                      label: 'N° Série',
                      value: widget.result.serialNumber!,
                      color: AppColors.validGreen,
                    ),
                  ],
                  if (widget.result.ticketType != null) ...[
                    const SizedBox(height: 12),
                    _InfoRow(
                      icon: Icons.category_outlined,
                      label: 'Type',
                      value: widget.result.ticketType!,
                      color: AppColors.validGreen,
                    ),
                  ],
                  if (widget.result.seat != null) ...[
                    const SizedBox(height: 12),
                    _InfoRow(
                      icon: Icons.event_seat_outlined,
                      label: 'Siège',
                      value: '${widget.result.zone != null ? "${widget.result.zone} - " : ""}${widget.result.seat}',
                      color: AppColors.validGreen,
                    ),
                  ],
                  const SizedBox(height: 12),
                  _InfoRow(
                    icon: Icons.access_time_rounded,
                    label: 'Heure de scan',
                    value: AppDateUtils.formatShortTime(widget.result.scannedAt),
                    color: AppColors.validGreen,
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

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color.withOpacity(0.7)),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: GoogleFonts.inter(
                fontSize: 10,
                color: color.withOpacity(0.5),
                letterSpacing: 1,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 15,
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
