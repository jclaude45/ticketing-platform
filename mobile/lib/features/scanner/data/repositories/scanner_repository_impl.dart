import 'package:uuid/uuid.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_info.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/utils/date_utils.dart';
import '../../domain/entities/scan_sync_report.dart';
import '../../domain/entities/validation_result.dart';
import '../../domain/repositories/scanner_repository.dart';
import '../sources/scanner_local_source.dart';
import '../sources/scanner_remote_source.dart';
import '../models/validation_result_model.dart';
import '../ticket_qr.dart';

class ScannerRepositoryImpl implements ScannerRepository {
  final ScannerRemoteSource remoteSource;
  final ScannerLocalSource localSource;
  final SecureStorage secureStorage;
  final NetworkInfo networkInfo;
  final _uuid = const Uuid();

  ScannerRepositoryImpl({
    required this.remoteSource,
    required this.localSource,
    required this.secureStorage,
    required this.networkInfo,
  });

  @override
  Future<ValidationResult> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
  }) async {
    final user = await secureStorage.getUser();
    final hasPack = await localSource.hasOfflinePack(eventId);

    // Known offline: no point waiting for a timeout at the door
    if (hasPack && !await networkInfo.isConnected) {
      return _validateOffline(eventId: eventId, qrCode: qrCode, gate: gate, controllerId: user?.id, controllerName: user?.name);
    }

    try {
      final result = await remoteSource.validateTicket(eventId: eventId, qrCode: qrCode, gate: gate);
      // Entry recorded online: the phone's list knows it at once, so a rescan of the same
      // ticket after a network cut is refused instead of becoming a conflict
      if (hasPack && (result.isValid || result.isUsed)) {
        await localSource.markTicketUsed(parseTicketQr(qrCode)?.id ?? result.ticketId);
      }
      await _saveScanLog(result: result, eventId: eventId, qrCode: qrCode, gate: gate, controllerId: user?.id);
      return result;
    } on NetworkException catch (e) {
      if (hasPack) {
        return _validateOffline(eventId: eventId, qrCode: qrCode, gate: gate, controllerId: user?.id, controllerName: user?.name);
      }
      return ValidationResult(
        status: ValidationStatus.error,
        ticketCode: qrCode,
        errorMessage: '${e.message} Le billet n\'a pas pu être vérifié. Téléchargez la liste des billets '
            '(écran de l\'événement) pour pouvoir scanner sans réseau.',
        isOfflineResult: true,
        networkFailure: true,
        scannedAt: DateTime.now(),
      );
    } on AuthException catch (e) {
      // 403 = not assigned to this event; 401 (session expired) is handled by the interceptor
      return ValidationResult.error(ticketCode: qrCode, message: ValidationResultModel.translate(e.message) ?? e.message);
    } on ServerException catch (e) {
      return ValidationResult.error(ticketCode: qrCode, message: ValidationResultModel.translate(e.message) ?? e.message);
    }
  }

  Future<ValidationResult> _validateOffline({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
    String? controllerName,
  }) async {
    try {
      final result = await localSource.validateTicketOffline(
        eventId: eventId,
        qrCode: qrCode,
        gate: gate,
        controllerId: controllerId,
        controllerName: controllerName,
      );
      await _saveScanLog(result: result, eventId: eventId, qrCode: qrCode, gate: gate, controllerId: controllerId);
      return result;
    } catch (_) {
      return ValidationResult.error(ticketCode: qrCode, message: 'Vérification hors connexion impossible.');
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
  Future<int> getPendingScanCount({String? eventId}) => localSource.getPendingScanCount(eventId: eventId);

  @override
  Future<ScanSyncReport> syncOfflineScans() async {
    final pendingScans = await localSource.getPendingScans();
    if (pendingScans.isEmpty) return ScanSyncReport.empty;
    final deviceId = await secureStorage.getOrCreateDeviceId();

    // The server takes the offline scans of one event per call
    final byEvent = <String, List<Map<String, dynamic>>>{};
    for (final scan in pendingScans) {
      byEvent.putIfAbsent(scan['event_id'] as String, () => []).add(scan);
    }

    var report = ScanSyncReport.empty;
    for (final entry in byEvent.entries) {
      final batch = entry.value;
      final List<Map<String, dynamic>> results;
      try {
        results = await remoteSource.syncScans(
          entry.key,
          [for (final scan in batch) {'qrContent': scan['qr_code'], 'offlineScannedAt': scan['scanned_at']}],
          deviceId: deviceId,
        );
      } on NetworkException {
        // Network lost: keep everything for the next attempt, without counting it as a failure
        return report + ScanSyncReport(remaining: await localSource.getPendingScanCount());
      } catch (e) {
        for (final scan in batch) {
          await localSource.incrementScanRetry(scan['id'] as String, e.toString());
        }
        report += ScanSyncReport(remaining: batch.length);
        continue;
      }
      report += await _applyResults(batch, results);
    }
    return report;
  }

  Future<ScanSyncReport> _applyResults(List<Map<String, dynamic>> batch, List<Map<String, dynamic>> results) async {
    var accepted = 0, conflicts = 0, rejected = 0, remaining = 0;
    final byIndex = {for (final r in results) if (r['index'] is int) r['index'] as int: r};
    for (var i = 0; i < batch.length; i++) {
      final scan = batch[i];
      final id = scan['id'] as String;
      final r = byIndex[i];
      if (r == null || r['error'] != null) {
        await localSource.incrementScanRetry(id, (r?['error'] ?? 'Pas de réponse du serveur').toString());
        remaining++;
        continue;
      }
      await localSource.markScanSynced(id);
      switch (r['result']) {
        case 'VALID':
          accepted++;
        case 'ALREADY_USED':
          // Same entry already recorded (an online attempt that timed out but reached the
          // server) is not a conflict; another entry with the same ticket is.
          final serverAt = DateTime.tryParse('${r['checkedInAt']}');
          final localAt = DateTime.tryParse('${scan['scanned_at']}');
          final sameEntry = serverAt != null && localAt != null && serverAt.difference(localAt).inSeconds.abs() <= 60;
          sameEntry ? accepted++ : conflicts++;
        default:
          rejected++;
      }
    }
    return ScanSyncReport(accepted: accepted, conflicts: conflicts, rejected: rejected, remaining: remaining);
  }
}
