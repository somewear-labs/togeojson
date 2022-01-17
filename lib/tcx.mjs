import htmlparser2 from "htmlparser2";
import { find, innerText, getElementsByTagName, isTag } from "domutils";

export function get1(x, y, recurse = true) {
  const n = getElementsByTagName(y, x, recurse);
  return n.length ? n[0] : null;
}

export function nodeVal(x) {
  return x ? innerText(x) || "" : "";
}

const TRACKPOINT_ATTRIBUTES = {
  heartRate: "heartRates",
  Cadence: "cadences",
  // Extended Trackpoint attributes
  Speed: "speeds",
  Watts: "watts",
};

const LAP_ATTRIBUTES = {
  TotalTimeSeconds: "totalTimeSeconds",
  DistanceMeters: "distanceMeters",
  MaximumSpeed: "maxSpeed",
  AverageHeartRateBpm: "avgHeartRate",
  MaximumHeartRateBpm: "maxHeartRate",

  // Extended Lap attributes
  AvgSpeed: "avgSpeed",
  AvgWatts: "avgWatts",
  MaxWatts: "maxWatts",
};

function fromEntries(arr) {
  const obj = {};
  for (const [key, value] of arr) {
    obj[key] = value;
  }
  return obj;
}

function getProperties(node, attributeNames, recurse) {
  const properties = [];

  find(
    (elem) => {
      if (!isTag(elem)) return;
      const tagName = elem.name.includes(":")
        ? elem.name.split(":")[1]
        : elem.name;
      if (tagName in attributeNames) {
        const val = parseFloat(nodeVal(elem));
        if (!isNaN(val)) {
          properties.push([attributeNames[tagName], val]);
        }
      }
    },
    node.children,
    recurse
  );

  return properties;
}

function coordPair(x) {
  const lon = nodeVal(get1(x, "LongitudeDegrees"));
  const lat = nodeVal(get1(x, "LatitudeDegrees"));
  if (!lon.length || !lat.length) {
    return null;
  }
  const ll = [parseFloat(lon), parseFloat(lat)];
  const alt = get1(x, "AltitudeMeters");
  const heartRate = get1(x, "HeartRateBpm");
  const time = get1(x, "Time");
  let a;
  if (alt) {
    a = parseFloat(nodeVal(alt));
    if (!isNaN(a)) {
      ll.push(a);
    }
  }
  return {
    coordinates: ll,
    time: time ? nodeVal(time) : null,
    heartRate: heartRate ? parseFloat(nodeVal(heartRate)) : null,
    extensions: getProperties(x, TRACKPOINT_ATTRIBUTES, true),
  };
}

function getPoints(node, pointname) {
  const pts = getElementsByTagName(pointname, node);
  const line = [];
  const times = [];
  const heartRates = [];
  if (pts.length < 2) return null; // Invalid line in GeoJSON
  const result = { extendedProperties: {} };
  for (let i = 0; i < pts.length; i++) {
    const c = coordPair(pts[i]);
    if (c === null) continue;
    line.push(c.coordinates);
    if (c.time) times.push(c.time);
    if (c.heartRate) heartRates.push(c.heartRate);
    for (const [alias, value] of c.extensions) {
      if (!result.extendedProperties[alias]) {
        result.extendedProperties[alias] = Array(pts.length).fill(null);
      }
      result.extendedProperties[alias][i] = value;
    }
  }
  return Object.assign(result, {
    line: line,
    times: times,
    heartRates: heartRates,
  });
}

function getLap(node) {
  const segments = getElementsByTagName("Track", node);
  const track = [];
  const times = [];
  const heartRates = [];
  const allExtendedProperties = [];
  let line;
  const lap = getElementsByTagName("Lap", node)[0];
  const properties = lap
    ? fromEntries(getProperties(lap, LAP_ATTRIBUTES, false))
    : {};

  const nameElement = get1(node, "Name");
  if (nameElement) {
    properties.name = nodeVal(nameElement);
  }

  for (let i = 0; i < segments.length; i++) {
    line = getPoints(segments[i], "Trackpoint");
    if (line) {
      track.push(line.line);
      if (line.times.length) times.push(line.times);
      if (line.heartRates.length) heartRates.push(line.heartRates);
      allExtendedProperties.push(line.extendedProperties);
    }
  }
  for (let i = 0; i < allExtendedProperties.length; i++) {
    const extendedProperties = allExtendedProperties[i];
    for (const property in extendedProperties) {
      if (segments.length === 1) {
        properties[property] = line.extendedProperties[property];
      } else {
        if (!properties[property]) {
          properties[property] = track.map((track) =>
            Array(track.length).fill(null)
          );
        }
        properties[property][i] = extendedProperties[property];
      }
    }
  }
  if (track.length === 0) return;

  if (times.length || heartRates.length) {
    properties.coordinateProperties = Object.assign(
      times.length
        ? {
            times: track.length === 1 ? times[0] : times,
          }
        : {},
      heartRates.length
        ? {
            heart: track.length === 1 ? heartRates[0] : heartRates,
          }
        : {}
    );
  }

  return {
    type: "Feature",
    properties: properties,
    geometry: {
      type: track.length === 1 ? "LineString" : "MultiLineString",
      coordinates: track.length === 1 ? track[0] : track,
    },
  };
}

export function* tcxGen(doc) {
  const laps = getElementsByTagName("Lap", doc);

  for (let i = 0; i < laps.length; i++) {
    const feature = getLap(laps[i]);
    if (feature) yield feature;
  }

  const courses = getElementsByTagName("Courses", doc);

  for (let i = 0; i < courses.length; i++) {
    const feature = getLap(courses[i]);
    if (feature) yield feature;
  }
}

export function tcx(str) {
  const doc = htmlparser2.parseDocument(str, {
    xmlMode: true,
  });
  return {
    type: "FeatureCollection",
    features: Array.from(tcxGen(doc)),
  };
}
