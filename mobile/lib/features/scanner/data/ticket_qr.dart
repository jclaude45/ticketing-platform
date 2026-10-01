import 'dart:convert';

/// Ticket reference read from a ZAYA QR code: v2 `{"id","sn","v":"2"}` or legacy v1
/// `{"p": "{\"tid\",\"sn\",...}", "s": signature}`. Null when it is not a ZAYA ticket.
({String id, String serial})? parseTicketQr(String content) {
  try {
    final raw = jsonDecode(content);
    if (raw is! Map) return null;
    String? id;
    String? serial;
    if (raw['v'] == '2') {
      id = raw['id'] as String?;
      serial = raw['sn'] as String?;
    } else if (raw['p'] is String) {
      final payload = jsonDecode(raw['p'] as String) as Map;
      id = payload['tid'] as String?;
      serial = payload['sn'] as String?;
    }
    if (id == null || id.isEmpty || serial == null || serial.isEmpty) return null;
    return (id: id, serial: serial);
  } catch (_) {
    return null;
  }
}
