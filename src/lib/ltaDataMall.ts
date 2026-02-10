/**
 * LTA DataMall API Integration
 * Provides bus stop information, bus arrival times, and imagery
 * 
 * API Documentation: https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html
 */

// ✅ FIXED: Use HTTPS instead of HTTP
const LTA_API_BASE = 'https://datamall2.mytransport.sg/ltaodataservice';
const LTA_API_KEY = process.env.NEXT_PUBLIC_LTA_API_KEY || '';

// ⚠️ Check if API key is configured
if (!LTA_API_KEY) {
  console.warn('⚠️ LTA API Key not configured. Set NEXT_PUBLIC_LTA_API_KEY in .env.local');
}

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
  if (!LTA_API_KEY) {
    console.error('LTA API Key not configured');
    return [];
  }

  try {
    const response = await fetch(`${LTA_API_BASE}/BusStops?$skip=${skip}`, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`LTA API error: ${response.status}`, errorText);
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
  if (!LTA_API_KEY) {
    console.error('LTA API Key not configured');
    return null;
  }

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
 * ⚠️ Note: This fetches ALL stops and filters client-side (can be slow)
 */
export async function fetchNearbyBusStops(
  lat: number, 
  lng: number, 
  radiusMeters: number = 500
): Promise<BusStop[]> {
  if (!LTA_API_KEY) {
    console.error('LTA API Key not configured');
    return [];
  }

  try {
    // LTA DataMall doesn't support geospatial queries directly
    // We need to fetch all stops and filter client-side
    // ✅ OPTIMIZATION: Fetch in batches and stop early if we find enough nearby stops
    
    let allStops: BusStop[] = [];
    let skip = 0;
    const batchSize = 500;
    const maxBatches = 10; // Limit to prevent infinite loops
    let batchCount = 0;

    while (batchCount < maxBatches) {
      const batch = await fetchBusStops(skip);
      if (batch.length === 0) break; // No more data
      
      allStops = [...allStops, ...batch];
      
      // Early exit if we have enough nearby stops
      const nearby = allStops.filter(stop => {
        const distance = calculateDistance(lat, lng, stop.Latitude, stop.Longitude);
        return distance <= radiusMeters;
      });
      
      if (nearby.length >= 5) {
        // Found enough nearby stops, no need to fetch more
        return nearby.sort((a, b) => {
          const distA = calculateDistance(lat, lng, a.Latitude, a.Longitude);
          const distB = calculateDistance(lat, lng, b.Latitude, b.Longitude);
          return distA - distB;
        }).slice(0, 10); // Return top 10 closest
      }
      
      skip += batchSize;
      batchCount++;
    }
    
    // Filter and sort all stops by distance
    return allStops.filter(stop => {
      const distance = calculateDistance(lat, lng, stop.Latitude, stop.Longitude);
      return distance <= radiusMeters;
    }).sort((a, b) => {
      const distA = calculateDistance(lat, lng, a.Latitude, a.Longitude);
      const distB = calculateDistance(lat, lng, b.Latitude, b.Longitude);
      return distA - distB;
    }).slice(0, 10); // Return top 10 closest
    
  } catch (error) {
    console.error('Error fetching nearby bus stops:', error);
    return [];
  }
}

/**
 * Fetch bus arrival times for a stop
 */
export async function fetchBusArrivals(busStopCode: string): Promise<BusArrival[]> {
  if (!LTA_API_KEY) {
    console.error('LTA API Key not configured');
    return [];
  }

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
  if (!LTA_API_KEY) {
    console.error('LTA API Key not configured');
    return [];
  }

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

/**
 * ✅ Test LTA API connection
 * Run this to verify your API key is working
 */
export async function testLTAConnection(): Promise<boolean> {
  if (!LTA_API_KEY) {
    console.error('❌ LTA API Key not configured. Add NEXT_PUBLIC_LTA_API_KEY to .env.local');
    return false;
  }

  console.log('🔍 Testing LTA API connection...');
  console.log('API Key:', LTA_API_KEY.substring(0, 8) + '...');
  
  try {
    const response = await fetch(`${LTA_API_BASE}/BusStops?$skip=0&$top=1`, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ LTA API Error:', response.status, errorText);
      
      if (response.status === 401 || response.status === 403) {
        console.error('🔑 Invalid API Key. Please check your NEXT_PUBLIC_LTA_API_KEY');
      } else if (response.status === 404) {
        console.error('🔗 API endpoint not found. Check the URL is correct.');
      }
      
      return false;
    }

    const data = await response.json();
    console.log('✅ LTA API connection successful!');
    console.log('📊 Sample data:', data.value?.[0]);
    return true;
    
  } catch (error) {
    console.error('❌ Network error:', error);
    return false;
  }
}