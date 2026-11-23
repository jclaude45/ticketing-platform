import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/navigation.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../wallet/wallet_data.dart';
import 'choose_screen.dart';
import 'purchase_data.dart';

/// Step 2: mobile money (confirmed on the phone) or card (FlexPay's page)
class PaymentScreen extends ConsumerStatefulWidget {
  final Order order;
  const PaymentScreen({super.key, required this.order});

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  var _method = 'mobile_money';
  late final _phone = TextEditingController(text: _localNumber());
  var _busy = false;
  String? _error;

  /// The account's number without +243, as typed in the field
  String _localNumber() {
    final p = ref.read(sessionProvider.notifier).customer?.phone ?? '';
    final d = p.replaceAll(RegExp(r'\D'), '');
    return d.length == 12 && d.startsWith('243')
        ? '${d.substring(3, 6)} ${d.substring(6, 9)} ${d.substring(9)}'
        : '';
  }

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await finishCheckout(
      context,
      ref,
      widget.order,
      method: _method,
      payerPhone: _method == 'mobile_money' ? ZPhoneField.international(_phone.text) : null,
    );
    if (mounted) {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final o = widget.order;
    final total = Fmt.money(o.total, o.category.currency);
    Widget method(String value, String label) {
      final selected = _method == value;
      return Expanded(
        child: Material(
          color: selected ? ZColors.orangeSoft : ZColors.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: selected ? ZColors.orange : Colors.transparent, width: 1.4),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() => _method = value),
            child: SizedBox(
              height: 56,
              child: Center(
                child: Text(
                  label,
                  style: zText(
                    ZSize.title,
                    weight: ZWeight.semibold,
                    color: selected ? ZColors.orangeText : ZColors.ink,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: zAppBar(s.paymentTitle),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
        children: [
          const StepTabs(step: 2),
          const SizedBox(height: 20),
          OrderHeader(
            event: o.event,
            line: '${s.ticketCount(o.quantity)} · ${o.category.name}',
          ),
          const SizedBox(height: 26),
          Text(s.howToPay, style: zText(ZSize.h1, weight: ZWeight.bold)),
          const SizedBox(height: 14),
          Row(
            children: [
              method('mobile_money', s.mobileMoney),
              const SizedBox(width: 12),
              method('card', s.card),
            ],
          ),
          const SizedBox(height: 22),
          if (_method == 'mobile_money') ...[
            ZLabel(s.mobileMoneyNumber),
            ZPhoneField(controller: _phone),
            const SizedBox(height: 10),
            Text(
              'M-Pesa · Airtel Money · Orange Money · Afrimoney',
              style: zText(ZSize.small, weight: ZWeight.medium),
            ),
            const SizedBox(height: 4),
            Text(s.confirmOnPhone, style: zText(ZSize.small, color: ZColors.muted)),
          ] else
            Text(s.cardNote, style: zText(ZSize.body, color: ZColors.muted, height: 1.5)),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
            decoration: BoxDecoration(
              color: ZColors.orangeSoft,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(s.totalToPay, style: zText(ZSize.title, weight: ZWeight.semibold)),
                ),
                Text(total, style: zText(ZSize.h1, weight: ZWeight.bold)),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!, style: zText(ZSize.body, color: ZColors.red, height: 1.4)),
          ],
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: ZColors.page,
          border: Border(top: BorderSide(color: ZColors.line)),
        ),
        child: SafeArea(
          top: false,
          minimum: const EdgeInsets.fromLTRB(24, 14, 24, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ZButton(label: s.pay(total), loading: _busy, onPressed: _pay),
              const SizedBox(height: 8),
              Text(s.securePayment, style: zText(ZSize.small, color: ZColors.muted)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Places the order and follows it to the end; returns the error to show on the payment step
Future<String?> finishCheckout(
  BuildContext context,
  WidgetRef ref,
  Order order, {
  required String method,
  String? payerPhone,
}) async {
  final CheckoutResult result;
  try {
    result = await Purchase.checkout(order, method: method, payerPhone: payerPhone);
  } on ApiException catch (e) {
    return e.message;
  }
  if (!context.mounted) return null;
  if (result.redirectUrl != null) {
    // FlexPay's card page in the in-app browser; the status is followed meanwhile
    unawaited(launchUrl(Uri.parse(result.redirectUrl!), mode: LaunchMode.inAppBrowserView));
  }
  // Failed: back on the payment step to try again; paid: « Voir mes billets » leaves it
  await Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => PaymentResultScreen(order: order, reference: result.reference, card: method == 'card'),
    ),
  );
  return null;
}

/// Waits for the payment (polling the server), then says how it ended
class PaymentResultScreen extends ConsumerStatefulWidget {
  final Order order;

  /// Null for free tickets: already issued
  final String? reference;
  final bool card;

  const PaymentResultScreen({super.key, required this.order, this.reference, this.card = false});

  @override
  ConsumerState<PaymentResultScreen> createState() => _PaymentResultScreenState();
}

class _PaymentResultScreenState extends ConsumerState<PaymentResultScreen> {
  late var _outcome = widget.reference == null ? PaymentOutcome.paid : PaymentOutcome.pending;
  Timer? _timer;
  var _checks = 0;

  @override
  void initState() {
    super.initState();
    if (_outcome == PaymentOutcome.paid) {
      _paid();
    } else {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) => _check());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    // Ten minutes at most: the seats are held that long, then the server settles it
    if (++_checks > 150) {
      _timer?.cancel();
      return;
    }
    try {
      final o = await Purchase.status(widget.reference!);
      if (!mounted || o == PaymentOutcome.pending) return;
      _timer?.cancel();
      if (o == PaymentOutcome.paid) {
        _paid();
      } else {
        setState(() => _outcome = o);
      }
    } catch (_) {
      // Network hiccup: the next check tries again
    }
  }

  void _paid() {
    setState(() => _outcome = PaymentOutcome.paid);
    ref.read(walletProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final (icon, color, title, text) = switch (_outcome) {
      PaymentOutcome.pending => (
        widget.card ? Icons.credit_card_rounded : Icons.phone_iphone_rounded,
        ZColors.orange,
        s.waitingTitle,
        widget.card ? s.cardNote : s.waitingText,
      ),
      PaymentOutcome.paid => (Icons.check_rounded, ZColors.green, s.paidTitle, s.paidText),
      PaymentOutcome.failed => (Icons.close_rounded, ZColors.red, s.failedTitle, s.failedText),
    };
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 42, color: color),
              ),
              const SizedBox(height: 22),
              Text(
                title,
                textAlign: TextAlign.center,
                style: zText(ZSize.display, weight: ZWeight.bold),
              ),
              const SizedBox(height: 10),
              Text(
                text,
                textAlign: TextAlign.center,
                style: zText(ZSize.body, color: ZColors.muted, height: 1.55),
              ),
              if (_outcome == PaymentOutcome.pending) ...[
                const SizedBox(height: 26),
                const CircularProgressIndicator(),
              ],
              const SizedBox(height: 18),
              OrderHeader(
                event: widget.order.event,
                line: '${s.ticketCount(widget.order.quantity)} · ${widget.order.category.name}',
              ),
              const Spacer(),
              if (_outcome == PaymentOutcome.paid)
                ZButton(
                  label: s.seeTickets,
                  onPressed: () {
                    ref.read(homeTabProvider.notifier).state = HomeTab.tickets;
                    Navigator.of(context).popUntil((r) => r.isFirst);
                  },
                )
              else
                ZButton(
                  label: s.backToEvent,
                  style: ZButtonStyle.secondary,
                  onPressed: () => Navigator.of(context).pop(_outcome),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
