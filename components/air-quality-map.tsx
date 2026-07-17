"use client";

import maplibregl, {
  type ErrorEvent as MapErrorEvent,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { AQI_CATEGORIES } from "@/lib/domain/aqi";
import { formatEquivalentMarker } from "@/lib/ui/map-markers";
import type {
  DisplayMode,
  ReadingsFeatureCollection,
} from "@/lib/ui/types";

import styles from "./air-quality-map.module.css";

const SOURCE_ID = "current-pm25-readings";
const AQI_CLUSTER_LAYER_ID = "aqi-reading-clusters";
const AQI_CLUSTER_COUNT_LAYER_ID = "aqi-reading-cluster-counts";
const AQI_SELECTION_LAYER_ID = "aqi-selected-reading-ring";
const AQI_READING_LAYER_ID = "aqi-individual-readings";
const AQI_READING_LABEL_LAYER_ID = "aqi-individual-reading-labels";
const CIGARETTE_CLUSTER_RING_LAYER_ID = "equivalent-cluster-aqi-rings";
const CIGARETTE_CLUSTER_CORE_LAYER_ID = "equivalent-cluster-paper-cores";
const CIGARETTE_CLUSTER_TAB_LAYER_ID = "equivalent-cluster-filter-tabs";
const CIGARETTE_CLUSTER_LABEL_LAYER_ID = "equivalent-cluster-labels";
const CIGARETTE_HIT_LAYER_ID = "equivalent-reading-hit-targets";
const CIGARETTE_SELECTION_LAYER_ID = "equivalent-selected-reading-ring";
const CIGARETTE_ANCHOR_LAYER_ID = "equivalent-reading-aqi-anchors";
const CIGARETTE_LABEL_LAYER_ID = "equivalent-reading-field-flags";
const CIGARETTE_SELECTED_LABEL_LAYER_ID = "equivalent-selected-field-flag";

const FIELD_FLAG_IMAGE_ID = "equivalent-filter-paper";
const UNAVAILABLE_FIELD_FLAG_IMAGE_ID = "equivalent-filter-paper-unavailable";
const FILTER_TAB_IMAGE_ID = "equivalent-filter-tab";

const AQI_LAYER_IDS = [
  AQI_CLUSTER_LAYER_ID,
  AQI_CLUSTER_COUNT_LAYER_ID,
  AQI_SELECTION_LAYER_ID,
  AQI_READING_LAYER_ID,
  AQI_READING_LABEL_LAYER_ID,
] as const;

const CIGARETTE_LAYER_IDS = [
  CIGARETTE_CLUSTER_RING_LAYER_ID,
  CIGARETTE_CLUSTER_CORE_LAYER_ID,
  CIGARETTE_CLUSTER_TAB_LAYER_ID,
  CIGARETTE_CLUSTER_LABEL_LAYER_ID,
  CIGARETTE_HIT_LAYER_ID,
  CIGARETTE_SELECTION_LAYER_ID,
  CIGARETTE_ANCHOR_LAYER_ID,
  CIGARETTE_LABEL_LAYER_ID,
  CIGARETTE_SELECTED_LABEL_LAYER_ID,
] as const;

const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

const NORTH_AMERICA_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-168, 15],
  [-52, 72],
];

const CATEGORY_COLOR_EXPRESSION: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "aqiCategory"],
  "good",
  "#00e400",
  "moderate",
  "#ffff00",
  "unhealthy-for-sensitive-groups",
  "#ff7e00",
  "unhealthy",
  "#ff0000",
  "very-unhealthy",
  "#8f3f97",
  "hazardous",
  "#7e0023",
  "#7a8178",
];

const CLUSTER_COLOR_EXPRESSION: maplibregl.ExpressionSpecification = [
  "step",
  ["get", "maxAqi"],
  "#7a8178",
  0,
  "#00e400",
  51,
  "#ffff00",
  101,
  "#ff7e00",
  151,
  "#ff0000",
  201,
  "#8f3f97",
  301,
  "#7e0023",
];

