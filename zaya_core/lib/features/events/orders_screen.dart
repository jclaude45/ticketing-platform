import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'event_admin_data.dart';
import 'events_data.dart';

/// Paid orders of the online ticketing, newest first, with the refund of an order
class OrdersScreen extends ConsumerWidget {
  final String eventId;
  const OrdersScreen({super.key, required this.eventId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider(eventId));
    return Scaffold(
      appBar: AppBar(title: const Text('Commandes')),
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () => ref.refresh(ordersProvider(eventId).future),
        child: orders.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              SizedBox(
                height: 420,
                child: ZMessage.error(
                  e,
                  () => ref.invalidate(ordersProvider(eventId)),
                ),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(
                    height: 420,
                    child: ZMessage(
                      icon: Icons.receipt_long_outlined,
                      title: 'Aucune commande',
                      text:
                          'Les achats faits sur zaya.live apparaîtront ici dès qu’ils sont payés.',
                    ),
                  ),
                ],
              );
            }
            final paid = list.where((o) => o.status == 'COMPLETED');
            final byCurrency = <String, double>{};
            for (final o in paid) {
              byCurrency[o.currency] = (byCurrency[o.currency] ?? 0) + o.net;
            }
            return ListView(
              padding: const EdgeInsets.only(bottom: 32),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  child: Text(
                    '${paid.length} commande${paid.length > 1 ? 's' : ''} payée${paid.length > 1 ? 's' : ''}'
                    '${byCurrency.isEmpty ? '' : ' · ${byCurrency.entries.map((e) => Fmt.money(e.value, e.key)).join(' + ')} pour vous'}',
                    style: zText(ZSize.body, color: ZColors.muted),
                  ),
                ),
                ...list.map((o) => _OrderTile(order: o, eventId: eventId)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _OrderTile extends ConsumerWidget {
  final Order order;
  final String eventId;
  const _OrderTile({required this.order, required this.eventId});

  (String, Color) get _status => switch (order.status) {
    'COMPLETED' => ('Payée', ZColors.green),
    'REFUNDED' => (
      order.refundStatus == 'PAID' ? 'Remboursée' : 'Remboursement en cours',
      ZColors.orange,
    ),
    'PROCESSING' => ('En traitement', ZColors.muted),
    _ => (order.status, ZColors.muted),
  };

  Future<void> _refund(BuildContext context, WidgetRef ref) async {
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Rembourser cette commande ?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${order.tickets} billet${order.tickets > 1 ? 's' : ''} de ${order.holderName} seront annulés, et '
              '${Fmt.money(order.amount, order.currency)} lui seront rendus par ZAYA. C’est définitif.',
            ),
            const SizedBox(height: 14),
            TextField(
              controller: reason,
              maxLength: 500,
              decoration: const InputDecoration(hintText: 'Motif (facultatif)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text(
              'Rembourser',
              style: TextStyle(color: ZColors.red),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref
          .read(eventAdminRepository)
          .refund(eventId, order.id, reason.text);
      ref.invalidate(ordersProvider(eventId));
      ref.invalidate(eventDashboardProvider(eventId));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Remboursement demandé : les billets sont annulés et l’acheteur est prévenu.',
            ),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiException.from(e).message)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (label, color) = _status;
    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 20),
      childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      shape: const Border(),
      title: Text(
        order.holderName,
        style: zText(ZSize.body, weight: ZWeight.bold),
      ),
      subtitle: Text(
        '${Fmt.dayTime(order.date)} · ${order.tickets} billet${order.tickets > 1 ? 's' : ''}',
        style: zText(ZSize.small, color: ZColors.muted),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            Fmt.money(order.amount, order.currency),
            style: zText(ZSize.body, weight: ZWeight.bold),
          ),
          const SizedBox(height: 4),
          ZPill(label, color: color),
        ],
      ),
      expandedCrossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _row('Référence', order.reference),
        _row('E-mail', order.holderEmail),
        if (order.holderPhone != null)
          _row('Téléphone', Fmt.phone(order.holderPhone!)),
        _row('Paiement', order.methodLabel),
        if (order.status == 'COMPLETED')
          _row('Pour vous', Fmt.money(order.net, order.currency)),
        if (order.refundable) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: ZColors.red,
              side: const BorderSide(color: ZColors.red),
            ),
            onPressed: () => _refund(context, ref),
            icon: const Icon(Icons.undo_rounded, size: 18),
            label: const Text('Rembourser'),
          ),
        ],
      ],
    );
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text(label, style: zText(ZSize.small, color: ZColors.muted)),
        ),
        Expanded(
          child: SelectableText(
            value,
            style: zText(ZSize.small, weight: ZWeight.medium),
          ),
        ),
      ],
    ),
  );
}
