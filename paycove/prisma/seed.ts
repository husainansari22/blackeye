import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("PayCove2026!", 12);

  await prisma.user.upsert({
    where: { email: "admin@paycovenow.com" },
    update: {},
    create: {
      email: "admin@paycovenow.com",
      name: "PayCove Admin",
      password,
      role: "ADMIN",
      phone: "+2348000000000",
    },
  });

  await prisma.user.upsert({
    where: { email: "seller@paycovenow.com" },
    update: {},
    create: {
      email: "seller@paycovenow.com",
      name: "Demo Seller",
      password,
      role: "SELLER",
      phone: "+2348012345678",
    },
  });

  console.log("Seeded accounts:");
  console.log("admin@paycovenow.com / PayCove2026!");
  console.log("seller@paycovenow.com / PayCove2026!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
