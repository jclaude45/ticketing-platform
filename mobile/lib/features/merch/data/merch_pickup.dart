import '../../../core/constants/api_endpoints.dart';
import '../../../core/error/exceptions.dart';
import '../../../core/network/dio_client.dart';

class MerchItem {
  final String productName;
  final String? size;
  final String? color;
  final int quantity;

  const MerchItem({required this.productName, this.size, this.color, required this.quantity});

  /// "Taille M · Noir"
  String get variant => [if (size != null) 'Taille $size', if (color != null) color!].join(' · ');
}

/// A shop order to hand over at the stand, as the server shows it to a controller.
class MerchPickup {
  final String id;
  final String code;
  final String buyerName;
  final String statusLabel;
  final bool canHandOver;

  /// Why it can't be handed over (already handed, not paid, to deliver...)
  final String? refusal;
  final DateTime? fulfilledAt;
  final List<MerchItem> items;

  const MerchPickup({
    required this.id,
    required this.code,
    required this.buyerName,
    required this.statusLabel,
    required this.canHandOver,
    this.refusal,
    this.fulfilledAt,
    required this.items,
  });

  int get itemCount => items.fold(0, (n, i) => n + i.quantity);

  factory MerchPickup.fromJson(Map<String, dynamic> json) => MerchPickup(
        id: json['id'] as String,
        code: json['code'] as String,
        buyerName: json['buyerName'] as String? ?? '',
        statusLabel: json['statusLabel'] as String? ?? '',
        canHandOver: json['canHandOver'] == true,
        refusal: json['refusal'] as String?,
        fulfilledAt: DateTime.tryParse('${json['fulfilledAt']}')?.toLocal(),
        items: [
          for (final i in (json['items'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>())
            MerchItem(
              productName: i['productName'] as String? ?? '',
              size: i['size'] as String?,
              color: i['color'] as String?,
              quantity: (i['quantity'] as num?)?.toInt() ?? 1,
            ),
        ],
      );
}

/// Pickup of shop orders at the stand (online only: the order list lives on the server).
class MerchRepository {
  final DioClient dioClient;

  const MerchRepository({required this.dioClient});

  Future<MerchPickup> lookup(String eventId, {String? qrContent, String? code}) => _post(
        ApiEndpoints.merchLookup(eventId),
        {if (qrContent != null) 'qrContent': qrContent, if (code != null) 'code': code},
      );

  Future<MerchPickup> handOver(String eventId, String orderId) => _post(ApiEndpoints.merchHandOver(eventId, orderId), null);

  Future<MerchPickup> _post(String path, Object? data) async {
    try {
      final response = await dioClient.post(path, data: data);
      final body = response.data as Map<String, dynamic>? ?? {};
      return MerchPickup.fromJson(body['data'] as Map<String, dynamic>? ?? body);
    } catch (e) {
      throw toAppException(e);
    }
  }
}
