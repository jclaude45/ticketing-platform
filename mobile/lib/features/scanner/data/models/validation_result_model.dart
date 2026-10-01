import '../../domain/entities/validation_result.dart';

class ValidationResultModel extends ValidationResult {
  const ValidationResultModel({
    required super.status,
    required super.ticketCode,
    super.ticketId,
    super.serialNumber,
    super.holderName,
    super.holderEmail,
    super.ticketType,
    super.eventId,
    super.eventName,
    super.gate,
    super.zone,
    super.seat,
    super.usedAt,
    super.usedBy,
    super.usedAtGate,
    super.errorMessage,
    super.isOfflineResult,
    required super.scannedAt,
    super.securityNote,
  });

  factory ValidationResultModel.fromJson(
    Map<String, dynamic> json, {
    required String ticketCode,
    bool isOfflineResult = false,
  }) {
    // Backend returns 'result' (uppercase: VALID, INVALID, ALREADY_USED, FRAUDULENT, EXPIRED)
    final rawResult = (json['result'] as String? ?? json['status'] as String? ?? 'error').toUpperCase();
    final status = _mapResult(rawResult);

    // Backend returns camelCase ticket fields
    final ticket = json['ticket'] as Map<String, dynamic>?;

    DateTime? usedAt;
    if (ticket?['checkedInAt'] != null) {
      usedAt = DateTime.tryParse(ticket!['checkedInAt'] as String);
    }

    return ValidationResultModel(
      status: status,
      ticketCode: ticketCode,
      ticketId: ticket?['id'] as String?,
      serialNumber: ticket?['serialNumber'] as String? ?? ticket?['serial_number'] as String?,
      holderName: ticket?['holderName'] as String? ?? ticket?['holder_name'] as String?,
      holderEmail: ticket?['holderEmail'] as String? ?? ticket?['holder_email'] as String?,
      ticketType: ticket?['templateName'] as String? ?? ticket?['type'] as String?,
      gate: json['gate'] as String?,
      usedAt: usedAt,
      errorMessage: translate(json['message'] as String? ?? json['error'] as String?),
      isOfflineResult: isOfflineResult,
      scannedAt: DateTime.now(),
    );
  }

  static ValidationStatus _mapResult(String result) {
    switch (result) {
      case 'VALID':
        return ValidationStatus.valid;
      case 'ALREADY_USED':
        return ValidationStatus.used;
      case 'FRAUDULENT':
        return ValidationStatus.fraudulent;
      case 'INVALID':
        return ValidationStatus.notFound;
      case 'EXPIRED': // event over: shown as a refused scan with its message
        return ValidationStatus.error;
      default:
        return ValidationStatus.error;
    }
  }

  /// French message for the controller (the server answers in English).
  static String? translate(String? message) {
    if (message == null) return null;
    const map = {
      'Ticket not found for this event': 'Ce billet n\'existe pas pour cet événement.',
      'Ticket not found in the system': 'Ce billet n\'existe pas pour cet événement.',
      'Invalid QR code format': 'Ce QR code n\'est pas un billet ZAYA.',
      'Ticket has already been used': 'Ce billet a déjà été utilisé.',
      'Ticket has been cancelled': 'Ce billet a été annulé.',
      'Ticket is marked as fraudulent': 'Ce billet est signalé comme frauduleux.',
      'Fraudulent ticket detected - invalid cryptographic signature': 'Billet falsifié : signature invalide.',
      'Event has ended': 'L\'événement est terminé.',
      'You are not authorized to scan tickets for this event': 'Vous n\'êtes pas assigné(e) à cet événement.',
      'Accès réservé à l\'organisateur': 'Action non autorisée pour un contrôleur.',
    };
    if (map.containsKey(message)) return map[message];
    if (message.startsWith('Ticket status is')) return 'Ce billet n\'est pas valide (${message.substring(17).trim()}).';
    return message;
  }
}
