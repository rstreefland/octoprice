import { deepStrictEqual, rejects, throws } from "node:assert";
import { test } from "node:test";
import legacyTariffs from "./fixtures/legacyTariffs.json";
import legacyProducts from "./fixtures/octopusLegacyProducts.json";
import {
  buildTariffCatalogue,
  getPairedTariffSelection,
  getTariffComparisonKey,
  fetchOctopusProducts,
  getSupportedTariffFamily,
  parseProductPage,
} from "./tariffCatalogue";

const products = parseProductPage({
  results: legacyProducts,
  next: null,
}).results;
const agile = products.find((product) => product.code === "AGILE-24-10-01")!;

function productPage(results: unknown[], next: string | null = null) {
  return new Response(JSON.stringify({ results, next }));
}

test("every reachable legacy product retains its tariff category and direction", () => {
  for (const [list, tariffs] of Object.entries(legacyTariffs)) {
    if (list === "AGILE" || list === "TRACKER") continue;
    for (const tariff of tariffs) {
      if (!("tariff" in tariff)) continue;
      if (tariff.tariff === "INTELLI-FLUX-EXPORT-23-07-14") continue;
      const product = products.find(
        (product) => product.code === tariff.tariff
      )!;
      const family = getSupportedTariffFamily(product);
      const category =
        family === "Outgoing" || family === "OutgoingLite" ? "Fixed" : family;
      deepStrictEqual(
        { category, direction: product.direction },
        {
          category: tariff.category,
          direction: list === "EETARIFFS" ? "EXPORT" : "IMPORT",
        }
      );
    }
  }
});

test("all historical Agile and Tracker selections remain discoverable", () => {
  for (const [list, family] of [
    [legacyTariffs.AGILE, "Agile"],
    [legacyTariffs.TRACKER, "Tracker"],
  ] satisfies [typeof legacyTariffs.AGILE, string][]) {
    deepStrictEqual(
      list.map((plan) =>
        getSupportedTariffFamily(
          products.find((product) => product.code === plan.code)!
        )
      ),
      list.map(() => family)
    );
  }
});

test("business, prepay, other suppliers and unsupported smart variants are excluded", () => {
  const unsupported = [
    { ...agile, is_business: true },
    { ...agile, is_prepay: true },
    { ...agile, brand: "AFFECT_ENERGY" },
    { ...agile, display_name: "Agile Business" },
    { ...agile, display_name: "Intelligent Octopus Go Max" },
    {
      ...agile,
      code: "IOG-SMB-VAR-26-11-04",
      display_name: "Intelligent Octopus Go",
    },
    { ...agile, display_name: "Octopus Go 12M Fixed" },
    {
      ...agile,
      direction: "EXPORT",
      display_name: "Octopus Outgoing Smart Export Guarantee",
    },
  ];
  deepStrictEqual(
    unsupported.map((product) =>
      getSupportedTariffFamily(
        parseProductPage({ results: [product], next: null }).results[0]
      )
    ),
    unsupported.map(() => undefined)
  );
});

test("catalogue fetching follows pagination, excludes unsupported products and deduplicates", async () => {
  const next = "https://api.oegb-kraken.energy/v1/products/?page=2";
  const urls: string[] = [];
  const signal = new AbortController().signal;
  const fetchPage: typeof fetch = async (input, options) => {
    const url = String(input);
    urls.push(url);
    deepStrictEqual(options?.signal, signal);
    return url === next
      ? productPage([agile])
      : productPage(
          [agile, { ...agile, code: "BUSINESS", is_business: true }],
          next
        );
  };
  deepStrictEqual(
    await fetchOctopusProducts({ fetchPage, signal, historical: true }),
    [agile]
  );
  deepStrictEqual(urls, [
    "https://api.octopus.energy/v1/products/?brand=OCTOPUS_ENERGY&is_business=false&is_prepay=false&is_historical=true",
    next,
  ]);
});

test("failed requests and invalid pages fail rather than publish partial tariffs", async () => {
  await rejects(
    fetchOctopusProducts({
      fetchPage: async () => new Response(null, { status: 503 }),
    }),
    /Unable to load/
  );
  await rejects(
    fetchOctopusProducts({
      fetchPage: async () => productPage([], "https://example.com/products/"),
    }),
    /invalid catalogue page link/
  );
  await rejects(
    fetchOctopusProducts({
      fetchPage: async (input) => productPage([], String(input)),
    }),
    /invalid catalogue page link/
  );
  for (const page of [
    null,
    {},
    { results: [], next: 42 },
    { results: [{ ...agile, is_business: undefined }], next: null },
    { results: [{ ...agile, available_from: "invalid" }], next: null },
  ]) {
    throws(() => parseProductPage(page), /invalid product catalogue/);
  }
});

