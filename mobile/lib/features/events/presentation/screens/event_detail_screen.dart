import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/network/network_info.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/event_entity.dart';
import '../providers/events_provider.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  final String eventId;

  const EventDetailScreen({super.key, required this.eventId});

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen>
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeIn),
    );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Fresh detail (with counters) from the server; the list entry meanwhile / when offline
    final detail = ref.watch(eventDetailProvider(widget.eventId));
    final event = detail.valueOrNull ?? ref.watch(eventByIdProvider(widget.eventId));
    final connectivity = ref.watch(connectivityStreamProvider);
    final isOnline = connectivity.when(
      data: (v) => v,
      loading: () => true,
      error: (_, __) => false,
    );

    if (event == null) {
      return Scaffold(
        backgroundColor: AppColors.backgroundDark,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          leading: const BackButton(color: AppColors.textPrimary),
        ),
        body: Center(
          child: detail.hasError
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        detail.error.toString(),
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(fontSize: 14, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 12),
                      TextButton(
                        onPressed: () => ref.invalidate(eventDetailProvider(widget.eventId)),
                        child: const Text('Réessayer'),
                      ),
                    ],
                  ),
                )
              : const CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: FadeTransition(
        opacity: _fadeAnimation,
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(),
          slivers: [
            // App bar with banner
            SliverAppBar(
              expandedHeight: 200,
              pinned: true,
              backgroundColor: AppColors.backgroundDark,
              leading: IconButton(
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.arrow_back_rounded,
                      color: Colors.white, size: 20),
                ),
                onPressed: () => Navigator.pop(context),
              ),
              flexibleSpace: FlexibleSpaceBar(
                background: _buildBanner(event),
              ),
            ),

            // Content
            SliverPadding(
              padding: const EdgeInsets.all(20),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Event name and status
                  _buildHeader(event),

                  const SizedBox(height: 20),

                  // Stats cards
                  _buildStatsRow(event),

                  const SizedBox(height: 20),

                  // Info section
                  _buildInfoSection(event),

                  const SizedBox(height: 20),

                  // Offline status
                  _buildOfflineSection(event, isOnline),

                  const SizedBox(height: 32),

                  // Scan button
                  _buildScanButton(event),

                  const SizedBox(height: 32),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBanner(EventEntity event) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Banner image or gradient
        if (event.bannerUrl != null)
          _buildBannerImage(event.bannerUrl!)
        else
          _defaultBanner(),

        // Dark overlay
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.transparent,
                Colors.black.withOpacity(0.7),
              ],
            ),
          ),
        ),

        // Live badge
        if (event.isLive)
          Positioned(
            bottom: 16,
            right: 16,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.validGreen,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    'LIVE NOW',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildBannerImage(String url) {
    if (url.startsWith('data:image')) {
      try {
        final base64Str = url.contains(',') ? url.split(',').last : url;
        final bytes = base64Decode(base64Str);
        return Image.memory(bytes, fit: BoxFit.cover);
      } catch (_) {
        return _defaultBanner();
      }
    }
    return Image.network(
      url,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _defaultBanner(),
    );
  }

  Widget _defaultBanner() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A1A3A),
            AppColors.primaryDark,
          ],
        ),
      ),
      child: const Center(
        child: Icon(
          Icons.event_rounded,
          size: 60,
          color: Colors.white24,
        ),
      ),
    );
  }

  Widget _buildHeader(EventEntity event) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          event.name,
          style: GoogleFonts.inter(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
            height: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        if (event.gate != null)
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppColors.primary.withOpacity(0.3),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.door_front_door_outlined,
                  size: 13,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 5),
                Text(
                  'Votre porte : ${event.gate}',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildStatsRow(EventEntity event) {
    final mine = event.extraData ?? const {};
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            label: 'Entrées',
            value: event.checkedIn.toString(),
            icon: Icons.how_to_reg_rounded,
            color: AppColors.validGreen,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            label: 'Mes validations',
            value: '${mine['myValidScans'] ?? '–'}',
            icon: Icons.verified_rounded,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            label: 'Mes scans',
            value: '${mine['myScans'] ?? '–'}',
            icon: Icons.qr_code_scanner_rounded,
            color: AppColors.accent,
          ),
        ),
      ],
    );
  }

  Widget _buildInfoSection(EventEntity event) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.backgroundCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderDefault),
      ),
      child: Column(
        children: [
          _InfoRow(
            icon: Icons.location_on_outlined,
            label: 'Lieu',
            value: event.venue,
          ),
          if (event.address != null) ...[
            const Divider(color: AppColors.borderDefault, height: 24),
            _InfoRow(
              icon: Icons.map_outlined,
              label: 'Adresse',
              value: event.address!,
            ),
          ],
          const Divider(color: AppColors.borderDefault, height: 24),
          _InfoRow(
            icon: Icons.calendar_today_outlined,
            label: 'Date et heure',
            value: AppDateUtils.formatEventDuration(
              event.startDate,
              event.endDate,
            ),
          ),
          if (event.description.isNotEmpty) ...[
            const Divider(color: AppColors.borderDefault, height: 24),
            _InfoRow(
              icon: Icons.info_outline_rounded,
              label: 'Description',
              value: event.description,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOfflineSection(EventEntity event, bool isOnline) {
    final color = isOnline ? AppColors.statusOnline : AppColors.statusOffline;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.backgroundCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isOnline ? AppColors.borderDefault : color.withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              isOnline
                  ? 'En ligne : chaque billet est vérifié en temps réel.'
                  : 'Pas de connexion : les billets ne peuvent pas être vérifiés pour le moment.',
              style: GoogleFonts.inter(fontSize: 12, color: AppColors.textSecondary, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScanButton(EventEntity event) {
    return GestureDetector(
      onTap: () {
        Navigator.pushNamed(context, '/scanner', arguments: event.id)
            // Back from scanning: refresh the counters
            .then((_) => ref.invalidate(eventDetailProvider(widget.eventId)));
      },
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primary, AppColors.primaryDark],
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withOpacity(0.4),
              blurRadius: 20,
              spreadRadius: 2,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.qr_code_scanner_rounded,
              color: Colors.white,
              size: 26,
            ),
            const SizedBox(width: 12),
            Text(
              'Commencer à scanner',
              style: GoogleFonts.inter(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(
            value,
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 10,
              color: color.withOpacity(0.7),
              fontWeight: FontWeight.w500,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.textMuted),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
