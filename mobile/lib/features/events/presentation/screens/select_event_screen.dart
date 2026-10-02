import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/colors.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/utils/date_utils.dart';
import '../../../../shared/widgets/zc_widgets.dart';
import '../../../auth/presentation/logout.dart';
import '../providers/events_provider.dart';

/// "Sélectionner un événement": the controller picks the event they work on.
class SelectEventScreen extends ConsumerStatefulWidget {
  const SelectEventScreen({super.key});

  @override
  ConsumerState<SelectEventScreen> createState() => _SelectEventScreenState();
}

class _SelectEventScreenState extends ConsumerState<SelectEventScreen> {
  String? _eventId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final current = await getIt<SecureStorage>().getSelectedEventId();
      if (mounted && current != null) setState(() => _eventId = current);
      await ref.read(eventsNotifierProvider.notifier).loadEvents(forceRefresh: true);
    });
  }

  Future<void> _start() async {
    final id = _eventId;
    if (id == null) return;
    await getIt<SecureStorage>().saveSelectedEventId(id);
    if (mounted) Navigator.pushNamedAndRemoveUntil(context, '/home', (_) => false, arguments: id);
  }

  /// Changing event from the settings: back to it; otherwise this is the first screen of
  /// the session and going back means logging out.
  void _back() {
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      confirmLogout(context, ref);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(eventsNotifierProvider);
    final events = state.events;
    final selected = events.any((e) => e.id == _eventId) ? _eventId : null;

    return ZcPatternScaffold(
      sheetTop: 0.42,
      child: ZcFillScroll(
        children: [
          const SizedBox(height: 40),
          ZcBackButton(onPressed: _back),
          const SizedBox(height: 40),
          Text('Sélectionner\nun événement', style: zcText(ZcSize.display, weight: FontWeight.w700, height: 1.2)),
          const SizedBox(height: 32),
          if (state.isLoading && events.isEmpty)
            SizedBox(height: 58, child: Center(child: CircularProgressIndicator(color: AppColors.ink, strokeWidth: 2)))
          else if (events.isEmpty)
            Text(
              state.error ?? "Aucun événement ne vous est encore assigné. Contactez l'organisateur.",
              style: zcText(ZcSize.body, color: AppColors.grey, height: 1.5),
            )
          else
            ZcDropdown<String>(
              hint: 'Événement',
              value: selected,
              items: [
                for (final e in events)
                  DropdownMenuItem(
                    value: e.id,
                    child: Text(
                      '${e.name} · ${AppDateUtils.formatDate(e.startDate)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (v) => setState(() => _eventId = v),
            ),
          const SizedBox(height: 37),
          if (events.isEmpty && !state.isLoading)
            ZcButton(
              label: 'Actualiser',
              onPressed: () => ref.read(eventsNotifierProvider.notifier).loadEvents(forceRefresh: true),
            )
          else
            ZcButton(label: 'Commencer', onPressed: selected == null ? null : _start),
          const Spacer(),
          const SizedBox(height: 40),
        ],
      ),
    );
  }
}
