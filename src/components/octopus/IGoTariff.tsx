"use client";
import { TariffUnavailable } from "./TariffUnavailable";
import { useTariffCatalogue } from "@/context/tariffCatalogue";

import Tariff from "./Tariff";

const IGoTariff = () => {
  const { electricity: ETARIFFS } = useTariffCatalogue();
  const currentTariff = ETARIFFS.find((tariff) => tariff.category === "IGo");
  if (!currentTariff) return <TariffUnavailable />;

  return <Tariff tariff={currentTariff} />;
};

export default IGoTariff;
