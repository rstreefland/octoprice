import { z } from "zod";
import {
  attributionSchema,
  periodSchema,
  sourceSchema,
  PriceCapRow,
  PriceCapUpdate,
} from "../utils/priceCaps";

z.config({ jitless: true });

export const PRICE_CAP_REGIONS_URL =
  "https://utilityprices.co.uk/api/v1/price-cap/regions";
export const PRICE_CAP_SUMMARY_URL =
  "https://utilityprices.co.uk/api/v1/price-cap";

const regionCodes: Record<string, PriceCapRow["Region"]> = {
  "eastern-england": "_A",
  "east-midlands": "_B",
  london: "_C",
  "merseyside-and-northern-wales": "_D",
  "west-midlands": "_E",
  "north-eastern-england": "_F",
  "north-western-england": "_G",
  "southern-england": "_H",
  "south-eastern-england": "_J",
  "southern-wales": "_K",
  "south-western-england": "_L",
  yorkshire: "_M",
  "southern-scotland": "_N",
  "northern-scotland": "_P",
};
const energySchema = z.object({
  unitRatePencePerKwh: z.number().positive(),
  standingChargePencePerDay: z.number().nonnegative(),
});
const ratesSchema = z.object({ electricity: energySchema, gas: energySchema });
const metadataShape = {
  apiVersion: z.literal("1"),
  period: periodSchema,
  units: z.object({
    unitRate: z.literal("pence per kWh"),
    standingCharge: z.literal("pence per day"),
  }),
  vatBasis: z.string().min(1),
  retrievedAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  attribution: attributionSchema,
  licence: z.object({ id: z.literal("CC-BY-4.0") }),
  source: z.array(sourceSchema).min(1),
};
const paymentShape = {
  paymentMethod: z.literal("Direct Debit"),
  electricityMeter: z.literal("Single rate"),
};
const regionsSchema = z.object({
  ...metadataShape,
  dataset: z.literal("price-cap-regions"),
  data: z.object({
    ...paymentShape,
    regions: z.array(ratesSchema.extend({ slug: z.string() })).length(14),
  }),
});
const summarySchema = z.object({
  ...metadataShape,
  dataset: z.literal("price-cap"),
  data: z.object({ gbAverage: ratesSchema.extend(paymentShape) }),
});

export function parseUtilityPricesUpdate({
  regions: rawRegions,
  summary: rawSummary,
}: {
  regions: unknown;
  summary: unknown;
}): PriceCapUpdate {
  const regions = regionsSchema.parse(rawRegions);
  const summary = summarySchema.parse(rawSummary);
  if (
    regions.period.effectiveFrom !== summary.period.effectiveFrom ||
    regions.period.effectiveTo !== summary.period.effectiveTo ||
    regions.vatBasis !== summary.vatBasis
  )
    throw new Error(
      "UtilityPrices regional and average periods or VAT basis disagree"
    );
  const makeRow = ({
    Region,
    rates,
  }: {
    Region: PriceCapRow["Region"];
    rates: z.infer<typeof ratesSchema>;
  }): PriceCapRow => ({
    Region,
    Date: regions.period.effectiveFrom,
    E: String(rates.electricity.unitRatePencePerKwh),
    G: String(rates.gas.unitRatePencePerKwh),
    ES: String(rates.electricity.standingChargePencePerDay),
    GS: String(rates.gas.standingChargePencePerDay),
  });
  const seen = new Set<string>();
  const rows = regions.data.regions.map((region) => {
    const code = regionCodes[region.slug];
    if (!Object.hasOwn(regionCodes, region.slug) || !code || seen.has(code))
      throw new Error("UtilityPrices returned unknown or duplicate regions");
    seen.add(code);
    return makeRow({ Region: code, rates: region });
  });
  rows.push(makeRow({ Region: "GB", rates: summary.data.gbAverage }));
  return {
    rows,
    metadata: {
      period: regions.period,
      retrievedAt: regions.retrievedAt,
      vatBasis: regions.vatBasis,
      sources: [
        ...new Map(
          [...regions.source, ...summary.source].map((source) => [
            source.url,
            source,
          ])
        ).values(),
      ].sort((a, b) => a.url.localeCompare(b.url)),
      attribution: regions.attribution,
      licence: regions.licence.id,
    },
  };
}

export async function fetchUtilityPricesUpdate({
  fetchPage = fetch,
  signal,
}: { fetchPage?: typeof fetch; signal?: AbortSignal } = {}) {
  const read = async (url: string): Promise<unknown> => {
    const response = await fetchPage(url, { signal });
    if (!response.ok)
      throw new Error(`UtilityPrices request failed: HTTP ${response.status}`);
    return response.json();
  };
  const [regions, summary] = await Promise.all([
    read(PRICE_CAP_REGIONS_URL),
    read(PRICE_CAP_SUMMARY_URL),
  ]);
  return parseUtilityPricesUpdate({ regions, summary });
}
