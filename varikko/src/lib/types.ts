import type { Feature, Geometry } from 'geojson';

export type CityCode = 'HEL' | 'VAN' | 'ESP' | 'KAU';

export const CITY_CODES = {
  HELSINKI: 'HEL' as CityCode,
  VANTAA: 'VAN' as CityCode,
  ESPOO: 'ESP' as CityCode,
  KAUNIAINEN: 'KAU' as CityCode,
} as const;

export const CITY_NAME_MAP: Record<string, string> = {
  'HEL': 'Helsinki',
  'VAN': 'Vantaa',
  'ESP': 'Espoo',
  'KAU': 'Kauniainen',
};

export interface StandardZone {
  originalId: string;
  cityCode: CityCode;
  city: string;
  name: string;
  nameSe?: string;
  adminLevel: string;
  geometry: Geometry;
  metadata?: {
    area?: number;
    sourceLayer: string;
    [key: string]: unknown;
  };
}

export interface ZoneData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  geometry: string;
  svg_path: string;
  city?: string;
  name_se?: string;
  admin_level?: string;
  source_layer?: string;
}

export interface CityFetcher {
  cityCode: CityCode;
  cityName: string;
  fetchFeatures(): Promise<Feature[]>;
  parseFeature(feature: Feature): StandardZone;
}
