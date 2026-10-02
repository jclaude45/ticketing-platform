import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/colors.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../providers/auth_provider.dart';

/// "Bienvenue": controller email + password.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    final ok = await ref.read(authNotifierProvider.notifier).login(email: _email.text.trim(), password: _password.text);
    if (ok && mounted) Navigator.pushNamedAndRemoveUntil(context, '/events', (_) => false);
  }

  /// Opened after a session expiry, there is no welcome screen behind
  void _back() {
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      Navigator.pushReplacementNamed(context, '/welcome');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authNotifierProvider);
    final error = auth.errorMessage;

    return ZcPatternScaffold(
      sheetTop: 0.42,
      child: Form(
        key: _formKey,
        child: ZcFillScroll(
          padding: const EdgeInsets.symmetric(horizontal: 42),
          children: [
            const SizedBox(height: 40),
            ZcBackButton(onPressed: _back),
            const SizedBox(height: 40),
            Text('Bienvenue', style: zcText(ZcSize.display, weight: FontWeight.w700, height: 1.2)),
            const SizedBox(height: 40),
            ZcTextField(
              controller: _email,
              hint: 'Email',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.email],
              enabled: !auth.isLoading,
              onChanged: (_) => ref.read(authNotifierProvider.notifier).clearError(),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return "L'email est obligatoire";
                if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim())) return 'Email invalide';
                return null;
              },
            ),
            const SizedBox(height: 33),
            ZcTextField(
              controller: _password,
              hint: 'Mot de passe',
              obscureText: _obscure,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.password],
              enabled: !auth.isLoading,
              onChanged: (_) => ref.read(authNotifierProvider.notifier).clearError(),
              onSubmitted: (_) => _login(),
              suffixIcon: IconButton(
                tooltip: _obscure ? 'Afficher' : 'Masquer',
                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: AppColors.hint, size: 20),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
              validator: (v) => v == null || v.isEmpty ? 'Le mot de passe est obligatoire' : null,
            ),
            if (error != null && error.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(error, textAlign: TextAlign.center, style: zcText(ZcSize.small, color: AppColors.usedRed)),
            ],
            const SizedBox(height: 33),
            ZcButton(label: 'Connexion', loading: auth.isLoading, onPressed: _login),
            const Spacer(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}
