import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'package:ticketing_scanner/core/constants/app_constants.dart';
import 'package:ticketing_scanner/core/storage/local_database.dart';

// On a phone or emulator: flutter test integration_test/encrypted_db_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> deleteAll(String path) async {
    for (final s in ['', '-wal', '-shm', '-journal']) {
      final f = File('$path$s');
      if (await f.exists()) await f.delete();
    }
  }

  testWidgets('the plain database of 1.1.0 is copied encrypted, pending scans kept', (tester) async {
    final dir = await getDatabasesPath();
    final legacyPath = join(dir, AppConstants.dbName);
    final securePath = join(dir, AppConstants.secureDbName);
    await deleteAll(legacyPath);
    await deleteAll(securePath);

    // What 1.1.0 left on the phone: a plain file with a scan not sent yet
    final legacy = LocalDatabase(path: legacyPath);
    await legacy.insertPendingScan({
      'id': 'scan-1', 'event_id': 'evt-1', 'qr_code': '{"id":"t1","sn":"S1","v":"2"}',
      'scanned_at': '2026-11-14T10:00:00.000Z', 'controller_id': 'c1', 'ticket_id': 't1', 'created_at': '2026-11-14T10:00:00.000Z',
    });
    await (await legacy.database).close();
    expect(String.fromCharCodes((await File(legacyPath).readAsBytes()).take(15)), 'SQLite format 3');

    // 1.1.1 starts
    final db = LocalDatabase();
    expect(await db.getPendingScanCountForEvent('evt-1'), 1);
    final cipher = await (await db.database).rawQuery('PRAGMA cipher_version');
    expect(cipher.first.values.first, isNotNull);
    await (await db.database).close();

    expect(await File(legacyPath).exists(), isFalse);
    final header = String.fromCharCodes((await File(securePath).readAsBytes()).take(15));
    expect(header, isNot('SQLite format 3')); // unreadable without the key

    // Next launch: same key from the secure storage, data still there
    final again = LocalDatabase();
    expect(await again.getPendingScanCountForEvent('evt-1'), 1);
    final version = Sqflite.firstIntValue(await (await again.database).rawQuery('PRAGMA user_version'));
    expect(version, AppConstants.dbVersion);
    await (await again.database).close();
  });
}
