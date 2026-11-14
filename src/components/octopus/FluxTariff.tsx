"use client";
import { TariffUnavailable } from "./TariffUnavailable";
import { useTariffCatalogue } from "@/context/tariffCatalogue";

import ExportTariff from "./ExportTariff";
import Tariff from "./Tariff";

const FluxTariff = () => {
  const { electricity: ETARIFFS, exports: EETARIFFS } = useTariffCatalogue();
  const currentTariff = ETARIFFS.find((tariff) => tariff.category === "Flux");
  const currentExportTariff = EETARIFFS.find(
    (tariff) => tariff.category === "Flux"
  );

  if (!currentTariff) return <TariffUnavailable />;
  if (!currentExportTariff) {
    return (
      <>
        <TariffUnavailable name="The export tariff" />
        <Tariff tariff={currentTariff} />
      </>
    );
  }

  return (
    <ExportTariff
      tariff={currentTariff}
      exportTariff={currentExportTariff}
      remarks={
        "Must sign up to both Flux Import and Export tariffs at the same time."
      }
    />
  );
};

export default FluxTariff;
