import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembershipRole } from '@prisma/client';
import { extname } from 'node:path';
import { AuthGuard } from '../common/auth.guard';
import { MAX_CSV_BYTES } from '../common/csv-limits';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PaymentImportMappingDto } from './dto/payment-import-mapping.dto';
import { PaymentImportService } from './payment-import.service';

function paymentCsvInterceptor() {
  return FileInterceptor('file', {
    limits: {
      fileSize: MAX_CSV_BYTES,
      files: 1,
      fields: 5,
      fieldSize: 1_024,
      parts: 6,
    },
    fileFilter: (_request, file, callback) => {
      if (extname(file.originalname).toLowerCase() !== '.csv') {
        callback(new BadRequestException('Seuls les fichiers .csv sont acceptés.'), false);
        return;
      }
      callback(null, true);
    },
  });
}

@Controller('imports/payments')
@UseGuards(AuthGuard, RolesGuard)
export class PaymentImportController {
  constructor(private readonly importService: PaymentImportService) {}

  @Post('preview')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  @UseInterceptors(paymentCsvInterceptor())
  preview(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() mapping: PaymentImportMappingDto,
  ) {
    return this.importService.preview(auth, file, mapping);
  }

  @Post('commit')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  @UseInterceptors(paymentCsvInterceptor())
  commit(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() mapping: PaymentImportMappingDto,
  ) {
    return this.importService.commit(auth, file, mapping);
  }
}
