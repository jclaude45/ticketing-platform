import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateProductDto, UpdateProductDto, ShopSettingsDto, VariantDto, MerchItemDto, OrderStatus,
} from './dto/shop.dto';

/** Stock is held for an unpaid order this long, then released (abandoned checkout). */
const RESERVATION_MS = 2 * 60 * 60 * 1000;

// Allowed organizer transitions
const NEXT_STATUSES: Record<string, OrderStatus[]> = {
  PAID: ['READY', 'SHIPPED', 'PICKED_UP', 'CANCELLED'],
  READY: ['PICKED_UP', 'SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  PICKED_UP: [],
  PENDING_PAYMENT: [],
  CANCELLED: [],
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'En attente de paiement', PAID: 'Payée', READY: 'Prête', SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée', PICKED_UP: 'Remise', CANCELLED: 'Annulée',
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const money = (n: number, currency: string) =>
  `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${currency}`;

export interface MerchQuote {
  lines: {
    variantId: string; productName: string; size: string | null; color: string | null;
    unitPrice: number; quantity: number;
  }[];
  fulfillment: 'PICKUP' | 'DELIVERY';
  delivery: { address: string; city: string; notes: string | null } | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
}

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);
  private readonly mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {
    const host = this.config.get<string>('email.host');
    const user = this.config.get<string>('email.user');
    if (host && user) {
      this.mailer = nodemailer.createTransport({
        host,
        port: this.config.get<number>('email.port') ?? 587,
        secure: this.config.get<boolean>('email.secure') ?? false,
        auth: { user, pass: this.config.get<string>('email.password') },
      });
    }
  }

  // ─── Organizer: access ────────────────────────────────────────────────────

  private async assertEvent(eventId: string, userId: string, role: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, merchDeliveryFee: true, merchPickupInfo: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
    return event;
  }

  /** Currency of the event's tickets: products default to it so a cart can mix both. */
  private async eventCurrency(eventId: string) {
    const tpl = await this.prisma.ticketTemplate.findFirst({ where: { eventId }, select: { currency: true } });
    if (tpl) return tpl.currency;
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { currency: true } });
    return event?.currency ?? 'USD';
  }

  // ─── Organizer: products ──────────────────────────────────────────────────

  async listProducts(eventId: string, userId: string, role: Role) {
    await this.assertEvent(eventId, userId, role);
    await this.expireStaleOrders(eventId);
    const products = await this.prisma.product.findMany({
      where: { eventId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { variants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    // Units sold per variant (paid orders and beyond)
    const sold = await this.prisma.merchOrderItem.groupBy({
      by: ['variantId'],
      where: { order: { eventId, status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } } },
      _sum: { quantity: true },
    });
    const soldBy = new Map(sold.map((s) => [s.variantId, s._sum.quantity ?? 0]));
    return products.map((p) => ({
      ...p,
      price: Number(p.price),
      variants: p.variants.map((v) => ({ ...v, sold: soldBy.get(v.id) ?? 0 })),
    }));
  }

  async createProduct(eventId: string, userId: string, role: Role, dto: CreateProductDto) {
    await this.assertEvent(eventId, userId, role);
    const position = await this.prisma.product.count({ where: { eventId } });
    const product = await this.prisma.product.create({
      data: {
        eventId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        price: dto.price,
        currency: (dto.currency || (await this.eventCurrency(eventId))).toUpperCase(),
        isActive: dto.isActive ?? true,
        position,
        variants: { create: this.normalizeVariants(dto.variants).map((v, i) => ({ ...v, position: i })) },
      },
    });
    return this.getProduct(eventId, product.id);
  }

  async updateProduct(eventId: string, productId: string, userId: string, role: Role, dto: UpdateProductDto) {
    await this.assertEvent(eventId, userId, role);
    const product = await this.prisma.product.findFirst({ where: { id: productId, eventId }, include: { variants: true } });
    if (!product) throw new NotFoundException('Article introuvable');

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          name: dto.name?.trim(),
          description: dto.description !== undefined ? dto.description.trim() || null : undefined,
          price: dto.price,
          currency: dto.currency?.toUpperCase(),
          isActive: dto.isActive,
          position: dto.position,
        },
      });
      if (!dto.variants) return;

      const wanted = this.normalizeVariants(dto.variants);
      const keepIds = new Set(wanted.filter((v) => v.id).map((v) => v.id));
      for (const [i, v] of wanted.entries()) {
        if (v.id) {
          if (!product.variants.some((pv) => pv.id === v.id)) throw new BadRequestException('Variante inconnue');
          await tx.productVariant.update({ where: { id: v.id }, data: { size: v.size, color: v.color, stock: v.stock, position: i } });
        } else {
          await tx.productVariant.create({ data: { productId, size: v.size, color: v.color, stock: v.stock, position: i } });
        }
      }
      // Removed variants: delete if never ordered, otherwise keep them out of sale (stock 0)
      for (const old of product.variants.filter((pv) => !keepIds.has(pv.id))) {
        const ordered = await tx.merchOrderItem.count({ where: { variantId: old.id } });
        if (ordered) await tx.productVariant.update({ where: { id: old.id }, data: { stock: 0, position: 999 } });
        else await tx.productVariant.delete({ where: { id: old.id } });
      }
    });
    return this.getProduct(eventId, productId);
  }

  async deleteProduct(eventId: string, productId: string, userId: string, role: Role) {
    await this.assertEvent(eventId, userId, role);
    const product = await this.prisma.product.findFirst({ where: { id: productId, eventId } });
    if (!product) throw new NotFoundException('Article introuvable');
    const ordered = await this.prisma.merchOrderItem.count({ where: { variant: { productId } } });
    if (ordered) {
      // Keeps order history intact: the product just leaves the shop
      await this.prisma.product.update({ where: { id: productId }, data: { isActive: false } });
      return { message: 'Article retiré de la boutique (il a déjà des commandes)', archived: true };
    }
    await this.prisma.product.delete({ where: { id: productId } });
    return { message: 'Article supprimé', archived: false };
  }

  async uploadImage(eventId: string, productId: string, userId: string, role: Role, file: Express.Multer.File) {
    await this.assertEvent(eventId, userId, role);
    if (!file) throw new BadRequestException('Aucune image reçue (champ "image")');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw new BadRequestException('Formats acceptés : JPG, PNG, WEBP');
    const product = await this.prisma.product.findFirst({ where: { id: productId, eventId } });
    if (!product) throw new NotFoundException('Article introuvable');
    const ext = file.mimetype.split('/')[1];
    const { url } = await this.storage.uploadBuffer(file.buffer, `${productId}-${Date.now()}.${ext}`, file.mimetype, 'products');
    await this.prisma.product.update({ where: { id: productId }, data: { imageUrl: url } });
    return { imageUrl: url };
  }

  private async getProduct(eventId: string, productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, eventId },
      include: { variants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    return { ...p, price: Number(p.price) };
  }

  private normalizeVariants(variants: VariantDto[]) {
    const clean = variants.map((v) => ({
      id: v.id,
      size: v.size?.trim() || null,
      color: v.color?.trim() || null,
      stock: v.stock,
    }));
    const keys = clean.map((v) => `${(v.size ?? '').toLowerCase()}|${(v.color ?? '').toLowerCase()}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Deux variantes ont la même taille et couleur');
    return clean;
  }

  // ─── Organizer: settings ──────────────────────────────────────────────────

  async getSettings(eventId: string, userId: string, role: Role) {
    const event = await this.assertEvent(eventId, userId, role);
    return {
      deliveryEnabled: event.merchDeliveryFee !== null,
      deliveryFee: event.merchDeliveryFee !== null ? Number(event.merchDeliveryFee) : 0,
      pickupInfo: event.merchPickupInfo ?? '',
      currency: await this.eventCurrency(eventId),
    };
  }

  async updateSettings(eventId: string, userId: string, role: Role, dto: ShopSettingsDto) {
    await this.assertEvent(eventId, userId, role);
    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        merchDeliveryFee: dto.deliveryEnabled ? dto.deliveryFee ?? 0 : null,
        merchPickupInfo: dto.pickupInfo?.trim() || null,
      },
    });
    return this.getSettings(eventId, userId, role);
  }

  // ─── Organizer: orders ────────────────────────────────────────────────────

  async listOrders(eventId: string, userId: string, role: Role, status?: string) {
    await this.assertEvent(eventId, userId, role);
    await this.expireStaleOrders(eventId);
    const orders = await this.prisma.merchOrder.findMany({
      where: {
        eventId,
        ...(status === 'TO_HANDLE'
          ? { status: { in: ['PAID', 'READY', 'SHIPPED'] } }
          : status ? { status } : { status: { not: 'PENDING_PAYMENT' } }),
      },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map((o) => this.serializeOrder(o));
  }

  async updateOrderStatus(eventId: string, orderId: string, userId: string, role: Role, status: OrderStatus) {
    await this.assertEvent(eventId, userId, role);
    const order = await this.prisma.merchOrder.findFirst({ where: { id: orderId, eventId }, include: { items: true } });
    if (!order) throw new NotFoundException('Commande introuvable');
    if (!NEXT_STATUSES[order.status]?.includes(status)) {
      throw new BadRequestException(
        `Impossible de passer une commande « ${STATUS_LABELS[order.status] ?? order.status} » à « ${STATUS_LABELS[status] ?? status} »`,
      );
    }
    if (order.fulfillment === 'PICKUP' && (status === 'SHIPPED' || status === 'DELIVERED')) {
      throw new BadRequestException('Cette commande est à retirer sur place');
    }
    if (order.fulfillment === 'DELIVERY' && status === 'PICKED_UP') {
      throw new BadRequestException('Cette commande est à livrer');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === 'CANCELLED') {
        // Paid but cancelled by the organizer: the items go back on sale (refund handled outside)
        for (const item of order.items) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
        }
      }
      return tx.merchOrder.update({
        where: { id: orderId },
        data: {
          status,
          ...(['PICKED_UP', 'DELIVERED'].includes(status) && { fulfilledAt: new Date() }),
        },
        include: { items: true },
      });
    });
    if (status === 'READY' || status === 'SHIPPED') this.sendStatusEmail(updated).catch(() => {});
    return this.serializeOrder(updated);
  }

  private serializeOrder(o: Prisma.MerchOrderGetPayload<{ include: { items: true } }>) {
    return {
      ...o,
      subtotal: Number(o.subtotal),
      deliveryFee: Number(o.deliveryFee),
      total: Number(o.total),
      items: o.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
    };
  }

  // ─── Public catalog ───────────────────────────────────────────────────────

  async publicCatalog(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, merchDeliveryFee: true, merchPickupInfo: true },
    });
    if (!event || event.status !== 'PUBLISHED') throw new NotFoundException('Événement introuvable');
    await this.expireStaleOrders(eventId);
    const products = await this.prisma.product.findMany({
      where: { eventId, isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, name: true, description: true, imageUrl: true, price: true, currency: true,
        variants: {
          where: { position: { lt: 999 } },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, size: true, color: true, stock: true },
        },
      },
    });
    return {
      products: products.map((p) => ({
        ...p,
        price: Number(p.price),
        // Exact stock stays private: just how many can still be bought (capped)
        variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: Math.min(v.stock, 20) })),
      })),
      delivery: event.merchDeliveryFee !== null ? { fee: Number(event.merchDeliveryFee) } : null,
      pickupInfo: event.merchPickupInfo,
    };
  }

  // ─── Checkout (used by PaymentService) ────────────────────────────────────

  /** Prices a merch cart from the database (never trusts client prices). */
  async quote(
    eventId: string,
    items: MerchItemDto[],
    fulfillment: 'PICKUP' | 'DELIVERY' | undefined,
    delivery: { address?: string; city?: string; notes?: string },
  ): Promise<MerchQuote> {
    const ids = items.map((i) => i.variantId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Chaque article ne doit apparaître qu\'une fois');
    if (!fulfillment) throw new BadRequestException('Choisissez le retrait sur place ou la livraison');

    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { merchDeliveryFee: true } });
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: ids }, product: { eventId, isActive: true } },
      include: { product: { select: { name: true, price: true, currency: true } } },
    });
    if (variants.length !== ids.length) throw new BadRequestException('Un article n\'est plus disponible');

    const lines = items.map((item) => {
      const v = variants.find((x) => x.id === item.variantId)!;
      if (v.stock < item.quantity) {
        const label = [v.product.name, v.size, v.color].filter(Boolean).join(' — ');
        throw new BadRequestException(v.stock > 0 ? `Plus que ${v.stock} "${label}" en stock` : `"${label}" est épuisé`);
      }
      return {
        variantId: v.id, productName: v.product.name, size: v.size, color: v.color,
        unitPrice: Number(v.product.price), quantity: item.quantity, currency: v.product.currency,
      };
    });
    const currency = lines[0].currency;
    if (lines.some((l) => l.currency !== currency)) throw new BadRequestException('Les articles doivent avoir la même devise');

    let deliveryInfo: MerchQuote['delivery'] = null;
    let deliveryFee = 0;
    if (fulfillment === 'DELIVERY') {
      if (event.merchDeliveryFee === null) throw new BadRequestException('La livraison n\'est pas proposée pour cet événement');
      if (!delivery.address?.trim() || !delivery.city?.trim()) throw new BadRequestException('Adresse et ville de livraison requises');
      deliveryFee = Number(event.merchDeliveryFee);
      deliveryInfo = { address: delivery.address.trim(), city: delivery.city.trim(), notes: delivery.notes?.trim() || null };
    }

    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    return {
      lines: lines.map(({ currency: _c, ...l }) => l),
      fulfillment,
      delivery: deliveryInfo,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      currency,
    };
  }

  /**
   * Creates the unpaid order and reserves its stock atomically (a variant is only
   * decremented if enough remains). Throws if anything sold out meanwhile.
   */
  async createPendingOrder(
    eventId: string,
    paymentId: string,
    buyer: { name: string; email: string; phone?: string },
    q: MerchQuote,
  ) {
    return this.prisma.$transaction(async (tx) => {
      for (const line of q.lines) {
        const reserved = await tx.productVariant.updateMany({
          where: { id: line.variantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (reserved.count === 0) throw new BadRequestException(`"${line.productName}" vient d'être épuisé`);
      }
      return tx.merchOrder.create({
        data: {
          code: await this.uniqueCode(tx),
          eventId,
          paymentId,
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          buyerPhone: buyer.phone ?? null,
          fulfillment: q.fulfillment,
          deliveryAddress: q.delivery?.address ?? null,
          deliveryCity: q.delivery?.city ?? null,
          deliveryNotes: q.delivery?.notes ?? null,
          subtotal: q.subtotal,
          deliveryFee: q.deliveryFee,
          total: q.total,
          currency: q.currency,
          items: { create: q.lines },
        },
      });
    });
  }

  /** Payment confirmed: the order becomes PAID; buyer and organizer are told. */
  async markPaidForPayment(paymentId: string) {
    const order = await this.prisma.merchOrder.findUnique({ where: { paymentId }, include: { items: true } });
    if (!order || order.status === 'PAID') return order;

    if (order.status === 'CANCELLED') {
      // Paid after the reservation expired: take the stock again (may go negative → organizer sees it)
      for (const item of order.items) {
        await this.prisma.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } });
      }
      this.logger.warn(`Order ${order.code} paid after its reservation expired — stock re-reserved`);
    } else if (order.status !== 'PENDING_PAYMENT') {
      return order;
    }

    const paid = await this.prisma.merchOrder.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
      include: { items: true, event: { select: { name: true, organizerId: true, merchPickupInfo: true } } },
    });
    this.sendOrderEmail(paid).catch((err) => this.logger.warn(`Order email failed for ${paid.code}: ${err?.message}`));
    this.notifications.create(paid.event.organizerId, {
      title: 'Nouvelle commande boutique',
      message: `${paid.buyerName} — ${paid.items.reduce((s, i) => s + i.quantity, 0)} article(s), ${money(Number(paid.total), paid.currency)}`,
      type: 'success',
      link: `/dashboard/events/${paid.eventId}/boutique`,
    }).catch(() => {});
    return paid;
  }

  /** Payment failed or abandoned: release the reserved stock. */
  async cancelForPayment(paymentId: string) {
    const order = await this.prisma.merchOrder.findUnique({ where: { paymentId }, include: { items: true } });
    if (!order || order.status !== 'PENDING_PAYMENT') return;
    await this.releaseOrder(order);
  }

  private async releaseOrder(order: { id: string; items: { variantId: string; quantity: number }[] }) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.merchOrder.updateMany({ where: { id: order.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      if (claimed.count === 0) return; // already handled
      for (const item of order.items) {
        await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
      }
    });
  }

  /** Releases stock held by checkouts left unpaid for too long. */
  async expireStaleOrders(eventId?: string) {
    const stale = await this.prisma.merchOrder.findMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(Date.now() - RESERVATION_MS) }, ...(eventId && { eventId }) },
      include: { items: true },
      take: 100,
    });
    for (const order of stale) await this.releaseOrder(order);
  }

  async orderSummaryForPayment(paymentId: string) {
    const o = await this.prisma.merchOrder.findUnique({ where: { paymentId }, include: { items: true } });
    if (!o) return null;
    return {
      code: o.code,
      status: o.status,
      fulfillment: o.fulfillment,
      total: Number(o.total),
      currency: o.currency,
      items: o.items.map((i) => ({ productName: i.productName, size: i.size, color: i.color, quantity: i.quantity })),
    };
  }

  private async uniqueCode(tx: Prisma.TransactionClient) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: read aloud at the stand
    for (;;) {
      const bytes = crypto.randomBytes(6);
      const code = 'B-' + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
      if (!(await tx.merchOrder.findUnique({ where: { code } }))) return code;
    }
  }

  // ─── Emails ───────────────────────────────────────────────────────────────

  private async sendOrderEmail(order: Prisma.MerchOrderGetPayload<{ include: { items: true; event: { select: { name: true; organizerId: true; merchPickupInfo: true } } } }>) {
    if (!this.mailer) return;
    const currency = order.currency;
    const rows = order.items.map((i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">
          ${escapeHtml(i.productName)}
          ${i.size || i.color ? `<br/><span style="font-size:12px;color:#6b7280;">${escapeHtml([i.size, i.color].filter(Boolean).join(' · '))}</span>` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:center;">× ${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;text-align:right;">${money(Number(i.unitPrice) * i.quantity, currency)}</td>
      </tr>`).join('');

    const isPickup = order.fulfillment === 'PICKUP';
    const qr = isPickup
      ? await QRCode.toBuffer(JSON.stringify({ mo: order.id, c: order.code }), { errorCorrectionLevel: 'M', margin: 1, width: 220 })
      : null;

    const fulfillmentBlock = isPickup
      ? `<p style="margin:0 0 8px;font-size:14px;color:#111827;font-weight:600;">Retrait sur place</p>
         <p style="margin:0 0 12px;font-size:13px;color:#374151;">${escapeHtml(order.event.merchPickupInfo || 'Au stand boutique de l’événement.')}<br/>
         Présentez ce QR code (ou le code <strong>${order.code}</strong>) au stand.</p>
         <img src="cid:pickup-qr" width="160" height="160" alt="QR de retrait" style="display:block;"/>`
      : `<p style="margin:0 0 8px;font-size:14px;color:#111827;font-weight:600;">Livraison</p>
         <p style="margin:0;font-size:13px;color:#374151;">${escapeHtml(order.deliveryAddress ?? '')}, ${escapeHtml(order.deliveryCity ?? '')}
         ${order.deliveryNotes ? `<br/>${escapeHtml(order.deliveryNotes)}` : ''}<br/>Vous serez informé(e) de l'expédition par email.</p>`;

    await this.mailer.sendMail({
      from: this.config.get<string>('email.from'),
      to: order.buyerEmail,
      subject: `Votre commande ${order.code} — ${order.event.name}`,
      attachments: qr ? [{ filename: 'retrait.png', content: qr, cid: 'pickup-qr', contentType: 'image/png' }] : [],
      html: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f1f5;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px 40px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#5C37FF;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:32px 36px;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#5C37FF;text-transform:uppercase;letter-spacing:0.1em;">Commande confirmée · ${order.code}</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Merci ${escapeHtml(order.buyerName.split(' ')[0])} !</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;">Votre commande boutique pour <strong>${escapeHtml(order.event.name)}</strong> est payée.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      ${Number(order.deliveryFee) > 0 ? `<tr><td colspan="2" style="padding:8px 0;font-size:13px;color:#6b7280;">Livraison</td><td style="padding:8px 0;font-size:13px;color:#374151;text-align:right;">${money(Number(order.deliveryFee), currency)}</td></tr>` : ''}
      <tr><td colspan="2" style="padding:10px 0 0;font-size:14px;font-weight:700;color:#111827;">Total</td><td style="padding:10px 0 0;font-size:14px;font-weight:700;color:#111827;text-align:right;">${money(Number(order.total), currency)}</td></tr>
    </table>
    <div style="margin-top:24px;padding:16px;border:1px solid #f3f4f6;border-radius:8px;">${fulfillmentBlock}</div>
  </td></tr>
  <tr><td align="center" style="background:#5C37FF;padding:16px;"><p style="margin:0;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:0.08em;">ZAYA</p></td></tr>
</table></td></tr></table></body></html>`,
    });
  }

  private async sendStatusEmail(order: { buyerEmail: string; buyerName: string; code: string; status: string; fulfillment: string; eventId: string }) {
    if (!this.mailer) return;
    const event = await this.prisma.event.findUnique({ where: { id: order.eventId }, select: { name: true, merchPickupInfo: true } });
    const ready = order.status === 'READY';
    await this.mailer.sendMail({
      from: this.config.get<string>('email.from'),
      to: order.buyerEmail,
      subject: ready ? `Votre commande ${order.code} est prête` : `Votre commande ${order.code} a été expédiée`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
        <h2 style="color:#5C37FF;margin:0 0 12px">${ready ? 'Commande prête' : 'Commande expédiée'}</h2>
        <p>Bonjour ${escapeHtml(order.buyerName.split(' ')[0])},</p>
        <p>${ready
          ? `Votre commande <strong>${order.code}</strong> (${escapeHtml(event?.name ?? '')}) est prête à être retirée. ${escapeHtml(event?.merchPickupInfo ?? '')}`
          : `Votre commande <strong>${order.code}</strong> (${escapeHtml(event?.name ?? '')}) est en route.`}</p>
      </div>`,
    });
  }
}
