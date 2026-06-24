import 'package:flutter/material.dart';

import '../../../../core/constants/colors.dart';

class ScanOverlay extends StatefulWidget {
  final bool isScanning;
  final bool isProcessing;
  final Color? frameColor;

  const ScanOverlay({
    super.key,
    this.isScanning = true,
    this.isProcessing = false,
    this.frameColor,
  });

  @override
  State<ScanOverlay> createState() => _ScanOverlayState();
}

class _ScanOverlayState extends State<ScanOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _scanLineController;
  late Animation<double> _scanLineAnimation;
  late Animation<double> _pulseAnimation;
  late Animation<double> _cornerAnimation;

  @override
  void initState() {
    super.initState();
    _scanLineController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );

    _scanLineAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _scanLineController,
        curve: Curves.easeInOut,
      ),
    );

    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(
        parent: _scanLineController,
        curve: Curves.easeInOut,
      ),
    );

    _cornerAnimation = Tween<double>(begin: 0.9, end: 1.05).animate(
      CurvedAnimation(
        parent: _scanLineController,
        curve: const Interval(0.0, 0.5, curve: Curves.easeInOut),
      ),
    );

    if (widget.isScanning && !widget.isProcessing) {
      _scanLineController.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(ScanOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isProcessing) {
      _scanLineController.stop();
    } else if (widget.isScanning) {
      _scanLineController.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _scanLineController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final frameSize = size.width * 0.72;
    final frameColor = widget.frameColor ?? AppColors.scannerFrame;

    return Stack(
      children: [
        // Dark overlay with cutout
        CustomPaint(
          size: Size(size.width, size.height),
          painter: _OverlayPainter(
            frameSize: frameSize,
            frameColor: frameColor,
          ),
        ),

        // Animated corners
        Center(
          child: AnimatedBuilder(
            animation: _cornerAnimation,
            builder: (_, __) => Transform.scale(
              scale: widget.isProcessing ? 1.0 : _cornerAnimation.value,
              child: SizedBox(
                width: frameSize,
                height: frameSize,
                child: _ScanFrame(
                  color: frameColor,
                  cornerLength: 32,
                  thickness: 4,
                ),
              ),
            ),
          ),
        ),

        // Scanning line
        if (widget.isScanning && !widget.isProcessing)
          Center(
            child: SizedBox(
              width: frameSize - 4,
              height: frameSize - 4,
              child: ClipRect(
                child: AnimatedBuilder(
                  animation: _scanLineAnimation,
                  builder: (_, __) {
                    return CustomPaint(
                      painter: _ScanLinePainter(
                        progress: _scanLineAnimation.value,
                        color: frameColor,
                      ),
                    );
                  },
                ),
              ),
            ),
          ),

        // Processing indicator
        if (widget.isProcessing)
          Center(
            child: SizedBox(
              width: frameSize,
              height: frameSize,
              child: Center(
                child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.7),
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: const Padding(
                    padding: EdgeInsets.all(14),
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(AppColors.primary),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _OverlayPainter extends CustomPainter {
  final double frameSize;
  final Color frameColor;

  _OverlayPainter({required this.frameSize, required this.frameColor});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black.withOpacity(0.65);

    final frameLeft = (size.width - frameSize) / 2;
    final frameTop = (size.height - frameSize) / 2;
    final frameRect = Rect.fromLTWH(frameLeft, frameTop, frameSize, frameSize);
    final frameRRect = RRect.fromRectAndRadius(
      frameRect,
      const Radius.circular(16),
    );

    // Full screen
    final fullPath = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height));

    // Cut out the frame
    final cutPath = Path()..addRRect(frameRRect);

    final combined =
        Path.combine(PathOperation.difference, fullPath, cutPath);
    canvas.drawPath(combined, paint);
  }

  @override
  bool shouldRepaint(_OverlayPainter oldDelegate) =>
      oldDelegate.frameSize != frameSize;
}

class _ScanLinePainter extends CustomPainter {
  final double progress;
  final Color color;

  _ScanLinePainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * progress;

    final gradient = LinearGradient(
      begin: Alignment.centerLeft,
      end: Alignment.centerRight,
      colors: [
        Colors.transparent,
        color.withOpacity(0.4),
        color.withOpacity(0.8),
        color,
        color.withOpacity(0.8),
        color.withOpacity(0.4),
        Colors.transparent,
      ],
    );

    final paint = Paint()
      ..shader = gradient.createShader(
        Rect.fromLTWH(0, y - 1, size.width, 3),
      )
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);

    // Glow effect
    final glowPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          color.withOpacity(0.0),
          color.withOpacity(0.15),
          color.withOpacity(0.0),
        ],
      ).createShader(
        Rect.fromLTWH(0, y - 20, size.width, 40),
      )
      ..style = PaintingStyle.fill;

    canvas.drawRect(
      Rect.fromLTWH(0, y - 20, size.width, 40),
      glowPaint,
    );
  }

  @override
  bool shouldRepaint(_ScanLinePainter oldDelegate) =>
      oldDelegate.progress != progress;
}

class _ScanFrame extends StatelessWidget {
  final Color color;
  final double cornerLength;
  final double thickness;

  const _ScanFrame({
    required this.color,
    required this.cornerLength,
    required this.thickness,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _ScanFramePainter(
        color: color,
        cornerLength: cornerLength,
        thickness: thickness,
      ),
    );
  }
}

class _ScanFramePainter extends CustomPainter {
  final Color color;
  final double cornerLength;
  final double thickness;

  _ScanFramePainter({
    required this.color,
    required this.cornerLength,
    required this.thickness,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = thickness
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // Shadow effect
    final shadowPaint = Paint()
      ..color = color.withOpacity(0.3)
      ..strokeWidth = thickness + 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    final corners = [
      // Top-left
      [
        Offset(0, cornerLength),
        Offset.zero,
        Offset(cornerLength, 0),
      ],
      // Top-right
      [
        Offset(size.width - cornerLength, 0),
        Offset(size.width, 0),
        Offset(size.width, cornerLength),
      ],
      // Bottom-right
      [
        Offset(size.width, size.height - cornerLength),
        Offset(size.width, size.height),
        Offset(size.width - cornerLength, size.height),
      ],
      // Bottom-left
      [
        Offset(cornerLength, size.height),
        Offset(0, size.height),
        Offset(0, size.height - cornerLength),
      ],
    ];

    for (final corner in corners) {
      final path = Path()
        ..moveTo(corner[0].dx, corner[0].dy)
        ..lineTo(corner[1].dx, corner[1].dy)
        ..lineTo(corner[2].dx, corner[2].dy);

      canvas.drawPath(path, shadowPaint);
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_ScanFramePainter oldDelegate) =>
      oldDelegate.color != color;
}
