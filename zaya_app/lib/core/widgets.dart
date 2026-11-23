import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'api/api_exception.dart';
import 'config.dart';
import 'i18n.dart';
import 'theme.dart';

enum ZButtonStyle { primary, secondary, outline }

/// Full-width button: orange (main action), warm grey (secondary) or outlined
class ZButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final ZButtonStyle style;
  final double height;

  const ZButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.style = ZButtonStyle.primary,
    this.height = 54,
  });

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (style) {
      ZButtonStyle.primary => (ZColors.orange, ZColors.onOrange),
      ZButtonStyle.secondary => (ZColors.surface, ZColors.ink),
      ZButtonStyle.outline => (Colors.transparent, ZColors.ink),
    };
    return SizedBox(
      height: height,
      width: double.infinity,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          disabledBackgroundColor: style == ZButtonStyle.primary
              ? ZColors.orange.withValues(alpha: 0.4)
              : bg,
          disabledForegroundColor: fg.withValues(alpha: 0.6),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: style == ZButtonStyle.outline
                ? BorderSide(color: ZColors.line, width: 1.4)
                : BorderSide.none,
          ),
        ),
        onPressed: loading ? null : onPressed,
        child: loading
            ? SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: fg),
              )
            : Text(
                label,
                style: zText(ZSize.title, weight: ZWeight.bold, color: fg),
              ),
      ),
    );
  }
}

/// Label above a field (dark, as on the welcome screen)
class ZLabel extends StatelessWidget {
  final String text;
  const ZLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(text, style: zText(ZSize.body, weight: ZWeight.semibold)),
  );
}

/// Label above an outlined field
class ZField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String>? autofillHints;

  const ZField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onSubmitted,
    this.autofillHints,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ZLabel(label),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          validator: validator,
          onFieldSubmitted: onSubmitted,
          autofillHints: autofillHints,
          cursorColor: ZColors.orange,
          style: zText(ZSize.title),
          decoration: InputDecoration(hintText: hint),
        ),
      ],
    );
  }
}

/// Phone number field: « +243 | 812 345 678 » (another country code can be typed with +)
class ZPhoneField extends StatelessWidget {
  final TextEditingController controller;
  final String? errorText;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;

  const ZPhoneField({
    super.key,
    required this.controller,
    this.errorText,
    this.autofocus = false,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      keyboardType: TextInputType.phone,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      textInputAction: TextInputAction.done,
      onSubmitted: onSubmitted,
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
        LengthLimitingTextInputFormatter(20),
      ],
      cursorColor: ZColors.orange,
      style: zText(ZSize.title, weight: ZWeight.medium),
      decoration: InputDecoration(
        hintText: '812 345 678',
        errorText: errorText,
        errorMaxLines: 3,
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 16, right: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('+243', style: zText(ZSize.title, weight: ZWeight.bold)),
              const SizedBox(width: 14),
              Container(width: 1, height: 26, color: ZColors.line),
            ],
          ),
        ),
        prefixIconConstraints: const BoxConstraints(minHeight: 0, minWidth: 0),
      ),
    );
  }

  /// What to send: +243 unless another country code was typed
  static String international(String typed) {
    final t = typed.trim();
    return t.startsWith('+') || t.startsWith('00') ? t : '+243 $t';
  }
}

/// White rounded card of the app
class ZCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final VoidCallback? onTap;

  const ZCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color ?? ZColors.card,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Rounded chip: orange when selected, warm grey otherwise
class ZChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;

  /// Pale orange instead of grey when not selected (the filters of the search)
  final bool soft;

  /// Shares a row with others (Expanded): the label shrinks rather than wrapping
  final bool fill;

  const ZChip({
    super.key,
    required this.label,
    this.selected = false,
    this.onTap,
    this.soft = false,
    this.fill = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = selected
        ? ZColors.orange
        : soft
        ? ZColors.orangeSoft
        : ZColors.surface;
    final style = zText(
      ZSize.body,
      weight: ZWeight.semibold,
      color: selected
          ? ZColors.onOrange
          : soft
          ? ZColors.orangeText
          : ZColors.ink,
    );
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: fill ? 8 : 18, vertical: 11),
          child: fill
              ? Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(label, maxLines: 1, style: style),
                  ),
                )
              : Text(label, style: style),
        ),
      ),
    );
  }
}

/// The « Z » of ZAYA in orange, with the name beside it or not
class ZLogo extends StatelessWidget {
  final double size;
  final bool withName;
  final Color? nameColor;

  const ZLogo({
    super.key,
    this.size = 28,
    this.withName = true,
    this.nameColor,
  });

  @override
  Widget build(BuildContext context) {
    final z = SvgPicture.asset('assets/images/zaya_z.svg', height: size);
    if (!withName) return z;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        z,
        SizedBox(width: size * 0.3),
        Text(
          'ZAYA',
          style: zText(
            size * 0.8,
            weight: ZWeight.bold,
            color: nameColor ?? ZColors.ink,
          ).copyWith(letterSpacing: 0.5),
        ),
      ],
    );
  }
}

