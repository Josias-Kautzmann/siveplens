/** Helpers de geometria para cálculos de bounding box e zoom */

/** Achata as coordenadas de um Polygon ou MultiPolygon no nível de anel externo */
export function flattenCoords(geometry: { type: string; coordinates: unknown }): [number, number][] {
  const coords: [number, number][] = [];
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as [number, number][][];
    rings[0].forEach((c) => coords.push(c));
  } else if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as [number, number][][][];
    polys.forEach((poly) => poly[0].forEach((c) => coords.push(c)));
  }
  return coords;
}

/** Calcula o centro do bounding box de uma geometria */
export function getBBoxCenter(geometry: { type: string; coordinates: unknown }): [number, number] {
  const coords = flattenCoords(geometry);
  if (coords.length === 0) return [-54, -15];
  const lngs = coords.map((c) => c[0]);
  const lats  = coords.map((c) => c[1]);
  return [
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ];
}

/** Calcula a escala de zoom ideal para preencher o canvas do mapa */
export function getZoomScale(geometry: { type: string; coordinates: unknown }): number {
  const coords = flattenCoords(geometry);
  if (coords.length === 0) return 800;
  const lngs     = coords.map((c) => c[0]);
  const lats     = coords.map((c) => c[1]);
  const lngSpan  = Math.max(...lngs) - Math.min(...lngs);
  const latSpan  = Math.max(...lats) - Math.min(...lats);
  const targetFillRatio = 0.80;
  const scaleFromLng = (38 / Math.max(lngSpan, 0.5)) * 800 * targetFillRatio;
  const scaleFromLat = (38 / Math.max(latSpan, 0.5)) * 800 * targetFillRatio * (750 / 800);
  const raw = Math.round(Math.min(scaleFromLng, scaleFromLat));
  return Math.max(1500, Math.min(raw, 18000));
}
