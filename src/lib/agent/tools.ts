import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import {
  products,
  orders,
  agentConfig,
  promotions,
  addresses,
} from "@/db/schema";
import { eq, and, ilike, desc, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── 1. getBusinessHours ──────────────────────────────────────────────────────

export const getBusinessHours = tool({
  description:
    "Check if the business is currently open and get today's operating hours.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const configRows = await db.select().from(agentConfig).limit(1);
      const row = configRows[0] ?? null;

      const now = new Date();
      const argTime = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).format(now);

      const [hourStr, minuteStr] = argTime.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);
      const totalMinutes = hour * 60 + minute;

      const startHour = (row?.businessStartHour as string) ?? "20:00";
      const [startH, startM] = startHour.split(":").map(Number);
      const openMinutes = startH * 60 + startM;
      const closeMinutes = 23 * 60; // default 23:00

      const isOpen = totalMinutes >= openMinutes && totalMinutes < closeMinutes;
      const hours =
        (row?.operatingHours as string) ?? `${startHour} a 23:00`;

      return {
        isOpen,
        currentTime: argTime,
        hours,
        message: isOpen
          ? `S\u00ed, estamos abiertos. Son las ${argTime}. Horario: ${hours}`
          : `Estamos cerrados en este momento. Son las ${argTime}. Horario: ${hours}`,
      };
    } catch {
      return {
        isOpen: false,
        currentTime: "unknown",
        hours: "Consultar horarios",
        message: "No pude verificar el horario en este momento.",
      };
    }
  },
});

// ─── 2. getCatalog ────────────────────────────────────────────────────────────

export const getCatalog = tool({
  description:
    "Get the product catalog from the database. Optionally filter by category.",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe("Category to filter products by (optional)"),
  }),
  execute: async ({ category }) => {
    try {
      const conditions = [eq(products.available, true)];
      if (category) {
        conditions.push(eq(products.category, category));
      }

      const items = await db
        .select({
          name: products.name,
          description: products.description,
          price: products.price,
          category: products.category,
          line: products.line,
        })
        .from(products)
        .where(and(...conditions))
        .orderBy(products.sortOrder);

      if (items.length === 0) {
        return {
          items: [],
          message: "There are no products available at the moment.",
        };
      }

      const formatted = items
        .map((item) => {
          const price = item.price ? ` - $${item.price}` : "";
          const desc = item.description ? ` (${item.description})` : "";
          return `\u2022 ${item.name}${price}${desc}`;
        })
        .join("\n");

      return {
        items,
        formatted,
        message: `Available catalog:\n${formatted}`,
      };
    } catch {
      return {
        items: [],
        message: "Could not load the catalog at this time.",
      };
    }
  },
});

// ─── 3. createOrder (factory) ─────────────────────────────────────────────────

