import 'package:flutter/material.dart';

/// Look of the ZAYA app: the zaya.live charter (Inter, the « Z », dark ink) with orange as the
/// main colour on a warm cream page, following the phone's light or dark mode.
const zFont = 'Inter';

class ZSize {
  ZSize._();

  /// Title of a main page (« On sort où ? », « Mes billets »)
  static const double display = 28;

  /// Name of an event on its page, totals
  static const double h1 = 24;

  /// Section titles (« À la une », « Ton expérience »)
  static const double h2 = 20;

  /// Title bar of a sub-page, card titles
  static const double h3 = 17;

  /// Buttons, fields
  static const double title = 15;

  /// Body text, list rows
  static const double body = 14;

  /// Secondary text, labels
  static const double small = 12;

  /// Pills, overlines
  static const double caption = 11;
}

class ZWeight {
  ZWeight._();
  static const regular = FontWeight.w400;
  static const medium = FontWeight.w500;
  static const semibold = FontWeight.w600;
  static const bold = FontWeight.w700;

  /// Inter is bundled up to Bold: heavier asks fall back to it
  static const black = FontWeight.w700;
}

/// Colours of the current mode ([isDark] is kept in step with the phone by the app shell)
class ZColors {
  ZColors._();

  static bool isDark = false;
  static Color _m(int dark, int light) => Color(isDark ? dark : light);

  /// Main colour: buttons, selected tab, prices to act on
  static const Color orange = Color(0xFFFF8700);

  /// Text and icons on orange
  static const Color onOrange = Color(0xFF2A231E);
  static const Color green = Color(0xFF1E9E5A);
  static const Color red = Color(0xFFE0362C);

  static Color get page => _m(0xFF15110E, 0xFFFFFAF5);
  static Color get card => _m(0xFF221C18, 0xFFFFFFFF);

  /// Quiet fills: unselected chips, secondary buttons, the search field
  static Color get surface => _m(0xFF2C2520, 0xFFF4EFEA);

  /// Pale orange: selected cards, totals, notices
  static Color get orangeSoft => _m(0xFF3A2614, 0xFFFFF2E8);

  /// Orange as text (dates, overlines): darker than the buttons to stay readable
  static Color get orangeText => _m(0xFFFFA54A, 0xFFB45309);
  static Color get ink => _m(0xFFF7F1EB, 0xFF2A231E);
  static Color get onInk => _m(0xFF2A231E, 0xFFFFFFFF);
  static Color get text => _m(0xFFF7F1EB, 0xFF2A231E);
  static Color get muted => _m(0xFFA99F97, 0xFF8A817A);
  static Color get line => _m(0xFF3A322C, 0xFFEAE2DA);
  static Color get track => _m(0xFF3A322C, 0xFFEFE8E1);

  /// The ticket's dark header (« ZAYA / BILLET NOMINATIF »)
  static const Color ticketHead = Color(0xFF2A231E);
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
  // Inter is drawn a little wide: titles are tightened as on zaya.live
  letterSpacing: size >= ZSize.h2 ? -0.4 : 0,
);

ThemeData zTheme() {
  final dark = ZColors.isDark;
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(14),
    borderSide: BorderSide(color: c, width: w),
  );
  return ThemeData(
    useMaterial3: true,
    fontFamily: zFont,
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: ZColors.page,
    splashFactory: InkSparkle.constantTurbulenceSeedSplashFactory,
    colorScheme: ColorScheme(
      brightness: dark ? Brightness.dark : Brightness.light,
      primary: ZColors.orange,
      onPrimary: ZColors.onOrange,
      secondary: ZColors.ink,
      onSecondary: ZColors.onInk,
      surface: ZColors.page,
      onSurface: ZColors.text,
      error: ZColors.red,
      onError: Colors.white,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: ZColors.page,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      iconTheme: IconThemeData(color: ZColors.ink),
      titleTextStyle: zText(ZSize.h2, weight: ZWeight.bold),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ZColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
      hintStyle: zText(ZSize.title, color: ZColors.muted),
      border: border(ZColors.line),
      enabledBorder: border(ZColors.line),
      focusedBorder: border(ZColors.orange, 1.6),
      errorBorder: border(ZColors.red),
      focusedErrorBorder: border(ZColors.red, 1.6),
    ),
    dividerTheme: DividerThemeData(color: ZColors.line, thickness: 1, space: 1),
    dialogTheme: DialogThemeData(
      backgroundColor: ZColors.page,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: zText(ZSize.h3, weight: ZWeight.bold),
      contentTextStyle: zText(ZSize.body, color: ZColors.muted, height: 1.45),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: ZColors.orangeText),
    ),
    listTileTheme: ListTileThemeData(
      titleTextStyle: zText(ZSize.body, weight: ZWeight.semibold),
      subtitleTextStyle: zText(ZSize.small, color: ZColors.muted),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: ZColors.page,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: ZColors.orange,
    ),
    switchTheme: SwitchThemeData(
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? ZColors.orange : ZColors.track,
      ),
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: ZColors.ink,
      contentTextStyle: zText(ZSize.body, color: ZColors.onInk),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}
