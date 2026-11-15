import {
  buildTariffCatalogue,
  parseTariffCatalogue,
  type TariffCatalogue,
} from "../utils/tariffCatalogue";
import { fetchOctopusProducts } from "./octopusProducts";

export const TARIFF_CATALOGUE_SNAPSHOT_URL = "/data/tariff-catalogue.json";

export async function discoverTariffCatalogue({
  signal,
  fetchPage,
  now = new Date(),
}: {
  signal?: AbortSignal;
  fetchPage?: typeof fetch;
  now?: Date;
} = {}): Promise<TariffCatalogue> {
  const [historical, current] = await Promise.all([
    fetchOctopusProducts({ historical: true, signal, fetchPage }),
    fetchOctopusProducts({ signal, fetchPage }),
  ]);
  const products = new Map(
    [...historical, ...current].map((product) => [product.code, product]),
  );
  const catalogue = buildTariffCatalogue({
    products: [...products.values()],
    now,
  });
  if (
    !catalogue.variableCode ||
    !catalogue.agile.length ||
    !catalogue.tracker.length
  ) {
    throw new Error(
      "Octopus returned an incomplete tariff catalogue. Please try again.",
    );
  }
  return catalogue;
}

export async function loadTariffCatalogue({
  signal,
  fetchPage = fetch,
}: {
  signal?: AbortSignal;
  fetchPage?: typeof fetch;
} = {}): Promise<TariffCatalogue> {
  const response = await fetchPage(TARIFF_CATALOGUE_SNAPSHOT_URL, { signal });
  if (!response.ok) {
    throw new Error("Unable to load Octopus tariffs. Please try again.");
  }
  const data = await response.json();
  return parseTariffCatalogue(data);
}
