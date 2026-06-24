import '../entities/user_entity.dart';
import '../repositories/auth_repository.dart';

class LoginUsecase {
  final AuthRepository repository;

  const LoginUsecase({required this.repository});

  Future<UserEntity> call({
    required String email,
    required String password,
  }) async {
    if (email.isEmpty) {
      throw ArgumentError('Email cannot be empty');
    }
    if (password.isEmpty) {
      throw ArgumentError('Password cannot be empty');
    }
    if (!_isValidEmail(email)) {
      throw ArgumentError('Invalid email format');
    }

    final result = await repository.login(
      email: email.trim().toLowerCase(),
      password: password,
    );

    return result.user;
  }

  bool _isValidEmail(String email) {
    final emailRegex = RegExp(
      r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
    );
    return emailRegex.hasMatch(email);
  }
}
