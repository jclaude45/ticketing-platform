import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/constants/colors.dart';

/// Building blocks of the zcontrole screens (mockups drawn on a 428 × 926 phone).

/// zcontrole's typeface, bundled in assets/fonts (no download, works offline)
const zcFont = 'Satoshi';

/// Type scale of the mockups: one size per role, nothing in between.
class ZcSize {
  ZcSize._();

  /// Form screen titles ("Bienvenue", "Sélectionner un événement")
  static const double display = 36;

  /// Screen headlines ("Prêt à scanner", result titles, tab titles)
  static const double h1 = 28;

  /// Brand name ("zcontrole"), large initials
  static const double h2 = 24;

  /// Dialog / sheet titles, main buttons, a person's name in a card
  static const double h3 = 18;

  /// Event card, bars over the camera
  static const double title = 16;

  /// Body text, fields, list rows
  static const double body = 14;

  /// Secondary text, labels, details
  static const double small = 12;

  /// Navigation labels, timestamps under a name
  static const double caption = 11;

  // Line heights: 1.2 for titles, 1.5 for paragraphs (1.75 kept for the intro texts of the mockups)
}

TextStyle zcText(double size, {FontWeight weight = FontWeight.w400, Color? color, double? height}) =>
    TextStyle(fontFamily: zcFont, fontSize: size, fontWeight: weight, color: color ?? AppColors.ink, height: height);

/// Black page with the tribal pattern on top and a rounded sheet over it (intro, login,
/// event choice). [sheetTop] is the share of the screen height above the sheet; the sheet
/// rises when the keyboard opens so the fields stay visible.
class ZcPatternScaffold extends StatelessWidget {
  final double sheetTop;
  final Widget child;

  const ZcPatternScaffold({super.key, required this.sheetTop, required this.child});

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final keyboard = media.viewInsets.bottom > 0;
    final top = keyboard ? media.padding.top + 24 : media.size.height * sheetTop;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: media.size.height * sheetTop + 48,
              child: Image.asset('assets/images/pattern.png', fit: BoxFit.cover, alignment: Alignment.topCenter),
            ),
            AnimatedPositioned(
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutCubic,
              top: top,
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.page,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(34)),
                  boxShadow: const [BoxShadow(color: Color(0x29000000), blurRadius: 6, offset: Offset(0, -3))],
                ),
                child: SafeArea(top: false, child: child),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Lets a column with [Spacer]s scroll when it does not fit (small phone, keyboard).
class ZcFillScroll extends StatelessWidget {
  final EdgeInsets padding;
  final List<Widget> children;
  final CrossAxisAlignment crossAxisAlignment;

  const ZcFillScroll({
    super.key,
    this.padding = const EdgeInsets.symmetric(horizontal: 42),
    required this.children,
    this.crossAxisAlignment = CrossAxisAlignment.stretch,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: padding,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: IntrinsicHeight(
            child: Column(crossAxisAlignment: crossAxisAlignment, children: children),
          ),
        ),
      ),
    );
  }
}

class ZcBackButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const ZcBackButton({super.key, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: IconButton(
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.compact,
        tooltip: 'Retour',
        icon: Icon(Icons.arrow_back_ios_new_rounded, size: 26, color: AppColors.ink),
        onPressed: onPressed ?? () => Navigator.maybePop(context),
      ),
    );
  }
}

/// Full-width dark button of the mockups ("Suivant", "Connexion", "Commencer").
class ZcButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  const ZcButton({super.key, required this.label, this.onPressed, this.loading = false});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 58,
      width: double.infinity,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.ink,
          foregroundColor: AppColors.onInk,
          disabledBackgroundColor: AppColors.ink.withValues(alpha: 0.35),
          disabledForegroundColor: AppColors.onInk,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        onPressed: loading ? null : onPressed,
        child: loading
            ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.onInk))
            : Text(label, style: zcText(ZcSize.h3, weight: FontWeight.w500, color: AppColors.onInk)),
      ),
    );
  }
}

