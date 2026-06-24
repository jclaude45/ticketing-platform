import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../../domain/entities/accreditation_result.dart';

abstract class AccreditationRemoteSource {
  Future<AccreditationResult> scanAccreditation({
    required String eventId,
    required String qrCode,
  });
}

class AccreditationRemoteSourceImpl implements AccreditationRemoteSource {
  final DioClient dioClient;

  const AccreditationRemoteSourceImpl({required this.dioClient});

  @override
  Future<AccreditationResult> scanAccreditation({
    required String eventId,
    required String qrCode,
  }) async {
    try {
      final response = await dioClient.post(
        ApiEndpoints.scanAccreditation(eventId),
        data: {'qr': qrCode},
      );
      return AccreditationResult.fromJson(
        response.data as Map<String, dynamic>,
        qrCode: qrCode,
      );
    } on ServerException {
      rethrow;
    } on NetworkException {
      rethrow;
    } catch (e) {
      throw ServerException(message: 'Accreditation scan failed: $e');
    }
  }
}
