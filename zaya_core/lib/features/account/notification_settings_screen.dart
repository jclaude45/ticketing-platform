import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

final _prefsProvider = FutureProvider.autoDispose<Map<String, bool>>((
  ref,
) async {
  final d =
      await ApiClient.instance.get('/users/me/notification-prefs')
          as Map<String, dynamic>;
  return d.map((k, v) => MapEntry(k, v == true));
});

const _push = [
  (
    'pushOnSale',
    'Chaque vente',
    'Montant et nombre de billets, dès que le paiement est confirmé',
  ),
  (
    'pushOnEventFull',
    'Événement complet',
    'Quand tous les billets sont vendus',
  ),
  ('pushOnFraud', 'Tentative de fraude', 'Un faux billet présenté à l’entrée'),
  ('pushWeeklyReport', 'Rapport de la semaine', 'Chaque lundi matin'),
];

const _email = [
  (
    'emailOnScan',
    'Résumé des scans',
    'Les entrées, regroupées tous les quarts d’heure',
  ),
  (
    'emailOnEventFull',
    'Événement complet',
    'Quand tous les billets sont vendus',
  ),
  ('emailOnFraud', 'Tentative de fraude', 'Alerte immédiate'),
  (
    'emailWeeklyReport',
    'Rapport hebdomadaire',
    'Ventes, entrées et prochains événements, le lundi',
  ),
];

/// Which alerts reach this phone and the mailbox (same settings as on the web)
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  final _changed = <String, bool>{};

  Future<void> _set(String key, bool value) async {
    setState(() => _changed[key] = value);
    try {
      await ApiClient.instance.patch('/users/me/notification-prefs', {
        key: value,
      });
    } catch (e) {
      setState(() => _changed.remove(key));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiException.from(e).message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(_prefsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: prefs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            ZMessage.error(e, () => ref.invalidate(_prefsProvider)),
        data: (p) {
          Widget tile((String, String, String) t) => SwitchListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            title: Text(t.$2, style: zText(ZSize.body, weight: ZWeight.medium)),
            subtitle: Text(
              t.$3,
              style: zText(ZSize.small, color: ZColors.muted),
            ),
            value: _changed[t.$1] ?? p[t.$1] ?? false,
            onChanged: (v) => _set(t.$1, v),
          );
          return ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              const ZSection('Sur ce téléphone'),
              ..._push.map(tile),
              const ZSection('Par e-mail'),
              ..._email.map(tile),
            ],
          );
        },
      ),
    );
  }
}