export function makeCreateOrder(phoneNumber: string) {
  return tool({
    description:
      "Create a new order in the database. Requires customer name, order type, and items. Confirm with the customer before creating.",
    inputSchema: z.object({
      customerName: z.string().describe("Full name of the customer"),
      orderType: z.string().describe("Type of order (e.g. delivery, pickup)"),
      items: z
        .array(
          z.object({
            productName: z.string().describe("Name of the product"),
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("Quantity of the product"),
          }),
        )
        .min(1)
        .describe("List of items in the order"),
      customerNotes: z
        .string()
        .optional()
        .describe("Optional notes or special instructions for the order"),
    }),
    execute: async ({ customerName, orderType, items, customerNotes }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(orders).values({
          phoneNumber,
          customerName,
          orderType,
          items: items as any,
          notes: customerNotes ?? null,
          status: "pending",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const summary = items
          .map((i) => `${i.quantity}x ${i.productName}`)
          .join(", ");

        return {
          success: true,
          message: `Order confirmed: ${summary}. Thank you!`,
          items,
        };
      } catch {
        return {
          success: false,
          message:
            "There was an error creating your order. Please contact us directly.",
        };
      }
    },
  });
}

// ─── 4. getOrderStatus ────────────────────────────────────────────────────────

export const getOrderStatus = tool({
  description:
    "Get the status of an order by order ID or phone number. Returns order details including current status.",
  inputSchema: z.object({
    orderId: z
      .number()
      .int()
      .optional()
      .describe("The order ID to look up"),
    phoneNumber: z
      .string()
      .optional()
      .describe("Phone number to look up orders by"),
  }),
  execute: async ({ orderId, phoneNumber: queryPhone }) => {
    try {
      const conditions: ReturnType<typeof eq>[] = [];

      if (orderId != null) {
        conditions.push(eq(orders.id, orderId));
      }
      if (queryPhone) {
        conditions.push(eq(orders.phoneNumber, queryPhone));
      }

      if (conditions.length === 0) {
        return {
          found: false,
          message:
            "Please provide either an order ID or a phone number to search.",
        };
      }

      const result = await db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(5);

      if (result.length === 0) {
        return { found: false, message: "No orders found matching your search." };
      }

      return {
        found: true,
        orders: result,
        message: `Found ${result.length} order(s).`,
      };
    } catch {
      return {
        found: false,
        message: "Could not retrieve order status at this time.",
      };
    }
  },
});

// ─── 5. searchCatalog ────────────────────────────────────────────────────────

export const searchCatalog = tool({
  description:
    "Search products in the catalog by name. Uses partial text matching.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search query to find products by name"),
  }),
  execute: async ({ query }) => {
    try {
      const items = await db
        .select({
          name: products.name,
          description: products.description,
          price: products.price,
          category: products.category,
          line: products.line,
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(
          and(
            eq(products.available, true),
            ilike(products.name, `%${query}%`),
          ),
        )
        .orderBy(products.sortOrder);

      if (items.length === 0) {
        return {
          items: [],
          message: `No products found matching "${query}".`,
        };
      }

      const formatted = items
        .map(
          (item) =>
            `\u2022 ${item.name}${item.price ? ` - $${item.price}` : ""}${item.description ? ` (${item.description})` : ""}`,
        )
        .join("\n");

      return {
        items,
        formatted,
        message: `Search results for "${query}":\n${formatted}`,
      };
    } catch {
      return {
        items: [],
        message: "Could not search the catalog at this time.",
      };
    }
  },
});

// ─── 6. getProductDetails ─────────────────────────────────────────────────────

export const getProductDetails = tool({
  description:
    "Get full details of a specific product by name or product ID. Returns description, price, category, and availability.",
  inputSchema: z.object({
    name: z.string().optional().describe("Name of the product to look up"),
    productId: z
      .number()
      .int()
      .optional()
      .describe("ID of the product to look up"),
  }),
  execute: async ({ name, productId }) => {
    try {
      const conditions: ReturnType<typeof eq>[] = [eq(products.available, true)];

      if (name) {
        conditions.push(eq(products.name, name));
      }
      if (productId != null) {
        conditions.push(eq(products.id, productId));
      }

      if (conditions.length === 1) {
        return {
          found: false,
          message: "Please provide either a product name or ID.",
        };
      }

      const item = await db
        .select()
        .from(products)
        .where(and(...conditions))
        .limit(1);

      if (item.length === 0) {
        return { found: false, message: "Product not found." };
      }

      return {
        found: true,
        product: item[0],
        message: `${item[0].name}${item[0].price ? ` - $${item[0].price}` : ""}${item[0].description ? `\n${item[0].description}` : ""}`,
      };
    } catch {
      return {
        found: false,
        message: "Could not retrieve product details at this time.",
      };
    }
  },
});

// ─── 7. checkDelivery ─────────────────────────────────────────────────────────

export const checkDelivery = tool({
  description:
    "Check if delivery is available, get delivery zones, costs, and estimated times.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const configRows = await db.select().from(agentConfig).limit(1);
      const row = configRows[0] ?? null;

      const deliveryEnabled = (row?.deliveryEnabled as boolean) ?? true;
      const deliveryZones = (row?.deliveryZones as Array<{
        zone: string;
        available: boolean;
        estimatedTime: string;
        cost: number;
      }>) ?? [];

      const info = deliveryEnabled
        ? deliveryZones.length > 0
          ? `Delivery available in ${deliveryZones.filter((z) => z.available).length} zone(s).`
          : "Delivery is available. Consult zones at order time."
        : "Delivery is not currently available.";

      return {
        deliveryEnabled,
        deliveryZones,
        info,
      };
    } catch {
      return {
        deliveryEnabled: false,
        deliveryZones: [],
        info: "Could not check delivery information at this time.",
      };
    }
  },
});

// ─── 8. getBusinessInfo ───────────────────────────────────────────────────────

