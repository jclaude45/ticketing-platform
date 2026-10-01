import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ShopService } from './shop.service';
import { CreateProductDto, UpdateProductDto, ShopSettingsDto, UpdateOrderStatusDto } from './dto/shop.dto';

/** Organizer: products, shop settings and orders of an event. */
@ApiTags('Shop')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
@Controller('events/:eventId/shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('products')
  @ApiOperation({ summary: 'Products with variants, stock and units sold' })
  listProducts(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.shop.listProducts(eventId, user.id, user.role);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a product with its variants' })
  createProduct(@Param('eventId') eventId: string, @CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.shop.createProduct(eventId, user.id, user.role, dto);
  }

  @Patch('products/:productId')
  @ApiOperation({ summary: 'Update a product (variants list replaces the current one)' })
  updateProduct(
    @Param('eventId') eventId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateProductDto,
  ) {
    return this.shop.updateProduct(eventId, productId, user.id, user.role, dto);
  }

  @Delete('products/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a product (archived if it already has orders)' })
  deleteProduct(@Param('eventId') eventId: string, @Param('productId') productId: string, @CurrentUser() user: any) {
    return this.shop.deleteProduct(eventId, productId, user.id, user.role);
  }

  @Post('products/:productId/image')
  @ApiOperation({ summary: 'Upload the product photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadImage(
    @Param('eventId') eventId: string,
    @Param('productId') productId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.shop.uploadImage(eventId, productId, user.id, user.role, file);
  }

  @Get('settings')
  getSettings(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.shop.getSettings(eventId, user.id, user.role);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Delivery fee / pickup information' })
  updateSettings(@Param('eventId') eventId: string, @CurrentUser() user: any, @Body() dto: ShopSettingsDto) {
    return this.shop.updateSettings(eventId, user.id, user.role, dto);
  }

  @Get('orders')
  @ApiQuery({ name: 'status', required: false, description: 'An order status, or TO_HANDLE (paid, ready, shipped)' })
  listOrders(@Param('eventId') eventId: string, @CurrentUser() user: any, @Query('status') status?: string) {
    return this.shop.listOrders(eventId, user.id, user.role, status);
  }

  @Patch('orders/:orderId')
  @ApiOperation({ summary: 'Move an order forward (ready, shipped, delivered, picked up, cancelled)' })
  updateOrder(
    @Param('eventId') eventId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.shop.updateOrderStatus(eventId, orderId, user.id, user.role, dto.status);
  }
}

/** Buyers: the shop of a published event. */
@ApiTags('Public Ticketing')
@Controller('public/events/:eventId/shop')
export class PublicShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  @ApiOperation({ summary: 'Products on sale for a published event, delivery options' })
  catalog(@Param('eventId') eventId: string) {
    return this.shop.publicCatalog(eventId);
  }
}
