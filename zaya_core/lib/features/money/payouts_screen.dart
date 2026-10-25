import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'payouts_data.dart';

/// What ZAYA pays out for each event's online sales, and where the money goes
class PayoutsScreen extends ConsumerWidget {
  const PayoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payouts = ref.watch(payoutsProvider);
    final info = ref.watch(payoutInfoProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Versements')),
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () async {
          ref.invalidate(payoutInfoProvider);
          final _ = await ref.refresh(payoutsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            _InfoCard(info: info),
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
              child: Text(
                'Les ventes en ligne sont versées en deux fois : 90 % trois jours après l’événement, '
                'puis la réserve de 10 % une semaine plus tard (elle couvre les remboursements).',
                style: zText(ZSize.small, color: ZColors.muted, height: 1.5),
              ),
            ),
            ...payouts.when(
              loading: () => [
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
              error: (e, _) => [
                SizedBox(
                  height: 300,
                  child: ZMessage.error(
                    e,
                    () => ref.invalidate(payoutsProvider),
                  ),
                ),
              ],
              data: (list) => list.isEmpty
                  ? [
                      const SizedBox(
                        height: 300,
                        child: ZMessage(
                          icon: Icons.account_balance_wallet_outlined,
                          title: 'Pas encore de vente en ligne',
                          text:
                              'Vos versements apparaîtront ici après les premières ventes sur zaya.live.',
                        ),
                      ),
                    ]
                  : list.map((p) => _EventPayoutCard(p)).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends ConsumerWidget {
  final AsyncValue<PayoutInfo?> info;
  const _InfoCard({required this.info});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = info.valueOrNull;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: current == null && !info.isLoading
            ? ZColors.yellow
            : ZColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Coordonnées de versement',
                  style: zText(
                    ZSize.small,
                    weight: ZWeight.medium,
                    color: current == null ? ZColors.onYellow : ZColors.muted,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  info.isLoading
                      ? '…'
                      : current == null
                      ? 'À compléter pour recevoir vos ventes'
                      : current.summary,
                  style: zText(
                    ZSize.title,
                    weight: ZWeight.bold,
                    color: current == null ? ZColors.onYellow : ZColors.text,
                  ),
                ),
                if (current != null && current.accountName.isNotEmpty)
                  Text(
                    current.accountName,
                    style: zText(ZSize.small, color: ZColors.muted),
                  ),
              ],
            ),
          ),
          TextButton(
            onPressed: info.isLoading
                ? null
                : () async {
                    final saved = await showModalBottomSheet<bool>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      builder: (_) =>
                          _InfoSheet(initial: current ?? const PayoutInfo()),
                    );
                    if (saved == true) ref.invalidate(payoutInfoProvider);
                  },
            child: Text(
              current == null ? 'Compléter' : 'Modifier',
              style: zText(
                ZSize.body,
                weight: ZWeight.bold,
                color: current == null ? ZColors.onYellow : ZColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EventPayoutCard extends StatelessWidget {
  final EventPayout p;
  const _EventPayoutCard(this.p);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ZColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ZColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(p.eventName, style: zText(ZSize.title, weight: ZWeight.bold)),
          if (p.eventEnd != null)
            Text(
              '${p.eventEnd!.isAfter(DateTime.now()) ? 'Se termine le' : 'Terminé le'} ${Fmt.day(p.eventEnd!)}',
              style: zText(ZSize.small, color: ZColors.muted),
            ),
          const SizedBox(height: 12),
          _line(
            'Ventes (${p.orders} commande${p.orders > 1 ? 's' : ''})',
            Fmt.money(p.gross, p.currency),
          ),
          if (p.fees > 0)
            _line('Frais ZAYA', '− ${Fmt.money(p.fees, p.currency)}'),
          if (p.refunded > 0)
            _line(
              'Remboursements (${p.refundedOrders})',
              '− ${Fmt.money(p.refunded, p.currency)}',
            ),
          const Divider(height: 18),
          _line('Pour vous', Fmt.money(p.net, p.currency), bold: true),
          const SizedBox(height: 12),
          ...p.parts.map((part) {
            final color = switch (part.status) {
              'PAID' => ZColors.green,
              'DUE' => ZColors.orange,
              'OWED' => ZColors.red,
              _ => ZColors.muted,
            };
            return Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          part.label,
                          style: zText(ZSize.body, weight: ZWeight.medium),
                        ),
                        Text(
                          part.status == 'PAID' && part.paidAt != null
                              ? 'Versé le ${Fmt.day(part.paidAt!)}${part.reference != null ? ' · réf. ${part.reference}' : ''}'
                              : part.dueAt != null
                              ? 'À partir du ${Fmt.day(part.dueAt!)}'
                              : '',
                          style: zText(ZSize.small, color: ZColors.muted),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        Fmt.money(part.amount, p.currency),
                        style: zText(ZSize.body, weight: ZWeight.bold),
                      ),
                      const SizedBox(height: 3),
                      ZPill(part.statusLabel, color: color),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _line(String label, String value, {bool bold = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: zText(
              ZSize.body,
              color: bold ? ZColors.text : ZColors.muted,
              weight: bold ? ZWeight.bold : ZWeight.regular,
            ),
          ),
        ),
        Text(
          value,
          style: zText(
            ZSize.body,
            weight: bold ? ZWeight.bold : ZWeight.medium,
          ),
        ),
      ],
    ),
  );
}

class _InfoSheet extends ConsumerStatefulWidget {
  final PayoutInfo initial;
  const _InfoSheet({required this.initial});

  @override
  ConsumerState<_InfoSheet> createState() => _InfoSheetState();
}

class _InfoSheetState extends ConsumerState<_InfoSheet> {
  final _form = GlobalKey<FormState>();
  late String _method = widget.initial.method;
  late String _network = mobileNetworks.contains(widget.initial.network)
      ? widget.initial.network
      : mobileNetworks.first;
  late final _phone = TextEditingController(text: widget.initial.phone);
  late final _bank = TextEditingController(text: widget.initial.bankName);
  late final _account = TextEditingController(
    text: widget.initial.accountNumber,
  );
  late final _holder = TextEditingController(text: widget.initial.accountName);
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_phone, _bank, _account, _holder]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _required(String? v) => (v ?? '').trim().isEmpty ? 'Requis' : null;

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(payoutsRepository)
          .saveInfo(
            PayoutInfo(
              method: _method,
              network: _network,
              phone: _phone.text.trim(),
              bankName: _bank.text.trim(),
              accountNumber: _account.text.trim(),
              accountName: _holder.text.trim(),
            ),
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiException.from(e).message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Coordonnées de versement',
                style: zText(ZSize.h2, weight: ZWeight.black),
              ),
              const SizedBox(height: 16),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'mobile_money',
                    label: Text('Mobile Money'),
                  ),
                  ButtonSegment(value: 'bank', label: Text('Banque')),
                ],
                selected: {_method},
                onSelectionChanged: (s) => setState(() => _method = s.first),
              ),
              const SizedBox(height: 16),
              if (_method == 'mobile_money') ...[
                Text(
                  'Réseau',
                  style: zText(
                    ZSize.small,
                    weight: ZWeight.medium,
                    color: ZColors.muted,
                  ),
                ),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  initialValue: _network,
                  items: mobileNetworks
                      .map((n) => DropdownMenuItem(value: n, child: Text(n)))
                      .toList(),
                  onChanged: (v) => setState(() => _network = v ?? _network),
                ),
                const SizedBox(height: 14),
                ZField(
                  label: 'Numéro',
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  hint: '081 234 5678',
                  validator: _required,
                ),
              ] else ...[
                ZField(
                  label: 'Banque',
                  controller: _bank,
                  validator: _required,
                ),
                const SizedBox(height: 14),
                ZField(
                  label: 'Numéro de compte',
                  controller: _account,
                  validator: _required,
                ),
              ],
              const SizedBox(height: 14),
              ZField(
                label: 'Titulaire',
                controller: _holder,
                hint: 'Nom exact du compte',
                validator: _required,
              ),
              const SizedBox(height: 22),
              ZButton(label: 'Enregistrer', loading: _saving, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}
