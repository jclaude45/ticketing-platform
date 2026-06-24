import 'package:get_it/get_it.dart';

import '../network/dio_client.dart';
import '../storage/local_database.dart';
import '../storage/secure_storage.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/data/sources/auth_remote_source.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/login_usecase.dart';
import '../../features/auth/domain/usecases/logout_usecase.dart';
import '../../features/events/data/repositories/events_repository_impl.dart';
import '../../features/events/data/sources/events_local_source.dart';
import '../../features/events/data/sources/events_remote_source.dart';
import '../../features/events/domain/repositories/events_repository.dart';
import '../../features/events/domain/usecases/get_assigned_events.dart';
import '../../features/events/domain/usecases/sync_events.dart';
import '../../features/scanner/data/repositories/scanner_repository_impl.dart';
import '../../features/scanner/data/sources/scanner_local_source.dart';
import '../../features/scanner/data/sources/scanner_remote_source.dart';
import '../../features/scanner/domain/repositories/scanner_repository.dart';
import '../../features/scanner/domain/usecases/scan_ticket.dart';
import '../../features/scanner/domain/usecases/sync_offline_scans.dart';
import '../../features/accreditation/data/sources/accreditation_remote_source.dart';
import '../../features/sync/data/sync_repository_impl.dart';
import '../../features/sync/domain/sync_usecase.dart';

final getIt = GetIt.instance;

Future<void> configureDependencies() async {
  // Core
  getIt.registerLazySingleton<SecureStorage>(() => SecureStorage());
  getIt.registerLazySingleton<LocalDatabase>(() => LocalDatabase());
  getIt.registerLazySingleton<DioClient>(
    () => DioClient(secureStorage: getIt<SecureStorage>()),
  );

  // Network
  // (NetworkInfo is registered as a Riverpod provider)

  // Auth
  getIt.registerLazySingleton<AuthRemoteSource>(
    () => AuthRemoteSourceImpl(dioClient: getIt<DioClient>()),
  );
  getIt.registerLazySingleton<AuthRepository>(
    () => AuthRepositoryImpl(
      remoteSource: getIt<AuthRemoteSource>(),
      secureStorage: getIt<SecureStorage>(),
    ),
  );
  getIt.registerLazySingleton<LoginUsecase>(
    () => LoginUsecase(repository: getIt<AuthRepository>()),
  );
  getIt.registerLazySingleton<LogoutUsecase>(
    () => LogoutUsecase(
      repository: getIt<AuthRepository>(),
      secureStorage: getIt<SecureStorage>(),
      localDatabase: getIt<LocalDatabase>(),
    ),
  );

  // Events
  getIt.registerLazySingleton<EventsRemoteSource>(
    () => EventsRemoteSourceImpl(dioClient: getIt<DioClient>()),
  );
  getIt.registerLazySingleton<EventsLocalSource>(
    () => EventsLocalSourceImpl(database: getIt<LocalDatabase>()),
  );
  getIt.registerLazySingleton<EventsRepository>(
    () => EventsRepositoryImpl(
      remoteSource: getIt<EventsRemoteSource>(),
      localSource: getIt<EventsLocalSource>(),
    ),
  );
  getIt.registerLazySingleton<GetAssignedEvents>(
    () => GetAssignedEvents(repository: getIt<EventsRepository>()),
  );
  getIt.registerLazySingleton<SyncEvents>(
    () => SyncEvents(repository: getIt<EventsRepository>()),
  );

  // Scanner
  getIt.registerLazySingleton<ScannerRemoteSource>(
    () => ScannerRemoteSourceImpl(dioClient: getIt<DioClient>()),
  );
  getIt.registerLazySingleton<ScannerLocalSource>(
    () => ScannerLocalSourceImpl(database: getIt<LocalDatabase>()),
  );
  getIt.registerLazySingleton<ScannerRepository>(
    () => ScannerRepositoryImpl(
      remoteSource: getIt<ScannerRemoteSource>(),
      localSource: getIt<ScannerLocalSource>(),
      secureStorage: getIt<SecureStorage>(),
    ),
  );
  getIt.registerLazySingleton<ScanTicket>(
    () => ScanTicket(repository: getIt<ScannerRepository>()),
  );
  getIt.registerLazySingleton<SyncOfflineScans>(
    () => SyncOfflineScans(repository: getIt<ScannerRepository>()),
  );

  // Accreditation
  getIt.registerLazySingleton<AccreditationRemoteSource>(
    () => AccreditationRemoteSourceImpl(dioClient: getIt<DioClient>()),
  );

  // Sync
  getIt.registerLazySingleton<SyncRepositoryImpl>(
    () => SyncRepositoryImpl(
      scannerRepository: getIt<ScannerRepository>(),
      eventsRepository: getIt<EventsRepository>(),
    ),
  );
  getIt.registerLazySingleton<SyncUsecase>(
    () => SyncUsecase(repository: getIt<SyncRepositoryImpl>()),
  );
}
