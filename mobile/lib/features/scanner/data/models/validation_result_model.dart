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
    final statusStr = json['status'] as String? ?? 'error';
    final status = ValidationStatus.values.firstWhere(
      (s) => s.name == statusStr,
      orElse: () => ValidationStatus.error,
    );

    final ticket = json['ticket'] as Map<String, dynamic>?;
    final firstUse = json['first_use'] as Map<String, dynamic>?;

    return ValidationResultModel(
      status: status,
      ticketCode: ticketCode,
      ticketId: ticket?['id'] as String? ?? json['ticket_id'] as String?,
      serialNumber: ticket?['serial_number'] as String? ??
          json['serial_number'] as String?,
      holderName: ticket?['holder_name'] as String? ??
          json['holder_name'] as String?,
      holderEmail: ticket?['holder_email'] as String? ??
          json['holder_email'] as String?,
      ticketType: ticket?['type'] as String? ?? json['ticket_type'] as String?,
      eventId: json['event_id'] as String?,
      eventName: json['event_name'] as String?,
      gate: json['gate'] as String?,
      zone: ticket?['zone'] as String?,
      seat: ticket?['seat'] as String?,
      usedAt: firstUse != null && firstUse['at'] != null
          ? DateTime.parse(firstUse['at'] as String)
          : (json['used_at'] != null
              ? DateTime.parse(json['used_at'] as String)
              : null),
      usedBy: firstUse?['controller_name'] as String? ??
          json['used_by'] as String?,
      usedAtGate: firstUse?['gate'] as String? ??
          json['used_at_gate'] as String?,
      errorMessage: json['message'] as String? ?? json['error'] as String?,
      isOfflineResult: isOfflineResult,
      scannedAt: DateTime.now(),
      securityNote: json['security_note'] as String?,
    );
  }
}
