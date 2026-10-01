// PDA trigger in keyboard mode: a code typed at machine speed is a scan, a person typing
// is not; the same code arriving twice (keyboard + broadcast) counts once.
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_scanner/core/scanner/hardware_scanner.dart';

Future<void> type(WidgetTester tester, String text, {Duration gap = Duration.zero, bool enter = true}) async {
  for (final char in text.split('')) {
    await simulateKeyDownEvent(LogicalKeyboardKey.keyA, character: char);
    await simulateKeyUpEvent(LogicalKeyboardKey.keyA);
    if (gap > Duration.zero) await tester.runAsync(() => Future<void>.delayed(gap));
  }
  if (enter) {
    await simulateKeyDownEvent(LogicalKeyboardKey.enter);
    await simulateKeyUpEvent(LogicalKeyboardKey.enter);
  }
}

void main() {
  late List<String> scans;

  setUp(() {
    scans = [];
    HardwareScanner.instance.debugReset();
  });

  testWidgets('a QR typed by the scanner, ended by Enter, is one scan', (tester) async {
    await tester.pumpWidget(const SizedBox());
    final sub = HardwareScanner.instance.scans.listen(scans.add);
    await type(tester, '{"id":"t1","sn":"SN-1","v":"2"}');
    await tester.pump();
    expect(scans, ['{"id":"t1","sn":"SN-1","v":"2"}']);
    sub.cancel(); // not awaited: a broadcast cancel never completes in the fake test clock
  });

  testWidgets('a person typing is not taken for a scan', (tester) async {
    await tester.pumpWidget(const SizedBox());
    final sub = HardwareScanner.instance.scans.listen(scans.add);
    await type(tester, 'B-7K3P9Q', gap: const Duration(milliseconds: 80));
    await tester.pump();
    expect(scans, isEmpty);
    sub.cancel(); // not awaited: a broadcast cancel never completes in the fake test clock
  });

  testWidgets('without Enter at the end, the code is taken after a short silence', (tester) async {
    await tester.pumpWidget(const SizedBox());
    final sub = HardwareScanner.instance.scans.listen(scans.add);
    await type(tester, 'NO-ENTER-123', enter: false);
    await tester.pump(const Duration(milliseconds: 200));
    expect(scans, ['NO-ENTER-123']);
    sub.cancel(); // not awaited: a broadcast cancel never completes in the fake test clock
  });

  testWidgets('the same code from keyboard and broadcast counts once', (tester) async {
    await tester.pumpWidget(const SizedBox());
    final sub = HardwareScanner.instance.scans.listen(scans.add);
    HardwareScanner.instance.debugEmit('DUP-CODE');
    HardwareScanner.instance.debugEmit('DUP-CODE');
    HardwareScanner.instance.debugEmit('OTHER');
    await tester.pump();
    expect(scans, ['DUP-CODE', 'OTHER']);
    sub.cancel(); // not awaited: a broadcast cancel never completes in the fake test clock
  });
}
