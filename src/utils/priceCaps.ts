import { z } from "zod";

z.config({ jitless: true });

export const PRICE_CAP_COLUMNS = "Region\tDate\tE\tG\tES\tGS";
export const LEGACY_PRICE_CAP_SOURCE =
  "https://gist.githubusercontent.com/edward-designer/232d54ace5006183d873e9eebcf82da2/raw/energy_price_caps.tsv";

const regionSchema = z.enum([
  "GB",
  "_A",
  "_B",
  "_C",
  "_D",
  "_E",
  "_F",
  "_G",
  "_H",
  "_J",
  "_K",
  "_L",
  "_M",
  "_N",
  "_P",
]);
const amountSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
export const priceCapRowSchema = z.object({
  Region: regionSchema,
  Date: z.iso.date(),
  E: amountSchema,
  G: amountSchema,
  ES: amountSchema.or(z.literal("")),
  GS: amountSchema.or(z.literal("")),
});
export type PriceCapRow = z.infer<typeof priceCapRowSchema>;

export const periodSchema = z
  .object({ effectiveFrom: z.iso.date(), effectiveTo: z.iso.date() })
  .refine(
    (period) => period.effectiveFrom <= period.effectiveTo,
    "Invalid cap period"
  );
export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
});
export const attributionSchema = z.object({
  text: z.string().min(1),
  url: z.literal("https://utilityprices.co.uk/energy-price-cap"),
});
export const updateMetadataSchema = z.object({
  period: periodSchema,
  retrievedAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  vatBasis: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  attribution: attributionSchema,
  licence: z.literal("CC-BY-4.0"),
});
const backfillMetadataSchema = updateMetadataSchema
  .omit({ attribution: true, licence: true })
  .extend({
    licence: z.literal("OGL-3.0"),
    methodology: z.string().min(1),
  });
export const priceCapSourcesSchema = z.object({
  legacySource: z.literal(LEGACY_PRICE_CAP_SOURCE),
  updates: z.array(updateMetadataSchema),
  backfills: z.array(backfillMetadataSchema),
});
export type PriceCapSources = z.infer<typeof priceCapSourcesSchema>;
export type PriceCapUpdate = {
  rows: PriceCapRow[];
  metadata: z.infer<typeof updateMetadataSchema>;
};

export function parsePriceCapTsv(text: string): PriceCapRow[] {
  const [header, ...lines] = text.split(/\r?\n/);
  if (header !== PRICE_CAP_COLUMNS)
    throw new Error("Invalid price cap file header");
  const seen = new Set<string>();
  const dataLines = lines.filter((line) => line !== "");
  if (dataLines.length === 0) throw new Error("Price cap data is empty");
  return dataLines.map((line) => {
    const fields = line.split("\t");
    if (fields.length !== 6) throw new Error("Invalid price cap row");
    const [Region, effectiveDate, E, G, ES, GS] = fields;
    const row = priceCapRowSchema.parse({
      Region,
      Date: effectiveDate,
      E,
      G,
      ES,
      GS,
    });
    const key = `${row.Date}:${row.Region}`;
    if (seen.has(key)) throw new Error("Duplicate price cap row");
    seen.add(key);
    return row;
  });
}

export function mergePriceCapUpdate({
  text,
  sources,
  update,
}: {
  text: string;
  sources: PriceCapSources;
  update: PriceCapUpdate;
}) {
  const existingRows = parsePriceCapTsv(text);
  const latestDate = existingRows
    .map((row) => row.Date)
    .sort()
    .at(-1);
  if (latestDate && update.metadata.period.effectiveFrom < latestDate)
    throw new Error("UtilityPrices returned an older cap period");
  const rows = new Map(
    existingRows.map((row) => [`${row.Date}:${row.Region}`, row])
  );
  for (const row of update.rows) rows.set(`${row.Date}:${row.Region}`, row);
  const sortedRows = [...rows.values()].sort((a, b) => {
    const dateOrder = b.Date.localeCompare(a.Date);
    if (dateOrder) return dateOrder;
    if (a.Region === b.Region) return 0;
    return a.Region < b.Region ? -1 : 1;
  });
  const updates = sources.updates.filter(
    (entry) =>
      entry.period.effectiveFrom !== update.metadata.period.effectiveFrom
  );
  updates.push(update.metadata);
  updates.sort((a, b) =>
    b.period.effectiveFrom.localeCompare(a.period.effectiveFrom)
  );
  return {
    text: [
      PRICE_CAP_COLUMNS,
      ...sortedRows.map((row) =>
        [row.Region, row.Date, row.E, row.G, row.ES, row.GS].join("\t")
      ),
      "",
    ].join("\n"),
    sources: { ...sources, updates },
  };
}
