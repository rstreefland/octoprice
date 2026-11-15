import { readFile, writeFile } from "node:fs/promises";
import { discoverTariffCatalogue } from "../src/api/tariffCatalogue";
import {
  tariffCatalogueSchema,
  tariffSourcesSchema,
  validateTariffCatalogueUpdate,
} from "../src/utils/tariffCatalogue";

async function main() {
  const dataPath = "public/data/tariff-catalogue.json";
  const sourcesPath = "public/data/tariff-sources.json";

  const catalogue = await discoverTariffCatalogue({
    signal: AbortSignal.timeout(60_000),
  });
  const validatedCatalogue = tariffCatalogueSchema.parse(catalogue);

  const catalogueText = JSON.stringify(validatedCatalogue, null, 2) + "\n";
  const previousCatalogueText = await readFile(dataPath, "utf8");
  const previousCatalogue = tariffCatalogueSchema.parse(
    JSON.parse(previousCatalogueText),
  );
  validateTariffCatalogueUpdate({
    previousCatalogue,
    catalogue: validatedCatalogue,
  });
  if (catalogueText === previousCatalogueText) return;

  const sources = tariffSourcesSchema.parse({
    retrievedAt: new Date().toISOString(),
    endpoint: "https://api.octopus.energy/v1/products/",
    brand: "OCTOPUS_ENERGY",
    electricityCount: validatedCatalogue.electricity.length,
    gasCount: validatedCatalogue.gas.length,
    exportsCount: validatedCatalogue.exports.length,
    agileCount: validatedCatalogue.agile.length,
    trackerCount: validatedCatalogue.tracker.length,
    variableCode: validatedCatalogue.variableCode,
  });

  await writeFile(dataPath, catalogueText);
  await writeFile(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
