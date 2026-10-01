import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../models/validation_result_model.dart';

abstract class ScannerRemoteSource {
  Future<ValidationResultModel> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
    String? deviceId,
  });

  /// Uploads scans made offline for one event (`{scans: [{qrContent, offlineScannedAt}]}`).
  Future<void> syncScans(String eventId, List<Map<String, dynamic>> scans);
}

class ScannerRemoteSourceImpl implements ScannerRemoteSource {
  final DioClient dioClient;

  const ScannerRemoteSourceImpl({required this.dioClient});

  @override
  Future<ValidationResultModel> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
    String? deviceId,
  }) async {
    try {
      final response = await dioClient.post(
        ApiEndpoints.validateTicket(eventId),
        data: {
          'qrContent': qrCode,
          if (gate != null) 'location': gate,
          if (deviceId != null) 'deviceId': deviceId,
        },
      );
      final body = response.data as Map<String, dynamic>? ?? {};
      final inner = (body['data'] ?? body) as Map<String, dynamic>;
      return ValidationResultModel.fromJson(inner, ticketCode: qrCode);
    } catch (e) {
      throw toAppException(e);
    }
  }

  @override
  Future<void> syncScans(String eventId, List<Map<String, dynamic>> scans) async {
    if (scans.isEmpty) return;
    try {
      await dioClient.post(ApiEndpoints.syncScans(eventId), data: {'scans': scans});
    } catch (e) {
      throw toAppException(e);
    }
  }
}
