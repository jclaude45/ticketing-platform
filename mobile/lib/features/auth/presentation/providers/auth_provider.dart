import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/entities/user_entity.dart';
import '../../domain/usecases/login_usecase.dart';
import '../../domain/usecases/logout_usecase.dart';

// Auth state
enum AuthStatus { initial, loading, authenticated, unauthenticated, error }

class AuthState {
  final AuthStatus status;
  final UserEntity? user;
  final String? errorMessage;

  const AuthState({
    required this.status,
    this.user,
    this.errorMessage,
  });

  const AuthState.initial() : this(status: AuthStatus.initial);

  AuthState copyWith({
    AuthStatus? status,
    UserEntity? user,
    String? errorMessage,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      errorMessage: errorMessage,
    );
  }

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isLoading => status == AuthStatus.loading;
}

class AuthNotifier extends StateNotifier<AuthState> {
  final LoginUsecase _loginUsecase;
  final LogoutUsecase _logoutUsecase;

  AuthNotifier({
    required LoginUsecase loginUsecase,
    required LogoutUsecase logoutUsecase,
  })  : _loginUsecase = loginUsecase,
        _logoutUsecase = logoutUsecase,
        super(const AuthState.initial());

  Future<void> checkAuthStatus() async {
    try {
      final isLoggedIn = await _loginUsecase.repository.isLoggedIn();
      if (isLoggedIn) {
        final user = await _loginUsecase.repository.getCurrentUser();
        if (user != null) {
          state = AuthState(status: AuthStatus.authenticated, user: user);
          return;
        }
      }
    } catch (_) {}

    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final user = await _loginUsecase(email: email, password: password);
      state = AuthState(status: AuthStatus.authenticated, user: user);
      return true;
    } catch (e) {
      final message = e.toString()
          .replaceAll('Exception: ', '')
          .replaceAll('ArgumentError: ', '');
      state = AuthState(
        status: AuthStatus.error,
        errorMessage: message,
      );
      return false;
    }
  }

  Future<void> logout() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      await _logoutUsecase();
    } catch (_) {}
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void clearError() {
    if (state.status == AuthStatus.error) {
      state = AuthState(
        status: AuthStatus.unauthenticated,
        user: state.user,
      );
    }
  }
}

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    loginUsecase: getIt<LoginUsecase>(),
    logoutUsecase: getIt<LogoutUsecase>(),
  );
});

// Async check for routing
final authStateProvider = FutureProvider<bool>((ref) async {
  final repository = getIt<LoginUsecase>().repository;
  return repository.isLoggedIn();
});

// Current user provider
final currentUserProvider = Provider<UserEntity?>((ref) {
  return ref.watch(authNotifierProvider).user;
});