const DARK_LABEL_EXPRESSION: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "aqiCategory"],
  "very-unhealthy",
  "#fffaf0",
  "hazardous",
  "#fffaf0",
  "#07110b",
];

const FRESHNESS_OPACITY_EXPRESSION: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "freshness"],
  "expired",
  0.48,
  "stale",
  0.72,
  0.98,
];

const CIGARETTE_ICON_EXPRESSION: maplibregl.ExpressionSpecification = [
  "case",
  ["get", "equivalentAvailable"],
  FIELD_FLAG_IMAGE_ID,
  UNAVAILABLE_FIELD_FLAG_IMAGE_ID,
];

const CIGARETTE_LABEL_EXPRESSION: maplibregl.ExpressionSpecification = [
  "step",
  ["zoom"],
  ["get", "equivalentLabel"],
  12,
  [
    "concat",
    ["get", "equivalentLabel"],
    "\n",
    ["get", "equivalentUnitLabel"],
  ],
];

const CIGARETTE_SORT_EXPRESSION: maplibregl.ExpressionSpecification = [
  "+",
  [
    "match",
    ["get", "freshness"],
    "fresh",
    0,
    "stale",
    1_000,
    2_000,
  ],
  [
    "-",
    0,
    ["coalesce", ["get", "projectedCigaretteEquivalentsPerDay"], 0],
  ],
];

const CIGARETTE_CLUSTER_VALUE_EXPRESSION: maplibregl.ExpressionSpecification = [
  "case",
  ["<", ["get", "maxEquivalent"], 0],
  "—",
  [
    "all",
    [">", ["get", "maxEquivalent"], 0],
    ["<", ["get", "maxEquivalent"], 0.1],
  ],
  "<0.1",
  ["<", ["get", "maxEquivalent"], 10],
  [
    "concat",
    "≈",
    [
      "to-string",
      [
        "/",
        ["round", ["*", ["get", "maxEquivalent"], 10]],
        10,
      ],
    ],
  ],
  [
    "concat",
    "≈",
    ["to-string", ["round", ["get", "maxEquivalent"]]],
  ],
];

interface MapReadingProperties {
  [key: string]: unknown;
  aqiLabel: string;
  equivalentAvailable: boolean;
  equivalentLabel: string;
  equivalentUnitLabel: string;
  pm25Aqi: number | null;
  stationId: string;
}

interface MapFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: MapReadingProperties;
  }>;
}

export interface AirQualityMapProps {
  readings: ReadingsFeatureCollection | null;
  selectedStationId: string | null;
  displayMode: DisplayMode;
  onSelectStation: (stationId: string) => void;
  error?: string | null;
  className?: string;
}

function categoryRange(min: number, max: number): string {
  return Number.isFinite(max) ? `${min}–${max}` : `${min}+`;
}

