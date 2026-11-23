import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// Texts of the app in French (« tu », as on the mockups) and Lingala. Switching the language
/// rebuilds every screen at once, without restarting (MaterialApp.locale). The Lingala texts
/// are a first draft, to be reviewed by a Lingala speaker before the launch.
class S {
  final bool ln;
  const S._(this.ln);

  static const fr = S._(false);
  static const lingala = S._(true);

  /// Texts outside the widget tree (request errors); follows the language chosen
  static S current = fr;

  static S of(BuildContext context) =>
      Localizations.of<S>(context, S) ?? current;

  static const locales = [Locale('fr'), Locale('ln')];

  static const delegates = <LocalizationsDelegate<dynamic>>[
    _SDelegate(),
    _FrenchFallback(GlobalMaterialLocalizations.delegate),
    _FrenchFallback(GlobalCupertinoLocalizations.delegate),
    _FrenchFallback(GlobalWidgetsLocalizations.delegate),
  ];

  String _l(String fr, String ln) => this.ln ? ln : fr;

  // Splash and welcome
  String get tagline => _l('Kinshasa, à vivre.', 'Kinshasa, ya kobika.');
  String get motto => _l('SORTIR. RÉSERVER. PROFITER.', 'KOBIMA. KOBOMBA. KOSEPELA.');
  String get heroTitle =>
      _l('Toutes tes sorties.\nUne seule app.', 'Babimi na yo nyonso.\nApp moko.');
  String get welcomeTitle => _l('Bienvenue chez toi.', 'Boyei malamu.');
  String get welcomeText => _l(
    'Concerts, tables et événements à Kinshasa.\nConnecte-toi simplement avec ton numéro.',
    'Ba concert, ba table mpe bafeti na Kinshasa.\nKɔta kaka na nimero na yo.',
  );
  String get phoneLabel => _l('Numéro de téléphone', 'Nimero ya telefone');
  String get sendCode => _l('Recevoir mon code SMS', 'Kozwa kode na SMS');
  String get codeNote =>
      _l('Un code à 6 chiffres, sans mot de passe.', 'Kode ya bachiffre 6, mot de passe te.');
  String get explore => _l('Explorer sans compte', 'Kotala kozanga kɔ́ntɛ');
  String get legal => _l(
    'En continuant, tu acceptes les conditions d’utilisation\net la politique de confidentialité de ZAYA.',
    'Soki okobi, ondimi mibeko ya kosalela\nmpe politiki ya sekele ya ZAYA.',
  );

  // Tabs
  String get tabHome => _l('Accueil', 'Ebandeli');
  String get tabSearch => _l('Recherche', 'Koluka');
  String get tabTickets => _l('Billets', 'Batike');
  String get tabProfile => _l('Profil', 'Profil');

  // Home
  String get city => 'Kinshasa';
  String get homeTitle => _l('On sort où ?', 'Tobima wapi?');
  String get homeSubtitle =>
      _l('Les meilleurs moments commencent ici.', 'Ntango ya malamu ebandi awa.');
  String get tonight => _l('Ce soir', 'Lelo na butu');
  String get weekend => _l('Ce week-end', 'Wikende oyo');
  String get upcoming => _l('À venir', 'Oyo ekoya');
  String get featured => _l('À la une', 'Na liboso');
  String get discoverMore => _l('À découvrir aussi', 'Tala lisusu');
  String get discoverMoreText => _l(
    'Concerts, soirées et expériences à partager.',
    'Ba concert, bafeti mpe makambo ya kokabola.',
  );
  String get book => _l('Réserver', 'Kobomba');
  String get noEvents => _l('Rien de prévu pour l’instant', 'Eloko moko te sikoyo');
  String get noEventsHint => _l(
    'Regarde ce week-end ou les sorties à venir.',
    'Tala wikende oyo to oyo ekoya.',
  );
  String get free => _l('Gratuit', 'Ofele');
  String from(String price) => _l('Dès $price', 'Kobanda $price');
  String get soldOut => _l('Complet', 'Etondi');
  String get ended => _l('Terminé', 'Esili');

