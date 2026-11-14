import { gsp } from "@/data/source";
import { parsePriceCapTsv } from "@/utils/priceCaps";
import { useQuery } from "@tanstack/react-query";

export function usePriceCapQuery(_options: { gsp?: gsp | "UK" } = {}) {
  return useQuery({
    queryKey: ["getCaps"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/data/price-caps.tsv", { signal });
      if (!response.ok) throw new Error("Unable to load price cap data");
      return parsePriceCapTsv(await response.text());
    },
  });
}