function AqiLegendItems() {
  return (
    <ul className={styles.legendGrid}>
      {AQI_CATEGORIES.map((category) => (
        <li className={styles.legendItem} key={category.id}>
          <span
            className={styles.legendSwatch}
            style={{ backgroundColor: category.color }}
            aria-hidden="true"
          />
          <span className={styles.legendLabel}>{category.shortLabel}</span>
          <span className={styles.legendRange}>
            {categoryRange(category.min, category.max)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CigaretteLegendItems() {
  return (
    <div className={styles.equivalentKey}>
      <div className={styles.equivalentSample} aria-hidden="true">
        <span className={styles.equivalentSampleAnchor} />
        <span className={styles.equivalentSampleFlag}>
          <strong>≈0.8</strong>
          <small>cig/day</small>
        </span>
      </div>
      <p className={styles.equivalentDefinition}>
        Projected if the latest outdoor PM2.5 level held for 24 hours.
      </p>
      <dl className={styles.equivalentDetails}>
        <div>
          <dt>
            <span className={styles.keyAqiDot} aria-hidden="true" /> AQI color
          </dt>
          <dd>Monitor category at a point; worst category in a cluster.</dd>
        </div>
        <div>
          <dt>MAX / —</dt>
          <dd>Highest site, never a total; dash means unavailable.</dd>
        </div>
      </dl>
    </div>
  );
}

function toMapData(readings: ReadingsFeatureCollection | null): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      readings?.features.map((feature) => {
        const equivalentMarker = formatEquivalentMarker(
          feature.properties.projectedCigaretteEquivalentsPerDay,
        );

        return {
          type: feature.type,
          id: feature.id,
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            aqiLabel:
              feature.properties.pm25Aqi == null ||
              !Number.isFinite(feature.properties.pm25Aqi)
                ? "—"
                : String(Math.round(feature.properties.pm25Aqi)),
            equivalentAvailable: equivalentMarker.available,
            equivalentLabel: equivalentMarker.label,
            equivalentUnitLabel: equivalentMarker.unitLabel,
          },
        };
      }) ?? [],
  };
}

function selectedFilter(stationId: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "stationId"], stationId ?? ""];
}

function unselectedReadingFilter(
  stationId: string | null,
): maplibregl.FilterSpecification {
  return [
    "all",
    ["!", ["has", "point_count"]],
    ["!=", ["get", "stationId"], stationId ?? ""],
  ];
}

function layerVisibility(
  displayMode: DisplayMode,
  layerMode: DisplayMode,
): "visible" | "none" {
  return displayMode === layerMode ? "visible" : "none";
}

function applyDisplayMode(map: MapLibreMap, displayMode: DisplayMode): void {
  for (const layerId of AQI_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        layerVisibility(displayMode, "aqi"),
      );
    }
  }

  for (const layerId of CIGARETTE_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        layerVisibility(displayMode, "cigarettes"),
      );
    }
  }

  map.getCanvas().setAttribute(
    "aria-label",
    displayMode === "cigarettes"
      ? "Interactive map of current North American PM2.5 monitor readings labeled with projected cigarette-equivalents per day. AQI-colored dots preserve the official category. Use the synchronized monitor list for a non-map view."
      : "Interactive map of current North American PM2.5 monitor readings labeled with AQI. Use the synchronized monitor list for a non-map view.",
  );
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function createFieldFlagImage(unavailable = false): ImageData {
  const pixelRatio = 2;
  const logicalWidth = 56;
  const logicalHeight = 28;
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * pixelRatio;
  canvas.height = logicalHeight * pixelRatio;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return new ImageData(canvas.width, canvas.height);
  }

  context.scale(pixelRatio, pixelRatio);
  roundedRectPath(context, 1, 1, logicalWidth - 2, logicalHeight - 2, 4);
  context.save();
  context.clip();

  context.fillStyle = unavailable ? "#f0eee4" : "#fff9e9";
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  context.fillStyle = unavailable ? "#a8a79e" : "#c58c4d";
  context.fillRect(0, 0, 13, logicalHeight);

  context.fillStyle = "#273027";
  context.fillRect(54, 0, 2, logicalHeight);

  context.fillStyle = unavailable
    ? "rgba(39, 48, 39, 0.16)"
    : "rgba(39, 48, 39, 0.055)";
  for (let x = 16; x < 52; x += 5) {
    context.fillRect(x, 0, 0.5, logicalHeight);
  }

  if (unavailable) {
    context.strokeStyle = "rgba(39, 48, 39, 0.28)";
    context.lineWidth = 1;
    for (let x = 8; x < 60; x += 7) {
      context.beginPath();
      context.moveTo(x, logicalHeight);
      context.lineTo(x + 14, 0);
      context.stroke();
    }
  }

  context.restore();
  context.strokeStyle = "#273027";
  context.lineWidth = 1;
  roundedRectPath(context, 1, 1, logicalWidth - 2, logicalHeight - 2, 4);
  context.stroke();

  context.strokeStyle = "rgba(39, 48, 39, 0.7)";
  context.beginPath();
  context.moveTo(13, 1);
  context.lineTo(13, logicalHeight - 1);
  context.moveTo(54, 1);
  context.lineTo(54, logicalHeight - 1);
  context.stroke();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createFilterTabImage(): ImageData {
  const pixelRatio = 2;
  const logicalWidth = 30;
  const logicalHeight = 7;
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * pixelRatio;
  canvas.height = logicalHeight * pixelRatio;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return new ImageData(canvas.width, canvas.height);
  }

  context.scale(pixelRatio, pixelRatio);
  roundedRectPath(context, 0.5, 0.5, logicalWidth - 1, logicalHeight - 1, 3);
  context.save();
  context.clip();
  context.fillStyle = "#fff9e9";
  context.fillRect(0, 0, logicalWidth, logicalHeight);
  context.fillStyle = "#c58c4d";
  context.fillRect(0, 0, 8, logicalHeight);
  context.fillStyle = "#273027";
  context.fillRect(27, 0, 3, logicalHeight);
  context.restore();
  context.strokeStyle = "#273027";
  context.lineWidth = 1;
  roundedRectPath(context, 0.5, 0.5, logicalWidth - 1, logicalHeight - 1, 3);
  context.stroke();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function addMarkerImages(map: MapLibreMap): void {
  const stretchableImageOptions = {
    pixelRatio: 2,
    stretchX: [[28, 104]] as Array<[number, number]>,
    stretchY: [[12, 44]] as Array<[number, number]>,
    content: [30, 8, 106, 48] as [number, number, number, number],
  };

  if (!map.hasImage(FIELD_FLAG_IMAGE_ID)) {
    map.addImage(
      FIELD_FLAG_IMAGE_ID,
      createFieldFlagImage(),
      stretchableImageOptions,
    );
  }
  if (!map.hasImage(UNAVAILABLE_FIELD_FLAG_IMAGE_ID)) {
    map.addImage(
      UNAVAILABLE_FIELD_FLAG_IMAGE_ID,
      createFieldFlagImage(true),
      stretchableImageOptions,
    );
  }
  if (!map.hasImage(FILTER_TAB_IMAGE_ID)) {
    map.addImage(FILTER_TAB_IMAGE_ID, createFilterTabImage(), {
      pixelRatio: 2,
    });
  }
}

