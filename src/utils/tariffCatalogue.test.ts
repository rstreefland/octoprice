import { deepStrictEqual, doesNotThrow, rejects, throws } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fetchOctopusProducts, parseProductPage } from "../api/octopusProducts";
import {
  discoverTariffCatalogue,
  loadTariffCatalogue,
  TARIFF_CATALOGUE_SNAPSHOT_URL,
} from "../api/tariffCatalogue";
import legacyTariffs from "./fixtures/legacyTariffs.json";
import legacyProducts from "./fixtures/octopusLegacyProducts.json";
import {
  buildTariffCatalogue,
  getPairedTariffSelection,
  getInitialTariffHoppingSelection,
  getTariffComparisonKey,
  getSupportedTariffFamily,
  parseTariffCatalogue,
  tariffSourcesSchema,
  validateTariffCatalogueUpdate,
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
        (product) => product.code === tariff.tariff,
      )!;
      const family = getSupportedTariffFamily(product);
      const category =
        family === "Outgoing" || family === "OutgoingLite" ? "Fixed" : family;
      deepStrictEqual(
        { category, direction: product.direction },
        {
          category: tariff.category,
          direction: list === "EETARIFFS" ? "EXPORT" : "IMPORT",
        },
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
          products.find((product) => product.code === plan.code)!,
        ),
      ),
      list.map(() => family),
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
        parseProductPage({ results: [product], next: null }).results[0],
      ),
    ),
    unsupported.map(() => undefined),
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
          next,
        );
  };
  deepStrictEqual(
    await fetchOctopusProducts({ fetchPage, signal, historical: true }),
    [agile, { ...agile, code: "BUSINESS", is_business: true }],
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
    /Unable to load/,
  );
  await rejects(
    fetchOctopusProducts({
      fetchPage: async () => productPage([], "https://example.com/products/"),
    }),
    /invalid catalogue page link/,
  );
  await rejects(
    fetchOctopusProducts({
      fetchPage: async (input) => productPage([], String(input)),
    }),
    /invalid catalogue page link/,
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
      (tariff) => tariff.tariff !== "INTELLI-FLUX-EXPORT-23-07-14",
    );
    const catalogue = buildTariffCatalogue({
      products: products.filter((product) =>
        expected.some((tariff) => tariff.tariff === product.code),
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
      expected.map(({ code, cap }) => ({ code, cap })),
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
      (tariff) => tariff.category === category,
    )!;
    deepStrictEqual(
      getPairedTariffSelection({
        ...catalogue,
        selectedCode: selected.tariff,
        isExport: false,
        isExporting: true,
      }),
      { importTariff: selected.tariff, exportTariff: expectedExport },
    );
  }
  deepStrictEqual(
    getPairedTariffSelection({
      ...catalogue,
      selectedCode: "saved-historical-tariff",
      isExport: false,
      isExporting: true,
    }),
    { importTariff: "saved-historical-tariff" },
  );
  deepStrictEqual(
    getPairedTariffSelection({
      ...catalogue,
      selectedCode: "INTELLI-FLUX-IMPORT-23-07-14",
      isExport: false,
      isExporting: true,
    }),
    { importTariff: "INTELLI-FLUX-IMPORT-23-07-14", exportTariff: "" },
  );
});

test("single-rate Flexible and Economy 7 comparisons have distinct identities", () => {
  deepStrictEqual(
    [
      getTariffComparisonKey({ tariff: "VAR-22-11-01", category: "SVT" }),
      getTariffComparisonKey({ tariff: "VAR-22-11-01", category: "E7" }),
    ],
    ["VAR-22-11-01:SVT", "VAR-22-11-01:E7"],
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
    { results: [agile], next: null },
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
      /invalid product catalogue/,
    );
  }
  const renamed = parseProductPage({
    results: [{ ...agile, full_name: "A renamed tariff" }],
    next: null,
  }).results[0];
  deepStrictEqual(getSupportedTariffFamily(renamed), "Agile");
});

test("the discovery loader merges current and archived products before discovering supported tariffs", async () => {
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
  const catalogue = await discoverTariffCatalogue({ signal, fetchPage });
  deepStrictEqual(catalogue.agile[0].name, "Current API label");
  deepStrictEqual(
    catalogue.agile.map((plan) => plan.code),
    legacyTariffs.AGILE.map((plan) => plan.code),
  );
  deepStrictEqual(
    catalogue.electricity.map((tariff) => tariff.category),
    ["SVT", "Tracker", "Agile", "Cosy", "Fixed", "Flux", "IFlux", "Go", "IGo"],
  );
});

