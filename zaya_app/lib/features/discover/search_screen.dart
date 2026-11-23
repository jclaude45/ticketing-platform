import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'events_data.dart';
import 'home_screen.dart';

/// Categories offered first (the others exist but are rarer in Kinshasa)
const _categories = ['PARTY', 'CONCERT', 'FESTIVAL', 'WORSHIP', 'SPORT', 'CONFERENCE', 'COMEDY'];

/// Top prices of the « Prix » filter, in dollars; 0 = free
const _prices = [0.0, 10.0, 25.0, 50.0];

/// « Recherche »: words, date, price and category; this week's and popular events otherwise
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  var _search = '';
  String? _type;
  Window? _window;
  double? _maxPrice;

  bool get _filtering =>
      _search.isNotEmpty || _type != null || _window != null || _maxPrice != null;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    // Typing on a slow network: one request once the person pauses
    _debounce = Timer(
      const Duration(milliseconds: 400),
      () => setState(() => _search = v.trim()),
    );
  }

  Future<void> _pick<T>(String title, List<(T?, String)> options, T? current, ValueChanged<T?> onPick) async {
    final picked = await showModalBottomSheet<(T?,)>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: zText(ZSize.h2, weight: ZWeight.bold)),
              const SizedBox(height: 12),
              for (final (value, label) in options)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(label, style: zText(ZSize.title, weight: ZWeight.medium)),
                  trailing: value == current
                      ? const Icon(Icons.check_rounded, color: ZColors.orange)
                      : null,
                  onTap: () => Navigator.pop(ctx, (value,)),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) setState(() => onPick(picked.$1));
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    String windowLabel(Window w) => switch (w) {
      Window.tonight => s.tonight,
      Window.weekend => s.weekend,
      Window.upcoming => s.upcoming,
    };
    String priceText(double p) => p == 0 ? s.free : s.upTo(Fmt.money(p, 'USD'));

    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverToBoxAdapter(
            child: ZPageHeader(overline: s.searchOverline, title: s.searchTitle),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
              child: TextField(
                controller: _ctrl,
                onChanged: _onSearch,
                textInputAction: TextInputAction.search,
                cursorColor: ZColors.orange,
                style: zText(ZSize.title),
                decoration: InputDecoration(
                  hintText: s.searchHint,
                  fillColor: ZColors.surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: Icon(Icons.search_rounded, color: ZColors.muted),
                  suffixIcon: _ctrl.text.isEmpty
                      ? null
                      : IconButton(
                          icon: Icon(Icons.close_rounded, color: ZColors.muted),
                          onPressed: () {
                            _ctrl.clear();
                            setState(() => _search = '');
                          },
                        ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(24, 14, 24, 0),
              child: Row(
                children: [
                  ZChip(
                    soft: true,
                    selected: _window != null,
                    label: _window == null ? s.filterDate : windowLabel(_window!),
                    onTap: () => _pick<Window>(
                      s.filterDate,
                      [(null, s.anyDate), for (final w in Window.values) (w, windowLabel(w))],
                      _window,
                      (v) => _window = v,
                    ),
                  ),
                  const SizedBox(width: 8),
                  ZChip(
                    soft: true,
                    selected: _maxPrice != null,
                    label: _maxPrice == null ? s.filterPrice : priceText(_maxPrice!),
                    onTap: () => _pick<double>(
                      s.filterPrice,
                      [(null, s.anyPrice), for (final p in _prices) (p, priceText(p))],
                      _maxPrice,
                      (v) => _maxPrice = v,
                    ),
                  ),
                  const SizedBox(width: 8),
                  // ZAYA sells in Kinshasa for now: the city is shown, not chosen
                  ZChip(soft: true, label: s.city),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: ZSection(s.byCategory, padding: const EdgeInsets.fromLTRB(24, 26, 24, 12)),
          ),
          SliverToBoxAdapter(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: [
                  for (final t in _categories) ...[
                    ZChip(
                      label: s.eventType(t),
                      selected: _type == t,
                      onTap: () => setState(() => _type = _type == t ? null : t),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
            ),
          ),
          if (_filtering)
            ..._results(s)
          else
            ..._highlights(s),
          const SliverToBoxAdapter(child: SizedBox(height: 28)),
        ],
      ),
    );
  }

  List<Widget> _results(S s) {
    final query = EventsQuery(
      window: _window ?? Window.upcoming,
      search: _search,
      type: _type,
      maxPrice: _maxPrice,
    );
    final events = ref.watch(eventsProvider(query));
    return [
      SliverToBoxAdapter(child: ZSection(s.results)),
      ...events.when(
        loading: () => [
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
        ],
        error: (e, _) => [
          SliverToBoxAdapter(
            child: ZMessage.error(e, () => ref.invalidate(eventsProvider(query))),
          ),
        ],
        data: (list) => list.isEmpty
            ? [
                SliverToBoxAdapter(
                  child: ZMessage(icon: Icons.search_off_rounded, title: s.noResults),
                ),
              ]
            : [_list(list)],
      ),
    ];
  }

  List<Widget> _highlights(S s) {
    final h = ref.watch(highlightsProvider);
    return h.when(
      loading: () => [
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(40),
            child: Center(child: CircularProgressIndicator()),
          ),
        ),
      ],
      error: (e, _) => [
        SliverToBoxAdapter(
          child: ZMessage.error(e, () => ref.invalidate(highlightsProvider)),
        ),
      ],
      data: (h) => [
        if (h.thisWeek.isNotEmpty) ...[
          SliverToBoxAdapter(child: ZSection(s.newest)),
          _list(h.thisWeek),
        ],
        if (h.popular.isNotEmpty) ...[
          SliverToBoxAdapter(child: ZSection(s.popular)),
          _list(h.popular),
        ],
        if (h.thisWeek.isEmpty && h.popular.isEmpty)
          SliverToBoxAdapter(
            child: ZMessage(icon: Icons.nightlife_rounded, title: s.noEvents),
          ),
      ],
    );
  }

  Widget _list(List<PublicEvent> list) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: 24),
    sliver: SliverList.separated(
      itemCount: list.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) => EventRow(event: list[i]),
    ),
  );
}
