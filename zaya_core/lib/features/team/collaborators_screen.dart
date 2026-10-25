import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'team_data.dart';

void _toast(BuildContext context, String m) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

/// People invited to work on this organizer account, with what each may do
class CollaboratorsScreen extends ConsumerWidget {
  const CollaboratorsScreen({super.key});

  Future<void> _sheet(
    BuildContext context,
    WidgetRef ref, [
    Collaborator? c,
  ]) async {
    final done = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CollaboratorSheet(collaborator: c),
    );
    if (done != null) {
      ref.invalidate(collaboratorsProvider);
      if (context.mounted) _toast(context, done);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(collaboratorsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Collaborateurs')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: ZColors.ink,
        foregroundColor: ZColors.onInk,
        icon: const Icon(Icons.person_add_alt_1_outlined),
        label: const Text('Inviter'),
        onPressed: () => _sheet(context, ref),
      ),
      body: RefreshIndicator(
        color: ZColors.ink,
        onRefresh: () => ref.refresh(collaboratorsProvider.future),
        child: list.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              SizedBox(
                height: 420,
                child: ZMessage.error(
                  e,
                  () => ref.invalidate(collaboratorsProvider),
                ),
              ),
            ],
          ),
          data: (items) => items.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(
                      height: 420,
                      child: ZMessage(
                        icon: Icons.groups_outlined,
                        title: 'Vous gérez seul',
                        text:
                            'Invitez un associé ou un employé : il accède à vos événements avec son propre compte ZAYA.',
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.only(bottom: 100),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const Divider(indent: 20, endIndent: 20),
                  itemBuilder: (_, i) {
                    final c = items[i];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 4,
                      ),
                      title: Text(
                        c.name ?? c.email,
                        style: zText(ZSize.body, weight: ZWeight.bold),
                      ),
                      subtitle: Text(
                        [
                          if (c.name != null) c.email,
                          permissionLabels[c.permission] ?? c.permission,
                        ].join('\n'),
                        style: zText(
                          ZSize.small,
                          color: ZColors.muted,
                          height: 1.4,
                        ),
                      ),
                      trailing: c.pending
                          ? ZPill('En attente', color: ZColors.muted)
                          : null,
                      onTap: () => _sheet(context, ref, c),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class _CollaboratorSheet extends ConsumerStatefulWidget {
  final Collaborator? collaborator;
  const _CollaboratorSheet({this.collaborator});

  @override
  ConsumerState<_CollaboratorSheet> createState() => _CollaboratorSheetState();
}

class _CollaboratorSheetState extends ConsumerState<_CollaboratorSheet> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  late String _permission = widget.collaborator?.permission ?? 'TICKETING';
  bool _busy = false;

  bool get _editing => widget.collaborator != null;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) Navigator.pop(context, done);
    } catch (e) {
      if (mounted) _toast(context, ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = ref.read(teamRepository);
    final c = widget.collaborator;
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
                _editing ? (c!.name ?? c.email) : 'Inviter un collaborateur',
                style: zText(ZSize.h2, weight: ZWeight.black),
              ),
              if (_editing && c!.pending)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'L’accès s’active dès que cette personne se connecte à ZAYA avec ${c.email}.',
                    style: zText(ZSize.small, color: ZColors.muted),
                  ),
                ),
              const SizedBox(height: 16),
              if (!_editing) ...[
                ZField(
                  label: 'E-mail',
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  validator: (v) =>
                      (v ?? '').contains('@') ? null : 'E-mail invalide',
                ),
                const SizedBox(height: 12),
              ],
              Text(
                'Ce qu’il peut faire',
                style: zText(
                  ZSize.small,
                  weight: ZWeight.medium,
                  color: ZColors.muted,
                ),
              ),
              RadioGroup<String>(
                groupValue: _permission,
                onChanged: (v) =>
                    setState(() => _permission = v ?? _permission),
                child: Column(
                  children: permissionLabels.entries
                      .map(
                        (e) => RadioListTile<String>(
                          value: e.key,
                          contentPadding: EdgeInsets.zero,
                          title: Text(e.value),
                          subtitle: Text(
                            permissionHints[e.key]!,
                            style: zText(ZSize.small, color: ZColors.muted),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              const SizedBox(height: 16),
              ZButton(
                label: _editing ? 'Enregistrer' : 'Envoyer l’invitation',
                loading: _busy,
                onPressed: () {
                  if (_editing) {
                    _run(
                      () => repo.setPermission(c!.id, _permission),
                      'Accès mis à jour.',
                    );
                  } else if (_form.currentState?.validate() ?? false) {
                    _run(
                      () => repo.inviteCollaborator(_email.text, _permission),
                      'Invitation envoyée par e-mail.',
                    );
                  }
                },
              ),
              if (_editing) ...[
                const SizedBox(height: 8),
                Center(
                  child: TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: ZColors.red),
                    icon: const Icon(Icons.person_remove_outlined),
                    label: const Text('Retirer l’accès'),
                    onPressed: _busy
                        ? null
                        : () => _run(
                            () => repo.removeCollaborator(c!.id),
                            'Accès retiré.',
                          ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
