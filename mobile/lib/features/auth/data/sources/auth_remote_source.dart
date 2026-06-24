import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../models/auth_model.dart';

abstract class AuthRemoteSource {
  Future<AuthResponseModel> login({
    required String email,
    required String password,
  });

  Future<void> logout();
}

class AuthRemoteSourceImpl implements AuthRemoteSource {
  final DioClient dioClient;

  const AuthRemoteSourceImpl({required this.dioClient});

  @override
  Future<AuthResponseModel> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await dioClient.post(
        ApiEndpoints.login,
        data: {
          'email': email,
          'password': password,
        },
      );

      if (response.data == null) {
        throw const ServerException(message: 'Empty response from server');
      }

      return AuthResponseModel.fromJson(
        response.data as Map<String, dynamic>,
      );
    } on ServerException {
      rethrow;
    } catch (e) {
      throw ServerException(message: e.toString());
    }
  }

  @override
  Future<void> logout() async {
    try {
      await dioClient.post(ApiEndpoints.logout);
    } catch (_) {
      // Ignore logout errors - always clear locally
    }
  }
}
