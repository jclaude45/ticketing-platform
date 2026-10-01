import 'package:intl/intl.dart';

/// Dates shown in French: the app sets Intl.defaultLocale to fr_FR at start (main.dart).
class AppDateUtils {
  AppDateUtils._();

  static final _dateFormat = DateFormat('d MMM yyyy');
  static final _timeFormat = DateFormat('HH:mm');
  static final _dateTimeFormat = DateFormat("d MMM yyyy 'à' HH:mm");
  static final _fullDateTimeFormat = DateFormat("EEEE d MMMM yyyy 'à' HH:mm");
  static final _isoFormat = DateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  static final _shortTimeFormat = DateFormat('HH:mm');

  static String formatDate(DateTime date) => _dateFormat.format(date.toLocal());

  static String formatTime(DateTime date) => _timeFormat.format(date.toLocal());

  static String formatShortTime(DateTime date) =>
      _shortTimeFormat.format(date.toLocal());

  static String formatDateTime(DateTime date) =>
      _dateTimeFormat.format(date.toLocal());

  static String formatFullDateTime(DateTime date) =>
      _fullDateTimeFormat.format(date.toLocal());

  static String formatIso(DateTime date) =>
      _isoFormat.format(date.toUtc());

  static DateTime parseIso(String iso) => DateTime.parse(iso).toLocal();

  static String timeAgo(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date.toLocal());

    if (diff.inSeconds < 60) {
      return "À l'instant";
    } else if (diff.inMinutes < 60) {
      return 'Il y a ${diff.inMinutes} min';
    } else if (diff.inHours < 24) {
      return 'Il y a ${diff.inHours} h';
    } else if (diff.inDays < 7) {
      return 'Il y a ${diff.inDays} j';
    } else {
      return formatDate(date);
    }
  }

  static String formatDuration(Duration duration) {
    if (duration.inDays > 0) {
      return '${duration.inDays}d ${duration.inHours.remainder(24)}h';
    } else if (duration.inHours > 0) {
      return '${duration.inHours}h ${duration.inMinutes.remainder(60)}m';
    } else {
      return '${duration.inMinutes}m';
    }
  }

  static String formatEventDuration(DateTime start, DateTime end) {
    final startLocal = start.toLocal();
    final endLocal = end.toLocal();

    if (startLocal.year == endLocal.year &&
        startLocal.month == endLocal.month &&
        startLocal.day == endLocal.day) {
      return '${_dateFormat.format(startLocal)} • ${_timeFormat.format(startLocal)} – ${_timeFormat.format(endLocal)}';
    } else {
      return '${formatDateTime(startLocal)} – ${formatDateTime(endLocal)}';
    }
  }

  static bool isEventActive(DateTime start, DateTime end) {
    final now = DateTime.now().toUtc();
    return now.isAfter(start.toUtc()) && now.isBefore(end.toUtc());
  }

  static bool isEventUpcoming(DateTime start) {
    return DateTime.now().toUtc().isBefore(start.toUtc());
  }

  static bool isEventPast(DateTime end) {
    return DateTime.now().toUtc().isAfter(end.toUtc());
  }

  static String nowIso() => formatIso(DateTime.now().toUtc());
}
