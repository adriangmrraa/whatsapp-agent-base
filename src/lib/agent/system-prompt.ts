import { db } from "@/db";
import { agentConfig, products } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface Product {
  name: string;
  description: string | null;
  price: string | null;
  category: string | null;
  line: string | null;
  available: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentConfig = Record<string, any>;

export async function loadConfig(tenantId: number): Promise<AgentConfig | null> {
  try {
    const rows = await db
      .select()
      .from(agentConfig)
      .where(eq(agentConfig.tenantId, tenantId))
      .limit(1);
    return (rows[0] as AgentConfig) ?? null;
  } catch {
    return null;
  }
}

export async function loadCatalog(tenantId: number): Promise<Product[]> {
  try {
    const items = await db
      .select({
        name: products.name,
        description: products.description,
        price: products.price,
        category: products.category,
        line: products.line,
        available: products.available,
      })
      .from(products)
      .where(and(eq(products.available, true), eq(products.tenantId, tenantId)))
      .orderBy(products.sortOrder);

    return items as Product[];
  } catch {
    return [];
  }
}

export function buildSystemPrompt(
  businessName: string,
  catalogProducts: Product[],
  config: AgentConfig | null,
): string {
  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  // Format catalog
  const catalogLines = catalogProducts.map((p) => {
    const price = p.price ? ` - $${p.price}` : "";
    const desc = p.description ? ` (${p.description})` : "";
    return `  \u2022 ${p.name}${price}${desc}`;
  });

  const catalog =
    catalogLines.length > 0
      ? catalogLines.join("\n")
      : "  (No hay productos disponibles en este momento.)";

  // Business hours
  const hours = config?.operatingHours ?? "No especificado";
  const deliveryEnabled = config?.deliveryEnabled ?? true;

  const deliveryZones = config?.deliveryZones ?? [];
  const zonesList =
    Array.isArray(deliveryZones) && deliveryZones.length > 0
      ? deliveryZones
          .map(
            (z: { zone: string; available: boolean; cost?: number }) =>
              `  - ${z.zone}${z.available ? "" : " (no disponible)"}${z.cost != null ? ` - $${z.cost}` : ""}`,
          )
          .join("\n")
      : "  Consultar disponibilidad.";

  const instructions = config?.whatsappInstructions ?? "";

  return `Eres el asistente virtual de ${businessName}. Tu personalidad es amable, profesional y servicial.

## Informaci\u00f3n del negocio
Hoy es ${today}.

## Horarios
- Horario: ${hours}

## Cat\u00e1logo disponible
${catalog}

## Pol\u00edticas
- Delivery: ${deliveryEnabled ? "Disponible" : "No disponible"}
${deliveryEnabled ? `- Zonas de delivery:\n${zonesList}` : ""}

## Instrucciones
${instructions}

## Reglas importantes
1. S\u00e9 amable y profesional
2. Si no sab\u00e9s algo, dec\u00ed que lo vas a consultar
3. NO inventes precios ni productos
4. Us\u00e1 las herramientas disponibles para ayudar al cliente
5. Confirm\u00e1 los pedidos antes de crearlos`;
}
