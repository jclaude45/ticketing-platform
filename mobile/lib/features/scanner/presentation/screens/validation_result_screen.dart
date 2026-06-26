import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../domain/entities/validation_result.dart';
import '../widgets/fraudulent_ticket_card.dart';
import '../widgets/invalid_qr_card.dart';
import '../widgets/used_ticket_card.dart';
import '../widgets/valid_ticket_card.dart';

class ValidationResultScreen extends StatefulWidget {
  final ValidationResult result;

  const ValidationResultScreen({super.key, required this.result});

  @override
  State<ValidationResultScreen> createState() => _ValidationResultScreenState();
}

class _ValidationResultScreenState extends State<ValidationResultScreen>
    with TickerProviderStateMixin {
  late AnimationController _bgController;
  late AnimationController _countdownController;
  late Animation<double> _bgOpacity;
  Timer? _autoReturnTimer;
  int _countdownSeconds = 3;

  @override
  void initState() {
    super.initState();

    _bgController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _countdownController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    );

    _bgOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _bgController, curve: Curves.easeIn),
    );

    _bgController.forward();
    _countdownController.forward();

    // Countdown timer
    _autoReturnTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _countdownSeconds--);
      if (_countdownSeconds <= 0) {
        timer.cancel();
        _returnToScanner();
      }
    });

    // Set status bar to match result
    _setSystemUI();
  }

  void _setSystemUI() {
    Color statusColor;
    if (widget.result.isValid) {
      statusColor = AppColors.validBackground;
    } else if (widget.result.isUsed) {
      statusColor = AppColors.usedBackground;
    } else {
      statusColor = AppColors.fraudBackground;
    }

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );
  }

  void _returnToScanner() {
    if (!mounted) return;
    Navigator.pop(context);
  }

  @override
  void dispose() {
    _autoReturnTimer?.cancel();
    _bgController.dispose();
    _countdownController.dispose();
    super.dispose();
  }

  // Determine colors and gradient based on result
  Gradient get _backgroundGradient {
    if (widget.result.isValid) {
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF001A0A), Color(0xFF003319), Color(0xFF001A0A)],
      );
    } else if (widget.result.isUsed) {
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF1A0005), Color(0xFF33000D), Color(0xFF1A0005)],
      );
    } else if (widget.result.isFraudulent) {
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF1A0800), Color(0xFF331500), Color(0xFF1A0800)],
      );
    } else {
      // invalid QR / not found
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF000A1A), Color(0xFF001533), Color(0xFF000A1A)],
      );
    }
  }

  Color get _accentColor {
    if (widget.result.isValid) return AppColors.validGreen;
    if (widget.result.isUsed) return AppColors.usedRed;
    if (widget.result.isFraudulent) return AppColors.fraudOrange;
    return const Color(0xFF448AFF); // blue for invalid QR
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _returnToScanner,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: FadeTransition(
          opacity: _bgOpacity,
          child: Container(
            decoration: BoxDecoration(gradient: _backgroundGradient),
            child: SafeArea(
              child: Stack(
                children: [
                  // Glow effect background
                  Positioned(
                    top: -100,
                    left: 0,
                    right: 0,
                    child: Container(
                      height: 400,
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          colors: [
                            _accentColor.withOpacity(0.12),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Main content
                  SingleChildScrollView(
                    physics: const NeverScrollableScrollPhysics(),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: MediaQuery.of(context).size.height -
                            MediaQuery.of(context).padding.top -
                            MediaQuery.of(context).padding.bottom,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // Result card
                            _buildResultWidget(),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Top bar with close + countdown
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: _buildTopBar(),
                  ),

                  // Bottom tap hint
                  Positioned(
                    bottom: 24,
                    left: 0,
                    right: 0,
                    child: Column(
                      children: [
                        // Countdown progress
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 48),
                          child: AnimatedBuilder(
                            animation: _countdownController,
                            builder: (_, __) => ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: 1 - _countdownController.value,
                                backgroundColor:
                                    Colors.white.withOpacity(0.1),
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  _accentColor.withOpacity(0.6),
                                ),
                                minHeight: 3,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Appuyez pour scanner le prochain ticket  •  $_countdownSeconds',
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            color: Colors.white.withOpacity(0.4),
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
      ),
    );
  }

  Widget _buildResultWidget() {
    if (widget.result.isValid) {
      return ValidTicketCard(result: widget.result);
    } else if (widget.result.isUsed) {
      return UsedTicketCard(result: widget.result);
    } else if (widget.result.isFraudulent) {
      return FraudulentTicketCard(result: widget.result);
    } else {
      return InvalidQrCard(result: widget.result);
    }
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Status indicator
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: _accentColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _accentColor.withOpacity(0.3),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: _accentColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  widget.result.isValid
                      ? 'VALIDE'
                      : widget.result.isUsed
                          ? 'UTILISÉ'
                          : widget.result.isFraudulent
                              ? 'FRAUDE'
                              : 'ERREUR',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: _accentColor,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),

          // Close button
          GestureDetector(
            onTap: _returnToScanner,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.close_rounded,
                color: Colors.white54,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }

}
