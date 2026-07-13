import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function hash(pw: string): Promise<string> {
  return argon2.hash(pw, { type: argon2.argon2id });
}

// A rough polygon covering central Dubai for the demo delivery zone.
const dubaiZone = {
  type: 'Polygon',
  coordinates: [
    [
      [55.20, 25.15],
      [55.35, 25.15],
      [55.35, 25.28],
      [55.20, 25.28],
      [55.20, 25.15],
    ],
  ],
};

async function main(): Promise<void> {
  console.log('Seeding Marhaba Delivery v2…');

  const password = await hash('Password123');

  const [admin, manager, dispatcher, driverUser, client] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@marhaba.delivery' },
      update: {},
      create: { email: 'admin@marhaba.delivery', passwordHash: password, fullName: 'Admin', role: 'ADMIN' },
    }),
    prisma.user.upsert({
      where: { email: 'manager@marhaba.delivery' },
      update: {},
      create: { email: 'manager@marhaba.delivery', passwordHash: password, fullName: 'Manager', role: 'MANAGER' },
    }),
    prisma.user.upsert({
      where: { email: 'dispatcher@marhaba.delivery' },
      update: {},
      create: { email: 'dispatcher@marhaba.delivery', passwordHash: password, fullName: 'Dispatcher', role: 'DISPATCHER' },
    }),
    prisma.user.upsert({
      where: { email: 'driver@marhaba.delivery' },
      update: {},
      create: {
        email: 'driver@marhaba.delivery',
        passwordHash: password,
        fullName: 'Sami Driver',
        role: 'DRIVER',
        phone: '+971500000001',
        driverProfile: {
          create: { status: 'AVAILABLE', vehicleType: 'MOTORCYCLE', lastLng: 55.27, lastLat: 25.2 },
        },
      },
    }),
    prisma.user.upsert({
      where: { email: 'client@marhaba.delivery' },
      update: {},
      create: {
        email: 'client@marhaba.delivery',
        passwordHash: password,
        fullName: 'Layla Client',
        role: 'CLIENT',
        phone: '+971500000002',
      },
    }),
  ]);

  const category = await prisma.category.upsert({
    where: { slug: 'burgers' },
    update: {},
    create: { name: 'Burgers', slug: 'burgers', sortOrder: 1 },
  });

  await prisma.product.upsert({
    where: { slug: 'classic-beef-burger' },
    update: {},
    create: {
      categoryId: category.id,
      name: 'Classic Beef Burger',
      slug: 'classic-beef-burger',
      description: 'Char-grilled beef, cheddar, house sauce.',
      priceMinor: 3500,
      prepTimeMinutes: 12,
    },
  });
  await prisma.product.upsert({
    where: { slug: 'crispy-chicken-burger' },
    update: {},
    create: {
      categoryId: category.id,
      name: 'Crispy Chicken Burger',
      slug: 'crispy-chicken-burger',
      priceMinor: 3200,
      prepTimeMinutes: 12,
    },
  });

  const zone = await prisma.deliveryZone.upsert({
    where: { id: 'seed-zone-dubai' },
    update: { geojson: dubaiZone },
    create: { id: 'seed-zone-dubai', name: 'Dubai Central', priority: 10, geojson: dubaiZone },
  });

  // Backfill the PostGIS area column from the GeoJSON.
  await prisma.$executeRawUnsafe(
    `UPDATE delivery_zones SET area = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography WHERE id = $2`,
    JSON.stringify(dubaiZone),
    zone.id,
  );

  await prisma.pricingRule.upsert({
    where: { id: 'seed-rule-dubai' },
    update: {},
    create: {
      id: 'seed-rule-dubai',
      zoneId: zone.id,
      baseFeeMinor: 500,
      perKmMinor: 120,
      minOrderMinor: 2000,
      freeDeliveryThresholdMinor: 8000,
      surgeWindows: [
        { label: 'Dinner rush', days: [4, 5, 6], startTime: '18:00', endTime: '21:00', multiplier: 1.4 },
      ],
    },
  });

  console.log('Seed complete.');
  console.log('Login: admin@marhaba.delivery / Password123 (and manager/dispatcher/driver/client)');
  void [admin, manager, dispatcher, driverUser, client];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
