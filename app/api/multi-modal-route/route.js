// app/api/multi-modal-route/route.js
// Comprehensive routing API for Singapore public transport
// Provides fastest path with MRT stations, bus stops, and walking directions

import { NextResponse } from 'next/server';
import { mrtStations, findNearestStation, findStationsInRadius, haversineDistance, lineColors } from '../../data/mrtStations';

const LTA_API_KEY = process.env.LTA_API_KEY;
const ONEMAP_TOKEN = process.env.ONEMAP_TOKEN;

// Constants for routing decisions
const WALKING_SPEED_KMH = 4.5; // Average walking speed
const MAX_WALKING_DISTANCE_KM = 1.5; // Max distance before suggesting transport
const BUS_WAIT_TIME_MIN = 8; // Average bus wait time
const MRT_WAIT_TIME_MIN = 4; // Average MRT wait time
const TRANSFER_TIME_MIN = 5; // Time to transfer between modes

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startLat = parseFloat(searchParams.get('startLat'));
  const startLng = parseFloat(searchParams.get('startLng'));
  const destLat = parseFloat(searchParams.get('destLat'));
  const destLng = parseFloat(searchParams.get('destLng'));
  const mode = searchParams.get('mode') || 'fastest'; // fastest, walking, transit

  if (!startLat || !startLng || !destLat || !destLng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  try {
    const totalDistance = haversineDistance(startLat, startLng, destLat, destLng);
    
    // Calculate all possible routes
    const routes = await Promise.all([
      calculateWalkingRoute(startLat, startLng, destLat, destLng),
      calculateTransitRoute(startLat, startLng, destLat, destLng),
    ]);

    const [walkingRoute, transitRoute] = routes;

    // Determine best route based on mode and distance
    let recommendedRoute;
    
    if (mode === 'walking' || totalDistance <= MAX_WALKING_DISTANCE_KM) {
      recommendedRoute = walkingRoute;
    } else if (mode === 'transit') {
      recommendedRoute = transitRoute || walkingRoute;
    } else {
      // Fastest mode - compare estimated times
      const walkingTime = walkingRoute?.estimatedTime || Infinity;
      const transitTime = transitRoute?.estimatedTime || Infinity;
      
      recommendedRoute = transitTime < walkingTime ? transitRoute : walkingRoute;
    }

    return NextResponse.json({
      success: true,
      totalDistanceKm: totalDistance.toFixed(2),
      recommendedRoute,
      alternatives: {
        walking: walkingRoute,
        transit: transitRoute,
      },
      metadata: {
        startLocation: { lat: startLat, lng: startLng },
        destLocation: { lat: destLat, lng: destLng },
        calculatedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error("Multi-modal routing error:", error);
    return NextResponse.json({ 
      error: error.message,
      fallback: true 
    }, { status: 500 });
  }
}

// Calculate walking-only route
async function calculateWalkingRoute(startLat, startLng, destLat, destLng) {
  try {
    // Try OneMap first (best for Singapore)
    const oneMapRoute = await fetchOneMapWalkingRoute(startLat, startLng, destLat, destLng);
    if (oneMapRoute) return oneMapRoute;

    // Fallback to OSRM
    const osrmRoute = await fetchOSRMWalkingRoute(startLat, startLng, destLat, destLng);
    if (osrmRoute) return osrmRoute;

    // Final fallback - straight line
    return createStraightLineRoute(startLat, startLng, destLat, destLng);
  } catch (error) {
    console.error("Walking route error:", error);
    return createStraightLineRoute(startLat, startLng, destLat, destLng);
  }
}

// Calculate transit route (MRT + Bus + Walking)
async function calculateTransitRoute(startLat, startLng, destLat, destLng) {
  try {
    // Find nearest MRT stations to start and destination
    const startStations = findStationsInRadius(startLat, startLng, 1.5);
    const destStations = findStationsInRadius(destLat, destLng, 1.5);

    if (startStations.length === 0 || destStations.length === 0) {
      // No MRT nearby, try bus-only route
      return await calculateBusRoute(startLat, startLng, destLat, destLng);
    }

    // Find best MRT route
    const mrtRoute = await findBestMRTRoute(startStations, destStations);
    
    if (!mrtRoute) {
      return await calculateBusRoute(startLat, startLng, destLat, destLng);
    }

    // Build complete multi-modal route
    const steps = [];
    let totalTime = 0;
    let totalDistance = 0;

    // Step 1: Walk to start MRT station
    const walkToStation = await fetchOSRMWalkingRoute(
      startLat, startLng, 
      mrtRoute.startStation.lat, mrtRoute.startStation.lng
    );
    
    if (walkToStation && walkToStation.steps) {
      steps.push({
        type: 'walk',
        mode: 'walking',
        instruction: `Walk to ${mrtRoute.startStation.name} MRT Station`,
        distance: walkToStation.totalDistance,
        duration: walkToStation.estimatedTime,
        from: { lat: startLat, lng: startLng },
        to: { lat: mrtRoute.startStation.lat, lng: mrtRoute.startStation.lng },
        detailedSteps: walkToStation.steps,
        path: walkToStation.path,
      });
      totalTime += walkToStation.estimatedTime;
      totalDistance += parseFloat(walkToStation.totalDistance) || 0;
    }

    // Step 2: Take MRT
    const mrtStep = {
      type: 'mrt',
      mode: 'transit',
      instruction: `Take ${mrtRoute.line} Line from ${mrtRoute.startStation.name} to ${mrtRoute.endStation.name}`,
      line: mrtRoute.line,
      lineColor: lineColors[mrtRoute.line]?.color || '#666',
      lineName: lineColors[mrtRoute.line]?.name || mrtRoute.line,
      from: {
        name: mrtRoute.startStation.name,
        code: mrtRoute.startStation.code,
        lat: mrtRoute.startStation.lat,
        lng: mrtRoute.startStation.lng,
      },
      to: {
        name: mrtRoute.endStation.name,
        code: mrtRoute.endStation.code,
        lat: mrtRoute.endStation.lat,
        lng: mrtRoute.endStation.lng,
      },
      stops: mrtRoute.stops,
      duration: mrtRoute.estimatedTime,
      path: mrtRoute.path,
    };
    steps.push(mrtStep);
    totalTime += mrtRoute.estimatedTime + MRT_WAIT_TIME_MIN;

    // Step 3: Walk from destination MRT station to final destination
    const walkFromStation = await fetchOSRMWalkingRoute(
      mrtRoute.endStation.lat, mrtRoute.endStation.lng,
      destLat, destLng
    );
    
    if (walkFromStation && walkFromStation.steps) {
      steps.push({
        type: 'walk',
        mode: 'walking',
        instruction: `Walk from ${mrtRoute.endStation.name} MRT Station to destination`,
        distance: walkFromStation.totalDistance,
        duration: walkFromStation.estimatedTime,
        from: { lat: mrtRoute.endStation.lat, lng: mrtRoute.endStation.lng },
        to: { lat: destLat, lng: destLng },
        detailedSteps: walkFromStation.steps,
        path: walkFromStation.path,
      });
      totalTime += walkFromStation.estimatedTime;
      totalDistance += parseFloat(walkFromStation.totalDistance) || 0;
    }

    // Combine all paths for AR navigation
    const combinedPath = [];
    steps.forEach(step => {
      if (step.path && step.path.length > 0) {
        combinedPath.push(...step.path);
      }
    });

    return {
      type: 'transit',
      mode: 'mrt',
      steps,
      estimatedTime: totalTime,
      totalDistance: `${totalDistance.toFixed(1)} km`,
      path: combinedPath,
      summary: `Take ${mrtRoute.line} Line: ${mrtRoute.startStation.name} → ${mrtRoute.endStation.name}`,
    };

  } catch (error) {
    console.error("Transit route error:", error);
    return null;
  }
}

// Calculate bus-only route
async function calculateBusRoute(startLat, startLng, destLat, destLng) {
  try {
    // Find nearby bus stops
    const nearbyStops = await findNearbyBusStops(startLat, startLng);
    const destStops = await findNearbyBusStops(destLat, destLng);

    if (!nearbyStops || nearbyStops.length === 0 || !destStops || destStops.length === 0) {
      return null;
    }

    // For now, create a simplified bus route
    // In production, this would use LTA's bus route planning
    const startStop = nearbyStops[0];
    const destStop = destStops[0];

    const steps = [];
    let totalTime = 0;

    // Walk to bus stop
    const walkToBusStop = await fetchOSRMWalkingRoute(
      startLat, startLng,
      startStop.Latitude, startStop.Longitude
    );

    if (walkToBusStop) {
      steps.push({
        type: 'walk',
        mode: 'walking',
        instruction: `Walk to bus stop ${startStop.Description} (${startStop.BusStopCode})`,
        distance: walkToBusStop.totalDistance,
        duration: walkToBusStop.estimatedTime,
        from: { lat: startLat, lng: startLng },
        to: { lat: startStop.Latitude, lng: startStop.Longitude },
        detailedSteps: walkToBusStop.steps,
        path: walkToBusStop.path,
      });
      totalTime += walkToBusStop.estimatedTime;
    }

    // Get bus arrival info
    const busArrival = await fetchBusArrival(startStop.BusStopCode);
    const availableBuses = busArrival?.Services || [];

    // Add bus step
    steps.push({
      type: 'bus',
      mode: 'transit',
      instruction: `Take bus from ${startStop.Description}`,
      busStopCode: startStop.BusStopCode,
      busStopName: startStop.Description,
      availableBuses: availableBuses.slice(0, 3).map(bus => ({
        serviceNo: bus.ServiceNo,
        nextArrival: bus.NextBus?.EstimatedArrival,
        crowdLevel: bus.NextBus?.Load || 'unknown',
      })),
      from: { lat: startStop.Latitude, lng: startStop.Longitude },
      to: { lat: destStop.Latitude, lng: destStop.Longitude },
      duration: 15, // Estimated bus travel time
    });
    totalTime += 15 + BUS_WAIT_TIME_MIN;

    // Walk from bus stop to destination
    const walkFromBusStop = await fetchOSRMWalkingRoute(
      destStop.Latitude, destStop.Longitude,
      destLat, destLng
    );

    if (walkFromBusStop) {
      steps.push({
        type: 'walk',
        mode: 'walking',
        instruction: `Walk from bus stop ${destStop.Description} to destination`,
        distance: walkFromBusStop.totalDistance,
        duration: walkFromBusStop.estimatedTime,
        from: { lat: destStop.Latitude, lng: destStop.Longitude },
        to: { lat: destLat, lng: destLng },
        detailedSteps: walkFromBusStop.steps,
        path: walkFromBusStop.path,
      });
      totalTime += walkFromBusStop.estimatedTime;
    }

    // Combine paths
    const combinedPath = [];
    steps.forEach(step => {
      if (step.path && step.path.length > 0) {
        combinedPath.push(...step.path);
      }
    });

    return {
      type: 'transit',
      mode: 'bus',
      steps,
      estimatedTime: totalTime,
      path: combinedPath,
      summary: `Take bus from ${startStop.Description}`,
    };

  } catch (error) {
    console.error("Bus route error:", error);
    return null;
  }
}

// Find best MRT route between stations
async function findBestMRTRoute(startStations, destStations) {
  // Simple implementation - find direct route on same line first
  for (const startStation of startStations) {
    for (const destStation of destStations) {
      // Check if both stations share a common line
      const commonLines = startStation.lines.filter(line => 
        destStation.lines.includes(line)
      );

      if (commonLines.length > 0) {
        const line = commonLines[0];
        const stops = countStopsBetween(startStation, destStation, line);
        const estimatedTime = stops * 2.5; // ~2.5 min per stop

        // Create path for MRT segment
        const path = [
          [startStation.lat, startStation.lng],
          [destStation.lat, destStation.lng]
        ];

        return {
          startStation,
          endStation: destStation,
          line,
          stops,
          estimatedTime,
          transfers: 0,
          path,
        };
      }
    }
  }

  // If no direct route, find route with transfer
  // This is a simplified version - production would use graph algorithm
  for (const startStation of startStations) {
    for (const destStation of destStations) {
      const route = findRouteWithTransfer(startStation, destStation);
      if (route) return route;
    }
  }

  return null;
}

// Count stops between two stations on the same line
function countStopsBetween(station1, station2, line) {
  const lineStations = mrtStations.filter(s => s.lines.includes(line));
  const idx1 = lineStations.findIndex(s => s.code === station1.code);
  const idx2 = lineStations.findIndex(s => s.code === station2.code);
  
  if (idx1 === -1 || idx2 === -1) return 10; // Default estimate
  return Math.abs(idx2 - idx1);
}

// Find route with one transfer
function findRouteWithTransfer(startStation, destStation) {
  // Find interchange stations
  const interchanges = mrtStations.filter(s => s.interchange);
  
  for (const interchange of interchanges) {
    // Check if start can reach interchange
    const startToInterchange = startStation.lines.some(line => 
      interchange.lines.includes(line)
    );
    
    // Check if interchange can reach dest
    const interchangeToDest = interchange.lines.some(line =>
      destStation.lines.includes(line)
    );

    if (startToInterchange && interchangeToDest) {
      const line1 = startStation.lines.find(l => interchange.lines.includes(l));
      const line2 = interchange.lines.find(l => destStation.lines.includes(l));
      
      const stops1 = countStopsBetween(startStation, interchange, line1);
      const stops2 = countStopsBetween(interchange, destStation, line2);
      
      return {
        startStation,
        endStation: destStation,
        line: `${line1} → ${line2}`,
        stops: stops1 + stops2,
        estimatedTime: (stops1 + stops2) * 2.5 + TRANSFER_TIME_MIN,
        transfers: 1,
        transferAt: interchange,
        path: [
          [startStation.lat, startStation.lng],
          [interchange.lat, interchange.lng],
          [destStation.lat, destStation.lng]
        ],
      };
    }
  }

  return null;
}

// Fetch walking route from OneMap
async function fetchOneMapWalkingRoute(startLat, startLng, destLat, destLng) {
  if (!ONEMAP_TOKEN) return null;

  try {
    const url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${startLat},${startLng}&end=${destLat},${destLng}&routeType=walk&token=${ONEMAP_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error || !data.route_instructions) return null;

    const path = data.route_geometry?.coordinates?.map(coord => [coord[1], coord[0]]) || [];
    
    const steps = data.route_instructions.map((instruction, index) => ({
      id: index + 1,
      instruction: instruction[9] || instruction[0],
      distance: `${Math.round(instruction[2])}m`,
      direction: parseDirection(instruction[0]),
      coordinates: instruction[3] ? instruction[3].split(',').map(Number).reverse() : null,
    }));

    const totalDistanceM = data.route_summary?.total_distance || 0;
    const estimatedTime = Math.round((totalDistanceM / 1000) / WALKING_SPEED_KMH * 60);

    return {
      type: 'walking',
      mode: 'walking',
      steps,
      path,
      totalDistance: `${(totalDistanceM / 1000).toFixed(1)} km`,
      estimatedTime,
      source: 'OneMap',
    };
  } catch (error) {
    console.error("OneMap walking route error:", error);
    return null;
  }
}

// Fetch walking route from OSRM - CLEANED for pedestrian use
async function fetchOSRMWalkingRoute(startLat, startLng, destLat, destLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const path = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    const steps = [];
    if (route.legs && route.legs[0]?.steps) {
      route.legs[0].steps.forEach((step, index) => {
        const maneuver = step.maneuver;
        let instruction = maneuver.type;
        const name = step.name || '';
        
        // ✅ FILTER OUT HIGHWAYS AND MAJOR ROADS
        const isHighway = name && (
          name.toLowerCase().includes('highway') ||
          name.toLowerCase().includes('expressway') ||
          name.toLowerCase().includes('motorway') ||
          name.match(/^[A-Z]+\d+$/) || // Like "PIE", "CTE", "AYE"
          name.match(/^\d+$/) // Pure numbers
        );

        // Generate pedestrian-friendly instructions
        if (maneuver.type === 'turn') {
          if (isHighway) {
            instruction = `Turn ${maneuver.modifier || 'ahead'}`;
          } else {
            instruction = `Turn ${maneuver.modifier || ''} ${name ? 'onto ' + name : ''}`;
          }
        } else if (maneuver.type === 'depart') {
          if (isHighway) {
            instruction = `Start walking ${maneuver.modifier || 'forward'}`;
          } else {
            instruction = `Head ${maneuver.modifier || 'forward'} ${name ? 'on ' + name : ''}`;
          }
        } else if (maneuver.type === 'arrive') {
          instruction = 'You have arrived at your destination';
        } else if (maneuver.type === 'new name' || maneuver.type === 'continue') {
          if (isHighway) {
            instruction = 'Continue walking';
          } else {
            instruction = `Continue ${name ? 'on ' + name : 'walking'}`;
          }
        } else {
          instruction = isHighway ? 'Continue walking' : `Walk ${name ? 'on ' + name : 'forward'}`;
        }

        steps.push({
          id: index + 1,
          instruction: instruction.charAt(0).toUpperCase() + instruction.slice(1),
          distance: step.distance < 1000 ? `${Math.round(step.distance)}m` : `${(step.distance / 1000).toFixed(1)}km`,
          direction: parseDirection(maneuver.modifier || maneuver.type),
          coordinates: [maneuver.location[1], maneuver.location[0]],
          bearing: maneuver.bearing_after,
        });
      });
    }

    const totalDistanceM = route.distance;
    const estimatedTime = Math.round(route.duration / 60);

    return {
      type: 'walking',
      mode: 'walking',
      steps,
      path,
      totalDistance: `${(totalDistanceM / 1000).toFixed(1)} km`,
      estimatedTime,
      source: 'OSRM',
    };
  } catch (error) {
    console.error("OSRM walking route error:", error);
    return null;
  }
}

// Create straight line fallback route
function createStraightLineRoute(startLat, startLng, destLat, destLng) {
  const distance = haversineDistance(startLat, startLng, destLat, destLng);
  const estimatedTime = Math.round(distance / WALKING_SPEED_KMH * 60);

  return {
    type: 'walking',
    mode: 'walking',
    steps: [{
      id: 1,
      instruction: 'Head towards your destination',
      distance: `${distance.toFixed(1)} km`,
      direction: 'straight',
      coordinates: [destLat, destLng],
    }],
    path: [
      [startLat, startLng],
      [destLat, destLng],
    ],
    totalDistance: `${distance.toFixed(1)} km`,
    estimatedTime,
    source: 'Fallback',
  };
}

// Parse direction from instruction
function parseDirection(instruction) {
  if (!instruction) return 'straight';
  const lower = instruction.toLowerCase();
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';
  if (lower.includes('uturn') || lower.includes('u-turn')) return 'uturn';
  return 'straight';
}

// Find nearby bus stops using LTA API
async function findNearbyBusStops(lat, lng) {
  if (!LTA_API_KEY) return [];

  try {
    // LTA doesn't have a direct nearby search, so we fetch all and filter
    // In production, you'd cache this data
    const response = await fetch(
      'https://datamall2.mytransport.sg/ltaodataservice/BusStops',
      {
        headers: {
          'AccountKey': LTA_API_KEY,
          'accept': 'application/json'
        }
      }
    );

    const data = await response.json();
    const stops = data.value || [];

    // Filter and sort by distance
    const nearbyStops = stops
      .map(stop => ({
        ...stop,
        distance: haversineDistance(lat, lng, stop.Latitude, stop.Longitude)
      }))
      .filter(stop => stop.distance <= 0.5) // Within 500m
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    return nearbyStops;
  } catch (error) {
    console.error("Error fetching bus stops:", error);
    return [];
  }
}

// Fetch bus arrival times
async function fetchBusArrival(busStopCode) {
  if (!LTA_API_KEY) return null;

  try {
    const response = await fetch(
      `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${busStopCode}`,
      {
        headers: {
          'AccountKey': LTA_API_KEY,
          'accept': 'application/json'
        }
      }
    );

    return await response.json();
  } catch (error) {
    console.error("Error fetching bus arrival:", error);
    return null;
  }
}
