import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../domain/entities/validation_result.dart';

const Color _invalidBlue = Color(0xFF448AFF);
const Color _invalidBlueDark = Color(0xFF1565C0);
const Color _invalidBlueLight = Color(0xFF82B1FF);

class InvalidQrCard extends StatefulWidget {
  final ValidationResult result;

  const InvalidQrCard({super.key, required this.result});

  @override
  State<InvalidQrCard> createState() => _InvalidQrCardState();
}

class _InvalidQrCardState extends State<InvalidQrCard>
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
      CurvedAnimation(parent: _iconController, curve: const Interval(0.0, 0.4)),
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
        // Icon circle
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
                  color: _invalidBlue.withOpacity(0.12),
                  border: Border.all(
                    color: _invalidBlue.withOpacity(0.4),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: _invalidBlue.withOpacity(0.3),
                      blurRadius: 30,
                      spreadRadius: 8,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.qr_code_2_rounded,
                  color: _invalidBlue,
                  size: 60,
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 24),

        // Title
        AnimatedBuilder(
          animation: _iconController,
          builder: (_, __) => Opacity(
            opacity: _iconOpacity.value,
            child: Column(
              children: [
                Text(
                  'QR CODE INVALIDE',
                  style: GoogleFonts.rajdhani(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: _invalidBlue,
                    letterSpacing: 4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Ce QR code ne correspond à aucun ticket',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: _invalidBlueLight.withOpacity(0.7),
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
                color: _invalidBlue.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: _invalidBlue.withOpacity(0.25),
                ),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _invalidBlue.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.qr_code_scanner_rounded,
                          color: _invalidBlue,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'QR code non reconnu',
                              style: GoogleFonts.inter(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: _invalidBlueLight,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              widget.result.errorMessage ??
                                  'Ce QR code n\'est pas un ticket valide pour cet événement.',
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                color: _invalidBlue.withOpacity(0.7),
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),
                  Divider(color: _invalidBlue.withOpacity(0.2), height: 1),
                  const SizedBox(height: 16),

                  _InfoItem(
                    icon: Icons.refresh_rounded,
                    text: 'Demander à réessayer le scan',
                    color: _invalidBlue,
                  ),
                  const SizedBox(height: 10),
                  _InfoItem(
                    icon: Icons.confirmation_number_outlined,
                    text: 'Vérifier que le ticket est valide',
                    color: _invalidBlueLight,
                  ),
                  const SizedBox(height: 10),
                  _InfoItem(
                    icon: Icons.support_agent_outlined,
                    text: 'Contacter l\'organisateur si besoin',
                    color: _invalidBlueLight,
                  ),

                  if (widget.result.ticketCode.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'CONTENU SCANNÉ',
                            style: GoogleFonts.inter(
                              fontSize: 10,
                              color: AppColors.textMuted,
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.result.ticketCode.length > 40
                                ? '${widget.result.ticketCode.substring(0, 40)}...'
                                : widget.result.ticketCode,
                            style: GoogleFonts.robotoMono(
                              fontSize: 11,
                              color: _invalidBlue.withOpacity(0.8),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoItem extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;

  const _InfoItem({
    required this.icon,
    required this.text,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: Colors.white.withOpacity(0.85),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