test("the discovery loader rejects incomplete catalogues and preserves request cancellation", async () => {
  await rejects(
    discoverTariffCatalogue({ fetchPage: async () => productPage([agile]) }),
    /incomplete tariff catalogue/,
  );
  const cancellation = new DOMException("Request cancelled", "AbortError");
  await rejects(
    discoverTariffCatalogue({
      fetchPage: async () => {
        throw cancellation;
      },
    }),
    (error) => error === cancellation,
  );
});

test("historical customer tariffs pair with discovered counterparts without replacing the selected code", () => {
  const catalogue = buildTariffCatalogue({ products, now });
  const cases = [
    {
      selectedCode: "GO-VAR-BB-22-01-01",
      isExport: false,
      expected: {
        importTariff: "GO-VAR-BB-22-01-01",
        exportTariff: "OUTGOING-LITE-FIX-12M-23-09-12",
      },
    },
    {
      selectedCode: "INTELLI-VAR-23-01-01",
      isExport: false,
      expected: {
        importTariff: "INTELLI-VAR-23-01-01",
        exportTariff: "OUTGOING-FIX-12M-19-05-13",
      },
    },
    {
      selectedCode: "FLUX-IMPORT-22-01-01",
      isExport: false,
      expected: {
        importTariff: "FLUX-IMPORT-22-01-01",
        exportTariff: "FLUX-EXPORT-23-02-14",
      },
    },
    {
      selectedCode: "FLUX-EXPORT-22-01-01",
      isExport: true,
      expected: {
        importTariff: "FLUX-IMPORT-23-02-14",
        exportTariff: "FLUX-EXPORT-22-01-01",
      },
    },
  ];
  for (const { selectedCode, isExport, expected } of cases) {
    deepStrictEqual(
      getPairedTariffSelection({
        ...catalogue,
        selectedCode,
        isExport,
        isExporting: true,
      }),
      expected,
    );
  }
});

test("tariff hopping uses saved choices ahead of defaults even when discovered versions change", () => {
  const catalogue = buildTariffCatalogue({ products, now });
  const saved = {
    savedImport: "GO-VAR-BB-23-02-07",
    savedExport: "OUTGOING-LITE-FIX-12M-23-09-12",
  };
  const refreshedElectricity = catalogue.electricity.map((tariff) => ({
    ...tariff,
    tariff: "A-NEW-PRODUCT-VERSION",
  }));
  deepStrictEqual(
    getInitialTariffHoppingSelection({
      ...catalogue,
      ...saved,
      isExporting: true,
    }),
    { importTariff: saved.savedImport, exportTariff: saved.savedExport },
  );
  deepStrictEqual(
    getInitialTariffHoppingSelection({
      ...catalogue,
      ...saved,
      electricity: refreshedElectricity,
      isExporting: true,
    }),
    { importTariff: saved.savedImport, exportTariff: saved.savedExport },
  );
  deepStrictEqual(
    getInitialTariffHoppingSelection({
      ...catalogue,
      savedImport: "",
      savedExport: "",
      isExporting: false,
    }),
    { importTariff: "AGILE-24-10-01", exportTariff: "" },
  );
  deepStrictEqual(
    getInitialTariffHoppingSelection({
      ...catalogue,
      savedImport: "",
      savedExport: "",
      isExporting: true,
    }),
    { importTariff: "INTELLI-FLUX-IMPORT-23-07-14", exportTariff: "" },
  );
});

test("the static snapshot loader fetches and parses the committed catalogue", async () => {
  const signal = new AbortController().signal;
  const mockCatalogue = buildTariffCatalogue({ products, now });
  let requestCount = 0;
  const fetchPage: typeof fetch = async (input, options) => {
    requestCount += 1;
    deepStrictEqual(input, TARIFF_CATALOGUE_SNAPSHOT_URL);
    deepStrictEqual(options?.signal, signal);
    return new Response(JSON.stringify(mockCatalogue));
  };
  const result = await loadTariffCatalogue({ signal, fetchPage });
  deepStrictEqual(result, mockCatalogue);
  deepStrictEqual(requestCount, 1);
});

test("the static snapshot loader handles HTTP failures, invalid payloads and request cancellation", async () => {
  await rejects(
    loadTariffCatalogue({
      fetchPage: async () => new Response("Not found", { status: 404 }),
    }),
    /Unable to load Octopus tariffs/,
  );
  await rejects(
    loadTariffCatalogue({
      fetchPage: async () => new Response(JSON.stringify({ invalid: true })),
    }),
    /invalid tariff catalogue/,
  );
  const cancellation = new DOMException("Request cancelled", "AbortError");
  await rejects(
    loadTariffCatalogue({
      fetchPage: async () => {
        throw cancellation;
      },
    }),
    (error) => error === cancellation,
  );
});

