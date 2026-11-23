import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session.dart';
import 'storage.dart';

/// Language of the app: kept on the phone (chosen before signing in too) and in the
/// customer's profile, so SMS and notifications follow it
final languageProvider = NotifierProvider<LanguageController, Locale>(
  LanguageController.new,
);

class LanguageController extends Notifier<Locale> {
  @override
  Locale build() {
    _load();
    // A signed-in customer's profile wins (chosen on another phone)
    ref.listen(sessionProvider, (_, next) {
      if (next is SignedIn && next.customer.language != state.languageCode) {
        _set(next.customer.language);
      }
    });
    return const Locale('fr');
  }

  Future<void> _load() async {
    final saved = await SecureStore.instance.language;
    if (saved == 'ln' || saved == 'fr') state = Locale(saved!);
  }

  void _set(String code) {
    state = Locale(code);
    SecureStore.instance.saveLanguage(code);
  }

  /// Switches every screen at once; saved in the profile when signed in
  Future<void> choose(String code) async {
    _set(code);
    final session = ref.read(sessionProvider.notifier);
    if (session.customer != null) {
      try {
        await session.update({'language': code});
      } catch (_) {
        // Offline: the phone keeps it, the profile catches up on the next change
      }
    }
  }
}
