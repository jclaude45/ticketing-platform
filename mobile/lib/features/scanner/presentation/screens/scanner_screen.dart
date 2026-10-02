import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/scanner/hardware_scanner.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/feedback/scan_feedback.dart';
import '../../../../core/network/network_info.dart';
import '../../../../core/utils/date_utils.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../accreditation/presentation/providers/accreditation_provider.dart';
import '../../../accreditation/presentation/screens/accreditation_result_screen.dart';
import '../../../events/presentation/providers/events_provider.dart';
import '../../../merch/data/merch_pickup.dart';
import '../../../merch/presentation/merch_pickup_screen.dart';
import '../../../sync/presentation/providers/sync_provider.dart';
import '../../domain/entities/validation_result.dart';
import '../providers/scanner_provider.dart';
import '../widgets/qr_scanner_widget.dart';
import '../widgets/scan_overlay.dart';

enum ScanMode { tickets, badges, merch }

/// Arguments of the /scanner route (a plain event id is also accepted)
class ScannerArgs {
  final String eventId;
  final ScanMode mode;
  final String? initialCode;

  const ScannerArgs(this.eventId, {this.mode = ScanMode.tickets, this.initialCode});
}

class ScannerScreen extends ConsumerStatefulWidget {
  final String eventId;

  /// Mode on opening (the Guichet tab opens it on shop pickups)
  final ScanMode initialMode;

  /// Code read with the terminal's trigger before this screen was open
  final String? initialCode;

