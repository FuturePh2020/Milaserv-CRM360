/**
 * Seeds the initial Team Leader account from environment variables.
 * Safe to run repeatedly (idempotent upsert on email).
 */
import argon2 from "argon2";
import { PrismaClient, UserRole, UserStatus } from "../generated/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_TEAM_LEADER_EMAIL;
  const password = process.env.SEED_TEAM_LEADER_PASSWORD;
  const fullName = process.env.SEED_TEAM_LEADER_FULL_NAME ?? "Milaserv Admin";

  if (!email || !password) {
    throw new Error(
      "SEED_TEAM_LEADER_EMAIL and SEED_TEAM_LEADER_PASSWORD must be set to seed the initial Team Leader.",
    );
  }

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      fullName,
      role: UserRole.TEAM_LEADER,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Seeded Team Leader: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
