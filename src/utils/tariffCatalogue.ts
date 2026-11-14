export interface OctopusProduct {
  code: string;
  full_name: string;
  display_name: string;
  direction: "IMPORT" | "EXPORT";
  brand: string;
  is_business: boolean;
  is_prepay: boolean;
  is_variable: boolean;
  available_from: string;
  available_to: string | null;
}

export type SupportedTariffFamily =
  | "SVT"
  | "Tracker"
  | "Agile"
  | "Cosy"
  | "Fixed"
  | "Flux"
  | "IFlux"
  | "Go"
  | "IGo"
  | "Outgoing"
  | "OutgoingLite";

export function getSupportedTariffFamily(
  product: OctopusProduct
): SupportedTariffFamily | undefined {
  if (product.is_business || product.is_prepay) return;
  if (!["OCTOPUS_ENERGY", "BULB"].includes(product.brand)) return;

  if (product.direction === "EXPORT") {
    switch (product.display_name) {
      case "Agile Outgoing Octopus":
        return "Agile";
      case "Octopus Flux Export":
        return "Flux";
      case "Intelligent Octopus Flux Export":
        return "IFlux";
      case "Outgoing Octopus 12M Fixed":
      case "Outgoing Octopus":
        return "Outgoing";
      case "Outgoing Octopus Fixed Lite":
        return "OutgoingLite";
    }
    return;
  }

  switch (product.display_name) {
    case "Flexible Octopus":
      return "SVT";
    case "Octopus Tracker":
      return "Tracker";
    case "Agile Octopus":
      return "Agile";
    case "Cosy Octopus":
      return "Cosy";
    case "Octopus Flux Import":
      return "Flux";
    case "Intelligent Octopus Flux Import":
      return "IFlux";
    case "Octopus Go":
      return "Go";
    case "Intelligent Octopus Go":
      if (product.code.startsWith("INTELLI-VAR-")) return "IGo";
      return;
    case "Loyal Octopus 12M Fixed":
    case "Octopus 12M Fixed":
      return "Fixed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOctopusProduct(value: unknown): value is OctopusProduct {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.full_name === "string" &&
    typeof value.display_name === "string" &&
    (value.direction === "IMPORT" || value.direction === "EXPORT") &&
    typeof value.brand === "string" &&
    typeof value.is_business === "boolean" &&
    typeof value.is_prepay === "boolean" &&
    typeof value.is_variable === "boolean" &&
    typeof value.available_from === "string" &&
    Number.isFinite(Date.parse(value.available_from)) &&
    (value.available_to === null ||
      (typeof value.available_to === "string" &&
        Number.isFinite(Date.parse(value.available_to))))
  );
}

export function parseProductPage(value: unknown): {
  results: OctopusProduct[];
  next: string | null;
} {
  if (
    !isRecord(value) ||
    !Array.isArray(value.results) ||
    !value.results.every(isOctopusProduct) ||
    !(value.next === null || typeof value.next === "string")
  ) {
    throw new Error(
      "Octopus returned an invalid product catalogue. Please try again."
    );
  }
  return {
    results: value.results,
    next: typeof value.next === "string" ? value.next : null,
  };
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
      if (getSupportedTariffFamily(product))
        products.set(product.code, product);
    }
    next = page.next;
  }

  return [...products.values()];
}

export interface CatalogueTariff {
  tariff: string;
  type: "E" | "G";
  category:
    | "SVT"
    | "Tracker"
    | "Agile"
    | "Cosy"
    | "Fixed"
    | "Flux"
    | "IFlux"
    | "Go"
    | "IGo";
  cost: number | null;
}

export interface CataloguePlan {
  code: string;
  name: string;
  currentPlan: boolean;
  cap: { E: number; G: number };
}

export interface TariffCatalogue {
  electricity: CatalogueTariff[];
  gas: CatalogueTariff[];
  exports: CatalogueTariff[];
  agile: CataloguePlan[];
  tracker: CataloguePlan[];
  variableCode: string;
}

