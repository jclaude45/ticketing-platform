import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/app_constants.dart';
import '../../domain/entities/accreditation_result.dart';

class AccreditationResultScreen extends StatefulWidget {
  final AccreditationResult result;

  const AccreditationResultScreen({super.key, required this.result});

  @override
  State<AccreditationResultScreen> createState() =>
      _AccreditationResultScreenState();
}

class _AccreditationResultScreenState extends State<AccreditationResultScreen>
    with TickerProviderStateMixin {
  late AnimationController _bgController;
  late AnimationController _slideController;
  late Animation<double> _bgOpacity;
  late Animation<Offset> _slideIn;
  Timer? _autoReturnTimer;
  int _countdownSeconds = AppConstants.resultDisplaySeconds;

  @override
  void initState() {
    super.initState();

    _bgController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );
    _slideController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _bgOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _bgController, curve: Curves.easeIn),
    );
    _slideIn = Tween<Offset>(begin: const Offset(0, 0.15), end: Offset.zero)
        .animate(CurvedAnimation(parent: _slideController, curve: Curves.easeOutCubic));

    _bgController.forward();
    _slideController.forward();

    if (widget.result.isValid) {
      HapticFeedback.lightImpact();
    } else {
      HapticFeedback.heavyImpact();
    }

    _autoReturnTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) { timer.cancel(); return; }
      setState(() => _countdownSeconds--);
      if (_countdownSeconds <= 0) { timer.cancel(); _return(); }
    });
  }

  void _return() {
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _autoReturnTimer?.cancel();
    _bgController.dispose();
    _slideController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isValid = widget.result.isValid;
    final bgColor = isValid
        ? const Color(0xFF0D2B1D)
        : const Color(0xFF2B0D0D);
    final accentColor = isValid
        ? const Color(0xFF22C55E)
        : const Color(0xFFEF4444);

    return Scaffold(
      backgroundColor: bgColor,
      body: FadeTransition(
        opacity: _bgOpacity,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header
                Row(
                  children: [
                    Icon(
                      isValid ? Icons.verified_rounded : Icons.cancel_rounded,
                      color: accentColor,
                      size: 32,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        isValid ? 'BADGE VALIDE' : 'BADGE REFUSÉ',
                        style: GoogleFonts.inter(
                          color: accentColor,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ),
                    GestureDetector(
                      onTap: _return,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.white24),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '$_countdownSeconds s',
                          style: GoogleFonts.inter(color: Colors.white60, fontSize: 13),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                SlideTransition(
                  position: _slideIn,
                  child: isValid ? _ValidCard(result: widget.result) : _InvalidCard(result: widget.result),
                ),

                const Spacer(),
                TextButton(
                  onPressed: _return,
                  child: Text(
                    'Retour au scanner',
                    style: GoogleFonts.inter(color: Colors.white54, fontSize: 15),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Valid badge card ──────────────────────────────────────────────────────────

class _ValidCard extends StatelessWidget {
  final AccreditationResult result;
  const _ValidCard({required this.result});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Photo + name row
          Row(
            children: [
              _PhotoAvatar(photoUrl: result.photoUrl, name: result.memberName ?? '?'),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.memberName ?? 'Membre inconnu',
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    _RoleBadge(role: result.role ?? 'STAFF'),
                  ],
                ),
              ),
            ],
          ),
          if (result.code != null) ...[
            const SizedBox(height: 16),
            _InfoRow(label: 'Code', value: result.code!),
          ],
          if (result.zones.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'ZONES AUTORISÉES',
              style: GoogleFonts.inter(
                color: Colors.white38,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: result.zones
                  .map((z) => _ZoneChip(zone: z))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Invalid badge card ────────────────────────────────────────────────────────

class _InvalidCard extends StatelessWidget {
  final AccreditationResult result;
  const _InvalidCard({required this.result});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.block_rounded, color: Color(0xFFEF4444), size: 48),
          const SizedBox(height: 16),
          Text(
            result.reason ?? 'Accreditation non valide',
            style: GoogleFonts.inter(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ce badge ne permet pas l\'accès.',
            style: GoogleFonts.inter(color: Colors.white54, fontSize: 14),
          ),
        ],
      ),
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _PhotoAvatar extends StatelessWidget {
  final String? photoUrl;
  final String name;
  const _PhotoAvatar({required this.photoUrl, required this.name});

  @override
  Widget build(BuildContext context) {
    if (photoUrl != null && photoUrl!.isNotEmpty) {
      final fullUrl = photoUrl!.startsWith('http')
          ? photoUrl!
          : '${AppConstants.baseUrl.replaceAll('/api/v1', '')}$photoUrl';
      return CircleAvatar(
        radius: 36,
        backgroundColor: Colors.white12,
        backgroundImage: NetworkImage(fullUrl),
      );
    }
    return CircleAvatar(
      radius: 36,
      backgroundColor: const Color(0xFF22C55E).withOpacity(0.2),
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : '?',
        style: GoogleFonts.inter(
          color: const Color(0xFF22C55E),
          fontSize: 28,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _RoleBadge extends StatelessWidget {
  final String role;
  const _RoleBadge({required this.role});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF6366F1).withOpacity(0.2),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.5)),
      ),
      child: Text(
        role.toUpperCase(),
        style: GoogleFonts.inter(
          color: const Color(0xFF818CF8),
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

class _ZoneChip extends StatelessWidget {
  final String zone;
  const _ZoneChip({required this.zone});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF22C55E).withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.4)),
      ),
      child: Text(
        zone,
        style: GoogleFonts.inter(
          color: const Color(0xFF86EFAC),
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          '$label: ',
          style: GoogleFonts.inter(color: Colors.white38, fontSize: 13),
        ),
        Text(
          value,
          style: GoogleFonts.inter(
            color: Colors.white70,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
