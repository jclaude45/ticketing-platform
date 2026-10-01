import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/constants/colors.dart';

class AppTheme {
  AppTheme._();

  /// Theme of the current mode ([AppColors.isDark]): ZControle charter, light or dark.
  static ThemeData get current {
    return ThemeData(
      useMaterial3: true,
      brightness: AppColors.isDark ? Brightness.dark : Brightness.light,
      scaffoldBackgroundColor: AppColors.backgroundDark,
      colorScheme: ColorScheme(
        brightness: AppColors.isDark ? Brightness.dark : Brightness.light,
        primary: AppColors.primary,
        secondary: AppColors.accent,
        surface: AppColors.backgroundCard,
        error: AppColors.usedRed,
        onPrimary: AppColors.isDark ? AppColors.onBrand : Colors.white,
        onSecondary: Colors.white,
        onSurface: AppColors.textPrimary,
        onError: Colors.white,
      ),

      // App bar
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.backgroundDark,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: AppColors.textPrimary),
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
      ),

      // Text
      textTheme: GoogleFonts.poppinsTextTheme(
        TextTheme(
          headlineLarge: TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w800,
          ),
          headlineMedium: TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
          titleLarge: TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
          titleMedium: TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w600,
          ),
          bodyLarge: TextStyle(color: AppColors.textPrimary),
          bodyMedium: TextStyle(color: AppColors.textSecondary),
          bodySmall: TextStyle(color: AppColors.textMuted),
        ),
      ),

      // Input
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.backgroundSurface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.borderDefault),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.borderDefault),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.borderFocus, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.borderError),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.borderError, width: 1.5),
        ),
        hintStyle: TextStyle(
          color: AppColors.textDisabled,
          fontSize: 14,
        ),
        labelStyle: TextStyle(color: AppColors.textMuted),
        floatingLabelStyle: TextStyle(color: AppColors.primary),
        errorStyle: const TextStyle(color: AppColors.usedRed, fontSize: 12),
      ),

      // Elevated button
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.onBrand,
          elevation: 0,
          padding:
              const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Card
      cardTheme: CardThemeData(
        color: AppColors.backgroundCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: AppColors.borderDefault),
        ),
      ),

      // Divider
      dividerTheme: DividerThemeData(
        color: AppColors.borderDefault,
        thickness: 1,
      ),

      // Progress indicator
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: AppColors.primary,
      ),

      // Bottom nav
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.backgroundCard,
        indicatorColor: AppColors.primary.withOpacity(0.15),
        labelTextStyle: WidgetStateProperty.all(
          GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600),
        ),
      ),

      // Snackbar
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.backgroundSurface,
        contentTextStyle: GoogleFonts.poppins(
          color: AppColors.textPrimary,
          fontSize: 14,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
