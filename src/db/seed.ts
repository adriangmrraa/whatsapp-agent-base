import "dotenv/config";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { tenants, users, agentConfig, products } from "@/db/schema";

async function seed() {
  // ── Default Tenant ────────────────────────────────────────────────────────

  const defaultSlug = process.env.DEFAULT_TENANT_SLUG ?? "default";

  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, defaultSlug))
    .limit(1);

  if (!tenant) {
    [tenant] = await db
      .insert(tenants)
      .values({
        slug: defaultSlug,
        name: process.env.DEFAULT_TENANT_NAME ?? "Default Business",
        status: "active",
      })
      .returning();

    console.log("Tenant created: %s (id=%d)", tenant.slug, tenant.id);
  } else {
    console.log("Tenant already exists: %s (id=%d)", tenant.slug, tenant.id);
  }

  const tenantId = tenant.id;

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
    where: and(eq(users.email, adminEmail), eq(users.tenantId, tenantId)),
  });

  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);

    await db.insert(users).values({
      tenantId,
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

  const existingConfig = await db
    .select({ id: agentConfig.id })
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId))
    .limit(1);

  if (existingConfig.length === 0) {
    await db.insert(agentConfig).values({
      tenantId,
      enabled: false,
    });

    console.log("Default agent config created.");
  } else {
    console.log("Agent config already exists, skipping.");
  }

  // ── Sample Products ───────────────────────────────────────────────────────

  const existingProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .limit(1);

  if (existingProducts.length === 0) {
    const sampleProducts = [
      {
        tenantId,
        name: "Product A",
        description: "Standard product offering with full features.",
        price: "99.99",
        category: "General",
        line: "Standard",
        sortOrder: 1,
      },
      {
        tenantId,
        name: "Service Basic",
        description: "Entry-level service package.",
        price: "49.99",
        category: "Services",
        line: "Standard",
        sortOrder: 2,
      },
      {
        tenantId,
        name: "Product B",
        description: "Premium product with extended warranty.",
        price: "199.99",
        category: "General",
        line: "Premium",
        sortOrder: 3,
      },
      {
        tenantId,
        name: "Service Pro",
        description: "Full-service package with priority support.",
        price: "149.99",
        category: "Services",
        line: "Premium",
        sortOrder: 4,
      },
      {
        tenantId,
        name: "Add-on Module X",
        description: "Supplementary module for existing products.",
        price: "29.99",
        category: "Add-ons",
        line: "Standard",
        sortOrder: 5,
      },
      {
        tenantId,
        name: "Enterprise Bundle",
        description: "All-in-one bundle for enterprise clients.",
        price: "499.99",
        category: "Bundles",
        line: "Premium",
        sortOrder: 6,
      },
      {
        tenantId,
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
