import 'package:intl/intl.dart';

/// French formats of the app (dates in Kinshasa time as on the web dashboard)
class Fmt {
  Fmt._();

  static final _int = NumberFormat.decimalPattern('fr');
  static final _money = NumberFormat.decimalPatternDigits(
    locale: 'fr',
    decimalDigits: 0,
  );
  static final _money2 = NumberFormat.decimalPatternDigits(
    locale: 'fr',
    decimalDigits: 2,
  );

  static String count(num n) => _int.format(n);

  static String money(num amount, String currency) {
    final whole = amount == amount.roundToDouble();
    final symbol = switch (currency) {
      'USD' => '\$',
      'EUR' => '€',
      _ => currency,
    };
    final value = (whole ? _money : _money2).format(amount);
    return '$value $symbol';
  }

  /// DRC numbers are stored as 243 + 9 digits: shown « +243 812 345 678 »
  static String phone(String raw) {
    final d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.length == 12 && d.startsWith('243')) {
      return '+243 ${d.substring(3, 6)} ${d.substring(6, 9)} ${d.substring(9)}';
    }
    return raw;
  }

  static String percent(double ratio) => '${(ratio * 100).round()} %';

  /// Kinshasa is UTC+1 all year
  static DateTime kinshasa(DateTime d) =>
      d.toUtc().add(const Duration(hours: 1));

  static String day(DateTime d) =>
      DateFormat('EEE d MMM yyyy', 'fr').format(kinshasa(d));

  static String dayTime(DateTime d) =>
      DateFormat("EEE d MMM 'à' HH:mm", 'fr').format(kinshasa(d));

  static String time(DateTime d) =>
      DateFormat('HH:mm', 'fr').format(kinshasa(d));

  /// "il y a 5 min", "hier", "12 oct."
  static String ago(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'à l’instant';
    if (diff.inMinutes < 60) return 'il y a ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'il y a ${diff.inHours} h';
    if (diff.inDays == 1) return 'hier';
    if (diff.inDays < 7) return 'il y a ${diff.inDays} j';
    return DateFormat('d MMM', 'fr').format(kinshasa(d));
  }
}
