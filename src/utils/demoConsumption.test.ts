import { deepStrictEqual, ok, throws } from "node:assert";
import { test } from "node:test";
import { createDemoConsumption } from "./demoConsumption";

const options = {
  fromISODate: "2026-01-01T00:00:00Z",
  toISODate: "2026-01-03T00:00:00Z",
  type: "E",
  halfHourly: false,
} satisfies Parameters<typeof createDemoConsumption>[0];

test("daily samples match the consumption API shape and newest-first ordering", () => {
  deepStrictEqual(createDemoConsumption(options), {
    results: [
      {
        consumption: 12,
        interval_start: "2026-01-02T00:00:00.000Z",
        interval_end: "2026-01-03T00:00:00.000Z",
      },
      {
        consumption: 12,
        interval_start: "2026-01-01T00:00:00.000Z",
        interval_end: "2026-01-02T00:00:00.000Z",
      },
    ],
  });
  deepStrictEqual(
    createDemoConsumption(options),
    createDemoConsumption(options),
  );
});

test("half-hourly samples cover the range with the same daily totals", () => {
  const { results } = createDemoConsumption({ ...options, halfHourly: true });
  deepStrictEqual(results.length, 96);
  deepStrictEqual(results[0].interval_end, "2026-01-03T00:00:00.000Z");
  deepStrictEqual(results[95].interval_start, "2026-01-01T00:00:00.000Z");
  const totalConsumption = results.reduce(
    (total, result) => total + result.consumption,
    0,
  );
  ok(Math.abs(totalConsumption - 24) < 0.01);
  for (const result of results) {
    deepStrictEqual(
      Date.parse(result.interval_end) - Date.parse(result.interval_start),
      1800000,
    );
    ok(result.consumption > 0);
  }
});

test("gas samples vary with seasonal demand", () => {
  const winter = createDemoConsumption({ ...options, type: "G" });
  deepStrictEqual(
    winter.results.map((result) => result.consumption),
    [4.5, 4.5],
  );
  const summer = createDemoConsumption({
    ...options,
    type: "G",
    fromISODate: "2026-07-01T00:00:00Z",
    toISODate: "2026-07-03T00:00:00Z",
  });
  deepStrictEqual(
    summer.results.map((result) => result.consumption),
    [0.5, 0.5],
  );
});

test("empty and partial ranges do not produce intervals beyond the requested end", () => {
  deepStrictEqual(
    createDemoConsumption({ ...options, toISODate: options.fromISODate }),
    { results: [] },
  );
  const partial = createDemoConsumption({
    ...options,
    toISODate: "2026-01-01T00:15:00Z",
    halfHourly: true,
  });
  deepStrictEqual(partial.results.length, 1);
  deepStrictEqual(partial.results[0].interval_end, "2026-01-01T00:15:00.000Z");
  throws(
    () => createDemoConsumption({ ...options, fromISODate: "invalid" }),
    /Invalid sample consumption date range/,
  );
});
