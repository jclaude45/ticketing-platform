import 'package:flutter/material.dart';

import '../../../../shared/widgets/zc_widgets.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/constants/colors.dart';

class QrScannerWidget extends StatefulWidget {
  final Function(String code) onDetected;
  final bool isActive;

  /// Camera to open on (the screen remembers the side across camera off / on)
  final bool front;

  /// The front camera can't be opened (many terminals have none): the screen goes back
  /// to the rear camera
  final VoidCallback? onFrontUnavailable;

  const QrScannerWidget({
    super.key,
    required this.onDetected,
    this.isActive = true,
    this.front = false,
    this.onFrontUnavailable,
  });

  @override
  State<QrScannerWidget> createState() => QrScannerWidgetState();
}

class QrScannerWidgetState extends State<QrScannerWidget> {
  late MobileScannerController controller;
  bool _isTorchOn = false;

  @override
  void initState() {
    super.initState();
    controller = MobileScannerController(
      facing: widget.front ? CameraFacing.front : CameraFacing.back,
      torchEnabled: false,
      detectionSpeed: DetectionSpeed.noDuplicates,
      returnImage: false,
    );
  }

  @override
  void didUpdateWidget(QrScannerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.isActive && oldWidget.isActive) {
      _run(controller.stop);
    } else if (widget.isActive && !oldWidget.isActive) {
      _run(controller.start);
    }
  }

  /// Camera commands one after the other: a start, stop or switch sent while the
  /// previous one runs used to fail ("Called start() while already started") and leave
  /// the camera in error.
  Future<void> _pending = Future.value();

  Future<bool> _run(Future<Object?> Function() command) {
    final done = _pending.then((_) async {
      if (!mounted) return false;
      try {
        await command();
        return true;
      } catch (e) {
        debugPrint('Camera command failed: $e');
        return false;
      }
    });
    _pending = done;
    return done;
  }

  bool _reportedFront = false;

  void _frontUnavailable() {
    if (_reportedFront) return;
    _reportedFront = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.onFrontUnavailable?.call());
  }

  Future<void> toggleTorch() async {
    await _run(controller.toggleTorch);
    setState(() => _isTorchOn = !_isTorchOn);
  }

  bool get isTorchOn => _isTorchOn;

  /// Back <-> front camera (e.g. a phone fixed on a stand facing the guests). Front
  /// cameras have no flash, so the torch goes off.
  Future<void> switchCamera() async {
    final ok = await _run(controller.switchCamera);
    // Switching to a front camera that isn't there
    if (!ok && controller.cameraFacingState.value == CameraFacing.front) _frontUnavailable();
    if (_isTorchOn) setState(() => _isTorchOn = false);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MobileScanner(
      controller: controller,
      onDetect: (capture) {
        if (!widget.isActive) return;
        final barcodes = capture.barcodes;
        if (barcodes.isEmpty) return;

        final barcode = barcodes.first;
        final value = barcode.rawValue;
        if (value != null && value.isNotEmpty) {
          widget.onDetected(value);
        }
      },
      errorBuilder: (context, error, child) {
        if (widget.front) _frontUnavailable();
        return _buildError(error);
      },
    );
  }

  Widget _buildError(MobileScannerException error) {
    String message;
    IconData icon;

    switch (error.errorCode) {
      case MobileScannerErrorCode.permissionDenied:
        message = 'Accès à la caméra refusé.\nActivez-le dans les Réglages du téléphone.';
        icon = Icons.camera_alt_outlined;
        break;
      case MobileScannerErrorCode.unsupported:
        message = 'Caméra non supportée sur cet appareil.';
        icon = Icons.no_photography_outlined;
        break;
      default:
        message = 'Erreur caméra: ${error.errorDetails?.message ?? "Erreur inconnue"}';
        icon = Icons.error_outline;
    }

    return Container(
      color: AppColors.backgroundDark,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 60, color: AppColors.textMuted),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: ZcSize.body,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
