import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Opens the sign-in (number → code → name the first time); true once signed in
Future<bool> signIn(BuildContext context) async =>
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => const PhoneScreen()),
    ) ==
    true;

/// Sends the code to a typed number and opens the code step; true once signed in
Future<bool> sendCodeAndVerify(
  BuildContext context,
  WidgetRef ref,
  String typed,
  ValueChanged<String?> onError,
) async {
  try {
    final r = await ref
        .read(sessionProvider.notifier)
        .requestCode(ZPhoneField.international(typed));
    if (!context.mounted) return false;
    return await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder: (_) => CodeScreen(phone: r.phone, resendIn: r.resendIn),
          ),
        ) ==
        true;
  } on ApiException catch (e) {
    onError(e.message);
    return false;
  }
}

/// The number, when signing in from the app (the welcome screen has its own)
class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  final _phone = TextEditingController();
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_phone.text.trim().isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final done = await sendCodeAndVerify(
      context,
      ref,
      _phone.text,
      (e) => setState(() => _error = e),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (done) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          children: [
            const Align(alignment: Alignment.centerLeft, child: ZLogo(size: 30, withName: false)),
            const SizedBox(height: 20),
            Text(s.phoneTitle, style: zText(ZSize.display, weight: ZWeight.bold)),
            const SizedBox(height: 8),
            Text(s.signInToBuy, style: zText(ZSize.body, color: ZColors.muted, height: 1.5)),
            const SizedBox(height: 28),
            ZLabel(s.phoneLabel),
            ZPhoneField(
              controller: _phone,
              autofocus: true,
              errorText: _error,
              onSubmitted: (_) => _send(),
            ),
            const SizedBox(height: 20),
            ZButton(label: s.sendCode, loading: _busy, onPressed: _send),
            const SizedBox(height: 12),
            Center(child: Text(s.codeNote, style: zText(ZSize.small, color: ZColors.muted))),
          ],
        ),
      ),
    );
  }
}

class CodeScreen extends ConsumerStatefulWidget {
  final String phone;
  final int resendIn;

  const CodeScreen({super.key, required this.phone, required this.resendIn});

  @override
  ConsumerState<CodeScreen> createState() => _CodeScreenState();
}

class _CodeScreenState extends ConsumerState<CodeScreen> {
  final _code = TextEditingController();
  var _busy = false;
  String? _error;
  late int _wait = widget.resendIn;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _tick();
  }

  void _tick() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_wait <= 1) t.cancel();
      setState(() => _wait = _wait > 0 ? _wait - 1 : 0);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_code.text.length != 6 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref
          .read(sessionProvider.notifier)
          .verify(widget.phone, _code.text);
      if (!mounted) return;
      if (r.needsName) {
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const NameScreen()),
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _code.clear();
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _error = null);
    try {
      final r = await ref.read(sessionProvider.notifier).requestCode(widget.phone);
      setState(() => _wait = r.resendIn);
      _tick();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          children: [
            Text(s.codeTitle, style: zText(ZSize.display, weight: ZWeight.bold)),
            const SizedBox(height: 8),
            Text(
              s.codeSentTo(Fmt.phone(widget.phone)),
              style: zText(ZSize.body, color: ZColors.muted, height: 1.5),
            ),
            const SizedBox(height: 28),
            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              // iOS offers the code of the SMS above the keyboard
              autofillHints: const [AutofillHints.oneTimeCode],
              textAlign: TextAlign.center,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              onChanged: (v) {
                if (v.length == 6) _verify();
              },
              cursorColor: ZColors.orange,
              style: zText(ZSize.display, weight: ZWeight.bold).copyWith(letterSpacing: 12),
              decoration: InputDecoration(
                hintText: '••••••',
                errorText: _error,
                errorMaxLines: 3,
              ),
            ),
            const SizedBox(height: 20),
            ZButton(label: s.verify, loading: _busy, onPressed: _verify),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: _wait > 0 ? null : _resend,
                child: Text(
                  _wait > 0 ? s.resendIn(_wait) : s.resend,
                  style: zText(
                    ZSize.body,
                    weight: ZWeight.bold,
                    color: _wait > 0 ? ZColors.muted : ZColors.orangeText,
                  ),
                ),
              ),
            ),
            Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(s.changeNumber, style: zText(ZSize.body, color: ZColors.muted)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Asked once, after the first sign-in (and before a first purchase): the name on the tickets
class NameScreen extends ConsumerStatefulWidget {
  const NameScreen({super.key});

  @override
  ConsumerState<NameScreen> createState() => _NameScreenState();
}

class _NameScreenState extends ConsumerState<NameScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).update({
        'firstName': _first.text.trim(),
        'lastName': _last.text.trim(),
      });
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(s.later, style: zText(ZSize.body, color: ZColors.muted)),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
            children: [
              Text(s.nameTitle, style: zText(ZSize.display, weight: ZWeight.bold)),
              const SizedBox(height: 8),
              Text(s.nameHelp, style: zText(ZSize.body, color: ZColors.muted, height: 1.5)),
              const SizedBox(height: 28),
              ZField(
                label: s.firstName,
                controller: _first,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.givenName],
                validator: (v) => (v ?? '').trim().isEmpty ? s.required : null,
              ),
              const SizedBox(height: 16),
              ZField(
                label: s.lastName,
                controller: _last,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.familyName],
                onSubmitted: (_) => _save(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: zText(ZSize.small, color: ZColors.red)),
              ],
              const SizedBox(height: 24),
              ZButton(label: s.continueLabel, loading: _busy, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}