InputDecoration zcInputDecoration(String hint, {Widget? suffixIcon}) {
  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(9.5),
        borderSide: BorderSide(color: color, width: width),
      );
  return InputDecoration(
    hintText: hint,
    hintStyle: zcText(ZcSize.body, color: AppColors.hint),
    filled: false,
    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 19),
    suffixIcon: suffixIcon,
    border: border(AppColors.ink),
    enabledBorder: border(AppColors.ink),
    focusedBorder: border(AppColors.ink, 1.6),
    disabledBorder: border(AppColors.ink.withValues(alpha: 0.4)),
    errorBorder: border(AppColors.usedRed),
    focusedErrorBorder: border(AppColors.usedRed, 1.6),
    errorStyle: zcText(ZcSize.small, color: AppColors.usedRed),
  );
}

/// Outlined text field of the mockups (placeholder only, no floating label).
class ZcTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final bool enabled;
  final Widget? suffixIcon;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;

  const ZcTextField({
    super.key,
    required this.controller,
    required this.hint,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.enabled = true,
    this.suffixIcon,
    this.validator,
    this.onSubmitted,
    this.onChanged,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      obscureText: obscureText,
      enabled: enabled,
      validator: validator,
      onFieldSubmitted: onSubmitted,
      onChanged: onChanged,
      textCapitalization: textCapitalization,
      autofillHints: autofillHints,
      cursorColor: AppColors.ink,
      style: zcText(ZcSize.body),
      decoration: zcInputDecoration(hint, suffixIcon: suffixIcon),
    );
  }
}

/// Outlined drop-down of the mockups ("Événement", "Nombre d'inviter").
class ZcDropdown<T> extends StatelessWidget {
  final String hint;
  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?>? onChanged;
  final Color? chevronColor;

  const ZcDropdown({
    super.key,
    required this.hint,
    required this.value,
    required this.items,
    required this.onChanged,
    this.chevronColor,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      // The field keeps its own value: rebuilt when the parent picks another one
      key: ValueKey(value),
      initialValue: value,
      items: items,
      onChanged: onChanged,
      isExpanded: true,
      dropdownColor: AppColors.page,
      borderRadius: BorderRadius.circular(9.5),
      style: zcText(ZcSize.body),
      icon: Icon(Icons.keyboard_arrow_down_rounded, size: 28, color: chevronColor ?? AppColors.hint),
      decoration: zcInputDecoration(hint).copyWith(contentPadding: const EdgeInsets.fromLTRB(20, 17, 14, 17)),
      hint: Text(hint, style: zcText(ZcSize.body, color: AppColors.hint)),
    );
  }
}

/// Black line drawing from the mockups, drawn in the ink colour (white in dark mode).
class ZcIllustration extends StatelessWidget {
  final String name;
  final double height;

  const ZcIllustration(this.name, {super.key, required this.height});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/$name.png',
      height: height,
      color: AppColors.ink,
      colorBlendMode: BlendMode.srcIn,
      filterQuality: FilterQuality.medium,
    );
  }
}

/// Yellow card at the top of the Scanner and Guest tabs: event name and entries.
class ZcEventCard extends StatelessWidget {
  final String name;
  final int checkedIn;
  final int? total;

  const ZcEventCard({super.key, required this.name, required this.checkedIn, this.total});

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF111111); // always dark on yellow
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 11),
      padding: const EdgeInsets.fromLTRB(30, 14, 20, 14),
      constraints: const BoxConstraints(minHeight: 80),
      decoration: BoxDecoration(
        color: AppColors.eventCard,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [BoxShadow(color: Color(0x29000000), blurRadius: 6, offset: Offset(0, 3))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontFamily: zcFont, fontSize: ZcSize.title, color: ink),
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(children: [
              TextSpan(
                text: total == null ? '$checkedIn' : '$checkedIn/$total',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const TextSpan(text: ' vérifié'),
            ]),
            style: const TextStyle(fontFamily: zcFont, fontSize: ZcSize.title, color: ink),
          ),
        ],
      ),
    );
  }
}
