import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
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
import { InvoiceImportMappingDto } from './dto/invoice-import-mapping.dto';
import { InvoiceImportService } from './invoice-import.service';

function invoiceCsvInterceptor() {
  return FileInterceptor('file', {
    limits: { fileSize: MAX_CSV_BYTES, files: 1, fields: 5 },
    fileFilter: (_request, file, callback) => {
      if (extname(file.originalname).toLowerCase() !== '.csv') {
        callback(new BadRequestException('Seuls les fichiers .csv sont acceptés.'), false);
        return;
      }
      callback(null, true);
    },
  });
}

@Controller('imports/invoices')
@UseGuards(AuthGuard, RolesGuard)
export class InvoiceImportController {
  constructor(private readonly importService: InvoiceImportService) {}

  @Post('preview')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  @UseInterceptors(invoiceCsvInterceptor())
  preview(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() mapping: InvoiceImportMappingDto,
  ) {
    return this.importService.preview(auth, file, mapping);
  }

  @Post('commit')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  @UseInterceptors(invoiceCsvInterceptor())
  commit(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() mapping: InvoiceImportMappingDto,
  ) {
    return this.importService.commit(auth, file, mapping);
  }
}
