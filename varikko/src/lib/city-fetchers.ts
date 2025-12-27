import axios from 'axios';
import type { Feature } from 'geojson';
import type { CityFetcher, StandardZone, CityCode } from './types';
import { parseGMLFeatureCollection } from './gml-parser';

export class HelsinkiFetcher implements CityFetcher {
  cityCode: CityCode = 'HEL';
  cityName = 'Helsinki';

  async fetchFeatures(): Promise<Feature[]> {
    const url = 'https://kartta.hel.fi/ws/geoserver/avoindata/wfs?' +
      'service=WFS&version=2.0.0&request=GetFeature&' +
      'typeName=avoindata:Maavesi_osa_alueet&' +
      'outputFormat=application/json&srsName=EPSG:4326';

    const response = await axios.get(url);
    return response.data.features;
  }

  parseFeature(feature: Feature): StandardZone {
    const props = feature.properties as any;
    return {
      originalId: props.tunnus,
      cityCode: this.cityCode,
      city: this.cityName,
      name: props.nimi_fi,
      nameSe: props.nimi_se,
      adminLevel: 'osa-alue',
      geometry: feature.geometry,
      metadata: {
        area: props.pa,
        sourceLayer: 'avoindata:Maavesi_osa_alueet'
      }
    };
  }
}

export class VantaaFetcher implements CityFetcher {
  cityCode: CityCode = 'VAN';
  cityName = 'Vantaa';

  async fetchFeatures(): Promise<Feature[]> {
    const url = 'https://gis.vantaa.fi/geoserver/wfs?' +
      'service=WFS&version=2.0.0&request=GetFeature&' +
      'typeName=indeksit:kaupunginosat&' +
      'outputFormat=application/json&srsName=EPSG:4326';

    const response = await axios.get(url);
    return response.data.features;
  }

  parseFeature(feature: Feature): StandardZone {
    const props = feature.properties as any;
    // Vantaa WFS has no tunnus/id - use kosanimi as unique identifier
    const name = props.kosanimi || props.nimi || '';
    return {
      originalId: name, // Use name as ID since no numeric tunnus exists
      cityCode: this.cityCode,
      city: this.cityName,
      name,
      nameSe: props.kosa_ruotsiksi || props.nimi_se,
      adminLevel: 'kaupunginosa',
      geometry: feature.geometry,
      metadata: {
        suuralue: props.suuralue,
        sourceLayer: 'indeksit:kaupunginosat'
      }
    };
  }
}

export class EspooFetcher implements CityFetcher {
  cityCode: CityCode = 'ESP';
  cityName = 'Espoo';

  async fetchFeatures(): Promise<Feature[]> {
    // Using statistical areas for better granularity
    const url = 'https://kartat.espoo.fi/teklaogcweb/wfs.ashx?' +
      'service=WFS&version=1.1.0&request=GetFeature&typeName=kanta:TilastollinenAlue';

    const response = await axios.get(url);
    // Response is GML XML, need to parse it
    const allFeatures = parseGMLFeatureCollection(response.data);
    
    // Filter to only include 'pienalue' (small areas)
    // Excludes 'suuralue' (compound areas like Suur-Tapiola) and 'tilastoalue'
    return allFeatures.filter(f => f.properties?.tyyppi === 'pienalue');
  }

  parseFeature(feature: Feature): StandardZone {
    const props = feature.properties as any;
    return {
      originalId: props.tunnus || props.id || '',
      cityCode: this.cityCode,
      city: this.cityName,
      name: props.nimi || '',
      nameSe: props.nimi_se, // May not be available
      adminLevel: 'pienalue',
      geometry: feature.geometry,
      metadata: {
        tyyppi: props.tyyppi,
        sourceLayer: 'kanta:TilastollinenAlue'
      }
    };
  }
}

export class KauniainenFetcher implements CityFetcher {
  cityCode: CityCode = 'KAU';
  cityName = 'Kauniainen';

  async fetchFeatures(): Promise<Feature[]> {
    // Kauniainen is small (10km²) - fetch entire municipality boundary
    // Using Statistics Finland's municipality layer, filtered for Kauniainen (code 235)
    const url = 'https://geo.stat.fi/geoserver/wfs?' +
      'service=WFS&version=2.0.0&request=GetFeature&' +
      'typeName=tilastointialueet:kunta1000k_2024&' +
      'outputFormat=application/json&srsName=EPSG:4326&' +
      'CQL_FILTER=kunta=\'235\'';

    const response = await axios.get(url);
    return response.data.features;
  }

  parseFeature(feature: Feature): StandardZone {
    const props = feature.properties as any;
    // Single zone covering entire city
    return {
      originalId: '001',
      cityCode: this.cityCode,
      city: this.cityName,
      name: props.nimi || 'Kauniainen',
      nameSe: props.namn || 'Grankulla',
      adminLevel: 'kunta',
      geometry: feature.geometry,
      metadata: {
        area: props.pinta_ala,
        kunta: props.kunta,
        sourceLayer: 'tilastointialueet:kunta1000k_2024'
      }
    };
  }
}

export const ALL_FETCHERS: CityFetcher[] = [
  new HelsinkiFetcher(),
  new VantaaFetcher(),
  new EspooFetcher(),
  new KauniainenFetcher(),
];

export function generateZoneId(cityCode: CityCode, originalId: string): string {
  return `${cityCode}-${originalId}`;
}
