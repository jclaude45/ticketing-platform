enum AccreditationStatus { valid, invalid, expired, revoked, notFound, error }

class AccreditationResult {
  final AccreditationStatus status;
  final String qrCode;
  final String? code;
  final String? memberName;
  final String? role;
  final List<String> zones;
  final String? photoUrl;
  final String? reason;
  final DateTime scannedAt;

  const AccreditationResult({
    required this.status,
    required this.qrCode,
    this.code,
    this.memberName,
    this.role,
    this.zones = const [],
    this.photoUrl,
    this.reason,
    required this.scannedAt,
  });

  bool get isValid => status == AccreditationStatus.valid;

  factory AccreditationResult.fromJson(Map<String, dynamic> json, {required String qrCode}) {
    // Handle TransformInterceptor wrapper
    final payload = json['data'] as Map<String, dynamic>? ?? json;
    final isValid = payload['valid'] as bool? ?? false;
    if (!isValid) {
      return AccreditationResult(
        status: AccreditationStatus.invalid,
        qrCode: qrCode,
        reason: _translateReason(payload['reason'] as String?),
        scannedAt: DateTime.now(),
      );
    }
    return AccreditationResult(
      status: AccreditationStatus.valid,
      qrCode: qrCode,
      code: payload['code'] as String?,
      memberName: payload['member'] as String?,
      role: payload['role'] as String?,
      zones: (payload['zones'] as List<dynamic>?)
              ?.map((z) => z.toString())
              .toList() ??
          [],
      photoUrl: payload['photoUrl'] as String?,
      scannedAt: DateTime.now(),
    );
  }

  factory AccreditationResult.error({required String qrCode, required String message}) {
    return AccreditationResult(
      status: AccreditationStatus.error,
      qrCode: qrCode,
      reason: message,
      scannedAt: DateTime.now(),
    );
  }

  /// French reasons for the controller (the server answers in English).
  static String _translateReason(String? reason) {
    const map = {
      'Accreditation expired': 'Ce badge a expiré.',
      'Accreditation has been revoked': 'Ce badge a été révoqué.',
      'Accreditation not found for this event': 'Ce badge n\'appartient pas à cet événement.',
      'Invalid QR code': 'Ce QR code n\'est pas un badge valide.',
    };
    if (reason == null) return 'Badge non valide.';
    return map[reason] ?? reason;
  }
}
