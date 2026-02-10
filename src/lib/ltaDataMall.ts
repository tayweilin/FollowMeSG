/**
 * LTA DataMall API Integration
 * Provides bus stop information, bus arrival times, and imagery
 */

const LTA_API_BASE = 'http://datamall2.mytransport.sg/ltaodataservice';
const LTA_API_KEY = process.env.NEXT_PUBLIC_LTA_API_KEY || '';

export interface BusStop {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: number;
  Longitude: number;
}

export interface BusArrival {
  ServiceNo: string;
  NextBus: {
    EstimatedArrival: string;
    Load: 'SEA' | 'SDA' | 'LSD'; // Seats Available, Standing Available, Limited Standing
    Feature: string;
  };
  NextBus2: {
    EstimatedArrival: string;
    Load: 'SEA' | 'SDA' | 'LSD';
  };
}

export interface BusRoute {
  ServiceNo: string;
  Direction: number;
  StopSequence: number;
  BusStopCode: string;
  Distance: number;
}

/**
 * Fetch all bus stops from LTA DataMall
 */
export async function fetchBusStops(skip: number = 0): Promise<BusStop[]> {
  try {
    const response = await fetch(`${LTA_API_BASE}/BusStops?$skip=${skip}`, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`LTA API error: ${response.status}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching bus stops:', error);
    return [];
  }
}

/**
 * Fetch bus stop by code
 */
export async function fetchBusStopByCode(busStopCode: string): Promise<BusStop | null> {
  try {
    const response = await fetch(`${LTA_API_BASE}/BusStops?$filter=BusStopCode eq '${busStopCode}'`, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`LTA API error: ${response.status}`);
    }

    const data = await response.json();
    return data.value?.[0] || null;
  } catch (error) {
    console.error('Error fetching bus stop:', error);
    return null;
  }
}

/**
 * Fetch nearby bus stops within radius
 */
export async function fetchNearbyBusStops(
  lat: number, 
  lng: number, 
  radiusMeters: number = 500
): Promise<BusStop[]> {
  try {
    // LTA DataMall doesn't support geospatial queries directly
    // We need to fetch all stops and filter client-side
    const allStops = await fetchBusStops();
    
    return allStops.filter(stop => {
      const distance = calculateDistance(lat, lng, stop.Latitude, stop.Longitude);
      return distance <= radiusMeters;
    }).sort((a, b) => {
      const distA = calculateDistance(lat, lng, a.Latitude, a.Longitude);
      const distB = calculateDistance(lat, lng, b.Latitude, b.Longitude);
      return distA - distB;
    });
  } catch (error) {
    console.error('Error fetching nearby bus stops:', error);
    return [];
  }
}

/**
 * Fetch bus arrival times for a stop
 */
export async function fetchBusArrivals(busStopCode: string): Promise<BusArrival[]> {
  try {
    const response = await fetch(`${LTA_API_BASE}/BusArrivalv2?BusStopCode=${busStopCode}`, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`LTA API error: ${response.status}`);
    }

    const data = await response.json();
    return data.Services || [];
  } catch (error) {
    console.error('Error fetching bus arrivals:', error);
    return [];
  }
}

/**
 * Fetch bus route information
 */
export async function fetchBusRoute(serviceNo: string): Promise<BusRoute[]> {
  try {
    const response = await fetch(`${LTA_API_BASE}/BusRoutes?$filter=ServiceNo eq '${serviceNo}'`, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`LTA API error: ${response.status}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error fetching bus route:', error);
    return [];
  }
}

/**
 * Get crowd level description from bus load
 */
export function getCrowdLevel(load: 'SEA' | 'SDA' | 'LSD'): {
  level: 'low' | 'medium' | 'high';
  label: string;
  color: string;
  emoji: string;
} {
  switch (load) {
    case 'SEA':
      return { 
        level: 'low', 
        label: 'Seats Available', 
        color: 'text-green-600 bg-green-50',
        emoji: '🟢'
      };
    case 'SDA':
      return { 
        level: 'medium', 
        label: 'Standing Room', 
        color: 'text-yellow-600 bg-yellow-50',
        emoji: '🟡'
      };
    case 'LSD':
      return { 
        level: 'high', 
        label: 'Very Crowded', 
        color: 'text-red-600 bg-red-50',
        emoji: '🔴'
      };
    default:
      return { 
        level: 'medium', 
        label: 'Unknown', 
        color: 'text-gray-600 bg-gray-50',
        emoji: '⚪'
      };
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

  return R * c; // Distance in meters
}

/**
 * Get minutes until arrival
 */
export function getMinutesUntilArrival(estimatedArrival: string): number {
  const now = new Date();
  const arrival = new Date(estimatedArrival);
  const diffMs = arrival.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 60000)); // Convert to minutes
}

/**
 * Format arrival time for display
 */
export function formatArrivalTime(estimatedArrival: string): string {
  const minutes = getMinutesUntilArrival(estimatedArrival);
  
  if (minutes === 0) return 'Arriving';
  if (minutes === 1) return '1 min';
  return `${minutes} mins`;
}
