"use client";
import { TariffUnavailable } from "./TariffUnavailable";
import { useTariffCatalogue } from "@/context/tariffCatalogue";

import Tariff from "./Tariff";

const CosyTariff = () => {
  const { electricity: ETARIFFS } = useTariffCatalogue();
  const currentTariff = ETARIFFS.find((tariff) => tariff.category === "Cosy");
  if (!currentTariff) return <TariffUnavailable />;

  return <Tariff tariff={currentTariff} />;
};

export default CosyTariff;