export const getBusinessInfo = tool({
  description:
    "Get general business information including name, hours, contact details, and wait times.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const configRows = await db.select().from(agentConfig).limit(1);
      const row = configRows[0] ?? null;

      return {
        metaBusinessName: row?.metaBusinessName ?? null,
        primaryAlias: row?.primaryAlias ?? null,
        secondaryAlias: row?.secondaryAlias ?? null,
        operatingHours: row?.operatingHours ?? null,
        estimatedWaitTime: row?.estimatedWaitTime ?? null,
        deliveryPhoneNumber: row?.deliveryPhoneNumber ?? null,
        isActive: row?.isActive ?? true,
      };
    } catch {
      return {
        metaBusinessName: null,
        primaryAlias: null,
        secondaryAlias: null,
        operatingHours: null,
        estimatedWaitTime: null,
        deliveryPhoneNumber: null,
        isActive: false,
      };
    }
  },
});

// ─── 9. saveCustomerAddress (factory) ─────────────────────────────────────────

export function makeSaveCustomerAddress(phoneNumber: string) {
  return tool({
    description:
      "Save a customer's delivery address. Can include a label, latitude, and longitude for future reference.",
    inputSchema: z.object({
      address: z.string().min(1).describe("Street address or delivery location"),
      label: z
        .string()
        .optional()
        .describe("Optional label for the address (e.g. Home, Work)"),
      latitude: z
        .string()
        .optional()
        .describe("Latitude coordinate for the address"),
      longitude: z
        .string()
        .optional()
        .describe("Longitude coordinate for the address"),
    }),
    execute: async ({ address, label, latitude, longitude }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(addresses).values({
          phone: phoneNumber,
          address,
          label: label ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        return {
          success: true,
          message: `Address saved successfully${label ? ` as "${label}"` : ""}.`,
        };
      } catch {
        return {
          success: false,
          message: "Could not save the address at this time.",
        };
      }
    },
  });
}

// ─── 10. callHuman ────────────────────────────────────────────────────────────

export const callHuman = tool({
  description:
    "Transfer the conversation to a human agent. Use this when the customer asks to speak with a person or when you cannot handle their request.",
  inputSchema: z.object({
    reason: z
      .string()
      .optional()
      .describe("Reason for transferring to a human agent"),
  }),
  execute: async ({ reason }) => {
    const reasonText = reason ? ` Reason: ${reason}` : "";

    return {
      transferred: true,
      message: `Un agente humano te atender\u00e1 en breve.${reasonText}`,
    };
  },
});

// ─── 11. sendProductImage ────────────────────────────────────────────────────

export const sendProductImage = tool({
  description:
    "Get the image URL of a product by name or ID. Returns the product image so you can share it with the customer.",
  inputSchema: z.object({
    productName: z
      .string()
      .optional()
      .describe("Name of the product to get the image for"),
    productId: z
      .number()
      .int()
      .optional()
      .describe("ID of the product to get the image for"),
  }),
  execute: async ({ productName, productId }) => {
    try {
      const conditions: ReturnType<typeof eq>[] = [];

      if (productName) {
        conditions.push(eq(products.name, productName));
      }
      if (productId != null) {
        conditions.push(eq(products.id, productId));
      }

      if (conditions.length === 0) {
        return {
          found: false,
          message: "Please provide either a product name or ID.",
        };
      }

      const item = await db
        .select({
          name: products.name,
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(and(eq(products.available, true), ...conditions))
        .limit(1);

      if (item.length === 0 || !item[0].imageUrl) {
        return {
          found: false,
          message: "No image available for this product.",
        };
      }

      return {
        found: true,
        productName: item[0].name,
        imageUrl: item[0].imageUrl,
        message: `Image for ${item[0].name}: ${item[0].imageUrl}`,
      };
    } catch {
      return {
        found: false,
        message: "Could not retrieve the product image at this time.",
      };
    }
  },
});

// ─── 12. getActivePromotions ──────────────────────────────────────────────────

export const getActivePromotions = tool({
  description:
    "Get all currently active promotions, discounts, and special offers.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const activePromotions = await db
        .select()
        .from(promotions)
        .where(eq(promotions.active, true))
        .orderBy(desc(promotions.createdAt));

      if (activePromotions.length === 0) {
        return {
          promotions: [],
          message: "There are no active promotions at the moment.",
        };
      }

      const formatted = activePromotions
        .map(
          (p) =>
            `\u2022 ${p.name}${p.customPrice ? ` - $${p.customPrice}` : ""}${p.description ? `: ${p.description}` : ""}`,
        )
        .join("\n");

      return {
        promotions: activePromotions,
        formatted,
        message: `Active promotions:\n${formatted}`,
      };
    } catch {
      return {
        promotions: [],
        message: "Could not load promotions at this time.",
      };
    }
  },
});

// ─── 13. getCustomerHistory (factory) ─────────────────────────────────────────

export function makeGetCustomerHistory(phoneNumber: string) {
  return tool({
    description:
      "Get the order history for the current customer. Returns recent orders with their status.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const customerOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.phoneNumber, phoneNumber))
          .orderBy(desc(orders.createdAt))
          .limit(10);

        if (customerOrders.length === 0) {
          return { orders: [], message: "No previous orders found." };
        }

        return {
          orders: customerOrders,
          message: `Found ${customerOrders.length} previous order(s).`,
        };
      } catch {
        return {
          orders: [],
          message: "Could not load order history at this time.",
        };
      }
    },
  });
}

