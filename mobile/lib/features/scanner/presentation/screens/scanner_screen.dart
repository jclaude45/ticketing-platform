import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/network/network_info.dart';
import '../../../../core/utils/date_utils.dart';
import '../../../accreditation/presentation/providers/accreditation_provider.dart';
import '../../../accreditation/presentation/screens/accreditation_result_screen.dart';
import '../../domain/entities/validation_result.dart';
import '../providers/scanner_provider.dart';
import '../widgets/qr_scanner_widget.dart';
import '../widgets/scan_overlay.dart';

enum ScanMode { tickets, badges }

class ScannerScreen extends ConsumerStatefulWidget {
  final String eventId;

  const ScannerScreen({super.key, required this.eventId});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen>
    with TickerProviderStateMixin {
  final GlobalKey<QrScannerWidgetState> _scannerKey = GlobalKey();
  bool _hasCameraPermission = false;
  bool _isTorchOn = false;
  ScanMode _scanMode = ScanMode.tickets;

  // Flash animation
  late AnimationController _flashController;
  late Animation<double> _flashOpacity;
  Color _flashColor = Colors.transparent;

  @override
  void initState() {
    super.initState();
    _flashController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _flashOpacity = Tween<double>(begin: 0.0, end: 0.5).animate(
      CurvedAnimation(parent: _flashController, curve: Curves.easeOut),
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(scannerNotifierProvider.notifier).setEventId(widget.eventId);
      ref.read(accreditationNotifierProvider.notifier).setEventId(widget.eventId);
      _checkCameraPermission();
    });
  }

  Future<void> _checkCameraPermission() async {
    final status = await Permission.camera.status;
    if (status.isGranted) {
      setState(() => _hasCameraPermission = true);
    } else {
      final result = await Permission.camera.request();
      setState(() => _hasCameraPermission = result.isGranted);
    }
  }

  @override
  void dispose() {
    _flashController.dispose();
    super.dispose();
  }

  Future<void> _onQrDetected(String code) async {
    if (_scanMode == ScanMode.badges) {
      await _handleAccreditationScan(code);
    } else {
      await _handleTicketScan(code);
    }
  }

  Future<void> _handleTicketScan(String code) async {
    final notifier = ref.read(scannerNotifierProvider.notifier);
    final result = await notifier.onQrDetected(code);
    if (result == null) return;

    if (result.isValid) {
      HapticFeedback.lightImpact();
    } else if (result.isUsed) {
      HapticFeedback.mediumImpact();
    } else if (result.isFraudulent) {
      HapticFeedback.heavyImpact();
      HapticFeedback.heavyImpact();
    }

    _triggerFlash(result.isValid ? AppColors.validGreen : AppColors.usedRed);

    if (!mounted) return;
    await Navigator.pushNamed(context, '/validation-result', arguments: result);
    if (mounted) notifier.resetToScanning();
  }

