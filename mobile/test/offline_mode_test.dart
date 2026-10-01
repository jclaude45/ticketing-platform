// Offline mode: QR parsing, the ticket list stored on the phone (real SQLite through ffi),
// local validation, and the upload of offline entries with conflict detection.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:ticketing_scanner/core/error/exceptions.dart';
import 'package:ticketing_scanner/core/network/dio_client.dart';
import 'package:ticketing_scanner/core/network/network_info.dart';
import 'package:ticketing_scanner/core/storage/local_database.dart';
import 'package:ticketing_scanner/core/storage/secure_storage.dart';
import 'package:ticketing_scanner/features/auth/domain/entities/user_entity.dart';
import 'package:ticketing_scanner/features/guests/data/guests_repository.dart';
import 'package:ticketing_scanner/features/scanner/data/models/validation_result_model.dart';
import 'package:ticketing_scanner/features/scanner/data/repositories/scanner_repository_impl.dart';
import 'package:ticketing_scanner/features/scanner/data/sources/scanner_local_source.dart';
import 'package:ticketing_scanner/features/scanner/data/sources/scanner_remote_source.dart';
import 'package:ticketing_scanner/features/scanner/data/ticket_qr.dart';
import 'package:ticketing_scanner/features/scanner/domain/entities/validation_result.dart';

const eventId = 'evt-1';
String qr(String id, String sn) => jsonEncode({'id': id, 'sn': sn, 'v': '2'});

Map<String, dynamic> serverTicket(String id, String sn, {String status = 'VALID', String? checkedInAt, bool guest = false}) =>
    {'id': id, 'serialNumber': sn, 'holderName': 'Invité $id', 'templateName': 'VIP', 'status': status, 'checkedInAt': checkedInAt, 'guest': guest};

class FakeStorage extends SecureStorage {
  @override
  Future<UserEntity?> getUser() async => null;
  @override
  Future<String> getOrCreateDeviceId() async => 'device-test';
}

class FakeNetwork implements NetworkInfo {
  bool connected = false;
  @override
  Future<bool> get isConnected async => connected;
  @override
  Stream<bool> get connectivityStream => const Stream.empty();
}

/// Server: online scans fail (no network) unless [online]; sync answers with [syncResults].
class FakeRemote implements ScannerRemoteSource {
  bool online = false;
  bool networkDuringSync = true;
  List<Map<String, dynamic>> Function(List<Map<String, dynamic>> scans) syncResults =
      (scans) => [for (var i = 0; i < scans.length; i++) {'index': i, 'result': 'VALID'}];
  final sent = <Map<String, dynamic>>[];

  @override
  Future<ValidationResultModel> validateTicket({required String eventId, required String qrCode, String? gate, String? deviceId}) async {
    if (!online) throw const NetworkException(message: 'Pas de connexion internet.');
    return ValidationResultModel.fromJson({'result': 'VALID'}, ticketCode: qrCode);
  }

