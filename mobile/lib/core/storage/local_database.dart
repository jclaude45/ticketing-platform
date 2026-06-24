import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import '../constants/app_constants.dart';

class LocalDatabase {
  static Database? _database;

  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, AppConstants.dbName);

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
  }

  Future<void> _upgradeDatabase(Database db, int oldVersion, int newVersion) async {
    // Handle future migrations here
  }

  // =========== EVENTS ===========

  Future<void> insertEvent(Map<String, dynamic> event) async {
    final db = await database;
    await db.insert(
      AppConstants.eventsTable,
      event,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> insertEvents(List<Map<String, dynamic>> events) async {
    final db = await database;
    final batch = db.batch();
    for (final event in events) {
      batch.insert(
        AppConstants.eventsTable,
        event,
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
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
    await db.delete(AppConstants.scanLogsTable);
    await db.delete(AppConstants.pendingScansTable);
    await db.delete(AppConstants.ticketsTable);
    await db.delete(AppConstants.eventsTable);
  }
}
