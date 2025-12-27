import { XMLParser } from 'fast-xml-parser';
import proj4 from 'proj4';
import type { Feature, Geometry, Polygon, MultiPolygon, Position } from 'geojson';

// Define EPSG:3879 (ETRS-GK25) - used by Espoo
proj4.defs('EPSG:3879',
  '+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 ' +
  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);

export function parseGMLFeatureCollection(gmlXml: string): Feature[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => {
      // These elements can appear multiple times
      return name === 'gml:featureMember' || 
             name === 'gml:pos' ||
             name === 'kanta:sijainnit' ||
             name === 'kanta:Sijainti';
    }
  });

  const parsed = parser.parse(gmlXml);
  const featureMembers = parsed['wfs:FeatureCollection']['gml:featureMember'];
  
  if (!Array.isArray(featureMembers)) {
    return [];
  }

  const features: Feature[] = [];

  for (const member of featureMembers) {
    const feature = member['kanta:TilastollinenAlue'];
    if (!feature) continue;

    try {
      const geometry = extractGeometry(feature);
      const properties = parseGMLProperties(feature);

      if (geometry) {
        features.push({
          type: 'Feature',
          geometry,
          properties
        });
      }
    } catch {
      // Skip features that fail to parse
      continue;
    }
  }

  return features;
}

// Extract geometry from feature, handling various structures
function extractGeometry(feature: any): Geometry | null {
  const sijainnit = feature['kanta:sijainnit'];
  if (!sijainnit) return null;

  // sijainnit can be an array or single object
  const sijainnitArray = Array.isArray(sijainnit) ? sijainnit : [sijainnit];
  
  const polygons: Position[][][] = [];

  for (const sijaintiContainer of sijainnitArray) {
    const sijaintiList = sijaintiContainer['kanta:Sijainti'];
    if (!sijaintiList) continue;

    // Sijainti can be an array or single object
    const sijaintiArray = Array.isArray(sijaintiList) ? sijaintiList : [sijaintiList];

    for (const sijainti of sijaintiArray) {
      const alue = sijainti['kanta:alue'];
      if (!alue) continue;

      const polygon = parseGMLGeometry(alue);
      if (polygon && polygon.type === 'Polygon') {
        polygons.push((polygon as Polygon).coordinates);
      }
    }
  }

  if (polygons.length === 0) return null;
  if (polygons.length === 1) {
    return { type: 'Polygon', coordinates: polygons[0] };
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function parseGMLProperties(feature: any): any {
  return {
    tunnus: feature['kanta:tunnus'],
    nimi: feature['kanta:nimi'],
    tyyppi: feature['kanta:tyyppi']
  };
}

function parseGMLGeometry(gmlGeometry: any): Geometry | null {
  if (!gmlGeometry) return null;

  const polygon = gmlGeometry['gml:Polygon'];
  if (polygon) {
    return parsePolygon(polygon);
  }

  const multiPolygon = gmlGeometry['gml:MultiPolygon'];
  if (multiPolygon) {
    return parseMultiPolygon(multiPolygon);
  }

  // Handle PolyhedralSurface (used by some Espoo zones)
  const polyhedralSurface = gmlGeometry['gml:PolyhedralSurface'];
  if (polyhedralSurface) {
    const result = parsePolyhedralSurface(polyhedralSurface);
    return result;
  }

  return null;
}

function parsePolyhedralSurface(surface: any): Polygon | null {
  const patches = surface['gml:polygonPatches'];
  if (!patches) return null;

  const patch = patches['gml:PolygonPatch'];
  if (!patch) return null;

  const exterior = patch['gml:exterior'];
  if (!exterior) return null;

  const ring = exterior['gml:Ring'];
  if (!ring) return null;

  const curveMember = ring['gml:curveMember'];
  if (!curveMember) return null;

  const curve = curveMember['gml:Curve'];
  if (!curve) return null;

  const segments = curve['gml:segments'];
  if (!segments) return null;

  const lineStringSegment = segments['gml:LineStringSegment'];
  if (!lineStringSegment) {
    return null;
  }

  // LineStringSegment can be array or single object
  const segmentArray = Array.isArray(lineStringSegment) ? lineStringSegment : [lineStringSegment];
  
  // Collect all gml:pos from all segments
  const allPosElements: string[] = [];
  for (const segment of segmentArray) {
    const posElements = segment['gml:pos'];
    if (posElements) {
      if (Array.isArray(posElements)) {
        allPosElements.push(...posElements);
      } else {
        allPosElements.push(posElements);
      }
    }
  }

  if (allPosElements.length === 0) {
    return null;
  }

  const coords = parsePosElements(allPosElements);
  if (coords.length < 4) {
    return null;
  }

  // Close the ring if not already closed
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first]);
  }

  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}

function parsePolygon(polygon: any): Polygon | null {
  const linearRing = polygon['gml:exterior']['gml:LinearRing'];
  if (!linearRing) return null;

  let coords: Position[];

  // Handle gml:posList format (space-separated coordinates)
  if (linearRing['gml:posList']) {
    const posList = linearRing['gml:posList'];
    coords = parsePosList(posList['#text'] || posList);
  }
  // Handle individual gml:pos elements (Espoo format)
  else if (linearRing['gml:pos']) {
    coords = parsePosElements(linearRing['gml:pos']);
  }
  else {
    return null;
  }

  if (coords.length < 4) return null;

  // Close the ring if not already closed
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first]);
  }

  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}

function parseMultiPolygon(multiPolygon: any): Polygon | MultiPolygon | null {
  const polygonMembers = multiPolygon['gml:polygonMember'];
  if (!Array.isArray(polygonMembers)) return null;

  const polygons: Position[][][] = [];

  for (const member of polygonMembers) {
    const polygon = parsePolygon(member['gml:Polygon']);
    if (polygon) {
      polygons.push(polygon.coordinates);
    }
  }

  if (polygons.length === 0) return null;
  if (polygons.length === 1) {
    return {
      type: 'Polygon',
      coordinates: polygons[0]
    };
  }

  return {
    type: 'MultiPolygon',
    coordinates: polygons
  };
}

function parsePosList(posList: string): Position[] {
  const coords = posList.trim().split(/\s+/);
  const positions: Position[] = [];

  for (let i = 0; i < coords.length; i += 2) {
    if (i + 1 < coords.length) {
      const x = parseFloat(coords[i]);
      const y = parseFloat(coords[i + 1]);
      
      if (!isNaN(x) && !isNaN(y)) {
        // Convert from EPSG:3879 to EPSG:4326 (WGS84)
        const [lon, lat] = proj4('EPSG:3879', 'EPSG:4326', [x, y]);
        positions.push([lon, lat]);
      }
    }
  }

  return positions;
}

// Parse individual gml:pos elements (used by Espoo WFS)
function parsePosElements(posElements: string | string[]): Position[] {
  const positions: Position[] = [];
  
  // Ensure we have an array
  const elements = Array.isArray(posElements) ? posElements : [posElements];
  
  for (const pos of elements) {
    const coords = pos.trim().split(/\s+/);
    if (coords.length >= 2) {
      const x = parseFloat(coords[0]);
      const y = parseFloat(coords[1]);
      
      if (!isNaN(x) && !isNaN(y)) {
        // Convert from EPSG:3879 to EPSG:4326 (WGS84)
        const [lon, lat] = proj4('EPSG:3879', 'EPSG:4326', [x, y]);
        positions.push([lon, lat]);
      }
    }
  }

  return positions;
}
