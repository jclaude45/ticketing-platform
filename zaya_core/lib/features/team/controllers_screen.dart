import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../events/events_data.dart';
import 'team_data.dart';

void _toast(BuildContext context, String m) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

/// People who scan tickets at the entrance with zcontrole: invite, assign to events, pause
class ControllersScreen extends ConsumerWidget {
  const ControllersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controllers = ref.watch(controllersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Contrôleurs')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: ZColors.ink,
        foregroundColor: ZColors.onInk,
        icon: const Icon(Icons.person_add_alt_1_outlined),
        label: const Text('Inviter'),
        onPressed: () async {
          final ok = await showModalBottomSheet<bool>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (_) => const _InviteSheet(),
          );
          if (ok == true) {
            ref.invalidate(controllersProvider);
            if (context.mounted) {
              _toast(context, 'Invitation envoyée par e-mail.');
            }
          }
        },
      ),
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () => ref.refresh(controllersProvider.future),
        child: controllers.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              SizedBox(
                height: 420,
                child: ZMessage.error(
                  e,
                  () => ref.invalidate(controllersProvider),
                ),
              ),
            ],
          ),
          data: (list) => list.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(
                      height: 420,
                      child: ZMessage(
                        icon: Icons.qr_code_scanner_rounded,
                        title: 'Aucun contrôleur',
                        text:
                            'Invitez les personnes qui scanneront les billets à l’entrée avec l’application zcontrole.',
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.only(bottom: 100),
                  itemCount: list.length,
                  separatorBuilder: (_, _) =>
                      const Divider(indent: 20, endIndent: 20),
                  itemBuilder: (_, i) {
                    final c = list[i];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 4,
                      ),
                      leading: CircleAvatar(
                        backgroundColor: c.isActive
                            ? ZColors.yellow
                            : ZColors.surface,
                        child: Text(
                          c.name.isEmpty ? '?' : c.name[0].toUpperCase(),
                          style: zText(
                            ZSize.body,
                            weight: ZWeight.bold,
                            color: c.isActive
                                ? ZColors.onYellow
                                : ZColors.muted,
                          ),
                        ),
                      ),
                      title: Text(
                        c.name,
                        style: zText(ZSize.body, weight: ZWeight.bold),
                      ),
                      subtitle: Text(
                        [
                          c.email,
                          '${c.eventsCount} événement${c.eventsCount > 1 ? 's' : ''} · ${Fmt.count(c.totalScans)} scan${c.totalScans > 1 ? 's' : ''}',
                        ].join('\n'),
                        style: zText(
                          ZSize.small,
                          color: ZColors.muted,
                          height: 1.4,
                        ),
                      ),
                      trailing: c.isActive
                          ? null
                          : ZPill(
                              c.invitationPending ? 'Invité' : 'Désactivé',
                              color: ZColors.muted,
                            ),
                      onTap: () async {
                        await showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          showDragHandle: true,
                          builder: (_) => _ControllerSheet(controller: c),
                        );
                        ref.invalidate(controllersProvider);
                      },
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class _InviteSheet extends ConsumerStatefulWidget {
  const _InviteSheet();

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _events = <String>{};
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(teamRepository)
          .inviteController(_name.text, _email.text, _events.toList());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) _toast(context, ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final events =
        ref
            .watch(eventsProvider)
            .valueOrNull
            ?.where((e) => !e.isPast && e.status != 'CANCELLED')
            .toList() ??
        [];
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
                'Inviter un contrôleur',
                style: zText(ZSize.h2, weight: ZWeight.black),
              ),
              const SizedBox(height: 6),
              Text(
                'Il reçoit un e-mail pour choisir son mot de passe, puis se connecte à zcontrole.',
                style: zText(ZSize.small, color: ZColors.muted, height: 1.4),
              ),
              const SizedBox(height: 16),
              ZField(
                label: 'Nom',
                controller: _name,
                hint: 'Porte A, Marie…',
                validator: (v) =>
                    (v ?? '').trim().isEmpty ? 'Nom requis' : null,
              ),
              const SizedBox(height: 14),
              ZField(
                label: 'E-mail',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                validator: (v) =>
                    (v ?? '').contains('@') ? null : 'E-mail invalide',
              ),
              if (events.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Événements à contrôler',
                  style: zText(
                    ZSize.small,
                    weight: ZWeight.medium,
                    color: ZColors.muted,
                  ),
                ),
                ...events.map(
                  (e) => CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _events.contains(e.id),
                    title: Text(e.name, style: zText(ZSize.body)),
                    subtitle: Text(
                      Fmt.day(e.startDate),
                      style: zText(ZSize.small, color: ZColors.muted),
                    ),
                    onChanged: (v) => setState(
                      () =>
                          v == true ? _events.add(e.id) : _events.remove(e.id),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              ZButton(
                label: 'Envoyer l’invitation',
                loading: _saving,
                onPressed: _send,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One controller: pause or resume, the events they can scan, removal
class _ControllerSheet extends ConsumerStatefulWidget {
  final ControllerMember controller;
  const _ControllerSheet({required this.controller});

  @override
  ConsumerState<_ControllerSheet> createState() => _ControllerSheetState();
}

class _ControllerSheetState extends ConsumerState<_ControllerSheet> {
  Set<String>? _assigned;
  late bool _active = widget.controller.isActive;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    ref
        .read(teamRepository)
        .controllerEvents(widget.controller.id)
        .then((s) {
          if (mounted) setState(() => _assigned = s);
        })
        .catchError((Object e) {
          if (mounted) _toast(context, ApiException.from(e).message);
        });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) _toast(context, ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final repo = ref.read(teamRepository);
    final events =
        ref
            .watch(eventsProvider)
            .valueOrNull
            ?.where((e) => e.status != 'CANCELLED')
            .toList() ??
        [];
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(c.name, style: zText(ZSize.h2, weight: ZWeight.black)),
            Text(c.email, style: zText(ZSize.small, color: ZColors.muted)),
            if (c.invitationPending)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Invitation pas encore acceptée.',
                  style: zText(ZSize.small, color: ZColors.orange),
                ),
              ),
            const SizedBox(height: 8),
            if (!c.invitationPending)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Accès actif'),
                subtitle: const Text(
                  'Désactivé, il ne peut plus se connecter à zcontrole',
                ),
                value: _active,
                onChanged: _busy
                    ? null
                    : (v) => _run(() async {
                        await repo.setControllerActive(c.id, v);
                        setState(() => _active = v);
                      }),
              ),
            const SizedBox(height: 8),
            Text(
              'Peut contrôler',
              style: zText(
                ZSize.small,
                weight: ZWeight.medium,
                color: ZColors.muted,
              ),
            ),
            if (_assigned == null)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              ...events.map(
                (e) => CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _assigned!.contains(e.id),
                  title: Text(e.name, style: zText(ZSize.body)),
                  subtitle: Text(
                    Fmt.day(e.startDate),
                    style: zText(ZSize.small, color: ZColors.muted),
                  ),
                  onChanged: _busy
                      ? null
                      : (v) => _run(() async {
                          if (v == true) {
                            await repo.assign(c.id, e.id);
                            setState(() => _assigned!.add(e.id));
                          } else {
                            await repo.unassign(c.id, e.id);
                            setState(() => _assigned!.remove(e.id));
                          }
                        }),
                ),
              ),
            const SizedBox(height: 16),
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: ZColors.red),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Retirer ce contrôleur'),
              onPressed: _busy
                  ? null
                  : () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (d) => AlertDialog(
                          title: Text('Retirer ${c.name} ?'),
                          content: const Text(
                            'Il ne pourra plus scanner vos billets. S’il a déjà scanné, il est désactivé et ses scans restent dans vos statistiques.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(d, false),
                              child: const Text('Annuler'),
                            ),
                            TextButton(
                              onPressed: () => Navigator.pop(d, true),
                              child: const Text(
                                'Retirer',
                                style: TextStyle(color: ZColors.red),
                              ),
                            ),
                          ],
                        ),
                      );
                      if (ok != true) return;
                      String? done;
                      await _run(
                        () async => done = await repo.deleteController(c.id),
                      );
                      if (context.mounted && done != null) {
                        Navigator.pop(context);
                        _toast(context, done!);
                      }
                    },
            ),
          ],
        ),
      ),
    );
  }
}
