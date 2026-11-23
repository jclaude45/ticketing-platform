import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Tab shown by the home shell: 0 Accueil, 1 Recherche, 2 Billets, 3 Profil. A screen can
/// open another tab (« Voir mes billets » after a payment).
final homeTabProvider = StateProvider<int>((_) => 0);

class HomeTab {
  HomeTab._();
  static const home = 0;
  static const search = 1;
  static const tickets = 2;
  static const profile = 3;
}
