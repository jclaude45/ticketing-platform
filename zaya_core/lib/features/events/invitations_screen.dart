import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'event_admin_data.dart';

void _toast(BuildContext context, String m) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

/// Free ticket emailed to a guest
class Invitation {
  final String id;
  final String serialNumber;
  final String holderName;
  final String holderEmail;
  final String status;
  final String tariff;
  final String emailStatus;
  final DateTime? checkedInAt;

  const Invitation({
    required this.id,
    required this.serialNumber,
    required this.holderName,
    required this.holderEmail,
    required this.status,
    required this.tariff,
    required this.emailStatus,
    required this.checkedInAt,
  });

  factory Invitation.fromJson(Map<String, dynamic> j) => Invitation(
    id: j['id'] as String,
    serialNumber: j['serialNumber'] as String? ?? '',
    holderName: j['holderName'] as String? ?? '',
    holderEmail: j['holderEmail'] as String? ?? '',
    status: j['status'] as String? ?? '',
    tariff: ((j['template'] as Map?)?['name'] ?? '').toString(),
    emailStatus: j['emailStatus'] as String? ?? '',
    checkedInAt: DateTime.tryParse(j['checkedInAt']?.toString() ?? ''),
  );
}

final invitationsProvider = FutureProvider.autoDispose
    .family<List<Invitation>, String>((ref, eventId) async {
      final list =
          await ApiClient.instance.get('/events/$eventId/invitations')
              as List<dynamic>;
      return list
          .map((i) => Invitation.fromJson(i as Map<String, dynamic>))
          .toList();
    });

