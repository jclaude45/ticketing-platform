import '../../domain/entities/user_entity.dart';
import '../../domain/repositories/auth_repository.dart';
import '../sources/auth_remote_source.dart';
import '../../../../core/storage/secure_storage.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteSource remoteSource;
  final SecureStorage secureStorage;

  const AuthRepositoryImpl({
    required this.remoteSource,
    required this.secureStorage,
  });

  @override
  Future<({UserEntity user, String accessToken, String refreshToken})> login({
    required String email,
    required String password,
  }) async {
    final response = await remoteSource.login(
      email: email,
      password: password,
    );

    // Persist tokens and user
    await secureStorage.saveAccessToken(response.accessToken);
    await secureStorage.saveRefreshToken(response.refreshToken);
    await secureStorage.saveUser(response.user);

    return (
      user: response.user,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    );
  }

  @override
  Future<void> logout() async {
    await remoteSource.logout();
  }

  @override
  Future<UserEntity?> getCurrentUser() async {
    return secureStorage.getUser();
  }

  @override
  Future<bool> isLoggedIn() async {
    return secureStorage.isLoggedIn;
  }
}
