// Walk through the app on a simulator against a local backend, taking screenshots.
// Needs the development helper (scratchpad helper.py) on localhost:8765 for the SMS code
// and the screenshots; run with --dart-define=API_URL=http://localhost:3001/api/v1.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:zaya_app/app.dart';

final _helper = Dio(BaseOptions(baseUrl: 'http://localhost:8765'));

Future<void> shot(WidgetTester t, String name, [int ms = 1500]) async {
  await settle(t, ms);
  await _helper.get('/shot', queryParameters: {'name': name});
}

/// pumpAndSettle never settles while a spinner turns: pump for a while instead
Future<void> settle(WidgetTester t, [int ms = 1500]) async {
  for (var i = 0; i < ms ~/ 100; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

Future<void> tapText(WidgetTester t, String text, [int ms = 1500]) async {
  final f = find.text(text);
  await t.ensureVisible(f.first);
  await t.pump();
  await t.tap(f.first);
  await settle(t, ms);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('welcome, discover, buy, wallet, profile', (t) async {
    await initializeDateFormatting('fr');
    // A brand new phone: no session, welcome not seen
    await const FlutterSecureStorage().deleteAll();
    await t.pumpWidget(const ProviderScope(child: ZayaApp()));
    await shot(t, '01_splash', 500);
    await shot(t, '02_bienvenue', 2500);

    await tapText(t, 'Explorer sans compte', 2500);
    await shot(t, '03_accueil');
    await tapText(t, 'Ce week-end');
    await shot(t, '04_accueil_weekend');
    await tapText(t, 'Ce soir', 2000);

    await tapText(t, 'Recherche', 2500);
    await shot(t, '05_recherche');
    await tapText(t, 'Accueil');

    await tapText(t, 'Kinshasa Live Festival', 2500);
    await shot(t, '06_evenement');
    await t.drag(find.byType(ListView).first, const Offset(0, -600));
    await shot(t, '07_evenement_bas');
    await tapText(t, 'Choisir mes billets');
    await shot(t, '08_choisir');
    await tapText(t, 'VIP');
    await t.tap(find.byIcon(Icons.add_rounded));
    await shot(t, '09_choisir_vip');

    // Not signed in: the number, the code, then the payment step
    await tapText(t, 'Continuer');
    await shot(t, '10_numero');
    await t.enterText(find.byType(TextField), '81 000 0001');
    await tapText(t, 'Recevoir mon code SMS', 2500);
    final code = (await _helper.get<String>('/code')).data!;
    await t.enterText(find.byType(TextField), code);
    await settle(t, 3000);
    if (find.text('Comment tu t’appelles ?').evaluate().isNotEmpty) {
      await t.enterText(find.byType(TextFormField).first, 'Jean');
      await tapText(t, 'Continuer', 2500);
    }
    await shot(t, '11_paiement', 2500);
    await tapText(t, 'Carte / Visa');
    await shot(t, '12_paiement_carte');
    // « Payer » is not pressed: the local backend may hold real FlexPay credentials
    await tapText(t, 'Mobile money');

    // Back to the shell
    final nav = t.state<NavigatorState>(find.byType(Navigator).first);
    nav.popUntil((r) => r.isFirst);
    await settle(t);
    await tapText(t, 'Billets', 3000);
    await shot(t, '14_billets');
    await tapText(t, 'Afficher mes billets', 2000);
    await shot(t, '15_acces');
    nav.popUntil((r) => r.isFirst);
    await settle(t);

    await tapText(t, 'Profil');
    await shot(t, '16_profil');
    await tapText(t, 'Lingala', 2000);
    await shot(t, '17_profil_lingala');
    await tapText(t, 'Ebandeli', 2500);
    await shot(t, '18_accueil_lingala');
    await tapText(t, 'Profil');
    await tapText(t, 'Français', 2000);
  });
}
