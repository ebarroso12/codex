import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin@123456", 10);

  await prisma.user.upsert({
    where: {
      email: "admin@espiao.local"
    },
    update: {
      name: "Admin Espiao",
      passwordHash,
      role: Role.ADMIN,
      isActive: true
    },
    create: {
      email: "admin@espiao.local",
      name: "Admin Espiao",
      passwordHash,
      role: Role.ADMIN,
      isActive: true
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
