import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/colors.dart';
import '../../../core/scanner/hardware_scanner.dart';
import '../../../shared/widgets/zc_widgets.dart';
import '../../events/domain/entities/event_entity.dart';
import '../../events/presentation/providers/events_provider.dart';
import '../../guests/data/guests_repository.dart';
import '../../scanner/presentation/screens/scanner_screen.dart';
import '../../sync/presentation/providers/sync_provider.dart';
import 'tabs/data_tab.dart';
import 'tabs/guests_tab.dart';
import 'tabs/guichet_tab.dart';
import 'tabs/scanner_tab.dart';
import 'tabs/settings_tab.dart';

/// The event the controller works on: Scanner, Guichet, Guest, Data and Paramètres tabs.
class HomeShell extends ConsumerStatefulWidget {
  final String eventId;

  const HomeShell({super.key, required this.eventId});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;
  Timer? _refresh;
  StreamSubscription<String>? _triggerSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventsNotifierProvider.notifier).loadEvents();
      refreshEvent(ref, widget.eventId);
    });
    // Terminal trigger pressed here: open the scanner on that code (shop pickup from Guichet)
    _triggerSub = HardwareScanner.instance.scans.listen((code) {
      if (!mounted || !(ModalRoute.of(context)?.isCurrent ?? false)) return;
      final mode = _tab == 1 ? ScanMode.merch : ScanMode.tickets;
      Navigator.pushNamed(context, '/scanner', arguments: ScannerArgs(widget.eventId, mode: mode, initialCode: code))
          .then((_) => refreshEvent(ref, widget.eventId));
    });
    // Counters of the other doors: the server figures every 30 s
    _refresh = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) ref.invalidate(eventDetailProvider(widget.eventId));
    });
  }

  @override
  void dispose() {
    _refresh?.cancel();
    _triggerSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      ScannerTab(eventId: widget.eventId, active: _tab == 0),
      GuichetTab(eventId: widget.eventId, active: _tab == 1),
      GuestsTab(eventId: widget.eventId),
      DataTab(eventId: widget.eventId),
      SettingsTab(eventId: widget.eventId),
    ];
    return Scaffold(
      backgroundColor: AppColors.page,
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: ZcBottomNav(
        index: _tab,
        onTap: (i) {
          FocusScope.of(context).unfocus();
          setState(() => _tab = i);
        },
      ),
    );
  }
}

/// Ticket list and pending entries brought up to date, then fresh server counters.
Future<void> refreshEvent(WidgetRef ref, String eventId) async {
  await ref.read(syncNotifierProvider.notifier).sync(packs: true);
  ref.invalidate(eventDetailProvider(eventId));
  ref.invalidate(ticketCountsProvider(eventId));
  ref.invalidate(eventGuestsProvider(eventId));
}

/// The event, fresh from the server or else as stored on the phone.
EventEntity? watchEvent(WidgetRef ref, String eventId) =>
    ref.watch(eventDetailProvider(eventId)).valueOrNull ?? ref.watch(eventByIdProvider(eventId));

/// Entries of the event: server counters (all doors) when known, the phone's ticket list
/// otherwise (offline), whichever saw more entries.
({int checkedIn, int? total}) watchEntries(WidgetRef ref, String eventId) {
  final event = watchEvent(ref, eventId);
  final local = ref.watch(ticketCountsProvider(eventId)).valueOrNull;
  final checkedIn = math.max(event?.checkedIn ?? 0, local?.checkedIn ?? 0);
  final serverTotal = event?.extraData?['totalTickets'] as int?;
  final localTotal = local == null || local.total == 0 ? null : local.total;
  final total = serverTotal ?? localTotal;
  return (checkedIn: checkedIn, total: total == null ? null : math.max(total, checkedIn));
}

/// White bar with rounded top corners of the mockups.
class ZcBottomNav extends StatelessWidget {
  final int index;
  final ValueChanged<int> onTap;

  const ZcBottomNav({super.key, required this.index, required this.onTap});

  static const _items = [
    (icon: Icons.crop_free_rounded, label: 'Scanner'),
    (icon: Icons.storefront_outlined, label: 'Guichet'),
    (icon: Icons.format_list_bulleted_rounded, label: 'Guest'),
    (icon: Icons.storage_rounded, label: 'Data'),
    (icon: Icons.settings_outlined, label: 'Paramètres'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.page,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(40)),
        boxShadow: [BoxShadow(color: AppColors.shadow, blurRadius: 22.5, offset: const Offset(0, 3))],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 82,
          child: Row(
            children: [
              for (var i = 0; i < _items.length; i++)
                Expanded(
                  child: InkResponse(
                    onTap: () => onTap(i),
                    radius: 36,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(_items[i].icon, size: 22, color: i == index ? AppColors.ink : AppColors.navInactive),
                        const SizedBox(height: 8),
                        Text(
                          _items[i].label,
                          maxLines: 1,
                          overflow: TextOverflow.fade,
                          softWrap: false,
                          style: TextStyle(
                            fontFamily: zcFont,
                            fontSize: ZcSize.small,
                            fontWeight: i == index ? ZcWeight.bold : ZcWeight.regular,
                            color: i == index ? AppColors.ink : AppColors.navInactive,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
