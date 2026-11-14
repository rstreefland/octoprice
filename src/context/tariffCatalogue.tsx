"use client";

import { createContext, ReactNode, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TariffCatalogue } from "@/utils/tariffCatalogue";
import { loadTariffCatalogue } from "@/api/tariffCatalogue";
import Loading from "@/app/loading";
import ErrorMessage from "@/components/octopus/ErrorMessage";

const TariffCatalogueContext = createContext<TariffCatalogue | null>(null);

export function TariffCatalogueProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["tariffCatalogue"],
    staleTime: 3_600_000,
    queryFn: ({ signal }) => loadTariffCatalogue({ signal }),
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
