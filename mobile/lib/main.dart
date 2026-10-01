import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import 'app.dart';
import 'core/di/injection_container.dart';
import 'core/scanner/hardware_scanner.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Lock to portrait orientation
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Dates and times in French ("1 oct. 2026 à 19:10")
  await initializeDateFormatting('fr_FR');
  Intl.defaultLocale = 'fr_FR';

  // Initialize dependency injection
  await configureDependencies();
  await ScannerModeNotifier.load();

  runApp(
    const ProviderScope(
      child: TicketScannerApp(),
    ),
  );
}
