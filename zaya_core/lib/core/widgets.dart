import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'api/api_exception.dart';
import 'config.dart';
import 'theme.dart';

/// Full-width black button (white in dark mode)
class ZButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool outlined;

  const ZButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.outlined = false,
  });

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: outlined ? ZColors.ink : ZColors.onInk,
            ),
          )
        : Text(
            label,
            style: zText(
              ZSize.title,
              weight: ZWeight.bold,
              color: outlined ? ZColors.ink : ZColors.onInk,
            ),
          );
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(999),
    );
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: outlined
          ? OutlinedButton(
              style: OutlinedButton.styleFrom(
                shape: shape,
                side: BorderSide(color: ZColors.ink, width: 1.4),
              ),
              onPressed: loading ? null : onPressed,
              child: child,
            )
          : FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: ZColors.ink,
                foregroundColor: ZColors.onInk,
                disabledBackgroundColor: ZColors.ink.withValues(alpha: 0.4),
                shape: shape,
              ),
              onPressed: loading ? null : onPressed,
              child: child,
            ),
    );
  }
}

/// Label above an outlined field
class ZField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final Widget? suffix;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String>? autofillHints;
  final int? maxLength;
  final TextAlign textAlign;
  final TextStyle? style;

  const ZField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.suffix,
    this.validator,
    this.onSubmitted,
    this.autofillHints,
    this.maxLength,
    this.textAlign = TextAlign.start,
    this.style,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: zText(
            ZSize.small,
            weight: ZWeight.medium,
            color: ZColors.muted,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          obscureText: obscureText,
          validator: validator,
          onFieldSubmitted: onSubmitted,
          autofillHints: autofillHints,
          maxLength: maxLength,
          textAlign: textAlign,
          cursorColor: ZColors.ink,
          style: style ?? zText(ZSize.title),
          decoration: InputDecoration(
            hintText: hint,
            suffixIcon: suffix,
            counterText: '',
          ),
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
    title: 'Impossible de charger',
    text: ApiException.from(error).message,
    actionLabel: 'Réessayer',
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
            Icon(icon, size: 44, color: ZColors.muted),
            const SizedBox(height: 14),
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
                width: 200,
                child: ZButton(
                  label: actionLabel!,
                  onPressed: onAction,
                  outlined: true,
                ),
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
    this.radius = const BorderRadius.all(Radius.circular(14)),
  });

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      height: height,
      color: ZColors.surface,
      alignment: Alignment.center,
      child: Icon(Icons.event_rounded, color: ZColors.muted, size: 32),
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

/// Small coloured label (event status, order status)
class ZPill extends StatelessWidget {
  final String label;
  final Color color;
  final Color? textColor;

  const ZPill(this.label, {super.key, required this.color, this.textColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: zText(
          ZSize.caption,
          weight: ZWeight.bold,
          color: textColor ?? Colors.white,
        ),
      ),
    );
  }
}

/// Thin progress bar (sold / capacity, entries / tickets)
class ZBar extends StatelessWidget {
  final double value;
  final Color? color;

  const ZBar(this.value, {super.key, this.color});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: value.clamp(0, 1),
        minHeight: 8,
        backgroundColor: ZColors.track,
        valueColor: AlwaysStoppedAnimation(color ?? ZColors.ink),
      ),
    );
  }
}

/// Section title of a screen
class ZSection extends StatelessWidget {
  final String title;
  final Widget? trailing;

  const ZSection(this.title, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 26, 20, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(title, style: zText(ZSize.title, weight: ZWeight.bold)),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Header of a main page (Événements, Statistiques, Compte): small line above, big title,
/// actions on the right (the notification bell)
class ZPageHeader extends StatelessWidget {
  final String title;
  final String? overline;
  final Widget? trailing;

  const ZPageHeader({
    super.key,
    required this.title,
    this.overline,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 12, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (overline != null)
                  Text(
                    overline!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: zText(
                      ZSize.small,
                      weight: ZWeight.medium,
                      color: ZColors.muted,
                    ),
                  ),
                const SizedBox(height: 2),
                Text(
                  title,
                  style: zText(
                    ZSize.display,
                    weight: ZWeight.black,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Banner sliding from the top of the screen (alert received while the app is open), gone
/// after a few seconds or when touched
void showTopBanner(
  BuildContext context, {
  required String title,
  String? body,
  VoidCallback? onTap,
}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  late OverlayEntry entry;
  var removed = false;
  void close() {
    if (removed) return;
    removed = true;
    entry.remove();
  }

  entry = OverlayEntry(
    builder: (context) => _TopBanner(
      title: title,
      body: body,
      onTap: () {
        close();
        onTap?.call();
      },
      onDone: close,
    ),
  );
  overlay.insert(entry);
}

class _TopBanner extends StatefulWidget {
  final String title;
  final String? body;
  final VoidCallback onTap;
  final VoidCallback onDone;

  const _TopBanner({
    required this.title,
    this.body,
    required this.onTap,
    required this.onDone,
  });

  @override
  State<_TopBanner> createState() => _TopBannerState();
}

class _TopBannerState extends State<_TopBanner>
    with SingleTickerProviderStateMixin {
  late final _slide = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  )..forward();

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(seconds: 5), () async {
      if (!mounted) return;
      await _slide.reverse();
      widget.onDone();
    });
  }

  @override
  void dispose() {
    _slide.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.paddingOf(context).top + 8,
      left: 12,
      right: 12,
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0, -1.4),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: _slide, curve: Curves.easeOutCubic)),
        child: Material(
          color: ZColors.ink,
          elevation: 6,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: widget.onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: ZColors.yellow,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.notifications_active_rounded,
                      size: 19,
                      color: ZColors.onYellow,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: zText(
                            ZSize.body,
                            weight: ZWeight.bold,
                            color: ZColors.onInk,
                          ),
                        ),
                        if (widget.body != null)
                          Text(
                            widget.body!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: zText(
                              ZSize.small,
                              color: ZColors.onInk.withValues(alpha: 0.75),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
