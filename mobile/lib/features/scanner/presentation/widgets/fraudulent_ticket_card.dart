import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../domain/entities/validation_result.dart';

class FraudulentTicketCard extends StatefulWidget {
  final ValidationResult result;

  const FraudulentTicketCard({super.key, required this.result});

  @override
  State<FraudulentTicketCard> createState() => _FraudulentTicketCardState();
}

class _FraudulentTicketCardState extends State<FraudulentTicketCard>
    with TickerProviderStateMixin {
  late AnimationController _iconController;
  late AnimationController _shakeController;
  late AnimationController _cardController;
  late AnimationController _pulseController;

  late Animation<double> _iconScale;
  late Animation<double> _shake;
  late Animation<double> _cardOpacity;
  late Animation<Offset> _cardSlide;
  late Animation<double> _pulseOpacity;

  @override
  void initState() {
    super.initState();

    _iconController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _cardController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);

    _iconScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _iconController, curve: Curves.easeOutBack),
    );

    _shake = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _shakeController, curve: Curves.elasticIn),
    );

    _cardOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _cardController, curve: Curves.easeIn),
    );
    _cardSlide = Tween<Offset>(
      begin: const Offset(0, 0.2),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _cardController, curve: Curves.easeOutCubic),
    );

    _pulseOpacity = Tween<double>(begin: 0.3, end: 0.8).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _iconController.forward().then((_) {
      _shakeController.forward();
    });

    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) _cardController.forward();
    });
  }

  @override
  void dispose() {
    _iconController.dispose();
    _shakeController.dispose();
    _cardController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Pulsing warning ring + shield icon
        AnimatedBuilder(
          animation: Listenable.merge([_iconController, _pulseController]),
          builder: (_, __) => Transform.scale(
            scale: _iconScale.value,
            child: AnimatedBuilder(
              animation: _shakeController,
              builder: (_, child) => Transform.translate(
                offset: Offset(
                  8 * (0.5 - _shake.value) * (1 - _shakeController.value),
                  0,
                ),
                child: child,
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Outer pulse ring
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (_, __) => Container(
                      width: 150,
                      height: 150,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.fraudOrange
                              .withOpacity(_pulseOpacity.value * 0.4),
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                  // Inner circle
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.fraudOrange.withOpacity(0.12),
                      border: Border.all(
                        color: AppColors.fraudOrange.withOpacity(0.4),
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.fraudOrange.withOpacity(0.35),
                          blurRadius: 30,
                          spreadRadius: 8,
                        ),
                      ],
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const Icon(
                          Icons.shield_outlined,
                          color: AppColors.fraudOrange,
                          size: 60,
                        ),
                        Positioned(
                          bottom: 22,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: AppColors.fraudOrange,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.close_rounded,
                              color: Colors.white,
                              size: 14,
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

        const SizedBox(height: 24),

        // Status text
        AnimatedBuilder(
          animation: _iconController,
          builder: (_, __) => Opacity(
            opacity: _iconScale.value,
            child: Column(
              children: [
                Text(
                  'FRAUDULEUX',
                  style: GoogleFonts.rajdhani(
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                    color: AppColors.fraudOrange,
                    letterSpacing: 4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'ALERTE SÉCURITÉ',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.fraudOrangeLight.withOpacity(0.7),
                    letterSpacing: 3,
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 28),

        // Alert card
        FadeTransition(
          opacity: _cardOpacity,
          child: SlideTransition(
            position: _cardSlide,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.fraudOrange.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.fraudOrange.withOpacity(0.3),
                ),
              ),
              child: Column(
                children: [
                  // Main alert row
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.fraudOrange.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.gpp_bad_outlined,
                          color: AppColors.fraudOrange,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Ticket invalide détecté',
                              style: GoogleFonts.inter(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.fraudOrangeLight,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              widget.result.securityNote ??
                                  'Ce QR code n\'est pas reconnu comme un ticket valide.',
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                color: AppColors.fraudOrange.withOpacity(0.7),
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),
                  Divider(
                    color: AppColors.fraudOrange.withOpacity(0.2),
                    height: 1,
                  ),
                  const SizedBox(height: 16),

                  // Action instructions
                  _AlertItem(
                    icon: Icons.block_rounded,
                    text: 'Refuser l\'entrée immédiatement',
                    color: AppColors.fraudOrange,
                  ),
                  const SizedBox(height: 10),
                  _AlertItem(
                    icon: Icons.radio_button_unchecked,
                    text: 'Conserver le ticket si possible',
                    color: AppColors.fraudOrangeLight,
                  ),
                  const SizedBox(height: 10),
                  _AlertItem(
                    icon: Icons.radio_button_unchecked,
                    text: 'Alerter le responsable immédiatement',
                    color: AppColors.fraudOrangeLight,
                  ),

                  const SizedBox(height: 16),

                  // Code display
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'QR CODE',
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
                            color: AppColors.fraudOrange.withOpacity(0.8),
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

class _AlertItem extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;

  const _AlertItem({
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
        Text(
          text,
          style: GoogleFonts.inter(
            fontSize: 13,
            color: Colors.white.withOpacity(0.85),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
