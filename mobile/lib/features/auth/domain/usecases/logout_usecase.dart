import '../repositories/auth_repository.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/storage/local_database.dart';

class LogoutUsecase {
  final AuthRepository repository;
  final SecureStorage secureStorage;
  final LocalDatabase localDatabase;

  const LogoutUsecase({
    required this.repository,
    required this.secureStorage,
    required this.localDatabase,
  });

  Future<void> call() async {
    // Try to notify server but don't fail on network error
    try {
      await repository.logout();
    } catch (_) {}

    // Always clear local data
    await secureStorage.clearAll();
    await localDatabase.clearAll();
  }
}
