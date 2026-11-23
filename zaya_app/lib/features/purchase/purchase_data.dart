import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../discover/events_data.dart';

/// What the buyer chose on « Choisir mes billets »
class Order {
  final PublicEvent event;
  final Category category;
  final int quantity;

  const Order({required this.event, required this.category, required this.quantity});

  double get total => category.price * quantity;
  bool get free => total == 0;
}

/// Answer of the checkout: paid at once (free tickets), waiting for the phone's confirmation
/// (mobile money), or a FlexPay page to open (card)
class CheckoutResult {
  final String? reference;
  final String? redirectUrl;
  final bool issued;

  const CheckoutResult({this.reference, this.redirectUrl, this.issued = false});
}

enum PaymentOutcome { pending, paid, failed }

class Purchase {
  Purchase._();

  static Future<CheckoutResult> checkout(
    Order order, {
    required String method,
    String? payerPhone,
  }) async {
    try {
      final r = await ApiClient.instance.post(
        '/customer/events/${order.event.id}/checkout',
        {
          'items': [
            {'templateId': order.category.id, 'quantity': order.quantity},
          ],
          'paymentMethod': method,
          if (payerPhone != null && payerPhone.trim().isNotEmpty) 'payerPhone': payerPhone.trim(),
        },
      ) as Map<String, dynamic>;
      // Free tickets come back issued, with no payment reference
      if (r['tickets'] is List && r['reference'] == null) {
        return const CheckoutResult(issued: true);
      }
      return CheckoutResult(
        reference: r['reference'] as String?,
        redirectUrl: r['redirectUrl'] as String?,
      );
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Where a payment stands (the server also asks FlexPay when it has no answer yet)
  static Future<PaymentOutcome> status(String reference) async {
    final r = await ApiClient.instance.get('/public/payments/$reference/status') as Map<String, dynamic>;
    return switch (r['status']) {
      'COMPLETED' => PaymentOutcome.paid,
      'FAILED' || 'CANCELLED' || 'REFUNDED' => PaymentOutcome.failed,
      _ => PaymentOutcome.pending,
    };
  }
}
