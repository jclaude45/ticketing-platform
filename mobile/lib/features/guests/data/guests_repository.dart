import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/di/injection_container.dart';
import '../../../core/error/exceptions.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/local_database.dart';
import '../../scanner/domain/entities/validation_result.dart';
import '../../scanner/domain/usecases/scan_ticket.dart';
import '../../sync/presentation/providers/sync_provider.dart';

/// A ticket holder of the event, from the ticket list kept on the phone.
class Guest {
  final String id;
  final String serialNumber;
  final String name;
  final String? ticketType;
  final DateTime? checkedInAt;

  const Guest({required this.id, required this.serialNumber, required this.name, this.ticketType, this.checkedInAt});

  bool get checkedIn => checkedInAt != null;

  /// Same content as the ticket's QR (v2), so a manual check-in follows the scan path
  String get qrContent => jsonEncode({'id': id, 'sn': serialNumber, 'v': '2'});
}

/// Entries of the event on the phone: tickets that can enter, and those already in.
class TicketCounts {
  final int checkedIn;
  final int total;

  const TicketCounts({required this.checkedIn, required this.total});

  int get remaining => (total - checkedIn).clamp(0, total);
}

class GuestsRepository {
  final LocalDatabase db;
  final DioClient dioClient;

  const GuestsRepository({required this.db, required this.dioClient});

  /// Valid and used tickets, by name (anonymous tickets show their number).
  Future<List<Guest>> list(String eventId) async {
    final database = await db.database;
    final rows = await database.query(
      AppConstants.ticketsTable,
      columns: ['id', 'serial_number', 'holder_name', 'ticket_type', 'status', 'used_at'],
      where: "event_id = ? AND status IN ('valid', 'used')",
      whereArgs: [eventId],
    );
    final guests = rows.map((r) {
      final name = (r['holder_name'] as String?)?.trim();
      final usedAt = r['used_at'] as String?;
      return Guest(
        id: r['id'] as String,
        serialNumber: r['serial_number'] as String,
        name: name == null || name.isEmpty ? 'Billet ${r['serial_number']}' : name,
        ticketType: r['ticket_type'] as String?,
        // A ticket marked used without a time (old offline entry) still counts as in
        checkedInAt: r['status'] == 'used' ? DateTime.tryParse(usedAt ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0) : null,
      );
    }).toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return guests;
  }

  Future<TicketCounts> counts(String eventId) async {
    final database = await db.database;
    final rows = await database.rawQuery(
      "SELECT status, COUNT(*) AS n FROM ${AppConstants.ticketsTable} WHERE event_id = ? AND status IN ('valid', 'used') GROUP BY status",
      [eventId],
    );
    var used = 0, total = 0;
    for (final r in rows) {
      final n = r['n'] as int? ?? 0;
      total += n;
      if (r['status'] == 'used') used = n;
    }
    return TicketCounts(checkedIn: used, total: total);
  }

  /// Invitation ticket(s) created on the server and emailed to the guest (online only).
  Future<int> add(
    String eventId, {
    required String lastName,
    required String firstName,
    required String email,
    String? phone,
    String? address,
    required int count,
  }) async {
    try {
      final response = await dioClient.post(ApiEndpoints.addGuest(eventId), data: {
        'lastName': lastName,
        'firstName': firstName,
        'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (address != null && address.isNotEmpty) 'address': address,
        'count': count,
      });
      final body = response.data as Map<String, dynamic>? ?? {};
      final data = body['data'] as Map<String, dynamic>? ?? body;
      return data['created'] as int? ?? count;
    } catch (e) {
      throw toAppException(e);
    }
  }

  /// Lets a guest in from the list: same check as scanning their ticket (works offline).
  Future<ValidationResult> checkIn(String eventId, Guest guest) =>
      getIt<ScanTicket>()(eventId: eventId, qrCode: guest.qrContent);
}

/// Guest list of an event, reloaded after each sync (ticket list refreshed, entries sent).
final eventGuestsProvider = FutureProvider.autoDispose.family<List<Guest>, String>((ref, eventId) {
  ref.watch(syncNotifierProvider.select((s) => s.lastSyncAt));
  return getIt<GuestsRepository>().list(eventId);
});

final ticketCountsProvider = FutureProvider.autoDispose.family<TicketCounts, String>((ref, eventId) {
  ref.watch(syncNotifierProvider.select((s) => s.lastSyncAt));
  return getIt<GuestsRepository>().counts(eventId);
});
