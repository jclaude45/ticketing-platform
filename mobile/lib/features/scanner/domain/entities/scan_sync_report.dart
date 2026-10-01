/// Outcome of uploading the scans validated without network.
class ScanSyncReport {
  /// Accepted by the server (entry recorded)
  final int accepted;

  /// Already used on the server by another entry: the same ticket got in twice
  final int conflicts;

  /// Refused by the server (cancelled, unknown, event over...)
  final int rejected;

  /// Still waiting (network lost during the upload, server error)
  final int remaining;

  const ScanSyncReport({this.accepted = 0, this.conflicts = 0, this.rejected = 0, this.remaining = 0});

  static const empty = ScanSyncReport();

  int get sent => accepted + conflicts + rejected;

  ScanSyncReport operator +(ScanSyncReport o) => ScanSyncReport(
        accepted: accepted + o.accepted,
        conflicts: conflicts + o.conflicts,
        rejected: rejected + o.rejected,
        remaining: remaining + o.remaining,
      );
}
