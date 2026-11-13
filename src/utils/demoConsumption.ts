type DemoConsumptionOptions = {
  fromISODate: string;
  toISODate: string;
  type: "E" | "G";
  halfHourly: boolean;
};

export function createDemoConsumption({
  fromISODate,
  toISODate,
  type,
  halfHourly,
}: DemoConsumptionOptions) {
  const startTime = Date.parse(fromISODate);
  const endTime = Date.parse(toISODate);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new Error("Invalid sample consumption date range");
  }

  const intervalMilliseconds = halfHourly
    ? 30 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const results = [];

  for (let time = startTime; time < endTime; time += intervalMilliseconds) {
    const date = new Date(time);
    const month = date.getUTCMonth();
    const hour = date.getUTCHours();
    const winterDemand = (1 + Math.cos((month * Math.PI) / 6)) / 2;
    const dailyConsumption =
      type === "G" ? 0.5 + winterDemand * 4 : 8 + winterDemand * 4;
    const eveningDemand = hour >= 16 && hour < 21 ? 2 : 1;
    const consumption = halfHourly
      ? (dailyConsumption * eveningDemand) / 58
      : dailyConsumption;

    results.push({
      consumption: Number(consumption.toFixed(4)),
      interval_start: date.toISOString(),
      interval_end: new Date(
        Math.min(time + intervalMilliseconds, endTime),
      ).toISOString(),
    });
  }

  return { results: results.reverse() };
}
