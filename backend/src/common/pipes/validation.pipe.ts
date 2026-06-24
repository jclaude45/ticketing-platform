import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class CustomValidationPipe implements PipeTransform<any> {
  private readonly logger = new Logger(CustomValidationPipe.name);

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToClass(metatype, value);
    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      skipMissingProperties: false,
    });

    if (errors.length > 0) {
      const errorMessages = errors.flatMap((error) => {
        if (error.constraints) {
          return Object.values(error.constraints);
        }
        // Handle nested validation errors
        if (error.children && error.children.length > 0) {
          return error.children.flatMap((child) =>
            child.constraints ? Object.values(child.constraints) : [],
          );
        }
        return [];
      });

      this.logger.debug(`Validation failed: ${errorMessages.join(', ')}`);
      throw new BadRequestException({
        statusCode: 400,
        message: errorMessages,
        error: 'Bad Request',
      });
    }

    return object;
  }

  private toValidate(metatype: any): boolean {
    const types: any[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
