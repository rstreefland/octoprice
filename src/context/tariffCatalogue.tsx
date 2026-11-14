"use client";

import { createContext, ReactNode, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildTariffCatalogue,
  fetchOctopusProducts,
  TariffCatalogue,
} from "@/utils/tariffCatalogue";
import Loading from "@/app/loading";
import ErrorMessage from "@/components/octopus/ErrorMessage";

const TariffCatalogueContext = createContext<TariffCatalogue | null>(null);

export function TariffCatalogueProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["tariffCatalogue"],
    staleTime: 60 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const [current, historical] = await Promise.all([
        fetchOctopusProducts({ signal }),
        fetchOctopusProducts({ historical: true, signal }),
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
    },
  });

  if (query.data) {
    return (
      <TariffCatalogueContext.Provider value={query.data}>
        {children}
      </TariffCatalogueContext.Provider>
    );
  }
  if (query.isError) {
    return (
      <div className="lg:col-[content] my-4">
        <ErrorMessage
          error={query.error}
          errorHandler={() => {
            void query.refetch();
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="lg:col-[content] my-4"
      role="status"
      aria-label="Loading Octopus tariffs"
    >
      <Loading />
    </div>
  );
}

export function useTariffCatalogue() {
  const catalogue = useContext(TariffCatalogueContext);
  if (!catalogue) throw new Error("Tariff catalogue provider is missing.");
  return catalogue;
}
