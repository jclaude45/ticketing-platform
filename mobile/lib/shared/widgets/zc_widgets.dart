import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lottie/lottie.dart';

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

  /// Secondary text, labels, details, bottom bar labels
  static const double small = 12;

  /// Timestamps under a name, status pills
  static const double caption = 11;

  // Line heights: 1.2 for titles, 1.5 for paragraphs (1.75 kept for the intro texts of the mockups)
}

/// Three weights, one job each (Satoshi has no semibold):
/// - bold: titles, people's names, key figures, the active choice;
/// - medium: buttons, links, values, labels;
/// - regular: body and secondary text.
class ZcWeight {
  ZcWeight._();

  static const regular = FontWeight.w400;
  static const medium = FontWeight.w500;
  static const bold = FontWeight.w700;
}

TextStyle zcText(double size, {FontWeight weight = ZcWeight.regular, Color? color, double? height}) =>
    TextStyle(fontFamily: zcFont, fontSize: size, fontWeight: weight, color: color ?? AppColors.ink, height: height);

/// Animated event drawings (Lottie, assets/animations) behind a rounded sheet (intro,
/// welcome, login, event choice). [sheetTop] is the share of the screen height above the
/// sheet; the sheet rises when the keyboard opens so the fields stay visible.
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
      value: (AppColors.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.page,
        body: Stack(
          children: [
            const Positioned.fill(child: ZcAnimatedBackdrop()),
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
                  // The backdrop is white too: a softer, wider shadow marks the sheet's edge
                  boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 24, offset: Offset(0, -4))],
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

/// The looping event drawings (white background, black lines). Inverted in dark mode.
/// One clock for the whole app: moving from one screen to the next, the drawings carry on
/// where they were instead of jumping back to the start.
class ZcAnimatedBackdrop extends StatefulWidget {
  const ZcAnimatedBackdrop({super.key});

  static final _origin = DateTime.now();

  @override
  State<ZcAnimatedBackdrop> createState() => _ZcAnimatedBackdropState();
}

class _ZcAnimatedBackdropState extends State<ZcAnimatedBackdrop> with SingleTickerProviderStateMixin {
  static const _invert = ColorFilter.matrix(<double>[
    -1, 0, 0, 0, 255, //
    0, -1, 0, 0, 255, //
    0, 0, -1, 0, 255, //
    0, 0, 0, 1, 0, //
  ]);

  late final AnimationController _controller = AnimationController(vsync: this);

  void _start(LottieComposition composition) {
    final total = composition.duration.inMicroseconds;
    final elapsed = DateTime.now().difference(ZcAnimatedBackdrop._origin).inMicroseconds;
    _controller
      ..duration = composition.duration
      ..value = (elapsed % total) / total
      ..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final animation = RepaintBoundary(
      child: Lottie.asset(
        'assets/animations/fond_evenements.json',
        controller: _controller,
        onLoaded: _start,
        fit: BoxFit.cover,
        alignment: Alignment.topCenter,
        // Plain page instead of nothing if the file can't be read
        errorBuilder: (_, __, ___) => ColoredBox(color: AppColors.page),
      ),
    );
    return AppColors.isDark ? ColorFiltered(colorFilter: _invert, child: animation) : animation;
  }
}

/// Line drawing that builds itself up (Lottie, assets/animations), in the ink colour
/// (white in dark mode). Plays once from the start each time [active] turns on; with
/// [loop], runs continuously while active.
/// [keepColors]: drawings with white parts of their own (a halo masking what is under a
/// scan line) keep their colours, swapped black/white in dark mode, instead of one tint.
class ZcAnimatedIllustration extends StatefulWidget {
  final String name;
  final double height;
  final bool active;
  final bool loop;
  final bool keepColors;

  const ZcAnimatedIllustration(
    this.name, {
    super.key,
    required this.height,
    this.active = true,
    this.loop = false,
    this.keepColors = false,
  });

  @override
  State<ZcAnimatedIllustration> createState() => _ZcAnimatedIllustrationState();
}

class _ZcAnimatedIllustrationState extends State<ZcAnimatedIllustration> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this);

  @override
  void didUpdateWidget(ZcAnimatedIllustration old) {
    super.didUpdateWidget(old);
    if (_controller.duration == null || widget.active == old.active) return;
    widget.active ? _play() : (widget.loop ? _controller.stop() : null);
  }

  void _play() => widget.loop ? _controller.repeat() : _controller.forward(from: 0);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorFilter? filter = widget.keepColors
        ? (AppColors.isDark ? _invertColors : null)
        : ColorFilter.mode(AppColors.ink, BlendMode.srcIn);
    final lottie = Lottie.asset(
        'assets/animations/${widget.name}.json',
        controller: _controller,
        height: widget.height,
        // Short loops: each frame's drawing is built once, then replayed
        renderCache: RenderCache.drawingCommands,
        onLoaded: (composition) {
          _controller.duration = composition.duration;
          // Not on screen yet: shown at its first frame, played when it becomes active
          widget.active ? _play() : _controller.value = 0;
        },
        errorBuilder: (_, __, ___) => SizedBox(height: widget.height),
    );
    // Own layer: a frame of the drawing doesn't repaint the page around it (shadows...)
    return RepaintBoundary(child: filter == null ? lottie : ColorFiltered(colorFilter: filter, child: lottie));
  }
}

const _invertColors = ColorFilter.matrix(<double>[
  -1, 0, 0, 0, 255, //
  0, -1, 0, 0, 255, //
  0, 0, -1, 0, 255, //
  0, 0, 0, 1, 0, //
]);

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
            : Text(label, style: zcText(ZcSize.h3, weight: ZcWeight.medium, color: AppColors.onInk)),
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
                style: const TextStyle(fontWeight: ZcWeight.bold),
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
