import { buildTariffCatalogue } from "../utils/tariffCatalogue";
import { fetchOctopusProducts } from "./octopusProducts";

export async function loadTariffCatalogue({
  signal,
  fetchPage,
}: { signal?: AbortSignal; fetchPage?: typeof fetch } = {}) {
  const [historical, current] = await Promise.all([
    fetchOctopusProducts({ historical: true, signal, fetchPage }),
    fetchOctopusProducts({ signal, fetchPage }),
  ]);
  const products = new Map(
    [...historical, ...current].map((product) => [product.code, product])
  );
  const catalogue = buildTariffCatalogue({
    products: [...products.values()],
    now: new Date(),
  });
  if (
    !catalogue.variableCode ||
    !catalogue.agile.length ||
    !catalogue.tracker.length
  ) {
    throw new Error(
      "Octopus returned an incomplete tariff catalogue. Please try again."
    );
  }
  return catalogue;
}
