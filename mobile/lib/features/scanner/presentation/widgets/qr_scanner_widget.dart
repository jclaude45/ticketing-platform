import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/constants/colors.dart';

class QrScannerWidget extends StatefulWidget {
  final Function(String code) onDetected;
  final bool isActive;

  const QrScannerWidget({
    super.key,
    required this.onDetected,
    this.isActive = true,
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
      facing: CameraFacing.back,
      torchEnabled: false,
      detectionSpeed: DetectionSpeed.noDuplicates,
      returnImage: false,
    );
  }

  @override
  void didUpdateWidget(QrScannerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.isActive && oldWidget.isActive) {
      controller.stop();
    } else if (widget.isActive && !oldWidget.isActive) {
      controller.start();
    }
  }

  Future<void> toggleTorch() async {
    await controller.toggleTorch();
    setState(() => _isTorchOn = !_isTorchOn);
  }

  bool get isTorchOn => _isTorchOn;

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
        return _buildError(error);
      },
    );
  }

  Widget _buildError(MobileScannerException error) {
    String message;
    IconData icon;

    switch (error.errorCode) {
      case MobileScannerErrorCode.permissionDenied:
        message = 'Camera permission denied.\nGo to Settings to enable it.';
        icon = Icons.camera_alt_outlined;
        break;
      case MobileScannerErrorCode.unsupported:
        message = 'Camera not supported on this device.';
        icon = Icons.no_photography_outlined;
        break;
      default:
        message = 'Camera error: ${error.errorDetails?.message ?? "Unknown error"}';
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
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 16,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
