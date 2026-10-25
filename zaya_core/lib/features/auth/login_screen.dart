import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Sign-in with the ZAYA organizer account, then the authenticator code when the account
/// has two-step verification (mandatory for administrators).
class LoginScreen extends ConsumerStatefulWidget {
  final String? notice;
  const LoginScreen({super.key, this.notice});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _needsCode = false;
  bool _loading = false;
  bool _showPassword = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _error = widget.notice;
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final step = await ref
          .read(sessionProvider.notifier)
          .login(
            _email.text,
            _password.text,
            code: _needsCode ? _code.text : null,
          );
      if (step == LoginStep.needsCode && mounted) {
        setState(() => _needsCode = true);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Image.asset(
                        'assets/images/zaya_wordmark.png',
                        height: 30,
                        color: ZColors.ink,
                      ),
                      const SizedBox(height: 36),
                      Text(
                        _needsCode ? 'Code de vérification' : 'Connexion',
                        style: zText(
                          ZSize.display,
                          weight: ZWeight.black,
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _needsCode
                            ? 'Entrez le code à 6 chiffres affiché par votre application d’authentification.'
                            : 'Vos événements, vos ventes et vos entrées, en direct.',
                        style: zText(
                          ZSize.body,
                          color: ZColors.muted,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 32),
                      if (!_needsCode) ...[
                        ZField(
                          label: 'Adresse e-mail',
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.email],
                          validator: (v) => (v ?? '').contains('@')
                              ? null
                              : 'Adresse e-mail invalide',
                        ),
                        const SizedBox(height: 18),
                        ZField(
                          label: 'Mot de passe',
                          controller: _password,
                          obscureText: !_showPassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => _submit(),
                          validator: (v) =>
                              (v ?? '').isEmpty ? 'Mot de passe requis' : null,
                          suffix: IconButton(
                            tooltip: _showPassword ? 'Masquer' : 'Afficher',
                            icon: Icon(
                              _showPassword
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                              color: ZColors.muted,
                            ),
                            onPressed: () =>
                                setState(() => _showPassword = !_showPassword),
                          ),
                        ),
                      ] else
                        ZField(
                          label: 'Code',
                          controller: _code,
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          textAlign: TextAlign.center,
                          style: zText(
                            ZSize.h1,
                            weight: ZWeight.bold,
                          ).copyWith(letterSpacing: 8),
                          onSubmitted: (_) => _submit(),
                          validator: (v) =>
                              RegExp(r'^\d{6}$').hasMatch((v ?? '').trim())
                              ? null
                              : '6 chiffres',
                        ),
                      if (_error != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          _error!,
                          style: zText(
                            ZSize.body,
                            color: ZColors.red,
                            height: 1.4,
                          ),
                        ),
                      ],
                      const SizedBox(height: 28),
                      ZButton(
                        label: _needsCode ? 'Valider' : 'Se connecter',
                        loading: _loading,
                        onPressed: _submit,
                      ),
                      if (_needsCode) ...[
                        const SizedBox(height: 12),
                        Center(
                          child: TextButton(
                            onPressed: _loading
                                ? null
                                : () => setState(() {
                                    _needsCode = false;
                                    _code.clear();
                                    _error = null;
                                  }),
                            child: Text(
                              'Retour',
                              style: zText(ZSize.body, weight: ZWeight.medium),
                            ),
                          ),
                        ),
                      ] else ...[
                        const SizedBox(height: 22),
                        Text(
                          'Pas encore de compte ou mot de passe oublié ? Rendez-vous sur app.zaya.live.',
                          style: zText(
                            ZSize.small,
                            color: ZColors.muted,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
