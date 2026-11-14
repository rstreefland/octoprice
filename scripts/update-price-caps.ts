import { readFile, writeFile } from "node:fs/promises";
import { fetchUtilityPricesUpdate } from "../src/api/priceCaps";
import {
  mergePriceCapUpdate,
  priceCapSourcesSchema,
} from "../src/utils/priceCaps";

async function main() {
  const dataPath = "public/data/price-caps.tsv";
  const sourcesPath = "public/data/price-cap-sources.json";
  const [text, sourceText, update] = await Promise.all([
    readFile(dataPath, "utf8"),
    readFile(sourcesPath, "utf8"),
    fetchUtilityPricesUpdate({ signal: AbortSignal.timeout(30_000) }),
  ]);
  const sources = priceCapSourcesSchema.parse(JSON.parse(sourceText));
  const merged = mergePriceCapUpdate({ text, sources, update });
  await writeFile(dataPath, merged.text);
  await writeFile(sourcesPath, JSON.stringify(merged.sources, null, 2) + "\n");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
