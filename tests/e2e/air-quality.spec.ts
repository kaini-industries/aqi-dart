import { expect, test, type Page } from "@playwright/test";

import {
  MINIMAL_MAP_STYLE,
  MOCK_HISTORY,
  MOCK_READINGS,
} from "./mock-data";

async function mockExplorerServices(page: Page): Promise<void> {
  await page.route("**/api/v1/readings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify(MOCK_READINGS),
    });
  });

  await page.route("**/api/v1/stations/*/history?hours=24", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_HISTORY),
    });
  });

  await page.route("**/styles/positron*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MINIMAL_MAP_STYLE),
    });
  });

  // The fixture style intentionally retains a glyph endpoint so it exercises
  // the app's symbol layers. An empty, valid protobuf message keeps the test
  // hermetic; the circle layers and accessible non-map view remain testable.
  await page.route("https://fonts.openmaptiles.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-protobuf",
      body: Buffer.alloc(0),
    });
  });
}

async function openExplorer(page: Page): Promise<void> {
  await mockExplorerServices(page);
  await page.goto("/");
  await expect(
    page.getByText("These are demonstration readings.", { exact: true }),
  ).toBeVisible();
}

async function openChicagoFromList(page: Page) {
  const listTab = page.getByRole("tab", { name: "List" });
  await listTab.click();

  const listPanel = page.getByRole("tabpanel", { name: "List" });
  await expect(listPanel).toBeVisible();

  const chicagoRow = listPanel.getByRole("button", {
    name: /^Chicago — Com Ed,/,
  });
  await chicagoRow.click();

  const stationPanel = page.getByRole("complementary", {
    name: "Chicago — Com Ed",
  });
  await expect(stationPanel).toBeVisible();

  return { chicagoRow, stationPanel };
}

test.beforeEach(async ({ page }) => {
  await openExplorer(page);
});

test("loads the current monitor map and clearly labels fallback data", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "Air Equivalent" })).toBeVisible();
  await expect(
    page.getByText("PM2.5 field map · North America", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Demonstration", { exact: true })).toBeVisible();
  await expect(page.getByText("Bundled sample readings", { exact: true })).toBeVisible();
  await expect(page.getByText("Monitors").getByText("3")).toBeVisible();

  const mapRegion = page.getByRole("region", {
    name: "Current air quality map",
  });
  await expect(mapRegion).toBeVisible();
  await expect(
    mapRegion.locator(
      'canvas[aria-label^="Interactive map of current North American PM2.5 monitor readings"]',
    ),
  ).toBeVisible();
  await expect(
    mapRegion.getByText("Plotting current monitors", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Cigarette equivalent" }).click();
  await expect(
    page.getByText(
      /latest outdoor PM2\.5 level persisted for 24 hours/,
    ),
  ).toBeVisible();
});

test("keeps AQI, raw concentration, projected rate, and measured history distinct", async ({
  page,
}) => {
  const { stationPanel } = await openChicagoFromList(page);

  await expect(
    stationPanel.getByText("PM2.5 NowCast AQI", { exact: true }),
  ).toBeVisible();
  await expect(stationPanel.getByText("64", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("Moderate", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("17 µg/m³", { exact: true })).toBeVisible();

  await expect(stationPanel.getByText("≈0.8", { exact: true })).toBeVisible();
  await expect(
    stationPanel.getByText(
      "If this outdoor PM2.5 level persisted for 24 hours.",
      { exact: true },
    ),
  ).toBeVisible();

  await expect(
    stationPanel.getByRole("heading", { name: "Measured PM2.5 history" }),
  ).toBeVisible();
  await expect(stationPanel.getByText("≈0.6", { exact: true })).toBeVisible();
  await expect(
    stationPanel.getByText(
      /20 of 24 hours captured; does not meet the display-completeness threshold; missing hours were not filled or scaled\./,
    ),
  ).toBeVisible();
  await expect(
    stationPanel.getByRole("progressbar", {
      name: "20 of 24 hourly readings captured",
    }),
  ).toHaveAttribute("value", "20");
  await expect(
    stationPanel.getByText("Longest missing gap: 4 hours.", { exact: false }),
  ).toBeVisible();
});

test("opens the concise methodology and links to the complete field guide", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Methodology" }).click();

  const methodologyPanel = page.getByRole("complementary", {
    name: "How the estimate works",
  });
  await expect(methodologyPanel).toBeVisible();
  await expect(
    methodologyPanel.getByText(
      /It does not mean you smoked cigarettes, and it is not a personal exposure or medical-risk estimate\./,
    ),
  ).toBeVisible();
  await expect(
    methodologyPanel.getByText("Gaps remain gaps", { exact: true }),
  ).toBeVisible();

  const fullMethodologyLink = methodologyPanel.getByRole("link", {
    name: /Read the full methodology/,
  });
  await expect(fullMethodologyLink).toHaveAttribute("href", "/methodology");
  await fullMethodologyLink.click();

  await expect(page).toHaveURL(/\/methodology$/);
  await expect(
    page.getByRole("heading", {
      name: "A memorable comparison, with its rough edges left visible.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Missing hours are not filled, interpolated, or extrapolated."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to the map" })).toBeVisible();
});

test.describe("adaptive monitor detail sheet", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("moves focus into the sheet, closes with Escape, and restores the row", async ({
    page,
  }) => {
    const { chicagoRow, stationPanel } = await openChicagoFromList(page);

    await expect(
      stationPanel.getByRole("button", {
        name: "Close details for Chicago — Com Ed",
      }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          stationPanel.evaluate((panel) =>
            panel.contains(document.activeElement),
          ),
        { message: "focus should move inside the adaptive detail sheet" },
      )
      .toBe(true);

    await page.keyboard.press("Escape");

    await expect(stationPanel).toBeHidden();
    await expect(chicagoRow).toBeFocused();
  });
});
