import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import '../constants/app_constants.dart';

class LocalDatabase {
  /// [path]: another file (tests); default is the app's database.
  LocalDatabase({String? path}) : _path = path;

  final String? _path;
  Database? _database;

  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final path = _path ?? join(await getDatabasesPath(), AppConstants.dbName);

    return openDatabase(
      path,
      version: AppConstants.dbVersion,
      onCreate: _createDatabase,
      onUpgrade: _upgradeDatabase,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
        try {
          await db.execute('PRAGMA journal_mode = WAL');
        } catch (_) {
          // WAL mode not supported on all Android configurations
        }
      },
    );
  }

  Future<void> _createDatabase(Database db, int version) async {
    // Events table
    await db.execute('''
      CREATE TABLE ${AppConstants.eventsTable} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        venue TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        banner_url TEXT,
        capacity INTEGER DEFAULT 0,
        checked_in INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        controller_id TEXT,
        gate TEXT,
        sync_at TEXT,
        created_at TEXT NOT NULL,
        data TEXT
      )
    ''');

    // Tickets cache table
    await db.execute('''
      CREATE TABLE ${AppConstants.ticketsTable} (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        qr_code TEXT NOT NULL,
        holder_name TEXT,
        holder_email TEXT,
        ticket_type TEXT,
        status TEXT DEFAULT 'valid',
        used_at TEXT,
        used_by TEXT,
        gate TEXT,
        seat TEXT,
        zone TEXT,
        synced_at TEXT,
        FOREIGN KEY (event_id) REFERENCES ${AppConstants.eventsTable}(id)
      )
    ''');

    // Index on QR code for fast lookup
    await db.execute('''
      CREATE INDEX idx_tickets_qr ON ${AppConstants.ticketsTable}(qr_code)
    ''');

    await db.execute('''
      CREATE INDEX idx_tickets_event ON ${AppConstants.ticketsTable}(event_id)
    ''');

    // Pending scans table (offline queue)
    await db.execute('''
      CREATE TABLE ${AppConstants.pendingScansTable} (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        qr_code TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        controller_id TEXT NOT NULL,
        controller_name TEXT,
        ticket_id TEXT,
        gate TEXT,
        result TEXT,
        synced INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL
      )
    ''');

    // Scan logs table (history)
    await db.execute('''
      CREATE TABLE ${AppConstants.scanLogsTable} (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        ticket_id TEXT,
        qr_code TEXT NOT NULL,
        result TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        controller_id TEXT,
        gate TEXT,
        holder_name TEXT,
        serial_number TEXT,
        ticket_type TEXT
      )
    ''');

    await db.execute('''
      CREATE INDEX idx_scan_logs_event ON ${AppConstants.scanLogsTable}(event_id)
    ''');

    await _createV2(db);
  }

  /// v2: when each event's ticket list was downloaded, and which ticket a pending scan is for.
  Future<void> _createV2(Database db, {bool alterPendingScans = false}) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS ${AppConstants.offlinePacksTable} (
        event_id TEXT PRIMARY KEY,
        generated_at TEXT NOT NULL,
        downloaded_at TEXT NOT NULL
      )
    ''');
    if (alterPendingScans) {
      await db.execute('ALTER TABLE ${AppConstants.pendingScansTable} ADD COLUMN ticket_id TEXT');
    }
  }

  Future<void> _upgradeDatabase(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) await _createV2(db, alterPendingScans: true);
  }

  // =========== EVENTS ===========

  // Upsert in place: a REPLACE would delete the row first, which foreign keys forbid once
  // the event has downloaded tickets
  Future<void> insertEvent(Map<String, dynamic> event) => insertEvents([event]);

  Future<void> insertEvents(List<Map<String, dynamic>> events) async {
    final db = await database;
    await db.transaction((txn) async {
      for (final event in events) {
        final updated = await txn.update(AppConstants.eventsTable, event, where: 'id = ?', whereArgs: [event['id']]);
        if (updated == 0) await txn.insert(AppConstants.eventsTable, event);
      }
    });
  }

  Future<List<Map<String, dynamic>>> getEvents() async {
    final db = await database;
    return db.query(
      AppConstants.eventsTable,
      orderBy: 'start_date ASC',
    );
  }

  Future<Map<String, dynamic>?> getEvent(String id) async {
    final db = await database;
    final results = await db.query(
      AppConstants.eventsTable,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return results.isEmpty ? null : results.first;
  }

  Future<void> updateEventStats(
    String eventId, {
    required int checkedIn,
  }) async {
    final db = await database;
    await db.update(
      AppConstants.eventsTable,
      {'checked_in': checkedIn},
      where: 'id = ?',
      whereArgs: [eventId],
    );
  }

  // =========== TICKETS ===========

  Future<void> insertTickets(List<Map<String, dynamic>> tickets) async {
    final db = await database;
    final batch = db.batch();
    for (final ticket in tickets) {
      batch.insert(
        AppConstants.ticketsTable,
        ticket,
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<Map<String, dynamic>?> getTicketByQrCode(String qrCode) async {
    final db = await database;
    final results = await db.query(
      AppConstants.ticketsTable,
      where: 'qr_code = ?',
      whereArgs: [qrCode],
      limit: 1,
    );
    return results.isEmpty ? null : results.first;
  }

  Future<void> markTicketUsed(
    String qrCode, {
    required String usedAt,
    required String usedBy,
    String? gate,
  }) async {
    final db = await database;
    await db.update(
      AppConstants.ticketsTable,
      {
        'status': 'used',
        'used_at': usedAt,
        'used_by': usedBy,
        if (gate != null) 'gate': gate,
      },
      where: 'qr_code = ?',
      whereArgs: [qrCode],
    );
  }

  /// Stores the event's ticket list (offline pack). A full pack replaces the list; a
  /// partial one (`since`) only updates changed tickets. A ticket validated offline whose
  /// scan is not uploaded yet stays "used" even if the server still says valid.
  Future<void> saveOfflinePack(
    String eventId,
    List<Map<String, dynamic>> tickets, {
    required bool full,
    required String generatedAt,
  }) async {
    final db = await database;
    await db.transaction((txn) async {
      final pendingRows = await txn.rawQuery(
        'SELECT DISTINCT ticket_id FROM ${AppConstants.pendingScansTable} WHERE synced = 0 AND ticket_id IS NOT NULL AND event_id = ?',
        [eventId],
      );
      final pendingIds = pendingRows.map((r) => r['ticket_id'] as String).toSet();
      if (full) {
        final keep = pendingIds.isEmpty ? '' : ' AND id NOT IN (${List.filled(pendingIds.length, '?').join(',')})';
        await txn.delete(AppConstants.ticketsTable, where: 'event_id = ?$keep', whereArgs: [eventId, ...pendingIds]);
      }
      final batch = txn.batch();
      for (final t in tickets) {
        final id = t['id'] as String;
        final serverStatus = (t['status'] as String? ?? 'VALID').toLowerCase();
        if (pendingIds.contains(id) && serverStatus == 'valid') continue; // keep the local "used"
        batch.insert(
          AppConstants.ticketsTable,
          {
            'id': id,
            'event_id': eventId,
            'serial_number': t['serialNumber'],
            'qr_code': id,
            'holder_name': t['holderName'],
            'ticket_type': t['templateName'],
            'status': serverStatus,
            'used_at': t['checkedInAt'],
            'synced_at': generatedAt,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
      await batch.commit(noResult: true);
      await txn.insert(
        AppConstants.offlinePacksTable,
        {'event_id': eventId, 'generated_at': generatedAt, 'downloaded_at': DateTime.now().toUtc().toIso8601String()},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    });
  }

  Future<Map<String, dynamic>?> getOfflinePack(String eventId) async {
    final db = await database;
    final rows = await db.query(AppConstants.offlinePacksTable, where: 'event_id = ?', whereArgs: [eventId], limit: 1);
    return rows.isEmpty ? null : rows.first;
  }

  Future<List<String>> getOfflinePackEventIds() async {
    final db = await database;
    final rows = await db.query(AppConstants.offlinePacksTable, columns: ['event_id']);
    return rows.map((r) => r['event_id'] as String).toList();
  }

  Future<int> getPendingScanCountForEvent(String eventId) async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM ${AppConstants.pendingScansTable} WHERE synced = 0 AND event_id = ?',
      [eventId],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<Map<String, dynamic>?> getTicketById(String id) async {
    final db = await database;
    final rows = await db.query(AppConstants.ticketsTable, where: 'id = ?', whereArgs: [id], limit: 1);
    return rows.isEmpty ? null : rows.first;
  }

  Future<void> markTicketUsedById(String id, {required String usedAt, required String usedBy}) async {
    final db = await database;
    await db.update(
      AppConstants.ticketsTable,
      {'status': 'used', 'used_at': usedAt, 'used_by': usedBy},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<int> getTicketCount(String eventId) async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM ${AppConstants.ticketsTable} WHERE event_id = ?',
      [eventId],
    );
    return (result.first['count'] as int?) ?? 0;
  }

  // =========== PENDING SCANS ===========

  Future<void> insertPendingScan(Map<String, dynamic> scan) async {
    final db = await database;
    await db.insert(
      AppConstants.pendingScansTable,
      scan,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getPendingScans() async {
    final db = await database;
    return db.query(
      AppConstants.pendingScansTable,
      where: 'synced = 0 AND retry_count < ?',
      whereArgs: [AppConstants.maxSyncRetries],
      orderBy: 'created_at ASC',
      limit: AppConstants.syncBatchSize,
    );
  }

  Future<int> getPendingScanCount() async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM ${AppConstants.pendingScansTable} WHERE synced = 0',
    );
    return (result.first['count'] as int?) ?? 0;
  }

  Future<void> markScanSynced(String id) async {
    final db = await database;
    await db.update(
      AppConstants.pendingScansTable,
      {'synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> incrementScanRetry(String id, String error) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE ${AppConstants.pendingScansTable} SET retry_count = retry_count + 1, error = ? WHERE id = ?',
      [error, id],
    );
  }

  Future<void> clearSyncedScans() async {
    final db = await database;
    await db.delete(
      AppConstants.pendingScansTable,
      where: 'synced = 1',
    );
  }

  // =========== SCAN LOGS ===========

  Future<void> insertScanLog(Map<String, dynamic> log) async {
    final db = await database;
    await db.insert(
      AppConstants.scanLogsTable,
      log,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getScanLogs(String eventId) async {
    final db = await database;
    return db.query(
      AppConstants.scanLogsTable,
      where: 'event_id = ?',
      whereArgs: [eventId],
      orderBy: 'scanned_at DESC',
      limit: 100,
    );
  }

  Future<int> getValidScanCount(String eventId) async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM ${AppConstants.scanLogsTable} WHERE event_id = ? AND result = "valid"',
      [eventId],
    );
    return (result.first['count'] as int?) ?? 0;
  }

  // =========== CLEANUP ===========

  Future<void> clearEventData(String eventId) async {
    final db = await database;
    await db.delete(
      AppConstants.ticketsTable,
      where: 'event_id = ?',
      whereArgs: [eventId],
    );
  }

  Future<void> clearAll() async {
    final db = await database;
    await db.delete(AppConstants.offlinePacksTable);
    await db.delete(AppConstants.scanLogsTable);
    await db.delete(AppConstants.pendingScansTable);
    await db.delete(AppConstants.ticketsTable);
    await db.delete(AppConstants.eventsTable);
  }
}
