export const VALID_AIRNOW_FIELDS = [
  "320030540",
  "Jerome Mack",
  "Active",
  "R9",
  "36.141875",
  "-115.078742",
  "538.3",
  "-8.0",
  "US",
  "NV",
  "05/31/19",
  "10:00",
  "Clark County Department of Air Quality",
  "Las Vegas|Clark County",
  "39.0",
  "11.0",
  "15.0",
  "8.0",
  "1",
  "1",
  "1",
  "1",
  "3.7",
  "UG/M3",
  "35.0",
  "PPB",
  "9.0",
  "PPB",
  "0.13",
  "PPM",
  "0.0",
  "PPB",
  "12.0",
  "UG/M3",
] as const;

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function makeAirNowRow(
  overrides: Readonly<Record<number, string>> = {},
): string {
  return VALID_AIRNOW_FIELDS.map((value, index) =>
    csvCell(overrides[index] ?? value),
  ).join(",");
}
