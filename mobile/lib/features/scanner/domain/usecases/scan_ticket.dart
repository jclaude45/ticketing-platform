import '../entities/validation_result.dart';
import '../repositories/scanner_repository.dart';

class ScanTicket {
  final ScannerRepository repository;

  const ScanTicket({required this.repository});

  Future<ValidationResult> call({
    required String eventId,
    required String qrCode,
    String? gate,
  }) async {
    if (qrCode.isEmpty) {
      return ValidationResult.error(
        ticketCode: qrCode,
        message: 'Invalid QR code: empty content',
      );
    }

    try {
      return await repository.validateTicket(
        eventId: eventId,
        qrCode: qrCode,
        gate: gate,
      );
    } catch (e) {
      return ValidationResult.error(
        ticketCode: qrCode,
        message: e.toString().replaceAll('Exception: ', ''),
      );
    }
  }
}