test("tariffCatalogueSchema and tariffSourcesSchema validate shape and reject corrupt fields", () => {
  const valid = buildTariffCatalogue({ products, now });
  deepStrictEqual(parseTariffCatalogue(valid), valid);

  const missingVariable = { ...valid, variableCode: "" };
  throws(
    () => parseTariffCatalogue(missingVariable),
    /invalid tariff catalogue/,
  );

  const emptyElectricity = { ...valid, electricity: [] };
  throws(
    () => parseTariffCatalogue(emptyElectricity),
    /invalid tariff catalogue/,
  );

  const validSources = {
    retrievedAt: "2026-11-14T19:35:00.000Z",
    endpoint: "https://api.octopus.energy/v1/products/",
    brand: "OCTOPUS_ENERGY",
    electricityCount: 9,
    gasCount: 3,
    exportsCount: 4,
    agileCount: 4,
    trackerCount: 8,
    variableCode: "VAR-22-11-01",
  };
  deepStrictEqual(tariffSourcesSchema.parse(validSources), validSources);

  throws(() =>
    tariffSourcesSchema.parse({ ...validSources, retrievedAt: "not-a-date" }),
  );
  throws(() =>
    tariffSourcesSchema.parse({ ...validSources, endpoint: "not-a-url" }),
  );
  throws(() =>
    tariffSourcesSchema.parse({ ...validSources, electricityCount: -1 }),
  );
});

test("the committed tariff catalogue and sources snapshots are valid and complete", () => {
  const catalogueText = readFileSync(
    "public/data/tariff-catalogue.json",
    "utf8",
  );
  const sourcesText = readFileSync("public/data/tariff-sources.json", "utf8");

  const catalogue = parseTariffCatalogue(JSON.parse(catalogueText));
  const sources = tariffSourcesSchema.parse(JSON.parse(sourcesText));

  deepStrictEqual(catalogue.electricity.length, sources.electricityCount);
  deepStrictEqual(catalogue.gas.length, sources.gasCount);
  deepStrictEqual(catalogue.exports.length, sources.exportsCount);
  deepStrictEqual(catalogue.agile.length, sources.agileCount);
  deepStrictEqual(catalogue.tracker.length, sources.trackerCount);
  deepStrictEqual(catalogue.variableCode, sources.variableCode);

  deepStrictEqual(
    catalogue.electricity.map((tariff) => tariff.category),
    ["SVT", "Tracker", "Agile", "Cosy", "Fixed", "Flux", "IFlux", "Go", "IGo"],
  );
});

test("snapshot updates reject lost tariff families even when other products remain", () => {
  const previousCatalogue = buildTariffCatalogue({ products, now });
  const partialCatalogues = [
    {
      ...previousCatalogue,
      electricity: previousCatalogue.electricity.filter(
        (tariff) => tariff.category !== "IFlux",
      ),
    },
    {
      ...previousCatalogue,
      gas: previousCatalogue.gas.filter(
        (tariff) => tariff.category !== "Fixed",
      ),
    },
    {
      ...previousCatalogue,
      exports: previousCatalogue.exports.filter(
        (tariff) => !tariff.tariff.startsWith("OUTGOING-LITE-"),
      ),
    },
  ];
  for (const catalogue of partialCatalogues) {
    throws(
      () =>
        validateTariffCatalogueUpdate({
          previousCatalogue,
          catalogue: parseTariffCatalogue(catalogue),
        }),
      /missing .* family/,
    );
  }
});

test("snapshot updates preserve historical Agile and Tracker selections", () => {
  const previousCatalogue = buildTariffCatalogue({ products, now });
  for (const catalogue of [
    { ...previousCatalogue, agile: previousCatalogue.agile.slice(0, -1) },
    { ...previousCatalogue, tracker: previousCatalogue.tracker.slice(0, -1) },
  ]) {
    throws(
      () =>
        validateTariffCatalogueUpdate({
          previousCatalogue,
          catalogue: parseTariffCatalogue(catalogue),
        }),
      /missing historical plan/,
    );
  }
});

test("snapshot updates allow new product versions and unchanged catalogues", () => {
  const previousCatalogue = buildTariffCatalogue({ products, now });
  doesNotThrow(() =>
    validateTariffCatalogueUpdate({
      previousCatalogue,
      catalogue: previousCatalogue,
    }),
  );
  const catalogue = {
    ...previousCatalogue,
    electricity: previousCatalogue.electricity.map((tariff) =>
      tariff.category === "Go"
        ? { ...tariff, tariff: "GO-VAR-26-11-15" }
        : tariff,
    ),
    agile: [
      { ...previousCatalogue.agile[0], code: "AGILE-26-11-15" },
      ...previousCatalogue.agile,
    ],
  };
  doesNotThrow(() =>
    validateTariffCatalogueUpdate({ previousCatalogue, catalogue }),
  );
});
