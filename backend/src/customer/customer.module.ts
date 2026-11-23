import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PaymentModule } from '../payment/payment.module';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerController } from './customer.controller';
import { CustomerGuard } from './customer.guard';
import { CustomerService } from './customer.service';

@Module({
  imports: [JwtModule.register({}), PaymentModule],
  controllers: [CustomerController],
  providers: [CustomerAuthService, CustomerService, CustomerGuard],
  exports: [CustomerAuthService, CustomerGuard],
})
export class CustomerModule {}
