import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/i18n.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../auth/sign_in_screens.dart';

/// Whether the welcome screen was passed on this phone; null while it is being read
final welcomedProvider = NotifierProvider<WelcomedController, bool?>(
  WelcomedController.new,
);

class WelcomedController extends Notifier<bool?> {
  @override
  bool? build() {
    SecureStore.instance.welcomed.then((v) => state = v);
    return null;
  }

  Future<void> done() async {
    state = true;
    await SecureStore.instance.saveWelcomed();
  }
}

/// Opening screen: the « Z », the city, the motto
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      body: SafeArea(
        child: SizedBox(
          width: double.infinity,
          child: Column(
            children: [
              const Spacer(flex: 3),
              const ZLogo(size: 104, withName: false),
              const SizedBox(height: 28),
              Text(
                'ZAYA',
                style: zText(
                  40,
                  weight: ZWeight.bold,
                ).copyWith(letterSpacing: 1),
              ),
              const SizedBox(height: 8),
              Text(s.tagline, style: zText(ZSize.h3, color: ZColors.muted)),
              const SizedBox(height: 22),
              Container(
                width: 46,
                height: 4,
                decoration: BoxDecoration(
                  color: ZColors.orange,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Spacer(flex: 4),
              Text(
                s.motto,
                style: zText(
                  ZSize.caption,
                  weight: ZWeight.medium,
                  color: ZColors.muted,
                ).copyWith(letterSpacing: 1.2),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

/// First screen of a new phone: sign in with the number, or look around without an account
class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});

  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
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
    if (done) await ref.read(welcomedProvider.notifier).done();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(26),
              child: SizedBox(
                height: 340,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(
                      'assets/images/welcome.webp',
                      fit: BoxFit.cover,
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Color(0x33000000),
                            Color(0x00000000),
                            Color(0xB3000000),
                          ],
                          stops: [0, 0.4, 1],
                        ),
                      ),
                    ),
                    const Positioned(
                      left: 22,
                      top: 22,
                      child: ZLogo(size: 26, nameColor: Colors.white),
                    ),
                    Positioned(
                      left: 22,
                      right: 22,
                      bottom: 26,
                      child: Text(
                        s.heroTitle,
                        style: zText(
                          ZSize.display,
                          weight: ZWeight.bold,
                          color: Colors.white,
                          height: 1.25,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 30, 10, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.welcomeTitle,
                    style: zText(ZSize.display, weight: ZWeight.bold),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    s.welcomeText,
                    style: zText(
                      ZSize.title,
                      color: ZColors.muted,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 26),
                  ZLabel(s.phoneLabel),
                  ZPhoneField(
                    controller: _phone,
                    errorText: _error,
                    onSubmitted: (_) => _send(),
                  ),
                  const SizedBox(height: 20),
                  ZButton(label: s.sendCode, loading: _busy, onPressed: _send),
                  const SizedBox(height: 12),
                  Center(
                    child: Text(
                      s.codeNote,
                      style: zText(ZSize.small, color: ZColors.muted),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Center(
                    child: TextButton(
                      onPressed: () =>
                          ref.read(welcomedProvider.notifier).done(),
                      child: Text(
                        s.explore,
                        style: zText(
                          ZSize.title,
                          weight: ZWeight.bold,
                          color: ZColors.orangeText,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Center(
                    child: Text(
                      s.legal,
                      textAlign: TextAlign.center,
                      style: zText(
                        ZSize.caption,
                        color: ZColors.muted,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
