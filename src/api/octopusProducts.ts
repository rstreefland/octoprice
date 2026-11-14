import { z } from "zod";

z.config({ jitless: true });

const timestampSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
const productSchema = z.object({
  code: z.string().min(1),
  full_name: z.string(),
  direction: z.enum(["IMPORT", "EXPORT"]),
  brand: z.string(),
  is_business: z.boolean(),
  is_prepay: z.boolean(),
  available_from: timestampSchema,
  available_to: timestampSchema.nullable(),
});
const productPageSchema = z.object({
  results: z.array(productSchema),
  next: z.string().nullable(),
});

export type OctopusProduct = z.infer<typeof productSchema>;

export function parseProductPage(value: unknown) {
  const result = productPageSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Octopus returned an invalid product catalogue. Please try again."
    );
  return result.data;
}

export async function fetchOctopusProducts({
  historical = false,
  fetchPage = fetch,
  signal,
}: {
  historical?: boolean;
  fetchPage?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<OctopusProduct[]> {
  const parameters = new URLSearchParams({
    brand: "OCTOPUS_ENERGY",
    is_business: "false",
    is_prepay: "false",
    is_historical: String(historical),
  });
  let next: string | null =
    `https://api.octopus.energy/v1/products/?${parameters}`;
  const visited = new Set<string>();
  const products = new Map<string, OctopusProduct>();

  while (next) {
    const url = new URL(next);
    const allowedHosts = ["api.octopus.energy", "api.oegb-kraken.energy"];
    if (
      url.protocol !== "https:" ||
      !allowedHosts.includes(url.hostname) ||
      url.pathname !== "/v1/products/" ||
      visited.has(url.href)
    ) {
      throw new Error("Octopus returned an invalid catalogue page link.");
    }
    visited.add(url.href);
    const response = await fetchPage(url.href, { signal });
    if (!response.ok)
      throw new Error("Unable to load Octopus tariffs. Please try again.");
    const page = parseProductPage(await response.json());
    for (const product of page.results) {
      products.set(product.code, product);
    }
    next = page.next;
  }

  return [...products.values()];
}