// ─── 14. suggestProducts ──────────────────────────────────────────────────────

export const suggestProducts = tool({
  description:
    "Suggest products based on category, maximum price, or a limit. Use this to recommend products to the customer.",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe("Filter products by category"),
    maxPrice: z
      .number()
      .positive()
      .optional()
      .describe("Maximum price filter"),
    limit: z
      .number()
      .int()
      .positive()
      .max(20)
      .optional()
      .default(5)
      .describe("Maximum number of suggestions to return (default 5, max 20)"),
  }),
  execute: async ({ category, maxPrice, limit = 5 }) => {
    try {
      const conditions: ReturnType<typeof eq | typeof sql>[] = [
        eq(products.available, true),
      ];

      if (category) {
        conditions.push(eq(products.category, category));
      }

      if (maxPrice != null) {
        conditions.push(
          sql`${products.price}::numeric <= ${maxPrice}`,
        );
      }

      const items = await db
        .select({
          name: products.name,
          description: products.description,
          price: products.price,
          category: products.category,
          line: products.line,
        })
        .from(products)
        .where(and(...conditions))
        .orderBy(asc(products.sortOrder))
        .limit(limit);

      if (items.length === 0) {
        return {
          items: [],
          message: "No products match your criteria.",
        };
      }

      const formatted = items
        .map(
          (item) =>
            `\u2022 ${item.name}${item.price ? ` - $${item.price}` : ""}${item.description ? ` (${item.description})` : ""}`,
        )
        .join("\n");

      return {
        items,
        formatted,
        message: `Suggestions:\n${formatted}`,
      };
    } catch {
      return {
        items: [],
        message: "Could not suggest products at this time.",
      };
    }
  },
});

// ─── 15. addToOrder (factory) ─────────────────────────────────────────────────

export function makeAddToOrder(phoneNumber: string) {
  return tool({
    description:
      "Add items to an existing pending order for this customer. The order must be in 'pending' status to modify.",
    inputSchema: z.object({
      orderId: z.number().int().describe("ID of the existing pending order"),
      productName: z.string().describe("Name of the product to add"),
      quantity: z.number().int().min(1).describe("Quantity to add"),
      variant: z.string().optional().describe("Product variant if applicable"),
    }),
    execute: async ({ orderId, productName, quantity, variant }) => {
      try {
        const existingOrders = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.id, orderId),
              eq(orders.phoneNumber, phoneNumber),
            ),
          )
          .limit(1);

        if (existingOrders.length === 0) {
          return { success: false, message: "Order not found." };
        }

        const order = existingOrders[0];

        if (order.status !== "pending") {
          return {
            success: false,
            message:
              "Cannot modify an order that is no longer pending.",
          };
        }

        const currentItems = (order.items as Array<{
          productName: string;
          quantity: number;
          variant?: string;
        }>) ?? [];

        const newItem: {
          productName: string;
          quantity: number;
          variant?: string;
        } = { productName, quantity };

        if (variant) {
          newItem.variant = variant;
        }

        const updatedItems = [...currentItems, newItem];

        await db
          .update(orders)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ items: updatedItems as any })
          .where(eq(orders.id, orderId));

        return {
          success: true,
          message: `Added ${quantity}x ${productName} to order #${orderId}.`,
        };
      } catch {
        return {
          success: false,
          message: "Could not add items to the order at this time.",
        };
      }
    },
  });
}