  // Search
  String get searchOverline => _l('Découvrir Kinshasa', 'Koyeba Kinshasa');
  String get searchTitle => _l('Trouve ta prochaine sortie', 'Luka bobimi na yo ya sika');
  String get searchHint =>
      _l('Artiste, lieu, église, événement…', 'Moyembi, esika, lingomba, likambo…');
  String get filterDate => _l('Date', 'Mokolo');
  String get filterPrice => _l('Prix', 'Ntalo');
  String get anyDate => _l('Toutes les dates', 'Mikolo nyonso');
  String get anyPrice => _l('Tous les prix', 'Ntalo nyonso');
  String upTo(String price) => _l('Jusqu’à $price', 'Tii $price');
  String get byCategory => _l('Par catégorie', 'Na lolenge');
  String get newest => _l('Cette semaine', 'Pɔsɔ oyo');
  String get popular => _l('Populaires sur ZAYA', 'Oyo bato balingi na ZAYA');
  String get results => _l('Résultats', 'Biloko emonani');
  String get noResults => _l('Aucun résultat', 'Eloko emonani te');
  String eventType(String type) => switch (type) {
    'CONCERT' => 'Concert',
    'PARTY' => _l('Soirée', 'Feti'),
    'FESTIVAL' => 'Festival',
    'SPORT' => _l('Sport', 'Lisano'),
    'CONFERENCE' => _l('Conférence', 'Lisolo'),
    'WORSHIP' => _l('Culte & gospel', 'Losambo & gospel'),
    'COMEDY' => _l('Humour', 'Kosekisa'),
    'THEATER' => _l('Théâtre', 'Teyatre'),
    'GALA' => 'Gala',
    'EXHIBITION' => _l('Exposition', 'Bolakisi'),
    'WORKSHOP' => _l('Atelier', 'Mosala'),
    'FAIR' => _l('Foire', 'Zando'),
    _ => _l('Autre', 'Mosusu'),
  };

  // Event page
  String get eventTitle => _l('L’événement', 'Likambo');
  String get inviteFriends => _l('Inviter des amis', 'Kobenga baninga');
  String shareText(String name, String url) => _l(
    'On y va ? $name sur ZAYA : $url',
    'Tokende? $name na ZAYA : $url',
  );
  String get about => _l('À propos', 'Na ntina na yango');
  String get organizer => _l('Organisé par', 'Ebongisami na');
  String get startingAt => _l('À partir de', 'Kobanda');
  String get chooseTickets => _l('Choisir mes billets', 'Kopona batike');
  String seatsLeft(int n) => _l(
    n == 1 ? '1 place restante' : '$n places restantes',
    n == 1 ? 'Esika 1 etikali' : 'Bisika $n etikali',
  );

  // Purchase
  String get stepTickets => _l('Billets', 'Batike');
  String get stepPayment => _l('Paiement', 'Kofuta');
  String get chooseTitle => _l('Choisir mes billets', 'Kopona batike');
  String get yourExperience => _l('Ton expérience', 'Ndenge olingi');
  String get quantity => _l('Nombre de billets', 'Motango ya batike');
  String get checkBeforeContinue => _l(
    'Vérifie le tarif et la quantité avant de continuer.',
    'Tala ntalo mpe motango liboso ya kokoba.',
  );
  String ticketsOf(int n, String category) => _l(
    n == 1 ? '1 billet $category' : '$n billets $category',
    n == 1 ? 'Tike 1 $category' : 'Batike $n $category',
  );
  String get continueLabel => _l('Continuer', 'Kokoba');
  String get paymentTitle => _l('Paiement', 'Kofuta');
  String get howToPay => _l('Comment veux-tu payer ?', 'Olingi kofuta ndenge nini?');
  String get mobileMoney => 'Mobile money';
  String get card => _l('Carte / Visa', 'Carte / Visa');
  String get mobileMoneyNumber => _l('Numéro mobile money', 'Nimero ya mobile money');
  String get confirmOnPhone => _l(
    'Tu confirmeras le paiement sur ton téléphone.',
    'Okondima kofuta na telefone na yo.',
  );
  String get cardNote => _l(
    'Tu paieras sur la page sécurisée de FlexPay, puis tu reviendras dans l’app.',
    'Okofuta na page ya FlexPay, sima okozonga na app.',
  );
  String get totalToPay => _l('Total à payer', 'Mbongo nyonso ya kofuta');
  String pay(String amount) => _l('Payer $amount', 'Futa $amount');
  String get securePayment =>
      _l('Paiement sécurisé par FlexPay', 'Kofuta ya kobatelama na FlexPay');
  String get waitingTitle => _l('Confirme sur ton téléphone', 'Ndima na telefone na yo');
  String get waitingText => _l(
    'Une demande de paiement arrive sur ton téléphone. Valide-la avec ton code mobile money : ton billet apparaît ici dès que c’est fait.',
    'Bosenga ya kofuta ekoya na telefone na yo. Ndima yango na kode ya mobile money : tike na yo ekomonana awa.',
  );
  String get paidTitle => _l('C’est payé !', 'Ofuti!');
  String get paidText => _l(
    'Tes billets sont dans « Billets », même sans connexion.',
    'Batike na yo ezali na « Batike », ata internet ezali te.',
  );
  String get failedTitle => _l('Paiement non abouti', 'Kofuta elongi te');
  String get failedText => _l(
    'Rien n’a été débité. Les places sont libérées : tu peux réessayer.',
    'Mbongo moko ebimi te. Okoki komeka lisusu.',
  );
  String get seeTickets => _l('Voir mes billets', 'Tala batike na ngai');
  String get backToEvent => _l('Revenir au paiement', 'Zonga na kofuta');
  String get signInToBuy => _l(
    'Connecte-toi avec ton numéro pour acheter : tes billets y seront liés.',
    'Kɔta na nimero na yo mpo na kosomba : batike ekokangama na yango.',
  );

