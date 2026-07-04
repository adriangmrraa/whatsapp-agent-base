import "dotenv/config";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users, agentConfig, products } from "@/db/schema";

async function seed() {
  // ── Admin User ────────────────────────────────────────────────────────────

  const adminEmail = "admin@example.com";

  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn(
      "ADMIN_PASSWORD environment variable is not set. " +
        "Falling back to default 'admin123'.",
    );
    adminPassword = "admin123";
  }

  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.email, adminEmail),
  });

  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);

    await db.insert(users).values({
      email: adminEmail,
      hashedPassword,
      name: "Admin",
      role: "admin",
    });

    console.log("Admin user created: %s", adminEmail);
  } else {
    console.log("Admin user already exists, skipping.");
  }

  // ── Agent Config ──────────────────────────────────────────────────────────

  const existingConfig = await db.query.agentConfig.findFirst();

  if (!existingConfig) {
    await db.insert(agentConfig).values({
      enabled: false,
    });

    console.log("Default agent config created.");
  } else {
    console.log("Agent config already exists, skipping.");
  }

  // ── Sample Products ───────────────────────────────────────────────────────

  const existingProducts = await db.select().from(products).limit(1);

  if (existingProducts.length === 0) {
    const sampleProducts = [
      {
        name: "Product A",
        description: "Standard product offering with full features.",
        price: "99.99",
        category: "General",
        line: "Standard",
        sortOrder: 1,
      },
      {
        name: "Service Basic",
        description: "Entry-level service package.",
        price: "49.99",
        category: "Services",
        line: "Standard",
        sortOrder: 2,
      },
      {
        name: "Product B",
        description: "Premium product with extended warranty.",
        price: "199.99",
        category: "General",
        line: "Premium",
        sortOrder: 3,
      },
      {
        name: "Service Pro",
        description: "Full-service package with priority support.",
        price: "149.99",
        category: "Services",
        line: "Premium",
        sortOrder: 4,
      },
      {
        name: "Add-on Module X",
        description: "Supplementary module for existing products.",
        price: "29.99",
        category: "Add-ons",
        line: "Standard",
        sortOrder: 5,
      },
      {
        name: "Enterprise Bundle",
        description: "All-in-one bundle for enterprise clients.",
        price: "499.99",
        category: "Bundles",
        line: "Premium",
        sortOrder: 6,
      },
      {
        name: "Consulting Hour",
        description: "One hour of expert consulting.",
        price: "120.00",
        category: "Services",
        line: "Standard",
        sortOrder: 7,
      },
    ];

    await db.insert(products).values(sampleProducts);

    console.log("Sample products created: %d items.", sampleProducts.length);
  } else {
    console.log("Products already exist, skipping.");
  }

  console.log("Seed completed successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