/// Guests of an event: who was invited, whether the e-mail left, who came in
class InvitationsScreen extends ConsumerWidget {
  final String eventId;
  const InvitationsScreen({super.key, required this.eventId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(invitationsProvider(eventId));
    return Scaffold(
      appBar: AppBar(title: const Text('Invités')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: ZColors.ink,
        foregroundColor: ZColors.onInk,
        icon: const Icon(Icons.forward_to_inbox_outlined),
        label: const Text('Inviter'),
        onPressed: () async {
          final done = await showModalBottomSheet<String>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (_) => _InviteSheet(eventId: eventId),
          );
          if (done != null) {
            ref.invalidate(invitationsProvider(eventId));
            if (context.mounted) _toast(context, done);
          }
        },
      ),
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () => ref.refresh(invitationsProvider(eventId).future),
        child: list.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              SizedBox(
                height: 420,
                child: ZMessage.error(
                  e,
                  () => ref.invalidate(invitationsProvider(eventId)),
                ),
              ),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(
                    height: 420,
                    child: ZMessage(
                      icon: Icons.mail_outline,
                      title: 'Aucun invité',
                      text:
                          'Une invitation est un billet gratuit envoyé par e-mail, scanné à l’entrée comme les autres.',
                    ),
                  ),
                ],
              );
            }
            final came = items.where((i) => i.checkedInAt != null).length;
            return ListView(
              padding: const EdgeInsets.only(bottom: 100),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  child: Text(
                    '${items.length} invité${items.length > 1 ? 's' : ''} · $came entré${came > 1 ? 's' : ''}',
                    style: zText(ZSize.body, color: ZColors.muted),
                  ),
                ),
                ...items.map((i) {
                  final (label, color) = i.checkedInAt != null
                      ? ('Entré', ZColors.green)
                      : i.status == 'CANCELLED'
                      ? ('Annulé', ZColors.muted)
                      : switch (i.emailStatus) {
                          'FAILED' ||
                          'BOUNCED' => ('E-mail en échec', ZColors.red),
                          'SENT' ||
                          'DELIVERED' ||
                          'OPENED' => ('Envoyé', ZColors.ink),
                          _ => ('En cours', ZColors.muted),
                        };
                  return ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(20, 2, 8, 2),
                    title: Text(
                      i.holderName,
                      style: zText(ZSize.body, weight: ZWeight.bold),
                    ),
                    subtitle: Text(
                      '${i.holderEmail}\n${i.tariff}${i.checkedInAt != null ? ' · ${Fmt.dayTime(i.checkedInAt!)}' : ''}',
                      style: zText(
                        ZSize.small,
                        color: ZColors.muted,
                        height: 1.4,
                      ),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ZPill(
                          label,
                          color: color,
                          textColor: color == ZColors.ink
                              ? ZColors.onInk
                              : null,
                        ),
                        if (i.status != 'CANCELLED')
                          IconButton(
                            tooltip: 'Renvoyer l’e-mail',
                            icon: const Icon(Icons.refresh_rounded),
                            onPressed: () async {
                              try {
                                await ApiClient.instance.post(
                                  '/events/$eventId/invitations/${i.id}/resend',
                                );
                                ref.invalidate(invitationsProvider(eventId));
                                if (context.mounted) {
                                  _toast(
                                    context,
                                    'Invitation renvoyée à ${i.holderEmail}.',
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  _toast(context, ApiException.from(e).message);
                                }
                              }
                            },
                          ),
                      ],
                    ),
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InviteSheet extends ConsumerStatefulWidget {
  final String eventId;
  const _InviteSheet({required this.eventId});

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _form = GlobalKey<FormState>();
  final _guests = [(TextEditingController(), TextEditingController())];
  final _message = TextEditingController();
  String? _tariffId;
  bool _sending = false;

  @override
  void dispose() {
    for (final (n, e) in _guests) {
      n.dispose();
      e.dispose();
    }
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!(_form.currentState?.validate() ?? false) || _tariffId == null) return;
    setState(() => _sending = true);
    try {
      final r =
          await ApiClient.instance.post(
                '/events/${widget.eventId}/invitations',
                {
                  'templateId': _tariffId,
                  'guests': _guests
                      .map(
                        (g) => {
                          'name': g.$1.text.trim(),
                          'email': g.$2.text.trim().toLowerCase(),
                        },
                      )
                      .toList(),
                  if (_message.text.trim().isNotEmpty)
                    'message': _message.text.trim(),
                },
              )
              as Map<String, dynamic>;
      final created = (r['created'] as num?)?.toInt() ?? 0;
      final skipped = (r['skipped'] as List?)?.length ?? 0;
      final failed = (r['errors'] as List?)?.length ?? 0;
      if (mounted) {
        Navigator.pop(
          context,
          [
            '$created invitation${created > 1 ? 's' : ''} envoyée${created > 1 ? 's' : ''}',
            if (skipped > 0) '$skipped déjà invité${skipped > 1 ? 's' : ''}',
            if (failed > 0) '$failed en erreur',
          ].join(' · '),
        );
      }
    } catch (e) {
      if (mounted) _toast(context, ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tariffs =
        ref.watch(tariffsProvider(widget.eventId)).valueOrNull ?? [];
    _tariffId ??= tariffs.isEmpty ? null : tariffs.first.id;
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
              Text('Inviter', style: zText(ZSize.h2, weight: ZWeight.black)),
              const SizedBox(height: 4),
              Text(
                'Chaque invité reçoit par e-mail un billet gratuit à présenter à l’entrée.',
                style: zText(ZSize.small, color: ZColors.muted, height: 1.4),
              ),
              const SizedBox(height: 16),
              Text(
                'Type de billet',
                style: zText(
                  ZSize.small,
                  weight: ZWeight.medium,
                  color: ZColors.muted,
                ),
              ),
              const SizedBox(height: 6),
              if (tariffs.isEmpty)
                Text(
                  'Ajoutez d’abord un tarif à l’événement.',
                  style: zText(ZSize.body, color: ZColors.red),
                )
              else
                DropdownButtonFormField<String>(
                  initialValue: _tariffId,
                  items: tariffs
                      .map(
                        (t) =>
                            DropdownMenuItem(value: t.id, child: Text(t.name)),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _tariffId = v),
                ),
              const SizedBox(height: 16),
              for (var k = 0; k < _guests.length; k++) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: ZField(
                        label: 'Nom',
                        controller: _guests[k].$1,
                        validator: (v) =>
                            (v ?? '').trim().isEmpty ? 'Requis' : null,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ZField(
                        label: 'E-mail',
                        controller: _guests[k].$2,
                        keyboardType: TextInputType.emailAddress,
                        validator: (v) =>
                            (v ?? '').contains('@') ? null : 'Invalide',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ],
              TextButton.icon(
                onPressed: () => setState(
                  () => _guests.add((
                    TextEditingController(),
                    TextEditingController(),
                  )),
                ),
                icon: const Icon(Icons.add),
                label: const Text('Ajouter un invité'),
              ),
              const SizedBox(height: 6),
              ZField(
                label: 'Message (facultatif)',
                controller: _message,
                hint: 'Affiché dans l’e-mail',
              ),
              const SizedBox(height: 20),
              ZButton(
                label: _guests.length > 1
                    ? 'Envoyer ${_guests.length} invitations'
                    : 'Envoyer l’invitation',
                loading: _sending,
                onPressed: tariffs.isEmpty ? null : _send,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
