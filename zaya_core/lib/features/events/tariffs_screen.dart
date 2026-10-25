import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'event_admin_data.dart';
import 'events_data.dart';

/// Tariffs of an event: add, change price or quantity, delete one that has no ticket yet.
/// Right after creating an event it also offers to publish it.
class TariffsScreen extends ConsumerWidget {
  final String eventId;
  final String currency;
  final bool isNewEvent;

  const TariffsScreen({
    super.key,
    required this.eventId,
    required this.currency,
    this.isNewEvent = false,
  });

  void _refresh(WidgetRef ref) {
    ref.invalidate(tariffsProvider(eventId));
    ref.invalidate(eventDashboardProvider(eventId));
    ref.invalidate(eventsProvider);
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, [Tariff? t]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _TariffSheet(eventId: eventId, currency: currency, tariff: t),
    );
    if (saved == true) _refresh(ref);
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Tariff t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Supprimer « ${t.name} » ?'),
        content: const Text(
          'Ce tarif ne sera plus proposé. Cette action est définitive.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text(
              'Supprimer',
              style: TextStyle(color: ZColors.red),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(eventAdminRepository).deleteTariff(eventId, t.id);
      _refresh(ref);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiException.from(e).message)));
      }
    }
  }

  Future<void> _publish(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(eventAdminRepository).publish(eventId);
      _refresh(ref);
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Événement publié : il est en vente sur zaya.live.'),
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
    final tariffs = ref.watch(tariffsProvider(eventId));
    return Scaffold(
      appBar: AppBar(title: const Text('Tarifs')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: ZColors.ink,
        foregroundColor: ZColors.onInk,
        onPressed: () => _edit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Ajouter un tarif'),
      ),
      body: tariffs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            ZMessage.error(e, () => ref.invalidate(tariffsProvider(eventId))),
        data: (list) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
          children: [
            if (isNewEvent)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: ZColors.surface,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Événement créé en brouillon',
                      style: zText(ZSize.title, weight: ZWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      list.isEmpty
                          ? 'Ajoutez au moins un tarif (Standard, VIP…), puis publiez-le.'
                          : 'Vos tarifs sont prêts ? Publiez l’événement pour ouvrir la vente.',
                      style: zText(
                        ZSize.body,
                        color: ZColors.muted,
                        height: 1.4,
                      ),
                    ),
                    if (list.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      ZButton(
                        label: 'Publier maintenant',
                        onPressed: () => _publish(context, ref),
                      ),
                    ],
                  ],
                ),
              ),
            if (list.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: ZMessage(
                  icon: Icons.sell_outlined,
                  title: 'Aucun tarif',
                  text:
                      'Un tarif = un type de billet, avec son prix et sa quantité.',
                ),
              ),
            ...list.map((t) {
              final sold = t.quantity - t.available;
              return Card(
                elevation: 0,
                color: ZColors.card,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: ZColors.line),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
                  title: Text(
                    t.name,
                    style: zText(ZSize.title, weight: ZWeight.bold),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '${t.price == 0 ? 'Gratuit' : Fmt.money(t.price, t.currency)} · ${Fmt.count(sold)} vendus sur ${Fmt.count(t.quantity)}',
                      style: zText(ZSize.small, color: ZColors.muted),
                    ),
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (v) => v == 'edit'
                        ? _edit(context, ref, t)
                        : _delete(context, ref, t),
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: Text('Modifier'),
                      ),
                      PopupMenuItem(
                        value: 'delete',
                        enabled: t.tickets == 0,
                        child: Text(
                          t.tickets == 0
                              ? 'Supprimer'
                              : 'Supprimer (billets déjà émis)',
                        ),
                      ),
                    ],
                  ),
                  onTap: () => _edit(context, ref, t),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _TariffSheet extends ConsumerStatefulWidget {
  final String eventId;
  final String currency;
  final Tariff? tariff;
  const _TariffSheet({
    required this.eventId,
    required this.currency,
    this.tariff,
  });

  @override
  ConsumerState<_TariffSheet> createState() => _TariffSheetState();
}

class _TariffSheetState extends ConsumerState<_TariffSheet> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.tariff?.name);
  late final _price = TextEditingController(
    text: widget.tariff == null ? '' : _plain(widget.tariff!.price),
  );
  late final _quantity = TextEditingController(
    text: widget.tariff == null ? '' : '${widget.tariff!.quantity}',
  );
  late final _description = TextEditingController(
    text: widget.tariff?.description,
  );
  bool _saving = false;

  static String _plain(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  @override
  void dispose() {
    for (final c in [_name, _price, _quantity, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(eventAdminRepository)
          .saveTariff(widget.eventId, widget.tariff?.id, {
            'name': _name.text.trim(),
            'price': double.parse(_price.text.trim().replaceAll(',', '.')),
            'quantity': int.parse(_quantity.text.trim()),
            'description': _description.text.trim(),
            if (widget.tariff == null) 'currency': widget.currency,
          });
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
    final sold = widget.tariff == null
        ? 0
        : widget.tariff!.quantity - widget.tariff!.available;
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
                widget.tariff == null ? 'Nouveau tarif' : 'Modifier le tarif',
                style: zText(ZSize.h2, weight: ZWeight.black),
              ),
              const SizedBox(height: 18),
              ZField(
                label: 'Nom',
                controller: _name,
                hint: 'Standard, VIP, Étudiant…',
                textInputAction: TextInputAction.next,
                validator: (v) =>
                    (v ?? '').trim().isEmpty ? 'Nom requis' : null,
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: ZField(
                      label:
                          'Prix (${widget.tariff?.currency ?? widget.currency})',
                      controller: _price,
                      hint: '0 = gratuit',
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      validator: (v) =>
                          (double.tryParse(
                                    (v ?? '').trim().replaceAll(',', '.'),
                                  ) ??
                                  -1) <
                              0
                          ? 'Prix invalide'
                          : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ZField(
                      label: 'Quantité',
                      controller: _quantity,
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final n = int.tryParse((v ?? '').trim()) ?? 0;
                        if (n < 1) return 'Au moins 1';
                        if (n < sold) return 'Déjà $sold vendus';
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              ZField(
                label: 'Description (facultatif)',
                controller: _description,
                hint: 'Accès, avantages…',
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