export function buildTariffCatalogue({
  products,
  now,
}: {
  products: OctopusProduct[];
  now: Date;
}): TariffCatalogue {
  const isAvailable = (product: OctopusProduct) =>
    Date.parse(product.available_from) <= now.valueOf() &&
    (product.available_to === null ||
      Date.parse(product.available_to) > now.valueOf());
  const supportedProducts = products.filter(
    (product) =>
      getSupportedTariffFamily(product) !== undefined &&
      Date.parse(product.available_from) <= now.valueOf()
  );
  const sortedProducts = [...supportedProducts].sort((a, b) => {
    const availabilityDifference =
      Number(isAvailable(b)) - Number(isAvailable(a));
    if (availabilityDifference) return availabilityDifference;
    const brandDifference =
      Number(b.brand === "OCTOPUS_ENERGY") -
      Number(a.brand === "OCTOPUS_ENERGY");
    return (
      brandDifference ||
      Date.parse(b.available_from) - Date.parse(a.available_from) ||
      a.code.localeCompare(b.code)
    );
  });
  const getTariffs = ({
    families,
    direction,
    type,
  }: {
    families: SupportedTariffFamily[];
    direction: "IMPORT" | "EXPORT";
    type: "E" | "G";
  }): CatalogueTariff[] =>
    families.flatMap((family) => {
      const product = sortedProducts.find(
        (product) =>
          product.direction === direction &&
          getSupportedTariffFamily(product) === family
      );
      if (!product) return [];
      return [
        {
          tariff: product.code,
          type,
          category:
            family === "Outgoing" || family === "OutgoingLite"
              ? "Fixed"
              : family,
          cost: null,
        },
      ];
    });
  const getPlans = ({
    family,
    earliestDate,
  }: {
    family: "Agile" | "Tracker";
    earliestDate: string;
  }): CataloguePlan[] =>
    sortedProducts
      .filter(
        (product) =>
          product.direction === "IMPORT" &&
          product.brand === "OCTOPUS_ENERGY" &&
          getSupportedTariffFamily(product) === family &&
          Date.parse(product.available_from) >= Date.parse(earliestDate)
      )
      .map((product) => ({
        code: product.code,
        name: product.full_name,
        currentPlan: isAvailable(product),
        cap: { E: 100, G: family === "Tracker" ? 30 : 0 },
      }));

  const electricity = getTariffs({
    families: [
      "SVT",
      "Tracker",
      "Agile",
      "Cosy",
      "Fixed",
      "Flux",
      "IFlux",
      "Go",
      "IGo",
    ],
    direction: "IMPORT",
    type: "E",
  });
  return {
    electricity,
    gas: getTariffs({
      families: ["SVT", "Fixed", "Tracker"],
      direction: "IMPORT",
      type: "G",
    }),
    exports: getTariffs({
      families: ["Agile", "Flux", "IFlux", "Outgoing", "OutgoingLite"],
      direction: "EXPORT",
      type: "E",
    }),
    agile: getPlans({ family: "Agile", earliestDate: "2022-11-25" }),
    tracker: getPlans({ family: "Tracker", earliestDate: "2023-12-11" }),
    variableCode:
      electricity.find((tariff) => tariff.category === "SVT")?.tariff ?? "",
  };
}

export function getPairedTariffSelection({
  selectedCode,
  isExport,
  isExporting,
  electricity,
  exports: exportTariffs,
}: {
  selectedCode: string;
  isExport: boolean;
  isExporting: boolean;
  electricity: CatalogueTariff[];
  exports: CatalogueTariff[];
}): { importTariff?: string; exportTariff?: string } {
  const selected = [...electricity, ...exportTariffs].find(
    (tariff) => tariff.tariff === selectedCode
  );
  if (isExporting && selected) {
    if (selected.category === "Flux" || selected.category === "IFlux") {
      return {
        importTariff: electricity.find(
          (tariff) => tariff.category === selected.category
        )?.tariff,
        exportTariff:
          exportTariffs.find((tariff) => tariff.category === selected.category)
            ?.tariff ?? "",
      };
    }
    if (selected.category === "Go" || selected.category === "IGo") {
      const outgoing = exportTariffs.find(
        (tariff) =>
          tariff.category === "Fixed" &&
          (selected.category === "Go"
            ? tariff.tariff.includes("LITE")
            : !tariff.tariff.includes("LITE"))
      );
      return {
        importTariff: selectedCode,
        exportTariff: outgoing?.tariff ?? "",
      };
    }
  }
  return isExport
    ? { exportTariff: selectedCode }
    : { importTariff: selectedCode };
}

export function getTariffComparisonKey({
  tariff,
  category,
}: {
  tariff: string;
  category: string;
}) {
  return `${tariff}:${category}`;
}
