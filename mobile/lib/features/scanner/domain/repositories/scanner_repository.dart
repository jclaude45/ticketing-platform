import '../entities/validation_result.dart';

abstract class ScannerRepository {
  Future<ValidationResult> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
  });

  Future<void> saveOfflineScan({
    required String eventId,
    required String qrCode,
    required String result,
    String? gate,
  });

  Future<int> getPendingScanCount();

  Future<void> syncOfflineScans();
}