function focusSelectedReading(
  map: MapLibreMap,
  data: MapFeatureCollection,
  stationId: string | null,
): void {
  if (!stationId) {
    return;
  }

  const selected = data.features.find(
    (feature) => feature.properties.stationId === stationId,
  );
  if (!selected) {
    return;
  }

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const { clientHeight, clientWidth } = map.getContainer();
  const offset: [number, number] =
    window.innerWidth < 768
      ? [0, -Math.min(clientHeight * 0.32, 240)]
      : window.innerWidth < 960
        ? [-Math.min(clientWidth * 0.27, 208), 0]
        : [0, 0];

  map.easeTo({
    center: selected.geometry.coordinates,
    zoom: Math.max(map.getZoom(), 11),
    offset,
    duration: reduceMotion ? 0 : 480,
  });
}

function addReadingLayers(
  map: MapLibreMap,
  data: MapFeatureCollection,
  selectedStationId: string | null,
  displayMode: DisplayMode,
): void {
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 64,
    clusterProperties: {
      maxAqi: ["max", ["coalesce", ["get", "pm25Aqi"], -1]],
      maxEquivalent: [
        "max",
        ["coalesce", ["get", "projectedCigaretteEquivalentsPerDay"], -1],
      ],
    },
  });

  map.addLayer({
    id: AQI_CLUSTER_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      visibility: layerVisibility(displayMode, "aqi"),
    },
    paint: {
      "circle-color": CLUSTER_COLOR_EXPRESSION,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        22,
        20,
        26,
        100,
        31,
        500,
        36,
      ],
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.94,
    },
  });

  map.addLayer({
    id: AQI_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": [
        "concat",
        ["to-string", ["get", "point_count_abbreviated"]],
        "\n",
        [
          "case",
          ["<", ["get", "maxAqi"], 0],
          "AQI —",
          ["concat", "max ", ["to-string", ["round", ["get", "maxAqi"]]]],
        ],
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-line-height": 1.05,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      visibility: layerVisibility(displayMode, "aqi"),
    },
    paint: {
      "text-color": [
        "step",
        ["get", "maxAqi"],
        "#07110b",
        0,
        "#07110b",
        201,
        "#fffaf0",
      ],
      "text-halo-color": "rgba(7, 17, 11, 0.55)",
      "text-halo-width": 0.5,
    },
  });

  map.addLayer({
    id: AQI_SELECTION_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: selectedFilter(selectedStationId),
    layout: {
      visibility: layerVisibility(displayMode, "aqi"),
    },
    paint: {
      "circle-color": "rgba(255, 250, 240, 0.86)",
      "circle-radius": 30,
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 3,
    },
  });

  map.addLayer({
    id: AQI_READING_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      visibility: layerVisibility(displayMode, "aqi"),
    },
    paint: {
      "circle-color": CATEGORY_COLOR_EXPRESSION,
      "circle-radius": 22,
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 1.4,
      "circle-opacity": FRESHNESS_OPACITY_EXPRESSION,
    },
  });

  map.addLayer({
    id: AQI_READING_LABEL_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "aqiLabel"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-letter-spacing": 0.02,
      visibility: layerVisibility(displayMode, "aqi"),
    },
    paint: {
      "text-color": DARK_LABEL_EXPRESSION,
      "text-halo-color": "rgba(7, 17, 11, 0.55)",
      "text-halo-width": 0.35,
    },
  });

  map.addLayer({
    id: CIGARETTE_CLUSTER_RING_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "circle-color": CLUSTER_COLOR_EXPRESSION,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        25,
        20,
        29,
        100,
        33,
        500,
        37,
      ],
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 2,
      "circle-opacity": 0.98,
    },
  });

  map.addLayer({
    id: CIGARETTE_CLUSTER_CORE_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "circle-color": "#fff9e9",
      "circle-radius": [
        "step",
        ["get", "point_count"],
        21,
        20,
        25,
        100,
        29,
        500,
        33,
      ],
      "circle-stroke-color": "rgba(23, 35, 27, 0.45)",
      "circle-stroke-width": 1,
      "circle-opacity": 0.97,
    },
  });

  map.addLayer({
    id: CIGARETTE_CLUSTER_TAB_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "icon-image": FILTER_TAB_IMAGE_ID,
      "icon-offset": [0, -19],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
  });

  map.addLayer({
    id: CIGARETTE_CLUSTER_LABEL_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": [
        "concat",
        ["to-string", ["get", "point_count_abbreviated"]],
        "\nSITES · MAX\n",
        CIGARETTE_CLUSTER_VALUE_EXPRESSION,
        " CIG/DAY",
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 8.6,
      "text-line-height": 0.96,
      "text-letter-spacing": 0.015,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "text-color": "#17231b",
      "text-halo-color": "rgba(255, 249, 233, 0.72)",
      "text-halo-width": 0.45,
    },
  });

  map.addLayer({
    id: CIGARETTE_HIT_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "circle-color": "#17231b",
      "circle-radius": 22,
      "circle-opacity": 0.001,
    },
  });

  map.addLayer({
    id: CIGARETTE_SELECTION_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: selectedFilter(selectedStationId),
    layout: {
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "circle-color": "rgba(255, 249, 233, 0.96)",
      "circle-radius": 13,
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 3,
    },
  });

  map.addLayer({
    id: CIGARETTE_ANCHOR_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "circle-color": CATEGORY_COLOR_EXPRESSION,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5.5, 13, 7],
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 1.4,
      "circle-opacity": FRESHNESS_OPACITY_EXPRESSION,
    },
  });

  map.addLayer({
    id: CIGARETTE_LABEL_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: unselectedReadingFilter(selectedStationId),
    layout: {
      "icon-image": CIGARETTE_ICON_EXPRESSION,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [3, 10, 3, 10],
      "icon-allow-overlap": false,
      "icon-ignore-placement": false,
      "text-field": CIGARETTE_LABEL_EXPRESSION,
      "text-font": ["Noto Sans Regular"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        10,
        13,
        11,
      ],
      "text-line-height": 0.92,
      "text-letter-spacing": 0.01,
      "text-variable-anchor": [
        "top-left",
        "bottom-left",
        "top-right",
        "bottom-right",
      ],
      "text-radial-offset": 1.25,
      "text-justify": "auto",
      "text-padding": 7,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "symbol-sort-key": CIGARETTE_SORT_EXPRESSION,
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "icon-opacity": FRESHNESS_OPACITY_EXPRESSION,
      "text-color": "#17231b",
      "text-opacity": FRESHNESS_OPACITY_EXPRESSION,
      "text-halo-width": 0,
    },
  });

  map.addLayer({
    id: CIGARETTE_SELECTED_LABEL_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: selectedFilter(selectedStationId),
    layout: {
      "icon-image": CIGARETTE_ICON_EXPRESSION,
      "icon-size": 1.08,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [3, 11, 3, 11],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": [
        "concat",
        ["get", "equivalentLabel"],
        "\n",
        ["get", "equivalentUnitLabel"],
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11.5,
      "text-line-height": 0.92,
      "text-letter-spacing": 0.01,
      "text-variable-anchor": [
        "top-left",
        "bottom-left",
        "top-right",
        "bottom-right",
      ],
      "text-radial-offset": 1.45,
      "text-justify": "auto",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      visibility: layerVisibility(displayMode, "cigarettes"),
    },
    paint: {
      "icon-opacity": 1,
      "text-color": "#17231b",
      "text-opacity": 1,
      "text-halo-width": 0,
    },
  });

  applyDisplayMode(map, displayMode);
}

