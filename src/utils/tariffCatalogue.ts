import type { OctopusProduct } from "../api/octopusProducts";

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

const familyPatterns: Record<
  OctopusProduct["direction"],
  [SupportedTariffFamily, RegExp][]
> = {
  IMPORT: [
    ["SVT", /^VAR-(?:BB-)?\d/],
    ["Tracker", /^SILVER-(?:(?:FLEX|VAR)-(?:BB-)?)?\d/],
    ["Agile", /^AGILE-(?:FLEX-)?\d/],
    ["Cosy", /^COSY-\d/],
    ["Fixed", /^(?:LOYAL-|OE-)?FIX-12M-\d/],
    ["Flux", /^FLUX-IMPORT-(?:BB-)?\d/],
    ["IFlux", /^INTELLI-FLUX-IMPORT-(?:BB-)?\d/],
    ["Go", /^GO-VAR-(?:BB-)?\d/],
    ["IGo", /^INTELLI-VAR-(?:BB-)?\d/],
  ],
  EXPORT: [
    ["Agile", /^AGILE-OUTGOING-\d/],
    ["Flux", /^FLUX-EXPORT-(?:BB-)?\d/],
    ["IFlux", /^INTELLI-FLUX-EXPORT-(?:BB-)?\d/],
    ["Outgoing", /^OUTGOING-(?:FIX-12M-|VAR-)(?:BB-)?\d/],
    ["OutgoingLite", /^OUTGOING-LITE-FIX-12M-(?:BB-)?\d/],
  ],
};

export function getSupportedTariffFamily(product: OctopusProduct) {
  if (product.is_business || product.is_prepay) return;
  if (product.brand !== "OCTOPUS_ENERGY" && product.brand !== "BULB") return;
  return getTariffFamilyForCode({
    code: product.code,
    direction: product.direction,
  });
}

export function getTariffFamilyForCode({
  code,
  direction,
}: {
  code: string;
  direction: OctopusProduct["direction"];
}) {
  return familyPatterns[direction].find(([, pattern]) =>
    pattern.test(code)
  )?.[0];
}

export interface CatalogueTariff {
  tariff: string;
  type: "E" | "G";
  category: Exclude<SupportedTariffFamily, "Outgoing" | "OutgoingLite">;
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
  const candidates = products.flatMap((product) => {
    const family = getSupportedTariffFamily(product);
    if (!family || Date.parse(product.available_from) > now.valueOf())
      return [];
    return [{ ...product, family, available: isAvailable(product) }];
  });
  const sortedProducts = candidates.sort((a, b) => {
    const availabilityDifference = Number(b.available) - Number(a.available);
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
          product.direction === direction && product.family === family
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
          product.family === family &&
          Date.parse(product.available_from) >= Date.parse(earliestDate)
      )
      .map((product) => ({
        code: product.code,
        name: product.full_name,
        currentPlan: product.available,
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
  const family = getTariffFamilyForCode({
    code: selectedCode,
    direction: isExport ? "EXPORT" : "IMPORT",
  });
  if (isExporting) {
    if (family === "Flux" || family === "IFlux") {
      return {
        importTariff: isExport
          ? (electricity.find((tariff) => tariff.category === family)?.tariff ??
            "")
          : selectedCode,
        exportTariff: isExport
          ? selectedCode
          : (exportTariffs.find((tariff) => tariff.category === family)
              ?.tariff ?? ""),
      };
    }
    if (family === "Go" || family === "IGo") {
      const outgoingFamily = family === "Go" ? "OutgoingLite" : "Outgoing";
      const outgoing = exportTariffs.find(
        (tariff) =>
          getTariffFamilyForCode({
            code: tariff.tariff,
            direction: "EXPORT",
          }) === outgoingFamily
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

export function getInitialTariffHoppingSelection({
  savedImport,
  savedExport,
  isExporting,
  electricity,
  exports: exportTariffs,
}: {
  savedImport: string;
  savedExport: string;
  isExporting: boolean;
  electricity: CatalogueTariff[];
  exports: CatalogueTariff[];
}) {
  return {
    importTariff:
      savedImport ||
      electricity.find(
        (tariff) => tariff.category === (isExporting ? "IFlux" : "Agile")
      )?.tariff ||
      "",
    exportTariff:
      savedExport ||
      (isExporting
        ? (exportTariffs.find((tariff) => tariff.category === "IFlux")
            ?.tariff ?? "")
        : ""),
  };
}
