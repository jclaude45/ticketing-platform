import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../auth/sign_in_screens.dart';
import '../discover/events_data.dart';
import 'payment_screen.dart';
import 'purchase_data.dart';

/// Step 1: the category and how many tickets
class ChooseScreen extends ConsumerStatefulWidget {
  final PublicEvent event;
  const ChooseScreen({super.key, required this.event});

  @override
  ConsumerState<ChooseScreen> createState() => _ChooseScreenState();
}

class _ChooseScreenState extends ConsumerState<ChooseScreen> {
  late Category? _category = widget.event.categories
      .where((c) => c.available > 0)
      .firstOrNull;
  var _quantity = 1;
  var _busy = false;

  /// At most 10 at once, and never more than what is left
  int get _max => (_category?.available ?? 0).clamp(0, 10);

  Future<void> _continue() async {
    final category = _category;
    if (category == null) return;
    final order = Order(event: widget.event, category: category, quantity: _quantity);
    // The tickets are tied to a verified number: sign in first, the name the first time
    if (ref.read(sessionProvider) is! SignedIn) {
      if (!await signIn(context) || !mounted) return;
    }
    final customer = ref.read(sessionProvider.notifier).customer;
    if (customer != null && customer.fullName.length < 2) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NameScreen()));
      if (!mounted || (ref.read(sessionProvider.notifier).customer?.fullName.length ?? 0) < 2) return;
    }
    if (!mounted) return;
    if (order.free) {
      setState(() => _busy = true);
      await finishCheckout(context, ref, order, method: 'mobile_money');
      if (mounted) setState(() => _busy = false);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PaymentScreen(order: order)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final e = widget.event;
    final c = _category;
    final total = c == null ? 0.0 : c.price * _quantity;
    return Scaffold(
      appBar: zAppBar(s.chooseTitle),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
        children: [
          const StepTabs(step: 1),
          const SizedBox(height: 20),
          OrderHeader(
            event: e,
            line: '${Fmt.dayLong(e.start)} · ${e.venue}',
          ),
          const SizedBox(height: 26),
          Text(s.yourExperience, style: zText(ZSize.h1, weight: ZWeight.bold)),
          const SizedBox(height: 14),
          for (final cat in e.categories) ...[
            _CategoryCard(
              category: cat,
              selected: cat.id == c?.id,
              onTap: cat.available <= 0
                  ? null
                  : () => setState(() {
                      _category = cat;
                      _quantity = _quantity.clamp(1, cat.available.clamp(1, 10));
                    }),
            ),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Text(s.quantity, style: zText(ZSize.title, weight: ZWeight.semibold)),
              ),
              _Stepper(
                value: _quantity,
                onMinus: _quantity > 1 ? () => setState(() => _quantity--) : null,
                onPlus: _quantity < _max ? () => setState(() => _quantity++) : null,
              ),
            ],
          ),
          const SizedBox(height: 22),
          Text(s.checkBeforeContinue, style: zText(ZSize.small, color: ZColors.muted)),
        ],
      ),
      bottomNavigationBar: ZActionBar(
        caption: c == null ? null : s.ticketsOf(_quantity, c.name),
        amount: total == 0 ? s.free : Fmt.money(total, c?.currency ?? e.currency),
        label: s.continueLabel,
        loading: _busy,
        onPressed: c == null ? null : _continue,
      ),
    );
  }
}

/// « 01 BILLETS — 02 PAIEMENT »
class StepTabs extends StatelessWidget {
  final int step;
  const StepTabs({super.key, required this.step});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    Widget tab(int n, String label) {
      final active = n == step;
      final done = n < step;
      return Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '0$n  ${label.toUpperCase()}',
              style: zText(
                ZSize.caption,
                weight: active ? ZWeight.bold : ZWeight.medium,
                color: active ? ZColors.orangeText : ZColors.muted,
              ).copyWith(letterSpacing: 0.6),
            ),
            const SizedBox(height: 8),
            Container(
              height: 3,
              decoration: BoxDecoration(
                color: active
                    ? ZColors.orange
                    : done
                    ? ZColors.orange.withValues(alpha: 0.45)
                    : ZColors.track,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      );
    }

    return Row(
      children: [
        tab(1, s.stepTickets),
        const SizedBox(width: 12),
        tab(2, s.stepPayment),
      ],
    );
  }
}

/// The event being bought: poster, name, one line below
class OrderHeader extends StatelessWidget {
  final PublicEvent event;
  final String line;
  const OrderHeader({super.key, required this.event, required this.line});

  @override
  Widget build(BuildContext context) {
    return ZCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          SizedBox(
            width: 76,
            height: 76,
            child: EventPoster(url: event.bannerUrl, radius: BorderRadius.circular(12)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: zText(ZSize.h3, weight: ZWeight.bold, height: 1.2),
                ),
                const SizedBox(height: 6),
                Text(line, style: zText(ZSize.small, color: ZColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  final Category category;
  final bool selected;
  final VoidCallback? onTap;

  const _CategoryCard({required this.category, required this.selected, this.onTap});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final c = category;
    final out = c.available <= 0;
    return Material(
      color: selected ? ZColors.orangeSoft : ZColors.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: selected ? ZColors.orange : ZColors.line,
          width: selected ? 1.6 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 18, 18),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.name, style: zText(ZSize.h3, weight: ZWeight.bold)),
                    const SizedBox(height: 6),
                    Text(
                      c.price == 0 ? s.free : Fmt.money(c.price, c.currency),
                      style: zText(ZSize.h3, weight: ZWeight.bold),
                    ),
                    if (out || c.available <= 50 || (c.description ?? '').isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        out
                            ? s.soldOut
                            // An exact count only when few are left
                            : c.available <= 50
                            ? s.seatsLeft(c.available)
                            : c.description!,
                        style: zText(ZSize.small, color: out ? ZColors.red : ZColors.muted),
                      ),
                    ],
                  ],
                ),
              ),
              if (selected)
                const CircleAvatar(
                  radius: 13,
                  backgroundColor: ZColors.orange,
                  child: Icon(Icons.check_rounded, size: 17, color: ZColors.onOrange),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  final int value;
  final VoidCallback? onMinus;
  final VoidCallback? onPlus;

  const _Stepper({required this.value, this.onMinus, this.onPlus});

  @override
  Widget build(BuildContext context) {
    Widget button(IconData icon, VoidCallback? onTap, Color bg, Color fg) => Material(
      color: bg,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(icon, size: 20, color: onTap == null ? fg.withValues(alpha: 0.35) : fg),
        ),
      ),
    );
    return Row(
      children: [
        button(Icons.remove_rounded, onMinus, ZColors.surface, ZColors.ink),
        SizedBox(
          width: 44,
          child: Text(
            '$value',
            textAlign: TextAlign.center,
            style: zText(ZSize.h3, weight: ZWeight.bold),
          ),
        ),
        button(Icons.add_rounded, onPlus, ZColors.orangeSoft, ZColors.orangeText),
      ],
    );
  }
}
