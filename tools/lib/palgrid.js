// Palestine Grid 1923 -> WGS84.
//
// The workbook records a grid reference for 87% of its rows, which is the only
// independent check we have on a Wikidata match: label matching alone cheerfully
// pairs باب الخليل ("Hebron Gate", in Jerusalem) with الخليل, the city 30 km away.
//
// The grid is a Cassini-Soldner projection on the Palestine 1923 datum, but a
// full inverse plus datum shift is more machinery than this needs. Anchoring a
// local linear approximation at the projection origin lands within ~2 km
// anywhere in the country, verified against six independently known cities in
// test/unit/palgrid.test.js. That is ample for a 5 km match gate; it is NOT
// accurate enough to publish as a coordinate, and nothing here does.

// Projection origin: 31°44'02.749"N, 35°12'43.490"E at E=170251.555, N=126867.909.
const E0 = 170.251555; // km
const N0 = 126.867909; // km
const LAT0 = 31.734097;
const LON0 = 35.212081;

const KM_PER_DEG_LAT = 110.95;
const KM_PER_DEG_LON = 111.32;
const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Decode the workbook's coordinate cell.
 *
 * It stores a grid reference in units of 100 m with the two halves run together
 * either side of the decimal point: "1566.2583" is easting 156.6 km, northing
 * 258.3 km — Acre's known grid square. Northings carry trailing float noise
 * ("2583999999999") so only the leading digits are meaningful.
 */
function parseGrid(coord) {
  const m = /^(\d{2,4})\.(\d+)$/.exec(String(coord == null ? "" : coord).trim());
  if (!m) return null;
  const easting = Number(m[1]) / 10;
  const northing = Number(m[2].slice(0, 4).padEnd(4, "0")) / 10;
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  return { easting, northing };
}

/** Grid kilometres -> approximate WGS84 degrees. */
function gridToWgs84(grid) {
  if (!grid) return null;
  const lat = LAT0 + (grid.northing - N0) / KM_PER_DEG_LAT;
  const lon = LON0 + (grid.easting - E0) / (KM_PER_DEG_LON * Math.cos(rad(lat)));
  return { lat, lon };
}

/** Great-circle-ish distance in km; fine at this scale. */
function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const dLat = (a.lat - b.lat) * KM_PER_DEG_LAT;
  const dLon = (a.lon - b.lon) * KM_PER_DEG_LON * Math.cos(rad((a.lat + b.lat) / 2));
  return Math.hypot(dLat, dLon);
}

/** Convenience: workbook coordinate cell -> {lat, lon}, or null. */
function coordToWgs84(coord) {
  return gridToWgs84(parseGrid(coord));
}

module.exports = { parseGrid, gridToWgs84, distanceKm, coordToWgs84 };
