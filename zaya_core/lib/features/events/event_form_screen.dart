import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'event_admin_data.dart';
import 'events_data.dart';
import 'tariffs_screen.dart';

/// Create or edit an event: poster, details, dates (Kinshasa time), venue, capacity, currency
/// and who pays ZAYA's fee. A new event is saved as a draft, then its tariffs are added.
class EventFormScreen extends ConsumerStatefulWidget {
  final EventDetail? event;
  const EventFormScreen({super.key, this.event});

  @override
  ConsumerState<EventFormScreen> createState() => _EventFormScreenState();
}

class _EventFormScreenState extends ConsumerState<EventFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.event?.name);
  late final _description = TextEditingController(
    text: widget.event?.description,
  );
  late final _venue = TextEditingController(text: widget.event?.venue);
  late final _address = TextEditingController(text: widget.event?.address);
  late final _city = TextEditingController(
    text: widget.event?.city ?? 'Kinshasa',
  );
  late final _capacity = TextEditingController(
    text: widget.event == null ? '' : '${widget.event!.capacity}',
  );
  final _performer = TextEditingController();
  late List<String> _performers = [...?widget.event?.performers];
  late String _type = widget.event?.type ?? 'CONCERT';
  late String _currency = widget.event?.currency ?? 'USD';
  late String _feePayer = widget.event?.feePayer ?? 'BUYER';
  // Wall-clock times in Kinshasa (UTC+1), turned into UTC when saved
  late DateTime? _start = widget.event == null
      ? null
      : Fmt.kinshasa(widget.event!.startDate);
  late DateTime? _end = widget.event == null
      ? null
      : Fmt.kinshasa(widget.event!.endDate);
  String? _posterPath;
  bool _saving = false;

  bool get _editing => widget.event != null;

  @override
  void dispose() {
    for (final c in [
      _name,
      _description,
      _venue,
      _address,
      _city,
      _capacity,
      _performer,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickPoster() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choisir dans la galerie'),
              onTap: () => Navigator.pop(c, ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Prendre une photo'),
              onTap: () => Navigator.pop(c, ImageSource.camera),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    // Resized on the phone: the server takes 5 MB at most, and data is expensive
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (file != null) setState(() => _posterPath = file.path);
  }

  Future<DateTime?> _pickDateTime(
    DateTime? current, {
    DateTime? notBefore,
  }) async {
    final now = Fmt.kinshasa(DateTime.now());
    final initial = current ?? notBefore ?? now.add(const Duration(days: 7));
    final day = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
      helpText: 'Date',
    );
    if (day == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current ?? DateTime(2000, 1, 1, 18)),
      helpText: 'Heure (Kinshasa)',
    );
    if (time == null) return null;
    return DateTime(day.year, day.month, day.day, time.hour, time.minute);
  }

  /// Kinshasa wall-clock time → UTC ISO string
  String _utc(DateTime wall) => DateTime.utc(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
  ).subtract(const Duration(hours: 1)).toIso8601String();

  void _addPerformer() {
    final v = _performer.text.trim();
    if (v.isEmpty || _performers.contains(v)) return;
    setState(() {
      _performers = [..._performers, v];
      _performer.clear();
    });
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    if (_start == null || _end == null) {
      _toast('Choisissez la date de début et de fin.');
      return;
    }
    if (!_end!.isAfter(_start!)) {
      _toast('La fin doit être après le début.');
      return;
    }
    _addPerformer();
    setState(() => _saving = true);
    final repo = ref.read(eventAdminRepository);
    final body = {
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'performers': _performers,
      'venue': _venue.text.trim(),
      'address': _address.text.trim(),
      'city': _city.text.trim(),
      'country': widget.event?.country ?? 'RDC',
      'startDate': _utc(_start!),
      'endDate': _utc(_end!),
      'totalCapacity': int.parse(_capacity.text.trim()),
      'type': _type,
      'currency': _currency,
      'feePayer': _feePayer,
    };
    try {
      final saved = _editing
          ? await repo.update(widget.event!.id, body)
          : await repo.create(body);
      if (_posterPath != null) {
        try {
          await repo.uploadPoster(saved.id, _posterPath!);
        } catch (e) {
          _toast(
            'Événement enregistré, mais l’affiche n’a pas pu être envoyée : ${ApiException.from(e).message}',
          );
        }
      }
      ref.invalidate(eventsProvider);
      ref.invalidate(eventDashboardProvider(saved.id));
      if (!mounted) return;
      if (_editing) {
        Navigator.pop(context, true);
        _toast('Modifications enregistrées.');
      } else {
        // A new event needs at least one tariff before it can be published
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => TariffsScreen(
              eventId: saved.id,
              currency: saved.currency,
              isNewEvent: true,
            ),
          ),
        );
      }
    } catch (e) {
      _toast(ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat("EEE d MMM yyyy 'à' HH:mm", 'fr');
    return Scaffold(
      appBar: AppBar(
        title: Text(_editing ? 'Modifier l’événement' : 'Nouvel événement'),
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
          children: [
            // Poster
            GestureDetector(
              onTap: _pickPoster,
              child: Stack(
                children: [
                  if (_posterPath != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.file(
                        File(_posterPath!),
                        height: 190,
                        width: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    )
                  else
                    EventPoster(url: widget.event?.bannerUrl, height: 190),
                  Positioned(
                    right: 10,
                    bottom: 10,
                    child: FilledButton.tonalIcon(
                      onPressed: _pickPoster,
                      icon: const Icon(Icons.image_outlined, size: 18),
                      label: Text(
                        _posterPath != null || widget.event?.bannerUrl != null
                            ? 'Changer l’affiche'
                            : 'Ajouter une affiche',
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            ZField(
              label: 'Nom de l’événement',
              controller: _name,
              textInputAction: TextInputAction.next,
              validator: (v) => (v ?? '').trim().isEmpty ? 'Nom requis' : null,
            ),
            const SizedBox(height: 16),
            _label('Catégorie'),
            DropdownButtonFormField<String>(
              initialValue: _type,
              isExpanded: true,
              items: eventTypeLabels.entries
                  .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _type = v ?? _type),
            ),
            const SizedBox(height: 16),
            _label('Description'),
            TextFormField(
              controller: _description,
              minLines: 3,
              maxLines: 8,
              maxLength: 2000,
              decoration: const InputDecoration(
                hintText: 'Programme, invités, infos pratiques…',
              ),
            ),
            const SizedBox(height: 8),
            _label('Artistes ou intervenants'),
            if (_performers.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: _performers
                    .map(
                      (p) => InputChip(
                        label: Text(p),
                        onDeleted: () => setState(
                          () => _performers = [..._performers]..remove(p),
                        ),
                      ),
                    )
                    .toList(),
              ),
            TextFormField(
              controller: _performer,
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _addPerformer(),
              decoration: InputDecoration(
                hintText: 'Nom, puis « Ajouter »',
                suffixIcon: TextButton(
                  onPressed: _addPerformer,
                  child: const Text('Ajouter'),
                ),
              ),
            ),
            const SizedBox(height: 20),
            _label('Début (heure de Kinshasa)'),
            _DateButton(
              text: _start == null ? 'Choisir' : dateFmt.format(_start!),
              onTap: () async {
                final d = await _pickDateTime(_start);
                if (d != null) {
                  setState(() {
                    _start = d;
                    if (_end == null || !_end!.isAfter(d)) {
                      _end = d.add(const Duration(hours: 4));
                    }
                  });
                }
              },
            ),
            const SizedBox(height: 12),
            _label('Fin'),
            _DateButton(
              text: _end == null ? 'Choisir' : dateFmt.format(_end!),
              onTap: () async {
                final d = await _pickDateTime(_end, notBefore: _start);
                if (d != null) setState(() => _end = d);
              },
            ),
            const SizedBox(height: 20),
            ZField(
              label: 'Lieu',
              controller: _venue,
              hint: 'Salle, stade, hôtel…',
              textInputAction: TextInputAction.next,
              validator: (v) => (v ?? '').trim().isEmpty ? 'Lieu requis' : null,
            ),
            const SizedBox(height: 16),
            ZField(
              label: 'Adresse (facultatif)',
              controller: _address,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),
            ZField(
              label: 'Ville',
              controller: _city,
              textInputAction: TextInputAction.next,
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Ville requise' : null,
            ),
            const SizedBox(height: 16),
            ZField(
              label: 'Capacité totale',
              controller: _capacity,
              keyboardType: TextInputType.number,
              hint: 'Nombre de places',
              validator: (v) => (int.tryParse((v ?? '').trim()) ?? 0) < 1
                  ? 'Au moins 1 place'
                  : null,
            ),
            const SizedBox(height: 16),
            _label('Monnaie des billets'),
            SegmentedButton<String>(
              segments: currencies
                  .map((c) => ButtonSegment(value: c, label: Text(c)))
                  .toList(),
              selected: {_currency},
              onSelectionChanged: (s) => setState(() => _currency = s.first),
            ),
            const SizedBox(height: 20),
            _label('Frais ZAYA (9 % des billets payants)'),
            RadioGroup<String>(
              groupValue: _feePayer,
              onChanged: (v) => setState(() => _feePayer = v ?? _feePayer),
              child: Column(
                children: const [
                  RadioListTile(
                    value: 'BUYER',
                    contentPadding: EdgeInsets.zero,
                    title: Text('Payés par l’acheteur'),
                    subtitle: Text('Ajoutés au prix du billet'),
                  ),
                  RadioListTile(
                    value: 'ORGANIZER',
                    contentPadding: EdgeInsets.zero,
                    title: Text('Pris sur mes ventes'),
                    subtitle: Text('L’acheteur paie le prix affiché'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            ZButton(
              label: _editing ? 'Enregistrer' : 'Créer et ajouter les tarifs',
              loading: _saving,
              onPressed: _save,
            ),
            if (!_editing) ...[
              const SizedBox(height: 10),
              Text(
                'L’événement est créé en brouillon : il n’est visible sur zaya.live qu’une fois publié.',
                textAlign: TextAlign.center,
                style: zText(ZSize.small, color: ZColors.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _label(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      t,
      style: zText(ZSize.small, weight: ZWeight.medium, color: ZColors.muted),
    ),
  );
}

class _DateButton extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _DateButton({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: ZColors.line),
        ),
        child: Row(
          children: [
            Expanded(child: Text(text, style: zText(ZSize.title))),
            Icon(Icons.calendar_today_outlined, size: 18, color: ZColors.muted),
          ],
        ),
      ),
    );
  }
}
