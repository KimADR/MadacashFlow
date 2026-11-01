import { MembershipRole, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedDemo(): Promise<void> {
  const email = (process.env.DEMO_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.DEMO_ADMIN_PASSWORD ?? '';
  if (!email || password.length < 16) {
    throw new Error(
      'Set DEMO_ADMIN_EMAIL and a unique DEMO_ADMIN_PASSWORD of at least 16 characters before seeding.',
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const tenants = await Promise.all(
    [
      { name: 'MadaCash Distribution', slug: 'mada-demo-distribution' },
      { name: 'MadaCash Services', slug: 'mada-demo-services' },
    ].map(({ name, slug }) =>
      prisma.tenant.upsert({
        where: { slug },
        update: { name, isActive: true },
        create: { name, slug },
      }),
    ),
  );
  const [distributionTenant, servicesTenant] = tenants;
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true },
    create: { email, passwordHash },
  });

  await Promise.all(
    tenants.map((tenant) =>
      prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: { role: MembershipRole.ADMIN },
        create: { tenantId: tenant.id, userId: user.id, role: MembershipRole.ADMIN },
      }),
    ),
  );

  const distributionClient = await prisma.client.upsert({
    where: {
      tenantId_reference: {
        tenantId: distributionTenant.id,
        reference: 'CLIENT-DIST-001',
      },
    },
    update: { name: 'Épicerie Analakely SARL', email: 'compta@analakely.example' },
    create: {
      tenantId: distributionTenant.id,
      reference: 'CLIENT-DIST-001',
      name: 'Épicerie Analakely SARL',
      email: 'compta@analakely.example',
    },
  });
  const servicesClient = await prisma.client.upsert({
    where: {
      tenantId_reference: {
        tenantId: servicesTenant.id,
        reference: 'CLIENT-SERV-001',
      },
    },
    update: { name: 'Bâtiment Imerina SARL', email: 'finance@imerina.example' },
    create: {
      tenantId: servicesTenant.id,
      reference: 'CLIENT-SERV-001',
      name: 'Bâtiment Imerina SARL',
      email: 'finance@imerina.example',
    },
  });
  const issueDate = new Date(Date.UTC(2026, 9, 1));
  const dueDate = new Date(Date.UTC(2026, 10, 15));
  await Promise.all([
    prisma.invoice.upsert({
      where: {
        tenantId_clientId_number: {
          tenantId: distributionTenant.id,
          clientId: distributionClient.id,
          number: 'DEMO-DIST-2026-001',
        },
      },
      update: { issueDate, dueDate, amountAr: 3_000_000n, status: 'ACTIVE' },
      create: {
        tenantId: distributionTenant.id,
        clientId: distributionClient.id,
        number: 'DEMO-DIST-2026-001',
        issueDate,
        dueDate,
        amountAr: 3_000_000n,
      },
    }),
    prisma.invoice.upsert({
      where: {
        tenantId_clientId_number: {
          tenantId: servicesTenant.id,
          clientId: servicesClient.id,
          number: 'DEMO-SERV-2026-001',
        },
      },
      update: { issueDate, dueDate, amountAr: 1_250_000n, status: 'ACTIVE' },
      create: {
        tenantId: servicesTenant.id,
        clientId: servicesClient.id,
        number: 'DEMO-SERV-2026-001',
        issueDate,
        dueDate,
        amountAr: 1_250_000n,
      },
    }),
  ]);

  console.log(`Demo administrator ready: ${email}`);
  console.log('Demo tenants ready: MadaCash Distribution and MadaCash Services');
}

seedDemo()
  .catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
