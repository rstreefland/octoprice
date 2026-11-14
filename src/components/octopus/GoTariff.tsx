"use client";
import { TariffUnavailable } from "./TariffUnavailable";
import { useTariffCatalogue } from "@/context/tariffCatalogue";

import Tariff from "./Tariff";

const GoTariff = () => {
  const { electricity: ETARIFFS } = useTariffCatalogue();
  const currentTariff = ETARIFFS.find((tariff) => tariff.category === "Go");
  if (!currentTariff) return <TariffUnavailable />;

  return <Tariff tariff={currentTariff} />;
};

export default GoTariff;
