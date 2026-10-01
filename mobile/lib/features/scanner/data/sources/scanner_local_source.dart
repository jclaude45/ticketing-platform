import 'package:uuid/uuid.dart';

import '../../../../core/storage/local_database.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/validation_result.dart';
import '../models/validation_result_model.dart';
import '../ticket_qr.dart';

abstract class ScannerLocalSource {
  Future<bool> hasOfflinePack(String eventId);

  /// Checks a ticket against the downloaded list. A valid ticket is marked used on the
  /// phone and queued for upload.
  Future<ValidationResultModel> validateTicketOffline({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
    String? controllerName,
  });

  Future<List<Map<String, dynamic>>> getPendingScans();

  Future<void> markScanSynced(String id);

  Future<void> incrementScanRetry(String id, String error);

  Future<int> getPendingScanCount({String? eventId});

  Future<void> saveScanLog(Map<String, dynamic> log);
}

class ScannerLocalSourceImpl implements ScannerLocalSource {
  final LocalDatabase database;
  final _uuid = const Uuid();

  const ScannerLocalSourceImpl({required this.database});

  @override
  Future<bool> hasOfflinePack(String eventId) async => await database.getOfflinePack(eventId) != null;

  @override
  Future<ValidationResultModel> validateTicketOffline({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
    String? controllerName,
  }) async {
    final scannedAt = DateTime.now();
    ValidationResultModel refused(ValidationStatus status, String message, [Map<String, dynamic>? t]) =>
        ValidationResultModel(
          status: status,
          ticketCode: qrCode,
          ticketId: t?['id'] as String?,
          serialNumber: t?['serial_number'] as String?,
          holderName: t?['holder_name'] as String?,
          ticketType: t?['ticket_type'] as String?,
          eventId: eventId,
          errorMessage: message,
          isOfflineResult: true,
          scannedAt: scannedAt,
        );

    final ref = parseTicketQr(qrCode);
    if (ref == null) return refused(ValidationStatus.notFound, "Ce QR code n'est pas un billet ZAYA.");

    final ticket = await database.getTicketById(ref.id);
    if (ticket == null || ticket['event_id'] != eventId) {
      return refused(
        ValidationStatus.notFound,
        "Billet absent de la liste hors ligne. S'il vient d'être acheté, vérifiez-le dès que le réseau revient.",
      );
    }
    if (ticket['serial_number'] != ref.serial) {
      return refused(ValidationStatus.fraudulent, 'Le QR code ne correspond pas au billet : billet falsifié.', ticket);
    }

    switch (ticket['status'] as String? ?? 'valid') {
      case 'used':
        final usedAt = ticket['used_at'] as String?;
        return ValidationResultModel(
          status: ValidationStatus.used,
          ticketCode: qrCode,
          ticketId: ticket['id'] as String?,
          serialNumber: ticket['serial_number'] as String?,
          holderName: ticket['holder_name'] as String?,
          ticketType: ticket['ticket_type'] as String?,
          eventId: eventId,
          usedAt: usedAt != null ? DateTime.tryParse(usedAt)?.toLocal() : null,
          isOfflineResult: true,
          scannedAt: scannedAt,
        );
      case 'cancelled':
        return refused(ValidationStatus.error, 'Ce billet a été annulé.', ticket);
      case 'fraudulent':
        return refused(ValidationStatus.fraudulent, 'Ce billet est signalé comme frauduleux.', ticket);
      case 'valid':
      case 'pending':
        break;
      default:
        return refused(ValidationStatus.error, "Ce billet n'est pas valide.", ticket);
    }

    // Valid: mark used here (a second scan of it is refused) and queue it for the server
    final now = scannedAt.toUtc().toIso8601String();
    await database.markTicketUsedById(ref.id, usedAt: now, usedBy: controllerId ?? 'controller');
    await database.insertPendingScan({
      'id': _uuid.v4(),
      'event_id': eventId,
      'ticket_id': ref.id,
      'qr_code': qrCode,
      'scanned_at': now,
      'controller_id': controllerId ?? '',
      'controller_name': controllerName,
      'gate': gate,
      'result': ValidationStatus.valid.name,
      'synced': 0,
      'retry_count': 0,
      'created_at': AppDateUtils.nowIso(),
    });

    return ValidationResultModel(
      status: ValidationStatus.valid,
      ticketCode: qrCode,
      ticketId: ticket['id'] as String?,
      serialNumber: ticket['serial_number'] as String?,
      holderName: ticket['holder_name'] as String?,
      ticketType: ticket['ticket_type'] as String?,
      eventId: eventId,
      gate: gate,
      isOfflineResult: true,
      scannedAt: scannedAt,
    );
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
  Future<int> getPendingScanCount({String? eventId}) async {
    return eventId == null ? database.getPendingScanCount() : database.getPendingScanCountForEvent(eventId);
  }

  @override
  Future<void> saveScanLog(Map<String, dynamic> log) async {
    await database.insertScanLog(log);
  }
}
