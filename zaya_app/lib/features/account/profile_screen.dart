import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/language.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../auth/sign_in_screens.dart';

/// « Profil »: language (also without an account), name, consents, sign-out, deletion
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final session = ref.watch(sessionProvider);
    final customer = session is SignedIn ? session.customer : null;
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          ZPageHeader(title: s.profileTitle),
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: customer == null
                ? ZCard(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.profileSignedOut,
                          style: zText(ZSize.body, color: ZColors.muted, height: 1.5),
                        ),
                        const SizedBox(height: 16),
                        ZButton(label: s.signIn, onPressed: () => signIn(context)),
                      ],
                    ),
                  )
                : ZCard(
                    onTap: () => _editName(context, ref, customer),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 26,
                          backgroundColor: ZColors.orangeSoft,
                          child: Text(
                            customer.fullName.isEmpty ? 'Z' : customer.fullName.characters.first.toUpperCase(),
                            style: zText(ZSize.h2, weight: ZWeight.bold, color: ZColors.orangeText),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                customer.fullName.isEmpty ? '—' : customer.fullName,
                                style: zText(ZSize.h3, weight: ZWeight.bold),
                              ),
                              const SizedBox(height: 3),
                              Text(Fmt.phone(customer.phone), style: zText(ZSize.body, color: ZColors.muted)),
                            ],
                          ),
                        ),
                        Icon(Icons.edit_outlined, size: 20, color: ZColors.muted),
                      ],
                    ),
                  ),
          ),
          ZSection(s.language),
          const _LanguagePicker(),
          if (customer != null) ...[
            ZSection(s.consents, subtitle: s.consentsHelp),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: ZCard(
                padding: const EdgeInsets.symmetric(vertical: 4),
                // Location and friends' visibility come with « Près de moi », the posters and profiles
                child: _Consent(
                  'promoNotifications',
                  s.promoNotifications,
                  s.promoNotificationsHelp,
                  customer.promoNotifications,
                ),
              ),
            ),
            const SizedBox(height: 28),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: ZButton(
                label: s.signOut,
                style: ZButtonStyle.outline,
                onPressed: () => ref.read(sessionProvider.notifier).logout(),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: () => _delete(context, ref),
                child: Text(
                  s.deleteAccount,
                  style: zText(ZSize.body, weight: ZWeight.semibold, color: ZColors.red),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _editName(BuildContext context, WidgetRef ref, Customer c) async {
    final s = S.of(context);
    final first = TextEditingController(text: c.firstName ?? '');
    final last = TextEditingController(text: c.lastName ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.editName),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ZField(label: s.firstName, controller: first),
            const SizedBox(height: 12),
            ZField(label: s.lastName, controller: last),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.cancel)),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.save)),
        ],
      ),
    );
    if (ok == true && first.text.trim().isNotEmpty && context.mounted) {
      await _run(context, () => ref.read(sessionProvider.notifier).update({
        'firstName': first.text.trim(),
        'lastName': last.text.trim(),
      }));
    }
    first.dispose();
    last.dispose();
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final s = S.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.deleteAccount),
        content: Text(s.deleteAccountText),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.cancel)),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(s.delete, style: TextStyle(color: ZColors.red)),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      await _run(context, () => ref.read(sessionProvider.notifier).deleteAccount());
    }
  }
}

/// Runs a change; its error goes to a snackbar
Future<void> _run(BuildContext context, Future<Object?> Function() action) async {
  try {
    await action();
  } on ApiException catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _LanguagePicker extends ConsumerWidget {
  const _LanguagePicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final current = ref.watch(languageProvider).languageCode;
    void choose(String code) => ref.read(languageProvider.notifier).choose(code);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        children: [
          Expanded(child: ZChip(label: s.french, fill: true, selected: current == 'fr', onTap: () => choose('fr'))),
          const SizedBox(width: 10),
          Expanded(child: ZChip(label: s.lingalaName, fill: true, selected: current == 'ln', onTap: () => choose('ln'))),
        ],
      ),
    );
  }
}

/// A consent: off until the person turns it on, effective at once both ways
class _Consent extends ConsumerWidget {
  final String field;
  final String title;
  final String? help;
  final bool value;

  const _Consent(this.field, this.title, this.help, this.value);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SwitchListTile.adaptive(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      title: Text(title, style: zText(ZSize.body, weight: ZWeight.semibold)),
      subtitle: help == null
          ? null
          : Text(help!, style: zText(ZSize.small, color: ZColors.muted)),
      value: value,
      activeTrackColor: ZColors.orange,
      onChanged: (v) => _run(
        context,
        () => ref.read(sessionProvider.notifier).update({field: v}),
      ),
    );
  }
}