/// Message in the middle of an empty or failed screen, with an optional action
class ZMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? text;
  final String? actionLabel;
  final VoidCallback? onAction;

  const ZMessage({
    super.key,
    required this.icon,
    required this.title,
    this.text,
    this.actionLabel,
    this.onAction,
  });

  /// Error of a request, with « Réessayer »
  factory ZMessage.error(Object error, VoidCallback retry) => ZMessage(
    icon: Icons.cloud_off_rounded,
    title: S.current.loadError,
    text: ApiException.from(error).message,
    actionLabel: S.current.retry,
    onAction: retry,
  );

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: ZColors.orangeSoft,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(icon, size: 30, color: ZColors.orange),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: zText(ZSize.h3, weight: ZWeight.bold),
            ),
            if (text != null) ...[
              const SizedBox(height: 6),
              Text(
                text!,
                textAlign: TextAlign.center,
                style: zText(ZSize.body, color: ZColors.muted, height: 1.5),
              ),
            ],
            if (actionLabel != null) ...[
              const SizedBox(height: 20),
              SizedBox(
                width: 220,
                child: ZButton(label: actionLabel!, onPressed: onAction),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Event poster: a stored file (https or /uploads/…) or, for older events, an inline data URL
class EventPoster extends StatelessWidget {
  final String? url;
  final double? height;
  final BorderRadius radius;

  const EventPoster({
    super.key,
    required this.url,
    this.height,
    this.radius = const BorderRadius.all(Radius.circular(16)),
  });

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      height: height,
      color: ZColors.orangeSoft,
      alignment: Alignment.center,
      child: const ZLogo(size: 30, withName: false),
    );
    final u = url;
    Widget image;
    if (u == null || u.isEmpty) {
      image = placeholder;
    } else if (u.startsWith('data:')) {
      try {
        image = Image.memory(
          base64Decode(u.substring(u.indexOf(',') + 1)),
          height: height,
          width: double.infinity,
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      } catch (_) {
        image = placeholder;
      }
    } else {
      final full = u.startsWith('http')
          ? u.replaceFirst(
              RegExp(r'^https?://localhost(:\d+)?'),
              AppConfig.origin,
            )
          : '${AppConfig.origin}$u';
      image = CachedNetworkImage(
        imageUrl: full,
        height: height,
        width: double.infinity,
        fit: BoxFit.cover,
        placeholder: (_, _) => placeholder,
        errorWidget: (_, _, _) => placeholder,
      );
    }
    return ClipRRect(borderRadius: radius, child: image);
  }
}

/// Small rounded label (« Billet · Valide », « Complet »)
class ZPill extends StatelessWidget {
  final String label;
  final Color color;
  final Color? textColor;

  const ZPill(this.label, {super.key, required this.color, this.textColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: zText(
          ZSize.caption,
          weight: ZWeight.semibold,
          color: textColor ?? ZColors.ink,
        ),
      ),
    );
  }
}

/// Section title of a screen, with an optional line below
class ZSection extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsets padding;

  const ZSection(
    this.title, {
    super.key,
    this.subtitle,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(24, 28, 24, 12),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: zText(ZSize.h2, weight: ZWeight.bold)),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: zText(ZSize.small, color: ZColors.muted),
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Header of a main page: orange overline, big title, a line below
class ZPageHeader extends StatelessWidget {
  final String title;
  final String? overline;
  final String? subtitle;
  final Widget? trailing;

  const ZPageHeader({
    super.key,
    required this.title,
    this.overline,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (overline != null) ...[
                  Text(
                    overline!.toUpperCase(),
                    style: zText(
                      ZSize.caption,
                      weight: ZWeight.bold,
                      color: ZColors.orangeText,
                    ).copyWith(letterSpacing: 0.6),
                  ),
                  const SizedBox(height: 8),
                ],
                Text(
                  title,
                  style: zText(
                    ZSize.display,
                    weight: ZWeight.bold,
                    height: 1.15,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    subtitle!,
                    style: zText(ZSize.body, color: ZColors.muted),
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Bar at the bottom of a purchase screen: amount on the left, action on the right
class ZActionBar extends StatelessWidget {
  final String? caption;
  final String amount;
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  const ZActionBar({
    super.key,
    this.caption,
    required this.amount,
    required this.label,
    this.onPressed,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: ZColors.page,
        border: Border(top: BorderSide(color: ZColors.line)),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(24, 14, 24, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (caption != null)
                    Text(
                      caption!,
                      style: zText(ZSize.small, color: ZColors.muted),
                    ),
                  const SizedBox(height: 2),
                  Text(amount, style: zText(ZSize.h1, weight: ZWeight.bold)),
                ],
              ),
            ),
            SizedBox(
              width: 190,
              child: ZButton(
                label: label,
                onPressed: onPressed,
                loading: loading,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Back arrow and title of a sub-page, as in the mockups (no app bar shadow)
PreferredSizeWidget zAppBar(String title) =>
    AppBar(titleSpacing: 0, leading: const BackButton(), title: Text(title));