  const ScannerScreen({super.key, required this.eventId, this.initialMode = ScanMode.tickets, this.initialCode});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen>
    with TickerProviderStateMixin {
  final GlobalKey<QrScannerWidgetState> _scannerKey = GlobalKey();
  bool _hasCameraPermission = false;
  bool _isTorchOn = false;
  bool _frontCamera = false;
  bool _soundOn = ScanFeedback.instance.soundEnabled;
  bool _merchBusy = false;
  late ScanMode _scanMode = widget.initialMode;
  StreamSubscription<String>? _triggerSub;

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
      if (!ref.read(hardwareScannerOnlyProvider)) _checkCameraPermission();
      // Terminal trigger: same path as the camera, only while this screen is in front
      _triggerSub = HardwareScanner.instance.scans.listen((code) {
        if (mounted && (ModalRoute.of(context)?.isCurrent ?? false)) _onQrDetected(code);
      });
      if (widget.initialCode != null) _onQrDetected(widget.initialCode!);
      ScanFeedback.instance.init().then((_) {
        if (mounted) setState(() => _soundOn = ScanFeedback.instance.soundEnabled);
      });
      // Up-to-date ticket list and pending entries sent as soon as the scanner opens
      _sync();
    });
  }

  Future<void> _sync() async {
    final report = await ref.read(syncNotifierProvider.notifier).sync(packs: true);
    final message = report == null ? null : describeSync(report);
    if (!mounted || message == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: report!.conflicts > 0 ? AppColors.fraudOrange : null,
      duration: Duration(seconds: report.conflicts > 0 ? 8 : 3),
    ));
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
    _triggerSub?.cancel();
    _flashController.dispose();
    super.dispose();
  }

  /// True while a result screen is open: the camera stops so the same ticket in front of
  /// it can't be counted again (and result screens can't stack up).
  bool _showingResult = false;

  Future<void> _onQrDetected(String code) async {
    if (_showingResult) return;
    if (_scanMode == ScanMode.badges) {
      await _handleAccreditationScan(code);
    } else if (_scanMode == ScanMode.merch) {
      await _handleMerch(qrContent: code);
    } else {
      await _handleTicketScan(code);
    }
  }

  Future<void> _showResult(Future<void> Function() open) async {
    setState(() => _showingResult = true);
    try {
      await open();
    } finally {
      if (mounted) setState(() => _showingResult = false);
    }
  }

  Future<void> _handleTicketScan(String code) async {
    final notifier = ref.read(scannerNotifierProvider.notifier);
    final result = await notifier.onQrDetected(code);
    if (result == null) return;

    // Beep + short tap = entry granted; buzz + long vibration = look at the screen
    result.isValid ? ScanFeedback.instance.accepted() : ScanFeedback.instance.refused();

    _triggerFlash(result.isValid ? AppColors.validGreen : AppColors.usedRed);
    if (result.isOfflineResult) ref.read(syncNotifierProvider.notifier).refreshPending();

    if (!mounted) return;
    await _showResult(() => Navigator.pushNamed(context, '/validation-result', arguments: result));
    if (mounted) notifier.resetToScanning();
  }

  Future<void> _handleAccreditationScan(String code) async {
    final notifier = ref.read(accreditationNotifierProvider.notifier);
    final result = await notifier.onQrDetected(code);
    if (result == null) return;

    result.isValid ? ScanFeedback.instance.accepted() : ScanFeedback.instance.refused();

    _triggerFlash(result.isValid ? AppColors.validGreen : AppColors.usedRed);

    if (!mounted) return;
    await _showResult(() => Navigator.push(
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
    ));
  }

  void _triggerFlash(Color color) {
    _flashColor = color;
    _flashController.forward().then((_) => _flashController.reverse());
  }

  void _toggleTorch() {
    if (_frontCamera) return; // no flash on the front camera
    _scannerKey.currentState?.toggleTorch();
    setState(() => _isTorchOn = !_isTorchOn);
  }

  Future<void> _switchCamera() async {
    await _scannerKey.currentState?.switchCamera();
    setState(() {
      _frontCamera = !_frontCamera;
      _isTorchOn = false;
    });
  }

  Future<void> _toggleSound() async {
    await ScanFeedback.instance.setSoundEnabled(!_soundOn);
    setState(() => _soundOn = !_soundOn);
    if (_soundOn) ScanFeedback.instance.accepted();
  }

  /// Shop order picked up at the stand: from its QR, or its code typed by hand.
  Future<void> _handleMerch({String? qrContent, String? code}) async {
    if (_merchBusy) return;
    setState(() => _merchBusy = true);
    try {
      final order = await getIt<MerchRepository>().lookup(widget.eventId, qrContent: qrContent, code: code);
      if (!mounted) return;
      _triggerFlash(order.canHandOver ? AppColors.validGreen : AppColors.usedRed);
      await _showResult(() => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => MerchPickupScreen(eventId: widget.eventId, order: order)),
          ));
    } catch (e) {
      ScanFeedback.instance.refused();
      _triggerFlash(AppColors.usedRed);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: AppColors.usedRed));
      }
    } finally {
      if (mounted) setState(() => _merchBusy = false);
    }
  }

  Future<void> _typeMerchCode() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.page,
        title: Text('Code de la commande', style: zcText(ZcSize.h3, weight: ZcWeight.bold)),
        content: ZcTextField(
          controller: controller,
          hint: 'B-XXXXXX',
          textCapitalization: TextCapitalization.characters,
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Annuler', style: zcText(ZcSize.body, color: AppColors.grey))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: Text('Rechercher', style: zcText(ZcSize.body, weight: ZcWeight.medium)),
          ),
        ],
      ),
    );
    if (code != null && code.trim().isNotEmpty) await _handleMerch(code: code.trim());
  }

  /// Camera <-> terminal trigger only (remembered, also in Paramètres)
  Future<void> _toggleHardwareOnly() async {
    final hardwareOnly = !ref.read(hardwareScannerOnlyProvider);
    await ref.read(hardwareScannerOnlyProvider.notifier).set(hardwareOnly);
    if (!hardwareOnly && !_hasCameraPermission) await _checkCameraPermission();
    if (hardwareOnly) setState(() => _isTorchOn = false);
  }

  void _switchMode(ScanMode mode) {
    if (_scanMode == mode) return;
    setState(() => _scanMode = mode);
    HapticFeedback.selectionClick();
  }

  static const _modes = [
    (mode: ScanMode.tickets, label: 'Billets', icon: Icons.confirmation_number_outlined),
    (mode: ScanMode.badges, label: 'Badges', icon: Icons.badge_outlined),
    (mode: ScanMode.merch, label: 'Boutique', icon: Icons.shopping_bag_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final scannerState = ref.watch(scannerNotifierProvider);
    final accState = ref.watch(accreditationNotifierProvider);
    final isOnline = ref.watch(connectivityStreamProvider).valueOrNull ?? true;
    final hardwareOnly = ref.watch(hardwareScannerOnlyProvider);
    final camera = _hasCameraPermission && !hardwareOnly;
    final isProcessing = switch (_scanMode) {
      ScanMode.tickets => scannerState.isProcessing,
      ScanMode.badges => accState.isProcessing,
      ScanMode.merch => _merchBusy,
    };
    // Yellow of the charter; orange when tickets are checked with the offline list
    final frameColor = _scanMode == ScanMode.tickets && !isOnline ? AppColors.statusOffline : AppColors.eventCard;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Light icons over the camera; dark on the white panels (trigger, permission) in light mode
      value: (camera || AppColors.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            // Camera, or the panel of the terminal's trigger
            if (hardwareOnly)
              _buildTriggerPanel(isProcessing, frameColor)
            else if (_hasCameraPermission)
              Positioned.fill(
                child: QrScannerWidget(
                  key: _scannerKey,
                  onDetected: _onQrDetected,
                  isActive: !isProcessing && !_showingResult,
                ),
              )
            else
              _buildPermissionDenied(),

            if (camera)
              Positioned.fill(
                child: ScanOverlay(isScanning: !isProcessing, isProcessing: isProcessing, frameColor: frameColor),
              ),

            // Flash
            AnimatedBuilder(
              animation: _flashController,
              builder: (_, __) => Positioned.fill(
                child: IgnorePointer(child: Container(color: _flashColor.withValues(alpha: _flashOpacity.value))),
              ),
            ),

            Positioned(top: 0, left: 0, right: 0, child: _buildTopBar(isOnline, ref.watch(syncNotifierProvider).pending, overCamera: camera)),

            if (camera && !isProcessing)
              Center(
                child: Padding(
                  padding: const EdgeInsets.only(top: 340),
                  child: Text(
                    switch (_scanMode) {
                      ScanMode.tickets => 'Placez le QR code dans le cadre',
                      ScanMode.badges => 'Scannez le badge du membre',
                      ScanMode.merch => isOnline ? 'Scannez le QR de retrait de la commande' : 'Le retrait boutique nécessite une connexion',
                    },
                    style: zcText(ZcSize.body, color: Colors.white.withValues(alpha: 0.8)),
                  ),
                ),
              ),

            Positioned(bottom: 0, left: 0, right: 0, child: _buildBottomSheet(scannerState.lastResult, hardwareOnly)),
          ],
        ),
      ),
    );
  }

  /// Back chevron, title and event, network state, entries waiting to be sent.
  /// White on a dark gradient over the camera; charter ink on the white panels.
  Widget _buildTopBar(bool isOnline, int pendingCount, {required bool overCamera}) {
    final fg = overCamera ? Colors.white : AppColors.ink;
    final fgSoft = overCamera ? Colors.white70 : AppColors.grey;
    final statusColor = isOnline ? AppColors.statusOnline : AppColors.statusOffline;
    return Container(
      padding: EdgeInsets.fromLTRB(8, MediaQuery.of(context).padding.top + 8, 16, 24),
      decoration: overCamera
          ? const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xCC000000), Colors.transparent],
              ),
            )
          : null,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Retour',
            icon: Icon(Icons.arrow_back_ios_new_rounded, color: fg, size: 24),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  switch (_scanMode) {
                    ScanMode.tickets => 'Scanner les billets',
                    ScanMode.badges => 'Scanner les badges',
                    ScanMode.merch => 'Retrait boutique',
                  },
                  style: zcText(ZcSize.title, weight: ZcWeight.bold, color: fg),
                ),
                Text(
                  ref.watch(eventByIdProvider(widget.eventId))?.name ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: zcText(ZcSize.small, color: fgSoft),
                ),
              ],
            ),
          ),
          _Pill(bordered: !overCamera, color: statusColor, icon: isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded, label: isOnline ? 'En ligne' : 'Hors ligne'),
          if (pendingCount > 0) ...[
            const SizedBox(width: 6),
            _Pill(bordered: !overCamera, color: AppColors.fraudOrange, icon: Icons.cloud_upload_outlined, label: '$pendingCount'),
          ],
        ],
      ),
    );
  }

  /// White sheet with rounded top corners, like the bottom bar of the app.
  Widget _buildBottomSheet(ValidationResult? lastResult, bool hardwareOnly) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, 18, 20, MediaQuery.of(context).padding.bottom + 14),
      decoration: BoxDecoration(
        color: AppColors.page,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(34)),
        boxShadow: [BoxShadow(color: AppColors.shadow, blurRadius: 22.5, offset: const Offset(0, -3))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildModeToggle(),
          if (_scanMode == ScanMode.tickets && lastResult != null) ...[
            const SizedBox(height: 12),
            _buildLastScanInfo(lastResult),
          ],
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              if (!hardwareOnly) ...[
                _ControlButton(
                  icon: _isTorchOn ? Icons.flashlight_on_rounded : Icons.flashlight_off_outlined,
                  label: 'Torche',
                  onTap: _toggleTorch,
                  isActive: _isTorchOn,
                ),
                _ControlButton(
                  icon: Icons.cameraswitch_outlined,
                  label: _frontCamera ? 'Avant' : 'Arrière',
                  onTap: _switchCamera,
                  isActive: _frontCamera,
                ),
              ],
              _ControlButton(
                icon: hardwareOnly ? Icons.barcode_reader : Icons.photo_camera_outlined,
                label: hardwareOnly ? 'Gâchette' : 'Caméra',
                onTap: _toggleHardwareOnly,
                isActive: hardwareOnly,
              ),
              if (_scanMode == ScanMode.merch)
                _ControlButton(icon: Icons.keyboard_outlined, label: 'Code', onTap: _typeMerchCode, isActive: false),
              _ControlButton(
                icon: _soundOn ? Icons.volume_up_outlined : Icons.volume_off_outlined,
                label: _soundOn ? 'Son' : 'Muet',
                onTap: _toggleSound,
                isActive: _soundOn,
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Billets / Badges / Boutique: the selected one in ink, like the main buttons.
  Widget _buildModeToggle() {
    return Container(
      height: 46,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.ink),
      ),
      child: Row(
        children: [
          for (final m in _modes)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _switchMode(m.mode),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  decoration: BoxDecoration(
                    color: _scanMode == m.mode ? AppColors.ink : Colors.transparent,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(m.icon, size: 16, color: _scanMode == m.mode ? AppColors.onInk : AppColors.ink),
                      const SizedBox(width: 6),
                      Text(
                        m.label,
                        style: zcText(
                          ZcSize.body,
                          weight: _scanMode == m.mode ? ZcWeight.bold : ZcWeight.medium,
                          color: _scanMode == m.mode ? AppColors.onInk : AppColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Last ticket scanned, as a line of the guest list.
  Widget _buildLastScanInfo(ValidationResult result) {
    final (Color color, String label) = result.isValid
        ? (AppColors.validGreen, 'Valide')
        : result.isUsed
            ? (AppColors.usedRed, 'Déjà utilisé')
            : result.isFraudulent
                ? (AppColors.fraudOrange, 'Frauduleux')
                : (AppColors.grey, 'Refusé');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.grey.withValues(alpha: 0.4)))),
      child: Row(
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 10),
          Text('Dernier : $label', style: zcText(ZcSize.small, weight: ZcWeight.medium)),
          if (result.holderName != null)
            Expanded(
              child: Text(
                '  ·  ${result.holderName}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: zcText(ZcSize.small, color: AppColors.grey),
              ),
            )
          else
            const Spacer(),
          Text(AppDateUtils.formatShortTime(result.scannedAt), style: zcText(ZcSize.caption, color: AppColors.grey)),
        ],
      ),
    );
  }

  /// Camera off: the controller scans with the terminal's trigger.
  Widget _buildTriggerPanel(bool isProcessing, Color color) {
    return Positioned.fill(
      child: Container(
        color: AppColors.page,
        alignment: const Alignment(0, -0.25),
        padding: const EdgeInsets.symmetric(horizontal: 42),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            isProcessing
                ? SizedBox(width: 72, height: 72, child: CircularProgressIndicator(color: AppColors.ink, strokeWidth: 3))
                : Icon(Icons.barcode_reader, size: 96, color: AppColors.ink),
            const SizedBox(height: 28),
            Text(
              isProcessing ? 'Vérification…' : 'Appuyez sur\nla gâchette',
              textAlign: TextAlign.center,
              style: zcText(ZcSize.h1, weight: ZcWeight.bold, height: 1.2),
            ),
            const SizedBox(height: 12),
            Text(
              switch (_scanMode) {
                ScanMode.tickets => 'Visez le QR code du billet avec le scanner du terminal.',
                ScanMode.badges => 'Visez le badge du membre avec le scanner du terminal.',
                ScanMode.merch => 'Visez le QR de retrait de la commande avec le scanner du terminal.',
              },
              textAlign: TextAlign.center,
              style: zcText(ZcSize.body, color: AppColors.grey, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPermissionDenied() {
    return Positioned.fill(
      child: Container(
        color: AppColors.page,
        alignment: const Alignment(0, -0.25),
        padding: const EdgeInsets.symmetric(horizontal: 42),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.no_photography_outlined, size: 84, color: AppColors.ink),
            const SizedBox(height: 24),
            Text('Accès caméra requis', textAlign: TextAlign.center, style: zcText(ZcSize.h1, weight: ZcWeight.bold)),
            const SizedBox(height: 10),
            Text(
              "Autorisez la caméra pour scanner les billets et badges, ou passez sur la gâchette du terminal.",
              textAlign: TextAlign.center,
              style: zcText(ZcSize.body, color: AppColors.grey, height: 1.5),
            ),
            const SizedBox(height: 28),
            ZcButton(label: 'Ouvrir les réglages', onPressed: openAppSettings),
          ],
        ),
      ),
    );
  }
}

/// Small rounded status label over the camera (network, entries to send).
class _Pill extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String label;

  /// Outlined on a white background (no camera behind)
  final bool bordered;

  const _Pill({required this.color, required this.icon, required this.label, this.bordered = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: bordered ? Border.all(color: const Color(0xFF252427)) : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(label, style: zcText(ZcSize.caption, weight: ZcWeight.medium, color: const Color(0xFF252427))),
        ],
      ),
    );
  }
}

/// Round outlined button of the bottom sheet; filled in ink when the option is on.
class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isActive;

  const _ControlButton({required this.icon, required this.label, required this.onTap, required this.isActive});

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      radius: 32,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: isActive ? AppColors.ink : Colors.transparent,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.ink),
            ),
            child: Icon(icon, size: 22, color: isActive ? AppColors.onInk : AppColors.ink),
          ),
          const SizedBox(height: 6),
          Text(label, style: zcText(ZcSize.caption, color: AppColors.navInactive)),
        ],
      ),
    );
  }
}
