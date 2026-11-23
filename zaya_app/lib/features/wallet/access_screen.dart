import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'wallet_data.dart';

/// « Mes accès »: the tickets of one event, each with its QR drawn on the phone (works offline)
class AccessScreen extends StatelessWidget {
  final List<WalletTicket> tickets;
  const AccessScreen({super.key, required this.tickets});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: zAppBar(s.accessTitle),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
        children: [
          Text(s.accessSubtitle, style: zText(ZSize.body, color: ZColors.muted)),
          const SizedBox(height: 18),
          for (final t in tickets) ...[
            _TicketCard(ticket: t),
            const SizedBox(height: 22),
          ],
        ],
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  final WalletTicket ticket;
  const _TicketCard({required this.ticket});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = ticket;
    // The ticket stays white with dark ink in dark mode too: scanners read it best that way
    const ink = Color(0xFF2A231E);
    const muted = Color(0xFF8A817A);
    Widget field(String label, String value) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: zText(ZSize.caption, color: muted)),
        const SizedBox(height: 4),
        Text(value, style: zText(ZSize.title, weight: ZWeight.bold, color: ink)),
      ],
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: ColoredBox(
        color: Colors.white,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: ZColors.ticketHead,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.namedTicket,
                    style: zText(ZSize.caption, weight: ZWeight.semibold, color: const Color(0xFFFFB061))
                        .copyWith(letterSpacing: 0.5),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    t.category.toUpperCase(),
                    style: zText(ZSize.h2, weight: ZWeight.bold, color: Colors.white),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: field(s.date, Fmt.dayLongYear(t.start))),
                      field(s.time, Fmt.time(t.start)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  field(s.place, [t.venue, t.city].where((p) => p.isNotEmpty).join(', ')),
                  if (t.holderName != null) ...[
                    const SizedBox(height: 14),
                    field(s.holder, t.holderName!),
                  ],
                  const SizedBox(height: 18),
                  const Divider(color: Color(0xFFEAE2DA)),
                  const SizedBox(height: 18),
                  if (t.qr != null)
                    Center(
                      child: SizedBox(
                        width: 240,
                        height: 240,
                        child: QrImageView(
                          data: t.qr!,
                          errorCorrectionLevel: QrErrorCorrectLevel.M,
                          padding: EdgeInsets.zero,
                          backgroundColor: Colors.white,
                          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
                          dataModuleStyle: const QrDataModuleStyle(
                            dataModuleShape: QrDataModuleShape.square,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    )
                  else
                    Column(
                      children: [
                        Icon(
                          t.status == 'USED' ? Icons.check_circle_rounded : Icons.block_rounded,
                          size: 52,
                          color: t.status == 'USED' ? ZColors.green : ZColors.red,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          t.status == 'USED' ? s.statusUsed : s.statusCancelled,
                          style: zText(ZSize.h2, weight: ZWeight.bold, color: ink),
                        ),
                        if (t.status == 'USED' && t.checkedInAt != null)
                          Text(Fmt.dayTime(t.checkedInAt!), style: zText(ZSize.body, color: muted)),
                        const SizedBox(height: 6),
                        Text(
                          s.qrNotShown,
                          textAlign: TextAlign.center,
                          style: zText(ZSize.small, color: muted),
                        ),
                      ],
                    ),
                  const SizedBox(height: 12),
                  Text(
                    t.serial,
                    textAlign: TextAlign.center,
                    style: zText(ZSize.small, weight: ZWeight.medium, color: muted).copyWith(letterSpacing: 0.6),
                  ),
                  if (t.qr != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF2E8),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        s.qrNote,
                        textAlign: TextAlign.center,
                        style: zText(ZSize.small, weight: ZWeight.semibold, color: const Color(0xFFB45309)),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
