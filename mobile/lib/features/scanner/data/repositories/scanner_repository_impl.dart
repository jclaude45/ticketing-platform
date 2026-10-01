import 'package:uuid/uuid.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/validation_result.dart';
import '../../domain/repositories/scanner_repository.dart';
import '../sources/scanner_local_source.dart';
import '../sources/scanner_remote_source.dart';
import '../models/validation_result_model.dart';

class ScannerRepositoryImpl implements ScannerRepository {
  final ScannerRemoteSource remoteSource;
  final ScannerLocalSource localSource;
  final SecureStorage secureStorage;
  final _uuid = const Uuid();

  ScannerRepositoryImpl({
    required this.remoteSource,
    required this.localSource,
    required this.secureStorage,
  });

  @override
  Future<ValidationResult> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
  }) async {
    final user = await secureStorage.getUser();
    final controllerId = user?.id;
    final controllerName = user?.name;

    // Online only for now: tickets are not downloaded to the phone yet, so an "offline
    // validation" could only say "not found". Each failure is shown for what it is.
    try {
      final result = await remoteSource.validateTicket(
        eventId: eventId,
        qrCode: qrCode,
        gate: gate,
      );
      await _saveScanLog(result: result, eventId: eventId, qrCode: qrCode, gate: gate, controllerId: controllerId);
      return result;
    } on NetworkException catch (e) {
      return ValidationResult(
        status: ValidationStatus.error,
        ticketCode: qrCode,
        errorMessage: '${e.message} Le billet n\'a pas pu être vérifié : réessayez dès que le réseau revient.',
        isOfflineResult: true,
        scannedAt: DateTime.now(),
      );
    } on AuthException catch (e) {
      // 403 = not assigned to this event; 401 (session expired) is handled by the interceptor
      return ValidationResult.error(ticketCode: qrCode, message: ValidationResultModel.translate(e.message) ?? e.message);
    } on ServerException catch (e) {
      return ValidationResult.error(ticketCode: qrCode, message: ValidationResultModel.translate(e.message) ?? e.message);
    }
  }

  // Kept for the offline mode of a later batch (needs the tickets downloaded first)
  // ignore: unused_element
  Future<ValidationResult> _validateOffline({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
    String? controllerName,
  }) async {
    try {
      final localResult = await localSource.validateTicketOffline(
        eventId: eventId,
        qrCode: qrCode,
        gate: gate,
        controllerId: controllerId,
        controllerName: controllerName,
      );

      if (localResult != null) {
        // Save as pending scan for later sync
        await localSource.saveOfflineScan(
          eventId: eventId,
          qrCode: qrCode,
          result: localResult.status.name,
          gate: gate,
          controllerId: controllerId,
          controllerName: controllerName,
        );

        // Save log
        await _saveScanLog(
          result: localResult,
          eventId: eventId,
          qrCode: qrCode,
          gate: gate,
          controllerId: controllerId,
        );

        return localResult;
      } else {
        // Not found in local cache
        final result = ValidationResult.notFound(
          ticketCode: qrCode,
          eventId: eventId,
        );

        await localSource.saveOfflineScan(
          eventId: eventId,
          qrCode: qrCode,
          result: 'not_found',
          gate: gate,
          controllerId: controllerId,
          controllerName: controllerName,
        );

        return result;
      }
    } catch (e) {
      return ValidationResult.error(
        ticketCode: qrCode,
        message: 'Vérification hors connexion impossible.',
      );
    }
  }

  Future<void> _saveScanLog({
    required ValidationResult result,
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
  }) async {
    try {
      await localSource.saveScanLog({
        'id': _uuid.v4(),
        'event_id': eventId,
        'ticket_id': result.ticketId,
        'qr_code': qrCode,
        'result': result.status.name,
        'scanned_at': AppDateUtils.nowIso(),
        'controller_id': controllerId,
        'gate': gate,
        'holder_name': result.holderName,
        'serial_number': result.serialNumber,
        'ticket_type': result.ticketType,
      });
    } catch (_) {}
  }

  @override
  Future<void> saveOfflineScan({
    required String eventId,
    required String qrCode,
    required String result,
    String? gate,
  }) async {
    final user = await secureStorage.getUser();
    await localSource.saveOfflineScan(
      eventId: eventId,
      qrCode: qrCode,
      result: result,
      gate: gate,
      controllerId: user?.id,
      controllerName: user?.name,
    );
  }

  @override
  Future<int> getPendingScanCount() async {
    return localSource.getPendingScanCount();
  }

  @override
  Future<void> syncOfflineScans() async {
    final pendingScans = await localSource.getPendingScans();
    if (pendingScans.isEmpty) return;

    // The server takes the offline scans of one event per call
    final byEvent = <String, List<Map<String, dynamic>>>{};
    for (final scan in pendingScans) {
      byEvent.putIfAbsent(scan['event_id'] as String, () => []).add(scan);
    }
    for (final entry in byEvent.entries) {
      final batch = entry.value.take(500).toList();
      try {
        await remoteSource.syncScans(entry.key, [
          for (final scan in batch)
            {'qrContent': scan['qr_code'], 'offlineScannedAt': scan['scanned_at']},
        ]);
        for (final scan in batch) {
          await localSource.markScanSynced(scan['id'] as String);
        }
      } catch (e) {
        for (final scan in batch) {
          await localSource.incrementScanRetry(scan['id'] as String, e.toString());
        }
      }
    }
  }
}
