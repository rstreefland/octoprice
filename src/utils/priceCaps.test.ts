import { deepStrictEqual, ok, rejects, throws } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  fetchUtilityPricesUpdate,
  parseUtilityPricesUpdate,
  PRICE_CAP_REGIONS_URL,
  PRICE_CAP_SUMMARY_URL,
} from "../api/priceCaps";
import {
  LEGACY_PRICE_CAP_SOURCE,
  mergePriceCapUpdate,
  parsePriceCapTsv,
  PRICE_CAP_COLUMNS,
  priceCapSourcesSchema,
} from "./priceCaps";

function fixture() {
  const metadata = {
    apiVersion: "1",
    period: { effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31" },
    units: { unitRate: "pence per kWh", standingCharge: "pence per day" },
    vatBasis: "Electricity 0% VAT; gas includes 5% VAT.",
    retrievedAt: "2026-10-11",
    attribution: {
      text: "Data: UtilityPrices, from Ofgem. Licensed under CC BY 4.0.",
      url: "https://utilityprices.co.uk/energy-price-cap",
    },
    licence: { id: "CC-BY-4.0" },
    source: [
      {
        title: "Ofgem cap tables",
        url: "https://www.ofgem.gov.uk/energy-price-cap",
        publisher: "Ofgem",
      },
    ],
  };
  const rates = {
    electricity: {
      unitRatePencePerKwh: 26.61,
      standingChargePencePerDay: 51.84,
    },
    gas: { unitRatePencePerKwh: 7.91, standingChargePencePerDay: 29.34 },
  };
  return {
    regions: {
      ...metadata,
      dataset: "price-cap-regions",
      data: {
        paymentMethod: "Direct Debit",
        electricityMeter: "Single rate",
        regions: [
          "east-midlands",
          "eastern-england",
          "london",
          "merseyside-and-northern-wales",
          "north-eastern-england",
          "north-western-england",
          "northern-scotland",
          "south-eastern-england",
          "south-western-england",
          "southern-england",
          "southern-scotland",
          "southern-wales",
          "west-midlands",
          "yorkshire",
        ].map((slug) => ({ slug, ...rates })),
      },
    },
    summary: {
      ...metadata,
      dataset: "price-cap",
      data: {
        gbAverage: {
          paymentMethod: "Direct Debit",
          electricityMeter: "Single rate",
          electricity: {
            unitRatePencePerKwh: 26.32,
            standingChargePencePerDay: 54.83,
          },
          gas: { unitRatePencePerKwh: 7.97, standingChargePencePerDay: 29.68 },
        },
      },
    },
  };
}

const historical = PRICE_CAP_COLUMNS + "\n_A\t2026-04-01\t24.7\t5.65\t\t\n";
const emptySources = priceCapSourcesSchema.parse({
  legacySource: LEGACY_PRICE_CAP_SOURCE,
  updates: [],
});

test("UtilityPrices regions map to the correct GSPs and retain source units without VAT conversion", () => {
  const update = parseUtilityPricesUpdate(fixture());
  deepStrictEqual(
    update.rows.map((row) => row.Region),
    [
      "_B",
      "_A",
      "_C",
      "_D",
      "_F",
      "_G",
      "_P",
      "_J",
      "_L",
      "_H",
      "_N",
      "_K",
      "_E",
      "_M",
      "GB",
    ],
  );
  deepStrictEqual(
    update.rows.find((row) => row.Region === "_A"),
    {
      Region: "_A",
      Date: "2026-10-01",
      E: "26.61",
      G: "7.91",
      ES: "51.84",
      GS: "29.34",
    },
  );
  deepStrictEqual(
    update.rows.find((row) => row.Region === "GB"),
    {
      Region: "GB",
      Date: "2026-10-01",
      E: "26.32",
      G: "7.97",
      ES: "54.83",
      GS: "29.68",
    },
  );
  deepStrictEqual(update.metadata.attribution, fixture().regions.attribution);
});

test("incomplete, duplicate and unknown regions fail before producing an update", () => {
  const missing = fixture();
  missing.regions.data.regions.pop();
  throws(() => parseUtilityPricesUpdate(missing));
  const duplicate = fixture();
  duplicate.regions.data.regions[0].slug = "london";
  throws(() => parseUtilityPricesUpdate(duplicate), /duplicate regions/);
  const unknown = fixture();
  unknown.regions.data.regions[0].slug = "unknown";
  throws(() => parseUtilityPricesUpdate(unknown), /unknown or duplicate/);
});

test("changed units, payment methods, invalid rates and mismatched periods or VAT are rejected", () => {
  const units = fixture();
  units.regions.units.unitRate = "GBP per kWh";
  throws(() => parseUtilityPricesUpdate(units));
  const payment = fixture();
  payment.regions.data.paymentMethod = "Prepayment";
  throws(() => parseUtilityPricesUpdate(payment));
  const amount = fixture();
  amount.summary.data.gbAverage.gas.unitRatePencePerKwh = -1;
  throws(() => parseUtilityPricesUpdate(amount));
  const period = fixture();
  period.summary.period = {
    effectiveFrom: "2027-01-01",
    effectiveTo: "2027-03-31",
  };
  throws(() => parseUtilityPricesUpdate(period), /disagree/);
  const vat = fixture();
  vat.summary.vatBasis = "Different VAT basis";
  throws(() => parseUtilityPricesUpdate(vat), /disagree/);
});

test("missing standing charges and numeric-string API rates are rejected", () => {
  const { regions, summary } = fixture();
  const invalidGasRates = [
    { unitRatePencePerKwh: 7.97 },
    { unitRatePencePerKwh: "7.97", standingChargePencePerDay: 29.68 },
  ];
  for (const gas of invalidGasRates) {
    throws(() =>
      parseUtilityPricesUpdate({
        regions,
        summary: {
          ...summary,
          data: {
            ...summary.data,
            gbAverage: { ...summary.data.gbAverage, gas },
          },
        },
      }),
    );
  }
});

test("new snapshots preserve history and unknown legacy standing charges, with deterministic output", () => {
  const update = parseUtilityPricesUpdate(fixture());
  const merged = mergePriceCapUpdate({
    text: historical,
    sources: emptySources,
    update,
  });
  const rows = parsePriceCapTsv(merged.text);
  deepStrictEqual(rows.length, 16);
  deepStrictEqual(rows.at(-1), {
    Region: "_A",
    Date: "2026-04-01",
    E: "24.7",
    G: "5.65",
    ES: "",
    GS: "",
  });
  deepStrictEqual(rows[0], {
    Region: "GB",
    Date: "2026-10-01",
    E: "26.32",
    G: "7.97",
    ES: "54.83",
    GS: "29.68",
  });
  deepStrictEqual(mergePriceCapUpdate({ ...merged, update }), merged);
});

test("corrections replace the matching period without losing earlier records, and rollback is rejected", () => {
  const update = parseUtilityPricesUpdate(fixture());
  const merged = mergePriceCapUpdate({
    text: historical,
    sources: emptySources,
    update,
  });
  const correction = {
    ...update,
    rows: update.rows.map((row) =>
      row.Region === "_A" ? { ...row, E: "27.25" } : row,
    ),
  };
  const corrected = mergePriceCapUpdate({ ...merged, update: correction });
  deepStrictEqual(parsePriceCapTsv(corrected.text).length, 16);
  deepStrictEqual(
    parsePriceCapTsv(corrected.text).find(
      (row) => row.Date === "2026-10-01" && row.Region === "_A",
    )?.E,
    "27.25",
  );
  const older = fixture();
  older.regions.period = {
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-03-31",
  };
  older.summary.period = older.regions.period;
  throws(
    () =>
      mergePriceCapUpdate({
        ...corrected,
        update: parseUtilityPricesUpdate(older),
      }),
    /older cap period/,
  );
});

test("damaged stored data fails validation instead of silently dropping records", () => {
  throws(() => parsePriceCapTsv("<html>Error</html>"), /header/);
  throws(() => parsePriceCapTsv(PRICE_CAP_COLUMNS), /empty/);
  throws(
    () =>
      parsePriceCapTsv(
        PRICE_CAP_COLUMNS +
          "\n_A\t2026-04-01\t24.7\t5.65\t\t\n_A\t2026-04-01\t24.7\t5.65\t\t",
      ),
    /Duplicate/,
  );
  throws(() =>
    parsePriceCapTsv(PRICE_CAP_COLUMNS + "\n_A\tinvalid\t24.7\t5.65\t\t"),
  );
});

test("both API requests receive cancellation, and failed requests do not return partial updates", async () => {
  const data = fixture();
  const signal = new AbortController().signal;
  const urls: string[] = [];
  const fetchPage: typeof fetch = async (input, options) => {
    deepStrictEqual(options?.signal, signal);
    const url = String(input);
    urls.push(url);
    return new Response(
      JSON.stringify(
        url === PRICE_CAP_REGIONS_URL ? data.regions : data.summary,
      ),
    );
  };
  deepStrictEqual(
    await fetchUtilityPricesUpdate({ fetchPage, signal }),
    parseUtilityPricesUpdate(data),
  );
  deepStrictEqual(urls, [PRICE_CAP_REGIONS_URL, PRICE_CAP_SUMMARY_URL]);
  await rejects(
    fetchUtilityPricesUpdate({
      fetchPage: async () => new Response(null, { status: 503 }),
    }),
    /HTTP 503/,
  );
  const aborted = new DOMException("Cancelled", "AbortError");
  await rejects(
    fetchUtilityPricesUpdate({
      fetchPage: async () => {
        throw aborted;
      },
    }),
    (error) => error === aborted,
  );
});

test("committed snapshots have valid rows, provenance and complete UtilityPrices periods", () => {
  const rows = parsePriceCapTsv(
    readFileSync("public/data/price-caps.tsv", "utf8"),
  );
  const sources = priceCapSourcesSchema.parse(
    JSON.parse(readFileSync("public/data/price-cap-sources.json", "utf8")),
  );
  ok(rows.length > 0);
  for (const update of sources.updates) {
    deepStrictEqual(
      rows
        .filter((row) => row.Date === update.period.effectiveFrom)
        .map((row) => row.Region)
        .sort(),
      [
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
      ],
    );
  }
});
