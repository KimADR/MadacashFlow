import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUserContext } from '../common/auth-context';
import type { CreateClientDto } from './dto/create-client.dto';
import type { ListClientsDto } from './dto/list-clients.dto';

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthenticatedUserContext, query: ListClientsDto) {
    const tenantId = this.requireTenant(auth);
    const search = query.search?.trim();
    const where: Prisma.ClientWhereInput = {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { reference: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(auth: AuthenticatedUserContext, dto: CreateClientDto) {
    const tenantId = this.requireTenant(auth);

    try {
      const client = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.client.create({
          data: {
            tenantId,
            reference: dto.reference.trim(),
            name: dto.name.trim(),
            email: dto.email?.trim().toLowerCase() || null,
            phone: dto.phone?.trim() || null,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId,
            userId: auth.userId,
            action: 'CLIENT_CREATED',
            details: { clientId: created.id, reference: created.reference },
          },
        });
        return created;
      });

      return client;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CLIENT_REFERENCE_EXISTS',
          message: 'Cette référence client existe déjà dans cette entreprise.',
        });
      }
      throw error;
    }
  }

  private requireTenant(auth: AuthenticatedUserContext): string {
    if (!auth.tenantId) {
      throw new ConflictException({
        code: 'TENANT_NOT_SELECTED',
        message: 'Sélectionnez une entreprise avant de continuer.',
      });
    }
    return auth.tenantId;
  }
}
