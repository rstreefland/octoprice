"use client";
import { TariffUnavailable } from "./TariffUnavailable";
import { useTariffCatalogue } from "@/context/tariffCatalogue";

import Tariff from "./Tariff";

const FluxTariff = () => {
  const { exports: EETARIFFS } = useTariffCatalogue();
  const currentExportTariff = EETARIFFS.find(
    (tariff) => tariff.category === "Agile"
  );

  if (!currentExportTariff) return <TariffUnavailable />;

  return <Tariff tariff={currentExportTariff} isExport={true} />;
};

export default FluxTariff;