  // Sign-in
  String get signIn => _l('Se connecter', 'Kokɔta');
  String get phoneTitle => _l('Ton numéro', 'Nimero na yo');
  String get codeTitle => _l('Code reçu par SMS', 'Kode ozwi na SMS');
  String codeSentTo(String phone) =>
      _l('Envoyé au $phone.', 'Etindami na $phone.');
  String get changeNumber => _l('Changer de numéro', 'Kobongola nimero');
  String get verify => _l('Valider', 'Kondima');
  String get resend => _l('Renvoyer le code', 'Tinda kode lisusu');
  String resendIn(int s) =>
      _l('Nouveau code dans $s s', 'Kode ya sika na sekonde $s');
  String get nameTitle => _l('Comment tu t’appelles ?', 'Kombo na yo nani?');
  String get nameHelp => _l(
    'Ton nom figure sur tes billets nominatifs.',
    'Kombo na yo ekokomama na batike na yo.',
  );
  String get firstName => _l('Prénom', 'Kombo');
  String get lastName => _l('Nom', 'Kombo ya libota');
  String get later => _l('Plus tard', 'Na nsima');
  String get required => _l('Obligatoire', 'Esengeli');

  // Wallet
  String get walletOverline => _l('Ton prochain bon moment', 'Ntango na yo ya malamu');
  String get walletTitle => _l('Mes billets', 'Batike na ngai');
  String get walletSubtitle =>
      _l('Tes accès, même sans connexion.', 'Bokɔti na yo, ata internet ezali te.');
  String get offlineNotice => _l(
    'Billets et réservations accessibles hors ligne',
    'Batike emonanaka ata internet ezali te',
  );
  String offlineSince(String when) => _l(
    'Hors ligne : billets enregistrés $when',
    'Internet ezali te : batike ebombami $when',
  );
  String get walletSignedOut => _l(
    'Connecte-toi avec ton numéro : les billets achetés avec lui apparaissent ici, même sans connexion.',
    'Kɔta na nimero na yo : batike osombi na yango ekomonana awa, ata internet ezali te.',
  );
  String get walletEmpty => _l('Aucun billet pour l’instant', 'Tike moko te sikoyo');
  String get walletEmptyText => _l(
    'Les billets achetés ou reçus avec ton numéro apparaissent ici.',
    'Batike osombi to ozwi na nimero na yo ekomonana awa.',
  );
  String get findOuting => _l('Trouver une sortie', 'Luka bobimi');
  String get showTicket => _l('Afficher mon billet', 'Lakisa tike na ngai');
  String get showTickets => _l('Afficher mes billets', 'Lakisa batike na ngai');
  String get seeDetails => _l('Voir les détails', 'Tala makambo');
  String get past => _l('Passés', 'Oyo eleki');
  String get ticketWord => _l('Billet', 'Tike');
  String get statusValid => _l('Valide', 'Ebongi');
  String get statusUsed => _l('Utilisé', 'Esalelami');
  String get statusCancelled => _l('Annulé', 'Elongolami');
  String get statusPast => _l('Expiré', 'Eleki');
  String ticketCount(int n) =>
      _l(n == 1 ? '1 billet' : '$n billets', n == 1 ? 'Tike 1' : 'Batike $n');

