import 'package:flutter/material.dart';

/// ZControle colours. Brand: the logo's yellow and white. Neutral colours (backgrounds,
/// text, borders) follow the phone's light / dark mode through [isDark], set by the app
/// shell; brand and status colours are the same in both.
class AppColors {
  AppColors._();

  /// Current mode, kept in step with the phone by the app shell
  static bool isDark = true;
  static Color _m(int dark, int light) => Color(isDark ? dark : light);

  // Brand (logo)
  static const Color brand = Color(0xFFFFBB00);
  static const Color brandDeep = Color(0xFFF2A900);
  static const Color brandWhite = Color(0xFFFEFFFF);

  /// Text / icons on a yellow background
  static const Color onBrand = Color(0xFF14110A);
  static const List<Color> brandGradientColors = [brand, brandDeep];

  // Brand as text / icon / outline colour: yellow on dark, deep amber on light (yellow
  // on white is unreadable)
  static Color get primary => _m(0xFFFFBB00, 0xFF9A6700);
  static Color get primaryDark => _m(0xFFE0A200, 0xFF7A5200);
  static Color get primaryLight => _m(0xFFFFD15C, 0xFFC78A00);
  static const Color accent = Color(0xFF00BFA0);

  // Backgrounds
  static Color get backgroundDark => _m(0xFF0B0B0F, 0xFFF7F7F5); // page background
  static Color get backgroundCard => _m(0xFF15151C, 0xFFFFFFFF);
  static Color get backgroundSurface => _m(0xFF1D1D26, 0xFFF0F0EC);
  static Color get backgroundElevated => _m(0xFF262632, 0xFFE8E8E2);

  // Validation Colors
  static const Color validGreen = Color(0xFF00C853);
  static const Color validGreenDark = Color(0xFF00A040);
  static const Color validGreenLight = Color(0xFF69F0AE);
  static Color get validBackground => _m(0xFF001A0A, 0xFFE8F8EE);

  static const Color usedRed = Color(0xFFFF1744);
  static const Color usedRedDark = Color(0xFFD50000);
  static const Color usedRedLight = Color(0xFFFF8A80);
  static Color get usedBackground => _m(0xFF1A0005, 0xFFFDEBEE);

  static const Color fraudOrange = Color(0xFFFF6D00);
  static const Color fraudOrangeDark = Color(0xFFE65100);
  static const Color fraudOrangeLight = Color(0xFFFFAB40);
  static Color get fraudBackground => _m(0xFF1A0800, 0xFFFFF1E5);

  // Text Colors
  static Color get textPrimary => _m(0xFFFAFAFA, 0xFF14110A);
  static Color get textSecondary => _m(0xFFB4B4C2, 0xFF4A4A55);
  static Color get textMuted => _m(0xFF74748A, 0xFF7A7A86);
  static Color get textDisabled => _m(0xFF3F3F50, 0xFFBDBDC6);

  // Border Colors
  static Color get borderDefault => _m(0xFF2A2A36, 0xFFE3E3DE);
  static Color get borderFocus => primary;
  static const Color borderError = Color(0xFFFF1744);

  // Status Colors
  static const Color statusOnline = Color(0xFF00C853);
  static const Color statusOffline = Color(0xFFFF6D00);
  static Color get statusSyncing => primary;

  // Scanner UI (always over the camera picture)
  static const Color scannerOverlay = Color(0x99000000);
  static const Color scannerFrame = brand;
  static const Color scannerFrameValid = Color(0xFF00C853);
  static const Color scannerFrameError = Color(0xFFFF1744);
  static const Color scannerCorner = Color(0xFFFFFFFF);

  // Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: brandGradientColors,
  );

  static LinearGradient get validGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [validBackground, _m(0xFF003319, 0xFFD3F2DF)],
      );

  static LinearGradient get usedGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [usedBackground, _m(0xFF33000D, 0xFFFAD5DB)],
      );

  static LinearGradient get fraudGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [fraudBackground, _m(0xFF331500, 0xFFFFE0C7)],
      );

  static LinearGradient get darkGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [backgroundDark, backgroundCard],
      );
}
