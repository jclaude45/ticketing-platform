import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../models/validation_result_model.dart';
import '../../domain/entities/validation_result.dart';

abstract class ScannerRemoteSource {
  Future<ValidationResultModel> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
  });

  Future<void> syncScans(List<Map<String, dynamic>> scans);
}

class ScannerRemoteSourceImpl implements ScannerRemoteSource {
  final DioClient dioClient;

  const ScannerRemoteSourceImpl({required this.dioClient});

  @override
  Future<ValidationResultModel> validateTicket({
    required String eventId,
    required String qrCode,
    String? gate,
    String? controllerId,
  }) async {
    try {
      final response = await dioClient.post(
        ApiEndpoints.validateTicket(eventId),
        data: {
          'qrContent': qrCode,
          if (gate != null) 'location': gate,
          if (controllerId != null) 'deviceId': controllerId,
        },
      );

      if (response.data == null) {
        throw const ServerException(message: 'Empty response from server');
      }

      // Unwrap TransformInterceptor: { success, data: { result, message, ticket } }
      final wrapper = response.data as Map<String, dynamic>;
      final inner = (wrapper['data'] ?? wrapper) as Map<String, dynamic>;

      return ValidationResultModel.fromJson(inner, ticketCode: qrCode);
    } on ServerException {
      rethrow;
    } on NetworkException {
      rethrow;
    } catch (e) {
      throw ServerException(
          message: 'Validation error: ${e.toString()}');
    }
  }

  @override
  Future<void> syncScans(List<Map<String, dynamic>> scans) async {
    if (scans.isEmpty) return;

    try {
      await dioClient.post(
        ApiEndpoints.syncScans,
        data: {'scans': scans},
      );
    } catch (e) {
      throw ServerException(
          message: 'Sync failed: ${e.toString()}');
    }
  }
}
