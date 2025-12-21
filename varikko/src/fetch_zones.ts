import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';

const WFS_URL = 'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';
const DATA_DIR = path.resolve(__dirname, '../data');
const OUT_FILE = path.join(DATA_DIR, 'zones.geojson');

async function main() {
  try {
    console.log(`Fetching data from ${WFS_URL}...`);
    const response = await axios.get(WFS_URL, {
      responseType: 'json',
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const geojson = response.data;
    console.log(`Downloaded ${geojson.features.length} features.`);

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Process features: Calculate properties and centroids
    // We want to keep: posti_alue (code), nimi (name)
    // And add: centroid coordinates
    
    const processedFeatures = geojson.features.map((feature: any) => {
      // Properties in Paavo data: "posti_alue" (e.g. "00100"), "nimi" (e.g. "Helsinki Keskusta"), etc.
      // Note: verify exact property names. Usually 'postinumeroalue', 'nimi' in Paavo.
      // 2024 WFS might use 'postinumeroalue' or 'posti_alue'. We'll inspect or safe-guard.
      
      const props = feature.properties;
      const code = props.postinumeroalue || props.posti_alue;
      const name = props.nimi;

      if (!code) {
        console.warn('Feature missing postal code:', props);
        return null; // Skip invalid
      }

      // Filter for Capital Region only (Helsinki, Espoo, Vantaa - 00, 01, 02)
      if (!code.match(/^(00|01|02)/)) {
        return null;
      }

      // Calculate centroid
      // Turbo centroid for polygon
      let centroid = null;

      try {
        const center = turf.centroid(feature);
        centroid = center.geometry.coordinates; // [lon, lat]
      } catch (e) {
        console.warn(`Failed to calc centroid for ${code}`);
      }

      return {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          id: code,
          name: name,
          centroid: centroid, 
          // Keep original props? Maybe filter to save space.
          // For now, let's keep only essential.
        }
      };
    }).filter((f: any) => f !== null);

    const outputGeoJSON = {
      type: 'FeatureCollection',
      features: processedFeatures
    };

    fs.writeFileSync(OUT_FILE, JSON.stringify(outputGeoJSON));
    console.log(`Saved ${processedFeatures.length} zones to ${OUT_FILE}`);

  } catch (error) {
    console.error('Error fetching zones:', error);
    process.exit(1);
  }
}

main();
