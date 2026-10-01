import '../entities/scan_sync_report.dart';
import '../entities/validation_result.dart';

abstract class ScannerRepository {
  Future<ValidationResult> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
  });

  /// Scans validated without network and not uploaded yet ([eventId]: for one event).
  Future<int> getPendingScanCount({String? eventId});

  /// Uploads them; stops (keeping them) as soon as the network is lost.
  Future<ScanSyncReport> syncOfflineScans();
}