const now = new Date("2026-11-14T00:00:00Z");

test("discovery reproduces each hardcoded comparison list when given its original products", () => {
  for (const [legacyName, catalogueName] of [
    ["ETARIFFS", "electricity"],
    ["GTARIFFS", "gas"],
    ["EETARIFFS", "exports"],
  ] satisfies [
    "ETARIFFS" | "GTARIFFS" | "EETARIFFS",
    "electricity" | "gas" | "exports",
  ][]) {
    const expected = legacyTariffs[legacyName].filter(
      (tariff) => tariff.tariff !== "INTELLI-FLUX-EXPORT-23-07-14"
    );
    const catalogue = buildTariffCatalogue({
      products: products.filter((product) =>
        expected.some((tariff) => tariff.tariff === product.code)
      ),
      now,
    });
    deepStrictEqual(catalogue[catalogueName], expected);
  }
});

test("all previously selectable Agile and Tracker codes and maximum rates survive discovery", () => {
  const catalogue = buildTariffCatalogue({
    products,
    now,
  });
  for (const [expected, actual] of [
    [legacyTariffs.AGILE, catalogue.agile],
    [legacyTariffs.TRACKER, catalogue.tracker],
  ]) {
    deepStrictEqual(
      actual.map(({ code, cap }) => ({ code, cap })),
      expected.map(({ code, cap }) => ({ code, cap }))
    );
  }
});

test("active products take precedence, followed by the latest archived version, without future products", () => {
  const archived = {
    ...agile,
    code: "AGILE-ARCHIVED",
    available_from: "2025-01-01",
    available_to: "2025-04-01",
  };
  const future = {
    ...agile,
    code: "AGILE-FUTURE",
    available_from: "2027-01-01",
  };
  const catalogue = buildTariffCatalogue({
    products: [future, archived, agile],
    now,
  });
  deepStrictEqual(catalogue.electricity, [
    { tariff: agile.code, category: "Agile", type: "E", cost: null },
  ]);
  const withdrawn = buildTariffCatalogue({
    products: [
      archived,
      { ...archived, code: "AGILE-OLDER", available_from: "2024-01-01" },
    ],
    now,
  });
  deepStrictEqual(withdrawn.electricity, [
    { tariff: archived.code, category: "Agile", type: "E", cost: null },
  ]);
});

test("simulation pairing uses actual discovered codes rather than inventing import and export names", () => {
  const catalogue = buildTariffCatalogue({
    products,
    now,
  });
  for (const [category, expectedExport] of [
    ["Go", "OUTGOING-LITE-FIX-12M-23-09-12"],
    ["IGo", "OUTGOING-FIX-12M-19-05-13"],
    ["Flux", "FLUX-EXPORT-23-02-14"],
  ]) {
    const selected = catalogue.electricity.find(
      (tariff) => tariff.category === category
    )!;
    deepStrictEqual(
      getPairedTariffSelection({
        ...catalogue,
        selectedCode: selected.tariff,
        isExport: false,
        isExporting: true,
      }),
      { importTariff: selected.tariff, exportTariff: expectedExport }
    );
  }
  deepStrictEqual(
    getPairedTariffSelection({
      ...catalogue,
      selectedCode: "saved-historical-tariff",
      isExport: false,
      isExporting: true,
    }),
    { importTariff: "saved-historical-tariff" }
  );
  deepStrictEqual(
    getPairedTariffSelection({
      ...catalogue,
      selectedCode: "INTELLI-FLUX-IMPORT-23-07-14",
      isExport: false,
      isExporting: true,
    }),
    { importTariff: "INTELLI-FLUX-IMPORT-23-07-14", exportTariff: "" }
  );
});

test("single-rate Flexible and Economy 7 comparisons have distinct identities", () => {
  deepStrictEqual(
    [
      getTariffComparisonKey({ tariff: "VAR-22-11-01", category: "SVT" }),
      getTariffComparisonKey({ tariff: "VAR-22-11-01", category: "E7" }),
    ],
    ["VAR-22-11-01:SVT", "VAR-22-11-01:E7"]
  );
});