  @override
  Future<List<Map<String, dynamic>>> syncScans(String eventId, List<Map<String, dynamic>> scans, {required String deviceId}) async {
    if (!networkDuringSync) throw const NetworkException(message: 'Pas de connexion internet.');
    sent.addAll(scans);
    return syncResults(scans);
  }
}

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late Directory dir;
  late LocalDatabase db;
  late FakeRemote remote;
  late FakeNetwork network;
  late ScannerRepositoryImpl repo;

  Future<void> addEvent() => db.insertEvent({
        'id': eventId,
        'name': 'Concert',
        'venue': 'Salle',
        'start_date': '2026-10-01T18:00:00Z',
        'end_date': '2026-10-01T23:00:00Z',
        'created_at': '2026-09-01T00:00:00Z',
      });

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('zaya_offline_');
    db = LocalDatabase(path: '${dir.path}/test.db');
    remote = FakeRemote();
    network = FakeNetwork();
    repo = ScannerRepositoryImpl(
      remoteSource: remote,
      localSource: ScannerLocalSourceImpl(database: db),
      secureStorage: FakeStorage(),
      networkInfo: network,
    );
    await addEvent();
    await db.saveOfflinePack(eventId, [
      serverTicket('t1', 'SN-1', guest: true),
      serverTicket('t2', 'SN-2'),
      serverTicket('t3', 'SN-3', status: 'USED', checkedInAt: '2026-10-01T19:00:00Z', guest: true),
      serverTicket('t4', 'SN-4', status: 'CANCELLED'),
    ], full: true, generatedAt: '2026-10-01T18:30:00Z');
  });

  tearDown(() async {
    await (await db.database).close();
    await dir.delete(recursive: true);
  });

  group('QR parsing', () {
    test('v2 and legacy v1 are read, anything else is rejected', () {
      expect(parseTicketQr(qr('abc', 'SN-9')), (id: 'abc', serial: 'SN-9'));
      final v1 = jsonEncode({'p': jsonEncode({'tid': 'old', 'sn': 'SN-1', 'eid': 'e'}), 's': 'sig', 'v': '1'});
      expect(parseTicketQr(v1), (id: 'old', serial: 'SN-1'));
      expect(parseTicketQr('https://example.com'), isNull);
      expect(parseTicketQr('{"v":"2","id":"x"}'), isNull);
      expect(parseTicketQr('[1,2]'), isNull);
    });
  });

  group('offline validation', () {
    test('a valid ticket enters once, the second scan is refused', () async {
      final first = await repo.validateTicket(eventId: eventId, qrCode: qr('t1', 'SN-1'));
      expect(first.status, ValidationStatus.valid);
      expect(first.isOfflineResult, isTrue);
      expect(first.holderName, 'Invité t1');
      expect(await repo.getPendingScanCount(), 1);

      final again = await repo.validateTicket(eventId: eventId, qrCode: qr('t1', 'SN-1'));
      expect(again.status, ValidationStatus.used);
      expect(await repo.getPendingScanCount(), 1, reason: 'a refused scan is not queued');
    });

    test('used, cancelled, forged and unknown tickets are refused', () async {
      expect((await repo.validateTicket(eventId: eventId, qrCode: qr('t3', 'SN-3'))).status, ValidationStatus.used);
      expect((await repo.validateTicket(eventId: eventId, qrCode: qr('t4', 'SN-4'))).status, ValidationStatus.error);
      expect((await repo.validateTicket(eventId: eventId, qrCode: qr('t2', 'SN-FAUX'))).status, ValidationStatus.fraudulent);
      final unknown = await repo.validateTicket(eventId: eventId, qrCode: qr('t99', 'SN-99'));
      expect(unknown.status, ValidationStatus.notFound);
      expect(unknown.errorMessage, startsWith('Billet absent'));
      expect((await repo.validateTicket(eventId: eventId, qrCode: 'pas un billet')).status, ValidationStatus.notFound);
      expect(await repo.getPendingScanCount(), 0);
    });

    test('a ticket of another event is unknown here', () async {
      await db.insertEvent({'id': 'evt-2', 'name': 'Autre', 'venue': 'X', 'start_date': 'a', 'end_date': 'b', 'created_at': 'c'});
      await db.saveOfflinePack('evt-2', [serverTicket('o1', 'SN-O1')], full: true, generatedAt: '2026-10-01T18:30:00Z');
      expect((await repo.validateTicket(eventId: eventId, qrCode: qr('o1', 'SN-O1'))).status, ValidationStatus.notFound);
    });

    test('network timeout while the phone thinks it is online: falls back to the list', () async {
      network.connected = true; // remote.online stays false: the request fails
      final r = await repo.validateTicket(eventId: eventId, qrCode: qr('t2', 'SN-2'));
      expect(r.status, ValidationStatus.valid);
      expect(r.isOfflineResult, isTrue);
    });

    test('entry made online, then network cut: the same ticket is refused offline', () async {
      network.connected = true;
      remote.online = true;
      expect((await repo.validateTicket(eventId: eventId, qrCode: qr('t1', 'SN-1'))).isOfflineResult, isFalse);
      network.connected = false;
      remote.online = false;
      expect((await repo.validateTicket(eventId: eventId, qrCode: qr('t1', 'SN-1'))).status, ValidationStatus.used);
      expect(await repo.getPendingScanCount(), 0);
    });

    test('without a downloaded list, no network is reported as such', () async {
      final r = await repo.validateTicket(eventId: 'evt-sans-liste', qrCode: qr('t1', 'SN-1'));
      expect(r.networkFailure, isTrue);
      expect(r.status, ValidationStatus.error);
    });
  });

  group('ticket list refresh', () {
    test('event upsert keeps the tickets (foreign key) and refresh keeps local entries', () async {
      await repo.validateTicket(eventId: eventId, qrCode: qr('t1', 'SN-1'));
      await addEvent(); // event list refreshed while tickets are stored
      // Server does not know the offline entry yet: t1 must stay "used" on the phone
      await db.saveOfflinePack(eventId, [serverTicket('t1', 'SN-1'), serverTicket('t2', 'SN-2', status: 'USED')],
          full: true, generatedAt: '2026-10-01T19:30:00Z');
      expect((await db.getTicketById('t1'))!['status'], 'used');
      expect((await db.getTicketById('t2'))!['status'], 'used', reason: 'entry made at another door');
      expect(await db.getTicketById('t4'), isNull, reason: 'a full list replaces the old one');
      expect((await db.getOfflinePack(eventId))!['generated_at'], '2026-10-01T19:30:00Z');
    });

    test('a partial list only updates the changed tickets', () async {
      await db.saveOfflinePack(eventId, [serverTicket('t5', 'SN-5')], full: false, generatedAt: '2026-10-01T19:30:00Z');
      expect(await db.getTicketCount(eventId), 5);
    });
  });

  group('upload of offline entries', () {
    setUp(() async {
      await repo.validateTicket(eventId: eventId, qrCode: qr('t1', 'SN-1'));
      await repo.validateTicket(eventId: eventId, qrCode: qr('t2', 'SN-2'));
    });

    test('accepted entries leave the queue, with their scan time', () async {
      final report = await repo.syncOfflineScans();
      expect(report.accepted, 2);
      expect(report.conflicts, 0);
      expect(remote.sent.first['offlineScannedAt'], isNotNull);
      expect(await repo.getPendingScanCount(), 0);
    });

    test('a ticket used elsewhere in the meantime is a conflict', () async {
      remote.syncResults = (scans) => [
            {'index': 0, 'result': 'VALID'},
            {'index': 1, 'result': 'ALREADY_USED', 'checkedInAt': '2020-01-01T10:00:00Z'},
          ];
      final report = await repo.syncOfflineScans();
      expect(report.accepted, 1);
      expect(report.conflicts, 1);
      expect(await repo.getPendingScanCount(), 0);
    });

    test('our own online attempt that reached the server is not a conflict', () async {
      remote.syncResults = (scans) => [
            for (var i = 0; i < scans.length; i++)
              {'index': i, 'result': 'ALREADY_USED', 'checkedInAt': scans[i]['offlineScannedAt']},
          ];
      final report = await repo.syncOfflineScans();
      expect(report.accepted, 2);
      expect(report.conflicts, 0);
    });

    test('network lost during the upload: everything is kept, nothing counted as failed', () async {
      remote.networkDuringSync = false;
      for (var i = 0; i < 5; i++) {
        final report = await repo.syncOfflineScans();
        expect(report.remaining, 2);
      }
      remote.networkDuringSync = true;
      expect((await repo.syncOfflineScans()).accepted, 2, reason: 'no retry budget was used up');
    });

    test('a scan the server could not process stays queued', () async {
      remote.syncResults = (scans) => [
            {'index': 0, 'result': 'VALID'},
            {'index': 1, 'error': 'Internal error'},
          ];
      final report = await repo.syncOfflineScans();
      expect(report.accepted, 1);
      expect(report.remaining, 1);
      expect(await repo.getPendingScanCount(), 1);
    });
  });

  test('upgrade from the first version of the phone database', () async {
    final path = '${dir.path}/v1.db';
    final v1 = await openDatabase(path, version: 1, onCreate: (d, _) async {
      await d.execute('CREATE TABLE pending_scans (id TEXT PRIMARY KEY, event_id TEXT, qr_code TEXT, scanned_at TEXT, '
          'controller_id TEXT NOT NULL, controller_name TEXT, gate TEXT, result TEXT, synced INTEGER DEFAULT 0, '
          'retry_count INTEGER DEFAULT 0, error TEXT, created_at TEXT)');
    });
    await v1.close();
    final upgraded = LocalDatabase(path: path);
    final d = await upgraded.database;
    final cols = (await d.rawQuery('PRAGMA table_info(pending_scans)')).map((c) => c['name']).toList();
    expect(cols, contains('ticket_id'));
    expect(await upgraded.getOfflinePack('x'), isNull);
    await d.close();
  });

  test('upgrade to v3: guest flag added, ticket lists downloaded again in full', () async {
    final path = '${dir.path}/v2.db';
    final v2 = await openDatabase(path, version: 2, onCreate: (d, _) async {
      await d.execute('CREATE TABLE tickets (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, serial_number TEXT, '
          'qr_code TEXT, holder_name TEXT, status TEXT, used_at TEXT)');
      await d.execute('CREATE TABLE offline_packs (event_id TEXT PRIMARY KEY, generated_at TEXT NOT NULL, downloaded_at TEXT NOT NULL)');
      await d.insert('offline_packs', {'event_id': 'e', 'generated_at': '2026-10-01T10:00:00Z', 'downloaded_at': '2026-10-01T10:00:00Z'});
    });
    await v2.close();
    final upgraded = LocalDatabase(path: path);
    final d = await upgraded.database;
    final cols = (await d.rawQuery('PRAGMA table_info(tickets)')).map((c) => c['name']).toList();
    expect(cols, contains('is_guest'));
    expect(await upgraded.getOfflinePack('e'), isNull); // next sync: full download
    await d.close();
  });

  group('Guest tab', () {
    GuestsRepository guests() => GuestsRepository(db: db, dioClient: DioClient(secureStorage: FakeStorage()));

    test('lists only the invitations, by name, with the entry time', () async {
      final list = await guests().list(eventId);
      expect(list.map((g) => g.name), ['Invité t1', 'Invité t3']); // t2 bought, t4 cancelled
      expect(list.last.checkedInAt, DateTime.parse('2026-10-01T19:00:00Z'));
      expect(list.first.checkedIn, isFalse);
      final counts = await guests().counts(eventId);
      expect((counts.checkedIn, counts.total, counts.remaining), (1, 3, 2));
    });

    test('a guest let in from the list offline is counted in and queued', () async {
      final guest = (await guests().list(eventId)).first;
      final result = await repo.validateTicket(eventId: eventId, qrCode: guest.qrContent);
      expect(result.isValid, isTrue);
      expect((await guests().list(eventId)).first.checkedIn, isTrue);
      expect((await guests().counts(eventId)).checkedIn, 2);
      expect(await db.getPendingScanCountForEvent(eventId), 1);
    });
  });
}