  Future<void> _handleAccreditationScan(String code) async {
    final notifier = ref.read(accreditationNotifierProvider.notifier);
    final result = await notifier.onQrDetected(code);
    if (result == null) return;

    if (result.isValid) {
      HapticFeedback.lightImpact();
    } else {
      HapticFeedback.heavyImpact();
    }

    _triggerFlash(result.isValid ? AppColors.validGreen : AppColors.usedRed);

    if (!mounted) return;
    await Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (_, animation, __) =>
            AccreditationResultScreen(result: result),
        transitionDuration: const Duration(milliseconds: 300),
        transitionsBuilder: (_, animation, __, child) => FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.92, end: 1.0).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
            child: child,
          ),
        ),
      ),
    );
  }

  void _triggerFlash(Color color) {
    _flashColor = color;
    _flashController.forward().then((_) => _flashController.reverse());
  }

  void _toggleTorch() {
    _scannerKey.currentState?.toggleTorch();
    setState(() => _isTorchOn = !_isTorchOn);
  }

  void _switchMode(ScanMode mode) {
    if (_scanMode == mode) return;
    setState(() => _scanMode = mode);
    HapticFeedback.selectionClick();
  }

  @override
  Widget build(BuildContext context) {
    final scannerState = ref.watch(scannerNotifierProvider);
    final accState = ref.watch(accreditationNotifierProvider);
    final connectivity = ref.watch(connectivityStreamProvider);
    final isOnline = connectivity.when(
      data: (v) => v,
      loading: () => true,
      error: (_, __) => false,
    );
    final isProcessing = _scanMode == ScanMode.tickets
        ? scannerState.isProcessing
        : accState.isProcessing;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera
          if (_hasCameraPermission)
            Positioned.fill(
              child: QrScannerWidget(
                key: _scannerKey,
                onDetected: _onQrDetected,
                isActive: !isProcessing,
              ),
            )
          else
            _buildPermissionDenied(),

          // Scan overlay
          if (_hasCameraPermission)
            Positioned.fill(
              child: ScanOverlay(
                isScanning: !isProcessing,
                isProcessing: isProcessing,
                frameColor: isOnline
                    ? (_scanMode == ScanMode.badges
                        ? const Color(0xFF6366F1)
                        : AppColors.scannerFrame)
                    : AppColors.statusOffline,
              ),
            ),

          // Flash
          AnimatedBuilder(
            animation: _flashController,
            builder: (_, __) => Positioned.fill(
              child: IgnorePointer(
                child: Container(
                  color: _flashColor.withOpacity(_flashOpacity.value),
                ),
              ),
            ),
          ),

          // Top bar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildTopBar(isOnline, scannerState.pendingScanCount),
          ),

          // Center hint
          if (_hasCameraPermission && !isProcessing)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 300),
                child: Text(
                  _scanMode == ScanMode.tickets
                      ? 'Placez le QR code dans le cadre'
                      : 'Scannez le badge du membre',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: Colors.white.withOpacity(0.6),
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),

          // Bottom controls
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildBottomControls(isOnline, scannerState.lastResult),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(bool isOnline, int pendingCount) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        MediaQuery.of(context).padding.top + 12,
        16,
        16,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withOpacity(0.85),
            Colors.transparent,
          ],
        ),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _scanMode == ScanMode.tickets ? 'Scanner Tickets' : 'Scanner Badges',
                  style: GoogleFonts.inter(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'Event: ${widget.eventId.substring(0, widget.eventId.length > 8 ? 8 : widget.eventId.length)}...',
                  style: GoogleFonts.inter(fontSize: 11, color: Colors.white54),
                ),
              ],
            ),
          ),
          // Online badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: (isOnline ? AppColors.statusOnline : AppColors.statusOffline).withOpacity(0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: (isOnline ? AppColors.statusOnline : AppColors.statusOffline).withOpacity(0.4),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7, height: 7,
                  decoration: BoxDecoration(
                    color: isOnline ? AppColors.statusOnline : AppColors.statusOffline,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  isOnline ? 'Online' : 'Offline',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isOnline ? AppColors.statusOnline : AppColors.statusOffline,
                  ),
                ),
              ],
            ),
          ),
          if (pendingCount > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.fraudOrange.withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.fraudOrange.withOpacity(0.4)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_upload_outlined, size: 12, color: AppColors.fraudOrange),
                  const SizedBox(width: 4),
                  Text(
                    '$pendingCount',
                    style: GoogleFonts.inter(
                      fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.fraudOrange,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBottomControls(bool isOnline, ValidationResult? lastResult) {
    return Container(
      padding: EdgeInsets.fromLTRB(24, 16, 24, MediaQuery.of(context).padding.bottom + 24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Colors.black.withOpacity(0.9), Colors.transparent],
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Mode toggle
          _buildModeToggle(),
          const SizedBox(height: 16),

          // Last scan info (tickets mode only)
          if (_scanMode == ScanMode.tickets && lastResult != null)
            _buildLastScanInfo(lastResult),

          if (_scanMode == ScanMode.tickets && lastResult != null)
            const SizedBox(height: 16),

          // Control buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ControlButton(
                icon: _isTorchOn ? Icons.flashlight_on_rounded : Icons.flashlight_off_rounded,
                label: 'Torche',
                onTap: _toggleTorch,
                isActive: _isTorchOn,
              ),
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withOpacity(0.3), width: 2),
                  color: Colors.white.withOpacity(0.08),
                ),
                child: Icon(
                  _scanMode == ScanMode.badges ? Icons.badge_outlined : Icons.qr_code_rounded,
                  color: Colors.white,
                  size: 28,
                ),
              ),
              _ControlButton(
                icon: Icons.sync_rounded,
                label: 'Sync',
                onTap: () => ref.read(scannerNotifierProvider.notifier).syncOfflineScans(),
                isActive: false,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildModeToggle() {
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white12),
      ),
      child: Row(
        children: [
          _ModeTab(
            label: 'TICKETS',
            icon: Icons.confirmation_number_outlined,
            isSelected: _scanMode == ScanMode.tickets,
            onTap: () => _switchMode(ScanMode.tickets),
          ),
          _ModeTab(
            label: 'BADGES',
            icon: Icons.badge_outlined,
            isSelected: _scanMode == ScanMode.badges,
            selectedColor: const Color(0xFF6366F1),
            onTap: () => _switchMode(ScanMode.badges),
          ),
        ],
      ),
    );
  }

  Widget _buildLastScanInfo(ValidationResult result) {
    Color color;
    String label;
    IconData icon;

    if (result.isValid) {
      color = AppColors.validGreen;
      label = 'Dernier: VALIDE';
      icon = Icons.check_circle_rounded;
    } else if (result.isUsed) {
      color = AppColors.usedRed;
      label = 'Dernier: UTILISÉ';
      icon = Icons.do_not_disturb_rounded;
    } else if (result.isFraudulent) {
      color = AppColors.fraudOrange;
      label = 'Dernier: FRAUDULEUX';
      icon = Icons.gpp_bad_rounded;
    } else {
      color = AppColors.textMuted;
      label = 'Dernier: ERREUR';
      icon = Icons.error_outline_rounded;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Text(label, style: GoogleFonts.inter(fontSize: 13, color: color, fontWeight: FontWeight.w700)),
          if (result.holderName != null) ...[
            const SizedBox(width: 6),
            Text(
              '• ${result.holderName}',
              style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withOpacity(0.6)),
            ),
          ],
          const Spacer(),
          Text(
            AppDateUtils.formatShortTime(result.scannedAt),
            style: GoogleFonts.inter(fontSize: 11, color: Colors.white38),
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionDenied() {
    return Container(
      color: AppColors.backgroundDark,
      child: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.camera_alt_outlined, size: 70, color: AppColors.textMuted),
            const SizedBox(height: 20),
            Text(
              'Accès caméra requis',
              style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: Text(
                'Autorisez l\'accès à la caméra pour scanner les tickets et badges.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 14, color: AppColors.textMuted),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => openAppSettings(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text('Ouvrir les Paramètres', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Mode Tab ──────────────────────────────────────────────────────────────────

class _ModeTab extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isSelected;
  final Color selectedColor;
  final VoidCallback onTap;

  const _ModeTab({
    required this.label,
    required this.icon,
    required this.isSelected,
    this.selectedColor = const Color(0xFF22C55E),
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: isSelected ? selectedColor.withOpacity(0.2) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            border: isSelected
                ? Border.all(color: selectedColor.withOpacity(0.5))
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 16,
                color: isSelected ? selectedColor : Colors.white38,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? selectedColor : Colors.white38,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Control Button ────────────────────────────────────────────────────────────

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isActive;

  const _ControlButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: isActive ? Colors.white.withOpacity(0.2) : Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isActive ? Colors.white.withOpacity(0.4) : Colors.white.withOpacity(0.15),
              ),
            ),
            child: Icon(icon, color: isActive ? Colors.white : Colors.white60, size: 22),
          ),
          const SizedBox(height: 5),
          Text(label, style: GoogleFonts.inter(fontSize: 11, color: Colors.white60)),
        ],
      ),
    );
  }
}
