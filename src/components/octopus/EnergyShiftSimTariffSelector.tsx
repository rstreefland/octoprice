import { getPairedTariffSelection } from "@/utils/tariffCatalogue";
import { useTariffCatalogue } from "@/context/tariffCatalogue";
import { BiExport, BiImport } from "react-icons/bi";
import { HiSearchCircle } from "react-icons/hi";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { getCategory } from "@/utils/helpers";
import { ITariffToCompare } from "@/data/source";
import { ReactNode, SetStateAction } from "react";

interface IEnergyShiftSimTariffSelector {
  tariff: string;
  tariffs: ITariffToCompare[];
  isExport?: boolean;
  isExporting?: boolean;
  changeImportTariff: (value: SetStateAction<string>) => void;
  changeExportTariff: (value: SetStateAction<string>) => void;
  children: ReactNode;
}

const EnergyShiftSimTariffSelector = ({
  isExport = false,
  isExporting = true,
  tariff,
  tariffs,
  changeImportTariff,
  changeExportTariff,
  children,
}: IEnergyShiftSimTariffSelector) => {
  const { electricity, exports: exportTariffs } = useTariffCatalogue();
  return (
    <div className="flex items-center gap-1">
      {!isExport ? (
        <>
          <BiImport className="w-4 h-4 text-accentBlue-600" />
          <span className="text-sm text-accentBlue-600">Import:</span>
        </>
      ) : (
        <>
          <BiExport className="w-4 h-4 text-orange-400" />
          <span className="text-sm text-orange-400">Export:</span>
        </>
      )}

      <a
        href={`/${getCategory(tariff).toLowerCase()}${
          isExport &&
          ["agile", "fixed"].includes(getCategory(tariff).toLowerCase())
            ? "Outgoing"
            : ""
        }`}
        target="_blank"
      >
        <HiSearchCircle
          aria-label={`${getCategory(tariff)} tariff details`}
          className="hover:text-accentBlue-500"
        />
      </a>
      <Select
        onValueChange={(newSelection: string) => {
          const selection = getPairedTariffSelection({
            selectedCode: newSelection,
            isExport,
            isExporting,
            electricity,
            exports: exportTariffs,
          });
          if (selection.importTariff !== undefined)
            changeImportTariff(selection.importTariff);
          if (selection.exportTariff !== undefined)
            changeExportTariff(selection.exportTariff);
        }}
        value={tariff}
      >
        <SelectTrigger className="w-auto flex items-center justify-center p-0 m-0 h-5 md:h-7 text-sm md:text-base [&>svg]:ml-0 [&>h1]:max-w-[170px] md:[&>h1]:max-w-fit">
          <SelectValue placeholder="" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>{children}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export default EnergyShiftSimTariffSelector;
