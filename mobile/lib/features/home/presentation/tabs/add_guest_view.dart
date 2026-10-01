import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../guests/data/guests_repository.dart';
import '../home_shell.dart';

/// "Ajouter invité": invitation ticket(s) created on the server and emailed to the guest.
class AddGuestView extends ConsumerStatefulWidget {
  final String eventId;
  final VoidCallback onClose;

  const AddGuestView({super.key, required this.eventId, required this.onClose});

  @override
  ConsumerState<AddGuestView> createState() => _AddGuestViewState();
}

class _AddGuestViewState extends ConsumerState<AddGuestView> {
  static const _maxGuests = 10;

  final _formKey = GlobalKey<FormState>();
  final _lastName = TextEditingController();
  final _firstName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  int? _count;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_lastName, _firstName, _email, _phone, _address]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _required(String? v) => v == null || v.trim().isEmpty ? 'Obligatoire' : null;

  Future<void> _invite() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final email = _email.text.trim();
      final created = await getIt<GuestsRepository>().add(
        widget.eventId,
        lastName: _lastName.text.trim(),
        firstName: _firstName.text.trim(),
        email: email,
        phone: _phone.text.trim(),
        address: _address.text.trim(),
        count: _count ?? 1,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Invitation envoyée à $email ($created billet${created > 1 ? 's' : ''})'),
        backgroundColor: AppColors.validGreen,
      ));
      widget.onClose();
      // The new tickets join the list on the phone
      refreshEvent(ref, widget.eventId);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: AppColors.usedRed));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 26);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) widget.onClose();
      },
      child: SafeArea(
        bottom: false,
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(44, 12, 44, 24),
            children: [
              Row(
                children: [
                  IconButton(
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Retour',
                    icon: Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: AppColors.ink),
                    onPressed: widget.onClose,
                  ),
                  const SizedBox(width: 8),
                  Text('Ajouter invité', style: zcText(14, color: AppColors.grey)),
                ],
              ),
              const SizedBox(height: 28),
              ZcTextField(
                controller: _lastName,
                hint: 'Nom',
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                validator: _required,
              ),
              gap,
              ZcTextField(
                controller: _firstName,
                hint: 'Prénom',
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                validator: _required,
              ),
              gap,
              ZcTextField(
                controller: _email,
                hint: 'Email',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return "Obligatoire : l'invitation est envoyée par email";
                  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim())) return 'Email invalide';
                  return null;
                },
              ),
              gap,
              ZcTextField(
                controller: _phone,
                hint: 'Numéro Téléphone',
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
              ),
              gap,
              ZcTextField(
                controller: _address,
                hint: 'Adresse',
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.done,
              ),
              gap,
              ZcDropdown<int>(
                hint: "Nombre d'invités",
                value: _count,
                chevronColor: AppColors.ink,
                items: [
                  for (var n = 1; n <= _maxGuests; n++)
                    DropdownMenuItem(value: n, child: Text(n == 1 ? '1 personne' : '$n personnes')),
                ],
                onChanged: (v) => setState(() => _count = v),
              ),
              const SizedBox(height: 51),
              ZcButton(label: 'Inviter', loading: _busy, onPressed: _invite),
            ],
          ),
        ),
      ),
    );
  }
}
