"use client";
import { TariffUnavailable } from "./TariffUnavailable";
import { useTariffCatalogue } from "@/context/tariffCatalogue";

import ExportTariff from "./ExportTariff";
import Tariff from "./Tariff";

const IFluxTariff = () => {
  const { electricity: ETARIFFS, exports: EETARIFFS } = useTariffCatalogue();
  const currentTariff = ETARIFFS.find((tariff) => tariff.category === "IFlux");
  const currentExportTariff = EETARIFFS.find(
    (tariff) => tariff.category === "IFlux"
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
        "Must sign up to both Intelligent Flux Import and Export tariffs at the same time. Intelligent Octopus Flux is a smart import and export tariff optimised to give you the best rates for consuming and selling your energy. Compared to Flux tariff, Intelligent customers could save £100 or more each year."
      }
    />
  );
};

export default IFluxTariff;
