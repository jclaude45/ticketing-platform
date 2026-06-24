import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/network/network_info.dart';
import '../../../../shared/widgets/connectivity_banner.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/events_provider.dart';
import '../widgets/event_card.dart';

class EventsListScreen extends ConsumerStatefulWidget {
  const EventsListScreen({super.key});

  @override
  ConsumerState<EventsListScreen> createState() => _EventsListScreenState();
}

class _EventsListScreenState extends ConsumerState<EventsListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventsNotifierProvider.notifier).loadEvents();
    });
  }

  @override
  Widget build(BuildContext context) {
    final eventsState = ref.watch(eventsNotifierProvider);
    final user = ref.watch(currentUserProvider);
    final connectivity = ref.watch(connectivityStreamProvider);
    final isOnline = connectivity.when(
      data: (v) => v,
      loading: () => true,
      error: (_, __) => false,
    );
    final userName = user?.name ?? 'Controller';

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Connectivity banner
            const ConnectivityBanner(),

            // Fixed header
            _buildHeader(userName, isOnline),

            // Syncing / error banners
            if (eventsState.isSyncing) _buildSyncingBanner(),
            if (eventsState.error != null)
              _ErrorBanner(
                message: eventsState.error!,
                onDismiss: () =>
                    ref.read(eventsNotifierProvider.notifier).clearError(),
              ),

            // Stats row
            if (eventsState.events.isNotEmpty)
              _StatsRow(
                totalEvents: eventsState.events.length,
                liveEvents: eventsState.events.where((e) => e.isLive).length,
              ),

            // Events list — fills remaining space
            Expanded(
              child: eventsState.isLoading
                  ? _buildShimmerList()
                  : eventsState.events.isEmpty
                      ? _buildEmptyState(isOnline)
                      : RefreshIndicator(
                          color: AppColors.primary,
                          backgroundColor: AppColors.backgroundCard,
                          onRefresh: () => ref
                              .read(eventsNotifierProvider.notifier)
                              .loadEvents(forceRefresh: true),
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: eventsState.events.length,
                            itemBuilder: (context, index) {
                              final event = eventsState.events[index];
                              return EventCard(
                                event: event,
                                isOffline: !isOnline,
                                onTap: () => Navigator.pushNamed(
                                  context,
                                  '/event-detail',
                                  arguments: event.id,
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(String userName, bool isOnline) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 8, 4),
      child: Row(
        children: [
          // Avatar
          CircleAvatar(
            radius: 22,
            backgroundColor: AppColors.primary.withOpacity(0.2),
            child: Text(
              userName.isNotEmpty ? userName[0].toUpperCase() : 'C',
              style: GoogleFonts.inter(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Name + status
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Hello, $userName',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: isOnline
                            ? AppColors.statusOnline
                            : AppColors.statusOffline,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      isOnline ? 'Online' : 'Offline Mode',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: isOnline
                            ? AppColors.statusOnline
                            : AppColors.statusOffline,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Actions
          IconButton(
            icon: const Icon(Icons.sync_rounded, color: AppColors.textSecondary),
            onPressed: () =>
                ref.read(eventsNotifierProvider.notifier).sync(),
            tooltip: 'Sync',
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded,
                color: AppColors.textSecondary),
            onPressed: _confirmLogout,
            tooltip: 'Logout',
          ),
        ],
      ),
    );
  }

  Widget _buildSyncingBanner() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.statusSyncing.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.statusSyncing.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
          const SizedBox(width: 10),
          Text('Syncing events…',
              style:
                  GoogleFonts.inter(fontSize: 13, color: AppColors.primary)),
        ],
      ),
    );
  }

  Widget _buildShimmerList() {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: 3,
      itemBuilder: (_, __) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Shimmer.fromColors(
          baseColor: AppColors.backgroundCard,
          highlightColor: AppColors.backgroundSurface,
          child: Container(
            height: 240,
            decoration: BoxDecoration(
              color: AppColors.backgroundCard,
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState(bool isOnline) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.backgroundSurface,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.event_busy_rounded,
                  size: 40, color: AppColors.textMuted),
            ),
            const SizedBox(height: 20),
            Text(
              isOnline ? 'No events assigned' : 'No offline data',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isOnline
                  ? 'You have no events assigned yet.\nContact your administrator.'
                  : 'Connect to the internet to\ndownload your event data.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textMuted,
                height: 1.6,
              ),
            ),
            if (isOnline) ...[
              const SizedBox(height: 24),
              TextButton.icon(
                onPressed: () => ref
                    .read(eventsNotifierProvider.notifier)
                    .loadEvents(forceRefresh: true),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Refresh'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.backgroundCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Logout',
            style: GoogleFonts.inter(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary)),
        content: Text(
          'Are you sure you want to logout?\nAny unsynced scans will be lost.',
          style: GoogleFonts.inter(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel',
                style: GoogleFonts.inter(color: AppColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Logout',
                style: GoogleFonts.inter(color: AppColors.usedRed)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(authNotifierProvider.notifier).logout();
      if (mounted) Navigator.pushReplacementNamed(context, '/login');
    }
  }
}

// ── Stats row ────────────────────────────────────────────────────────────────

class _StatsRow extends StatelessWidget {
  final int totalEvents;
  final int liveEvents;
  const _StatsRow({required this.totalEvents, required this.liveEvents});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          _StatChip(label: 'Total', value: '$totalEvents', color: AppColors.primary),
          const SizedBox(width: 10),
          _StatChip(label: 'Live Now', value: '$liveEvents', color: AppColors.validGreen),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(width: 6),
          Text(label,
              style: GoogleFonts.inter(
                  fontSize: 12, color: color.withOpacity(0.7))),
        ],
      ),
    );
  }
}

// ── Error banner ─────────────────────────────────────────────────────────────

class _ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback onDismiss;
  const _ErrorBanner({required this.message, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.usedRed.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.usedRed.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.usedRed, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message,
                style: GoogleFonts.inter(
                    fontSize: 13, color: AppColors.usedRed)),
          ),
          GestureDetector(
            onTap: onDismiss,
            child:
                const Icon(Icons.close, color: AppColors.usedRed, size: 16),
          ),
        ],
      ),
    );
  }
}
