/**
 * The grid transform is what stops a Wikidata match landing on the wrong place,
 * so its accuracy claim is pinned here against cities whose position is known
 * independently of anything in this repo.
 */
const { parseGrid, gridToWgs84, distanceKm, coordToWgs84 } = require("../../tools/lib/palgrid.js");

describe("parseGrid", () => {
  it("splits the run-together easting and northing", () => {
    // Acre's grid square is 156/258.
    expect(parseGrid("1566.2583")).toEqual({ easting: 156.6, northing: 258.3 });
  });

  it("ignores the float noise the spreadsheet appended", () => {
    expect(parseGrid("1566.2583999999999")).toEqual({ easting: 156.6, northing: 258.3 });
  });

  it("handles a three-digit easting", () => {
    // Gaza sits at 099/101, stored as "996.1014".
    expect(parseGrid("996.10149999999999")).toEqual({ easting: 99.6, northing: 101.4 });
  });

  it("returns null for anything that is not a grid reference", () => {
    expect(parseGrid("")).toBeNull();
    expect(parseGrid("n/a")).toBeNull();
    expect(parseGrid(null)).toBeNull();
    expect(parseGrid("1566")).toBeNull();
  });
});

describe("gridToWgs84", () => {
  // lat/lon from independent sources, not from this codebase.
  const CITIES = [
    ["Acre", "1566.2583", 32.928, 35.075],
    ["Nablus", "1751.1804", 32.221, 35.261],
    ["Jaffa", "1266.1624", 32.054, 34.75],
    ["Safed", "1966.2635", 32.965, 35.497],
    ["Gaza", "996.1014", 31.517, 34.45],
  ];

  it.each(CITIES)("places %s within 3 km of its real position", (_name, coord, lat, lon) => {
    const got = coordToWgs84(coord);
    expect(distanceKm(got, { lat, lon })).toBeLessThan(3);
  });

  it("is accurate enough to separate places a match gate must tell apart", () => {
    // باب الخليل (a gate in Jerusalem) vs الخليل (the city) — the exact pair that
    // slipped through when matching on name alone.
    const jerusalem = coordToWgs84("1721.1313");
    const hebron = { lat: 31.5326, lon: 35.0998 };
    expect(distanceKm(jerusalem, hebron)).toBeGreaterThan(5);
  });

  it("returns null for an unparseable coordinate", () => {
    expect(coordToWgs84("")).toBeNull();
  });
});

describe("distanceKm", () => {
  it("is zero for a point against itself", () => {
    expect(distanceKm({ lat: 32, lon: 35 }, { lat: 32, lon: 35 })).toBe(0);
  });

  it("treats a missing point as infinitely far, so it never counts as a match", () => {
    expect(distanceKm(null, { lat: 32, lon: 35 })).toBe(Infinity);
  });
});
