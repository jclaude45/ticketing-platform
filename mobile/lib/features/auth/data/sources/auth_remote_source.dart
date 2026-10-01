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

      final auth = AuthResponseModel.fromJson(response.data as Map<String, dynamic>? ?? {});
      if (auth.user.role != 'controller') {
        throw const AuthException(message: 'Ce compte n\'est pas un compte contrôleur.');
      }
      return auth;
    } on AuthException catch (e) {
      // Wrong password / account not activated: the server's message is already in French
      throw AuthException(message: e.message);
    } on FormatException catch (e) {
      throw ServerException(message: e.message);
    } catch (e) {
      throw toAppException(e);
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
