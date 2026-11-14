import { deepStrictEqual, rejects, throws } from "node:assert";
import { test } from "node:test";
import { fetchOctopusProducts, parseProductPage } from "../api/octopusProducts";
import { loadTariffCatalogue } from "../api/tariffCatalogue";
import legacyTariffs from "./fixtures/legacyTariffs.json";
import legacyProducts from "./fixtures/octopusLegacyProducts.json";
import {
  buildTariffCatalogue,
  getPairedTariffSelection,
  getTariffComparisonKey,
  getSupportedTariffFamily,
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
    { ...agile, code: "AGILE-BUSINESS-26-01-01" },
    { ...agile, code: "IOG-SMB-VAR-26-10-29" },
    {
      ...agile,
      code: "IOG-SMB-VAR-26-11-04",
      display_name: "Intelligent Octopus Go",
    },
    { ...agile, code: "GO-FIX-12M-26-10-30" },
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

test("catalogue fetching follows pagination and deduplicates products", async () => {
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
    [agile, { ...agile, code: "BUSINESS", is_business: true }]
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
    code: "AGILE-25-01-01",
    available_from: "2025-01-01",
    available_to: "2025-04-01",
  };
  const future = {
    ...agile,
    code: "AGILE-27-01-01",
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
      { ...archived, code: "AGILE-24-01-01", available_from: "2024-01-01" },
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

test("Zod validates required API fields and strips unused enrichment", () => {
  deepStrictEqual(
    parseProductPage({
      count: 1,
      results: [
        {
          ...agile,
          display_name: "Renamed Agile",
          is_variable: true,
          unknown_field: "unused",
        },
      ],
      next: null,
    }),
    { results: [agile], next: null }
  );
  for (const invalid of [
    { ...agile, code: "" },
    { ...agile, full_name: undefined },
    { ...agile, direction: "UNKNOWN" },
    { ...agile, is_prepay: "false" },
    { ...agile, available_to: undefined },
  ]) {
    throws(
      () => parseProductPage({ results: [invalid], next: null }),
      /invalid product catalogue/
    );
  }
  const renamed = parseProductPage({
    results: [{ ...agile, full_name: "A renamed tariff" }],
    next: null,
  }).results[0];
  deepStrictEqual(getSupportedTariffFamily(renamed), "Agile");
});

test("the loader merges current and archived products before discovering supported tariffs", async () => {
  const signal = new AbortController().signal;
  const currentAgile = { ...agile, full_name: "Current API label" };
  const fetchPage: typeof fetch = async (input, options) => {
    deepStrictEqual(options?.signal, signal);
    return new URL(String(input)).searchParams.get("is_historical") === "true"
      ? productPage([
          ...products,
          { ...agile, code: "AGILE-BUSINESS", is_business: true },
        ])
      : productPage([currentAgile]);
  };
  const catalogue = await loadTariffCatalogue({ signal, fetchPage });
  deepStrictEqual(catalogue.agile[0].name, "Current API label");
  deepStrictEqual(
    catalogue.agile.map((plan) => plan.code),
    legacyTariffs.AGILE.map((plan) => plan.code)
  );
  deepStrictEqual(
    catalogue.electricity.map((tariff) => tariff.category),
    ["SVT", "Tracker", "Agile", "Cosy", "Fixed", "Flux", "IFlux", "Go", "IGo"]
  );
});

test("the loader rejects incomplete catalogues and preserves request cancellation", async () => {
  await rejects(
    loadTariffCatalogue({ fetchPage: async () => productPage([agile]) }),
    /incomplete tariff catalogue/
  );
  const cancellation = new DOMException("Request cancelled", "AbortError");
  await rejects(
    loadTariffCatalogue({
      fetchPage: async () => {
        throw cancellation;
      },
    }),
    (error) => error === cancellation
  );
});