  // Access (ticket with its QR)
  String get accessTitle => _l('Mes accès', 'Bokɔti na ngai');
  String get accessSubtitle => _l('Présente ton QR à l’entrée.', 'Lakisa QR na yo na ekuke.');
  String get namedTicket => _l('ZAYA / BILLET NOMINATIF', 'ZAYA / TIKE NA KOMBO');
  String get date => _l('Date', 'Mokolo');
  String get time => _l('Heure', 'Ngonga');
  String get place => _l('Lieu', 'Esika');
  String get holder => _l('Titulaire', 'Nkolo');
  String get qrNote => _l('Présente ce QR à l’entrée', 'Lakisa QR oyo na ekuke');
  String get qrNotShown => _l(
    'Ce billet ne peut plus entrer : pas de QR à présenter.',
    'Tike oyo ekoki kokɔta lisusu te.',
  );

  // Profile
  String get profileTitle => _l('Mon profil', 'Profil na ngai');
  String get profileSignedOut => _l(
    'Connecte-toi pour retrouver tes billets sur ce téléphone.',
    'Kɔta mpo na kozwa batike na yo na telefone oyo.',
  );
  String get editName => _l('Modifier mon nom', 'Kobongola kombo');
  String get language => _l('Langue', 'Lokota');
  String get french => 'Français';
  String get lingalaName => 'Lingala';
  String get consents => _l('Autorisations', 'Ndingisa');
  String get consentsHelp => _l(
    'Rien n’est activé sans ton accord. Tu peux changer d’avis à tout moment.',
    'Eloko moko ekosala te soki ondimi te. Okoki kobongola ntango nyonso.',
  );
  String get promoNotifications =>
      _l('Bons plans et nouveautés', 'Bansango ya sika mpe ntalo malamu');
  String get promoNotificationsHelp => _l(
    'Une notification par jour au plus, trois par semaine.',
    'Mbala moko na mokolo, mbala misato na pɔsɔ.',
  );
  String get save => _l('Enregistrer', 'Kobomba');
  String get signOut => _l('Se déconnecter', 'Kobima na kɔ́ntɛ');
  String get deleteAccount => _l('Supprimer mon compte', 'Kolongola kɔ́ntɛ na ngai');
  String get deleteAccountText => _l(
    'Ton profil et tes réglages sont effacés. Tes billets à venir restent valables : en te reconnectant avec ce numéro, tu les retrouves.',
    'Profil na yo ekolongwa. Batike oyo ekoya ekotikala malamu : soki okɔti lisusu na nimero oyo, okozwa yango.',
  );
  String get delete => _l('Supprimer', 'Kolongola');
  String get cancel => _l('Annuler', 'Kotika');
  String get sessionEnded => _l(
    'Tu as été déconnecté (connexion sur un autre téléphone ?).',
    'Obimi (okɔti na telefone mosusu?).',
  );

  // Errors
  String get loadError => _l('Impossible de charger', 'Ekoki kofungwama te');
  String get retry => _l('Réessayer', 'Meka lisusu');
  String get errTimeout => _l(
    'Le serveur met trop de temps à répondre. Vérifie ta connexion.',
    'Serveur ezali koyanola noki te. Tala internet na yo.',
  );
  String get errOffline => _l('Pas de connexion internet.', 'Internet ezali te.');
  String get errServer => _l(
    'Le serveur rencontre un problème. Réessaie dans un instant.',
    'Serveur ezali na mokakatano. Meka lisusu mwa moke.',
  );
  String get errTooMany => _l(
    'Trop de tentatives. Patiente une minute.',
    'Bomeki mingi. Zela miniti moko.',
  );
  String get errGeneric =>
      _l('Une erreur inattendue est survenue.', 'Libunga moko esalemi.');
}

class _SDelegate extends LocalizationsDelegate<S> {
  const _SDelegate();

  @override
  bool isSupported(Locale locale) =>
      locale.languageCode == 'fr' || locale.languageCode == 'ln';

  @override
  Future<S> load(Locale locale) {
    S.current = locale.languageCode == 'ln' ? S.lingala : S.fr;
    return SynchronousFuture(S.current);
  }

  @override
  bool shouldReload(_SDelegate old) => false;
}

/// Flutter has no Lingala texts of its own (dialog buttons, date pickers): French is used
class _FrenchFallback<T> extends LocalizationsDelegate<T> {
  final LocalizationsDelegate<T> inner;
  const _FrenchFallback(this.inner);

  @override
  Type get type => inner.type;

  @override
  bool isSupported(Locale locale) =>
      locale.languageCode == 'fr' || locale.languageCode == 'ln';

  @override
  Future<T> load(Locale locale) => inner.load(const Locale('fr'));

  @override
  bool shouldReload(_FrenchFallback<T> old) => false;
}