function errorDescription(error: MapErrorEvent): string {
  const message = error.error?.message?.toLowerCase() ?? "";
  if (message.includes("webgl")) {
    return "This browser could not start the interactive map. The monitor list still contains the same readings.";
  }
  return "The map background could not be loaded. The monitor list still contains the same readings.";
}

export function AirQualityMap({
  readings,
  selectedStationId,
  displayMode,
  onSelectStation,
  error,
  className,
}: AirQualityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef<MapFeatureCollection>(toMapData(readings));
  const selectedStationIdRef = useRef(selectedStationId);
  const displayModeRef = useRef(displayMode);
  const onSelectStationRef = useRef(onSelectStation);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const mapData = useMemo(() => toMapData(readings), [readings]);

  useEffect(() => {
    dataRef.current = mapData;
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(mapData);
  }, [mapData]);

  useEffect(() => {
    onSelectStationRef.current = onSelectStation;
  }, [onSelectStation]);

  useEffect(() => {
    selectedStationIdRef.current = selectedStationId;
    const map = mapRef.current;
    if (!map?.getLayer(AQI_SELECTION_LAYER_ID)) {
      return;
    }

    const selection = selectedFilter(selectedStationId);
    map.setFilter(AQI_SELECTION_LAYER_ID, selection);
    map.setFilter(CIGARETTE_SELECTION_LAYER_ID, selection);
    map.setFilter(CIGARETTE_SELECTED_LABEL_LAYER_ID, selection);
    map.setFilter(
      CIGARETTE_LABEL_LAYER_ID,
      unselectedReadingFilter(selectedStationId),
    );
    focusSelectedReading(map, dataRef.current, selectedStationId);
  }, [selectedStationId]);

  useEffect(() => {
    displayModeRef.current = displayMode;
    const map = mapRef.current;
    if (!map?.getLayer(AQI_READING_LABEL_LAYER_ID)) {
      return;
    }
    applyDisplayMode(map, displayMode);
  }, [displayMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE,
        bounds: NORTH_AMERICA_BOUNDS,
        fitBoundsOptions: { padding: 28, maxZoom: 4.2 },
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      });
    } catch {
      setMapError(
        "This browser could not start the interactive map. The monitor list still contains the same readings.",
      );
      return;
    }

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: false },
        showAccuracyCircle: true,
        showUserLocation: true,
        trackUserLocation: false,
      }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          'Air readings: <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer">AirNow</a>',
      }),
      "bottom-right",
    );

    const onLoad = () => {
      addMarkerImages(map);
      addReadingLayers(
        map,
        dataRef.current,
        selectedStationIdRef.current,
        displayModeRef.current,
      );
      focusSelectedReading(
        map,
        dataRef.current,
        selectedStationIdRef.current,
      );
      setMapError(null);
      setIsMapReady(true);
    };

    const onError = (event: MapErrorEvent) => {
      if (!map.isStyleLoaded()) {
        setMapError(errorDescription(event));
      }
    };

    const onClusterClick = async (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [AQI_CLUSTER_LAYER_ID, CIGARETTE_CLUSTER_RING_LAYER_ID],
      })[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      if (!feature || !Number.isFinite(clusterId) || feature.geometry.type !== "Point") {
        return;
      }

      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.easeTo({
        center: feature.geometry.coordinates as [number, number],
        zoom,
        duration: reduceMotion ? 0 : 420,
      });
    };

    const onReadingClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const stationId = feature?.properties?.stationId;
      if (typeof stationId === "string" && stationId.length > 0) {
        onSelectStationRef.current(stationId);
      }
    };

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointerCursor = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("load", onLoad);
    map.on("error", onError);

    for (const layerId of [
      AQI_CLUSTER_LAYER_ID,
      CIGARETTE_CLUSTER_RING_LAYER_ID,
    ]) {
      map.on("click", layerId, onClusterClick);
      map.on("mouseenter", layerId, setPointerCursor);
      map.on("mouseleave", layerId, clearPointerCursor);
    }

    for (const layerId of [
      AQI_READING_LAYER_ID,
      CIGARETTE_HIT_LAYER_ID,
      CIGARETTE_LABEL_LAYER_ID,
      CIGARETTE_SELECTED_LABEL_LAYER_ID,
    ]) {
      map.on("click", layerId, onReadingClick);
      map.on("mouseenter", layerId, setPointerCursor);
      map.on("mouseleave", layerId, clearPointerCursor);
    }

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const stateMessage = error
    ? {
        title: "Current readings unavailable",
        detail: `${error} Try refreshing this page.`,
        tone: "error" as const,
      }
    : mapError
      ? { title: "Map unavailable", detail: mapError, tone: "error" as const }
      : readings === null || !isMapReady
        ? {
            title: "Plotting current monitors",
            detail: "Loading the latest available PM2.5 observations.",
            tone: "loading" as const,
          }
        : readings.features.length === 0
          ? {
              title: "No current monitors to plot",
              detail:
                "Coverage can be sparse. An empty view does not mean the air is clean.",
              tone: "empty" as const,
            }
          : null;

  return (
    <section
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-display-mode={displayMode}
      aria-label="Current air quality map"
      aria-busy={readings === null}
    >
      <div ref={containerRef} className={styles.map} />

      {stateMessage ? (
        <div className={styles.stateLayer} aria-live="polite">
          <div
            className={`${styles.stateNote} ${
              stateMessage.tone === "error" ? styles.stateError : ""
            }`}
          >
            <span className={styles.stateTitle}>{stateMessage.title}</span>
            <span className={styles.stateDetail}>{stateMessage.detail}</span>
          </div>
        </div>
      ) : null}

      <aside
        className={styles.desktopLegend}
        aria-label={
          displayMode === "cigarettes"
            ? "Cigarette-equivalent field key"
            : "AQI category key"
        }
      >
        <span className={styles.legendHeading}>
          {displayMode === "cigarettes"
            ? "Cigarette-equivalent field key"
            : "AQI field key"}
        </span>
        {displayMode === "cigarettes" ? (
          <CigaretteLegendItems />
        ) : (
          <AqiLegendItems />
        )}
      </aside>

      <details className={styles.mobileLegend}>
        <summary>
          {displayMode === "cigarettes"
            ? "Cigarette-equivalent field key"
            : "AQI field key"}
        </summary>
        {displayMode === "cigarettes" ? (
          <CigaretteLegendItems />
        ) : (
          <AqiLegendItems />
        )}
      </details>

      <div className={styles.scaleNote} aria-hidden="true">
        <span className={styles.scaleRule} />
        <span>
          {displayMode === "cigarettes"
            ? "N. America · cigarette-equivalent / day"
            : "North America · current monitors"}
        </span>
      </div>
    </section>
  );
}
