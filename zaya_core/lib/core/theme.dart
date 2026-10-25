import 'package:flutter/material.dart';

/// ZAYA Core look: the ZAYA charter (black ink, white page, logo yellow as the accent),
/// following the phone's light or dark mode. Same typeface and type scale as zcontrole.
const zFont = 'Satoshi';

class ZSize {
  ZSize._();
  static const double display = 32;
  static const double h1 = 26;
  static const double h2 = 22;
  static const double h3 = 18;
  static const double title = 16;
  static const double body = 14;
  static const double small = 12;
  static const double caption = 11;
}

class ZWeight {
  ZWeight._();
  static const regular = FontWeight.w400;
  static const medium = FontWeight.w500;
  static const bold = FontWeight.w700;
  static const black = FontWeight.w900;
}

/// Colours of the current mode ([isDark] is kept in step with the phone by the app shell)
class ZColors {
  ZColors._();

  static bool isDark = false;
  static Color _m(int dark, int light) => Color(isDark ? dark : light);

  static const Color yellow = Color(0xFFFFBB00);
  static const Color onYellow = Color(0xFF111111);
  static const Color green = Color(0xFF00A651);
  static const Color red = Color(0xFFE5243B);
  static const Color orange = Color(0xFFF07C00);

  static Color get page => _m(0xFF0E0E11, 0xFFFFFFFF);
  static Color get surface => _m(0xFF18181D, 0xFFF5F5F3);
  static Color get card => _m(0xFF1E1E24, 0xFFFFFFFF);
  static Color get ink => _m(0xFFF4F4F4, 0xFF111111);
  static Color get onInk => _m(0xFF111111, 0xFFFFFFFF);
  static Color get text => _m(0xFFF4F4F4, 0xFF111111);
  static Color get muted => _m(0xFF9C9CA8, 0xFF6B6B74);
  static Color get line => _m(0xFF2C2C34, 0xFFE6E6E1);
  static Color get track => _m(0xFF2C2C34, 0xFFEDEDE8);
}

TextStyle zText(
  double size, {
  FontWeight weight = ZWeight.regular,
  Color? color,
  double? height,
}) => TextStyle(
  fontFamily: zFont,
  fontSize: size,
  fontWeight: weight,
  color: color ?? ZColors.text,
  height: height,
);

ThemeData zTheme() {
  final dark = ZColors.isDark;
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(10),
    borderSide: BorderSide(color: c, width: w),
  );
  return ThemeData(
    useMaterial3: true,
    fontFamily: zFont,
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: ZColors.page,
    colorScheme: ColorScheme(
      brightness: dark ? Brightness.dark : Brightness.light,
      primary: ZColors.ink,
      onPrimary: ZColors.onInk,
      secondary: ZColors.yellow,
      onSecondary: ZColors.onYellow,
      surface: ZColors.page,
      onSurface: ZColors.text,
      error: ZColors.red,
      onError: Colors.white,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: ZColors.page,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      iconTheme: IconThemeData(color: ZColors.ink),
      titleTextStyle: zText(ZSize.h3, weight: ZWeight.bold),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: false,
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
      hintStyle: zText(ZSize.body, color: ZColors.muted),
      border: border(ZColors.line),
      enabledBorder: border(ZColors.line),
      focusedBorder: border(ZColors.ink, 1.6),
      errorBorder: border(ZColors.red),
      focusedErrorBorder: border(ZColors.red, 1.6),
    ),
    dividerTheme: DividerThemeData(color: ZColors.line, thickness: 1, space: 1),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: ZColors.ink),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: ZColors.page,
      surfaceTintColor: Colors.transparent,
      indicatorColor: ZColors.yellow,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          color: s.contains(WidgetState.selected)
              ? ZColors.onYellow
              : ZColors.muted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.all(
        zText(ZSize.small, weight: ZWeight.medium),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: ZColors.ink,
      contentTextStyle: zText(ZSize.body, color: ZColors.onInk),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );
}
