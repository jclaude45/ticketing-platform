import 'package:dio/dio.dart';

import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/constants/app_constants.dart';
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

  /// Uploads scans made offline for one event. Returns one result per scan, each with the
  /// `index` of the scan in [scans] and either a `result` (VALID, ALREADY_USED...) or an `error`.
  Future<List<Map<String, dynamic>>> syncScans(String eventId, List<Map<String, dynamic>> scans, {required String deviceId});
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
        // Past this delay the phone checks the ticket with its offline list instead
        options: Options(sendTimeout: AppConstants.scanTimeout, receiveTimeout: AppConstants.scanTimeout),
      );
      final body = response.data as Map<String, dynamic>? ?? {};
      final inner = (body['data'] ?? body) as Map<String, dynamic>;
      return ValidationResultModel.fromJson(inner, ticketCode: qrCode);
    } catch (e) {
      throw toAppException(e);
    }
  }

  @override
  Future<List<Map<String, dynamic>>> syncScans(String eventId, List<Map<String, dynamic>> scans, {required String deviceId}) async {
    if (scans.isEmpty) return const [];
    try {
      final response = await dioClient.post(
        ApiEndpoints.syncScans(eventId),
        data: {'scans': scans, 'deviceId': deviceId},
        options: Options(receiveTimeout: const Duration(minutes: 2)),
      );
      final body = response.data as Map<String, dynamic>? ?? {};
      final inner = (body['data'] ?? body) as Map<String, dynamic>;
      return (inner['results'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
    } catch (e) {
      throw toAppException(e);
    }
  }
}
