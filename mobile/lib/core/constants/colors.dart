import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // Brand Colors
  static const Color primary = Color(0xFF6C63FF);
  static const Color primaryDark = Color(0xFF5A52D5);
  static const Color primaryLight = Color(0xFF8B84FF);
  static const Color accent = Color(0xFF00D4AA);

  // Backgrounds
  static const Color backgroundDark = Color(0xFF0A0A0F);
  static const Color backgroundCard = Color(0xFF12121A);
  static const Color backgroundSurface = Color(0xFF1A1A26);
  static const Color backgroundElevated = Color(0xFF22223A);

  // Validation Colors
  static const Color validGreen = Color(0xFF00C853);
  static const Color validGreenDark = Color(0xFF00A040);
  static const Color validGreenLight = Color(0xFF69F0AE);
  static const Color validBackground = Color(0xFF001A0A);

  static const Color usedRed = Color(0xFFFF1744);
  static const Color usedRedDark = Color(0xFFD50000);
  static const Color usedRedLight = Color(0xFFFF8A80);
  static const Color usedBackground = Color(0xFF1A0005);

  static const Color fraudOrange = Color(0xFFFF6D00);
  static const Color fraudOrangeDark = Color(0xFFE65100);
  static const Color fraudOrangeLight = Color(0xFFFFAB40);
  static const Color fraudBackground = Color(0xFF1A0800);

  // Text Colors
  static const Color textPrimary = Color(0xFFFAFAFA);
  static const Color textSecondary = Color(0xFFB0B0C8);
  static const Color textMuted = Color(0xFF6B6B8A);
  static const Color textDisabled = Color(0xFF3D3D5C);

  // Border Colors
  static const Color borderDefault = Color(0xFF2A2A3E);
  static const Color borderFocus = Color(0xFF6C63FF);
  static const Color borderError = Color(0xFFFF1744);

  // Status Colors
  static const Color statusOnline = Color(0xFF00C853);
  static const Color statusOffline = Color(0xFFFF6D00);
  static const Color statusSyncing = Color(0xFF6C63FF);

  // Scanner UI
  static const Color scannerOverlay = Color(0x99000000);
  static const Color scannerFrame = Color(0xFF6C63FF);
  static const Color scannerFrameValid = Color(0xFF00C853);
  static const Color scannerFrameError = Color(0xFFFF1744);
  static const Color scannerCorner = Color(0xFFFFFFFF);

  // Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, primaryDark],
  );

  static const LinearGradient validGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [validBackground, Color(0xFF003319)],
  );

  static const LinearGradient usedGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [usedBackground, Color(0xFF33000D)],
  );

  static const LinearGradient fraudGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [fraudBackground, Color(0xFF331500)],
  );

  static const LinearGradient darkGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [backgroundDark, backgroundCard],
  );
}
