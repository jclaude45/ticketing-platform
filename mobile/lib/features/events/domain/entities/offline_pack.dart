/// Tickets of an event stored on the phone so they can be checked without network.
class OfflinePackInfo {
  final int ticketCount;

  /// Server time of the list: tickets bought after it are unknown offline
  final DateTime generatedAt;

  const OfflinePackInfo({required this.ticketCount, required this.generatedAt});
}
