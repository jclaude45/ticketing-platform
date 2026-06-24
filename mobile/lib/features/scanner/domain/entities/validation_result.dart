enum ValidationStatus {
  valid,
  used,
  fraudulent,
  notFound,
  error,
}

class ValidationResult {
  final ValidationStatus status;
  final String ticketCode;
  final String? ticketId;
  final String? serialNumber;
  final String? holderName;
  final String? holderEmail;
  final String? ticketType;
  final String? eventId;
  final String? eventName;
  final String? gate;
  final String? zone;
  final String? seat;
  final DateTime? usedAt;
  final String? usedBy;
  final String? usedAtGate;
  final String? errorMessage;
  final bool isOfflineResult;
  final DateTime scannedAt;
  final String? securityNote;

  const ValidationResult({
    required this.status,
    required this.ticketCode,
    this.ticketId,
    this.serialNumber,
    this.holderName,
    this.holderEmail,
    this.ticketType,
    this.eventId,
    this.eventName,
    this.gate,
    this.zone,
    this.seat,
    this.usedAt,
    this.usedBy,
    this.usedAtGate,
    this.errorMessage,
    this.isOfflineResult = false,
    required this.scannedAt,
    this.securityNote,
  });

  bool get isValid => status == ValidationStatus.valid;
  bool get isUsed => status == ValidationStatus.used;
  bool get isFraudulent => status == ValidationStatus.fraudulent;
  bool get isNotFound => status == ValidationStatus.notFound;
  bool get hasError => status == ValidationStatus.error;

  factory ValidationResult.valid({
    required String ticketCode,
    String? ticketId,
    String? serialNumber,
    String? holderName,
    String? holderEmail,
    String? ticketType,
    String? eventId,
    String? eventName,
    String? gate,
    String? zone,
    String? seat,
    bool isOfflineResult = false,
  }) {
    return ValidationResult(
      status: ValidationStatus.valid,
      ticketCode: ticketCode,
      ticketId: ticketId,
      serialNumber: serialNumber,
      holderName: holderName,
      holderEmail: holderEmail,
      ticketType: ticketType,
      eventId: eventId,
      eventName: eventName,
      gate: gate,
      zone: zone,
      seat: seat,
      isOfflineResult: isOfflineResult,
      scannedAt: DateTime.now(),
    );
  }

  factory ValidationResult.used({
    required String ticketCode,
    String? ticketId,
    String? serialNumber,
    String? holderName,
    String? holderEmail,
    String? ticketType,
    String? eventId,
    String? eventName,
    DateTime? usedAt,
    String? usedBy,
    String? usedAtGate,
    bool isOfflineResult = false,
  }) {
    return ValidationResult(
      status: ValidationStatus.used,
      ticketCode: ticketCode,
      ticketId: ticketId,
      serialNumber: serialNumber,
      holderName: holderName,
      holderEmail: holderEmail,
      ticketType: ticketType,
      eventId: eventId,
      eventName: eventName,
      usedAt: usedAt,
      usedBy: usedBy,
      usedAtGate: usedAtGate,
      isOfflineResult: isOfflineResult,
      scannedAt: DateTime.now(),
    );
  }

  factory ValidationResult.fraudulent({
    required String ticketCode,
    String? eventId,
    String? securityNote,
    bool isOfflineResult = false,
  }) {
    return ValidationResult(
      status: ValidationStatus.fraudulent,
      ticketCode: ticketCode,
      eventId: eventId,
      securityNote: securityNote,
      isOfflineResult: isOfflineResult,
      scannedAt: DateTime.now(),
    );
  }

  factory ValidationResult.notFound({
    required String ticketCode,
    String? eventId,
  }) {
    return ValidationResult(
      status: ValidationStatus.notFound,
      ticketCode: ticketCode,
      eventId: eventId,
      errorMessage: 'Ticket not found in the system',
      scannedAt: DateTime.now(),
    );
  }

  factory ValidationResult.error({
    required String ticketCode,
    required String message,
  }) {
    return ValidationResult(
      status: ValidationStatus.error,
      ticketCode: ticketCode,
      errorMessage: message,
      scannedAt: DateTime.now(),
    );
  }
}
