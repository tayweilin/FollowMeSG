/**
 * OneMap API Integration
 * Provides location search, reverse geocoding, and landmark imagery
 */

const ONEMAP_API_BASE = 'https://www.onemap.gov.sg/api';

export interface OneMapLocation {
  SEARCHVAL: string;
  BLK_NO: string;
  ROAD_NAME: string;
  BUILDING: string;
  ADDRESS: string;
  POSTAL: string;
  X: string; // SVY21 X coordinate
  Y: string; // SVY21 Y coordinate
  LATITUDE: string;
  LONGITUDE: string;
}

export interface OneMapTheme {
  NAME: string;
  CATEGORY: string;
  DESCRIPTION: string;
  ADDRESSPOSTALCODE: string;
  ADDRESSSTREETNAME: string;
  Lat: string;
  Lng: string;
  ICON_NAME: string;
  PHOTOURL?: string; // Some themes have photo URLs
}

export interface OneMapRoute {
  route_instructions: Array<{
    instruction: string;
    distance: number;
    time: number;
    road: string;
  }>;
  route_geometry: string; // Encoded polyline
  total_distance: number;
  total_time: number;
}

/**
 * Search for locations by query
 */
export async function searchLocation(query: string): Promise<OneMapLocation[]> {
  try {
    const response = await fetch(
      `${ONEMAP_API_BASE}/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y`
    );

    if (!response.ok) {
      throw new Error(`OneMap API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching location:', error);
    return [];
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(lat: number, lng: number): Promise<OneMapLocation | null> {
  try {
    const response = await fetch(
      `${ONEMAP_API_BASE}/public/revgeocode?location=${lat},${lng}&buffer=10&addressType=All`
    );

    if (!response.ok) {
      throw new Error(`OneMap API error: ${response.status}`);
    }

    const data = await response.json();
    return data.GeocodeInfo?.[0] || null;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Get nearby landmarks/POIs by theme
 * Available themes: hotels, attractions, museums, nationalmonuments, etc.
 */
export async function getNearbyLandmarks(
  lat: number,
  lng: number,
  theme: string = 'all',
  radius: number = 500
): Promise<OneMapTheme[]> {
  try {
    const response = await fetch(
      `${ONEMAP_API_BASE}/public/themesvc/retrieveTheme?queryName=${theme}&lat=${lat}&lng=${lng}&radius=${radius}`
    );

    if (!response.ok) {
      throw new Error(`OneMap API error: ${response.status}`);
    }

    const data = await response.json();
    return data.SrchResults || [];
  } catch (error) {
    console.error('Error fetching nearby landmarks:', error);
    return [];
  }
}

/**
 * Get walking/driving route between two points
 */
export async function getRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  mode: 'walk' | 'drive' | 'pt' = 'walk' // walk, drive, or public transport
): Promise<OneMapRoute | null> {
  try {
    const response = await fetch(
      `${ONEMAP_API_BASE}/public/routingsvc/route?start=${startLat},${startLng}&end=${endLat},${endLng}&routeType=${mode}`
    );

    if (!response.ok) {
      throw new Error(`OneMap API error: ${response.status}`);
    }

    const data = await response.json();
    return data.route_geometry ? data : null;
  } catch (error) {
    console.error('Error fetching route:', error);
    return null;
  }
}

/**
 * Convert SVY21 coordinates to WGS84 (Lat/Lng)
 */
export async function convertSVY21toWGS84(x: number, y: number): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `${ONEMAP_API_BASE}/common/convert/3414to4326?X=${x}&Y=${y}`
    );

    if (!response.ok) {
      throw new Error(`OneMap API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      lat: parseFloat(data.latitude),
      lng: parseFloat(data.longitude)
    };
  } catch (error) {
    console.error('Error converting coordinates:', error);
    return null;
  }
}

/**
 * Get static map image URL
 */
export function getStaticMapUrl(
  lat: number,
  lng: number,
  zoom: number = 17,
  width: number = 512,
  height: number = 512,
  markers?: Array<{ lat: number; lng: number; color?: string; label?: string }>
): string {
  let url = `${ONEMAP_API_BASE}/staticmap/getStaticImage?layerchosen=default&lat=${lat}&lng=${lng}&zoom=${zoom}&width=${width}&height=${height}`;
  
  if (markers && markers.length > 0) {
    const markerParams = markers.map((m, i) => 
      `&marker=latLng:${m.lat},${m.lng}|label:${m.label || i + 1}|colour:${m.color || 'red'}`
    ).join('');
    url += markerParams;
  }
  
  return url;
}

/**
 * Get popular landmark themes for POI discovery
 */
export const LANDMARK_THEMES = {
  attractions: 'nationalparks',
  museums: 'museums',
  monuments: 'nationalmonuments',
  hotels: 'hotels',
  hawkerCentres: 'hawkercentres',
  schools: 'schools',
  libraries: 'libraries',
  communityClubs: 'communityclubs',
  polyclinics: 'polyclinics',
  childcare: 'childcare',
  eldercare: 'eldercare',
  airports: 'airports',
  mrt: 'mrtexits',
  parks: 'parks',
} as const;

/**
 * Decode Google Polyline (OneMap uses Google's polyline format)
 */
export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Get visual landmark for cognitive guidance
 * Returns the most prominent landmark near a location
 */
export async function getVisualLandmark(lat: number, lng: number): Promise<{
  name: string;
  category: string;
  distance: number;
  imageUrl?: string;
  description?: string;
} | null> {
  try {
    // Try multiple theme categories to find a good visual landmark
    const themes = [
      'nationalmonuments',
      'museums', 
      'attractions',
      'hawkercentres',
      'communityclubs',
      'libraries'
    ];

    for (const theme of themes) {
      const landmarks = await getNearbyLandmarks(lat, lng, theme, 100);
      
      if (landmarks.length > 0) {
        const nearest = landmarks[0];
        const distance = calculateDistance(
          lat, lng,
          parseFloat(nearest.Lat),
          parseFloat(nearest.Lng)
        );

        return {
          name: nearest.NAME,
          category: nearest.CATEGORY || theme,
          distance: Math.round(distance),
          imageUrl: nearest.PHOTOURL,
          description: nearest.DESCRIPTION
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding visual landmark:', error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}
