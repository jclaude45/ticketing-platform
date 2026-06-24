import 'package:uuid/uuid.dart';

import '../../../../core/storage/local_database.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/validation_result.dart';
import '../models/validation_result_model.dart';

abstract class ScannerLocalSource {
  Future<ValidationResultModel?> validateTicketOffline({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
    String? controllerName,
  });

  Future<void> saveOfflineScan({
    required String eventId,
    required String qrCode,
    required String result,
    String? gate,
    String? controllerId,
    String? controllerName,
  });

  Future<List<Map<String, dynamic>>> getPendingScans();

  Future<void> markScanSynced(String id);

  Future<void> incrementScanRetry(String id, String error);

  Future<int> getPendingScanCount();

  Future<void> saveScanLog(Map<String, dynamic> log);
}

class ScannerLocalSourceImpl implements ScannerLocalSource {
  final LocalDatabase database;
  final _uuid = const Uuid();

  const ScannerLocalSourceImpl({required this.database});

  @override
  Future<ValidationResultModel?> validateTicketOffline({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
    String? controllerName,
  }) async {
    // Look up the ticket in local cache
    final ticket = await database.getTicketByQrCode(qrCode);

    if (ticket == null) {
      // QR not in cache — might be fraudulent or just not downloaded
      return null;
    }

    // Verify it belongs to this event
    if (ticket['event_id'] != eventId) {
      return ValidationResultModel(
        status: ValidationStatus.fraudulent,
        ticketCode: qrCode,
        eventId: eventId,
        isOfflineResult: true,
        scannedAt: DateTime.now(),
        securityNote: 'Ticket belongs to a different event',
      );
    }

    final status = ticket['status'] as String? ?? 'valid';

    if (status == 'used') {
      // Already used locally
      return ValidationResultModel(
        status: ValidationStatus.used,
        ticketCode: qrCode,
        ticketId: ticket['id'] as String?,
        serialNumber: ticket['serial_number'] as String?,
        holderName: ticket['holder_name'] as String?,
        holderEmail: ticket['holder_email'] as String?,
        ticketType: ticket['ticket_type'] as String?,
        eventId: eventId,
        gate: gate,
        zone: ticket['zone'] as String?,
        seat: ticket['seat'] as String?,
        usedAt: ticket['used_at'] != null
            ? DateTime.parse(ticket['used_at'] as String)
            : null,
        usedBy: ticket['used_by'] as String?,
        usedAtGate: ticket['gate'] as String?,
        isOfflineResult: true,
        scannedAt: DateTime.now(),
      );
    }

    // Valid ticket — mark as used locally
    final now = AppDateUtils.nowIso();
    await database.markTicketUsed(
      qrCode,
      usedAt: now,
      usedBy: controllerId ?? 'controller',
      gate: gate,
    );

    return ValidationResultModel(
      status: ValidationStatus.valid,
      ticketCode: qrCode,
      ticketId: ticket['id'] as String?,
      serialNumber: ticket['serial_number'] as String?,
      holderName: ticket['holder_name'] as String?,
      holderEmail: ticket['holder_email'] as String?,
      ticketType: ticket['ticket_type'] as String?,
      eventId: eventId,
      gate: gate,
      zone: ticket['zone'] as String?,
      seat: ticket['seat'] as String?,
      isOfflineResult: true,
      scannedAt: DateTime.now(),
    );
  }

  @override
  Future<void> saveOfflineScan({
    required String eventId,
    required String qrCode,
    required String result,
    String? gate,
    String? controllerId,
    String? controllerName,
  }) async {
    await database.insertPendingScan({
      'id': _uuid.v4(),
      'event_id': eventId,
      'qr_code': qrCode,
      'scanned_at': AppDateUtils.nowIso(),
      'controller_id': controllerId ?? '',
      'controller_name': controllerName,
      'gate': gate,
      'result': result,
      'synced': 0,
      'retry_count': 0,
      'created_at': AppDateUtils.nowIso(),
    });
  }

  @override
  Future<List<Map<String, dynamic>>> getPendingScans() async {
    return database.getPendingScans();
  }

  @override
  Future<void> markScanSynced(String id) async {
    await database.markScanSynced(id);
  }

  @override
  Future<void> incrementScanRetry(String id, String error) async {
    await database.incrementScanRetry(id, error);
  }

  @override
  Future<int> getPendingScanCount() async {
    return database.getPendingScanCount();
  }

  @override
  Future<void> saveScanLog(Map<String, dynamic> log) async {
    await database.insertScanLog(log);
  }
}
