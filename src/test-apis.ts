// Load environment variables from .env.local
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from the project root
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function testAPIs() {
  // Dynamic imports AFTER environment is loaded
  const { fetchNearbyBusStops } = await import('./lib/ltaDataMall');
  const { searchLocation } = await import('./lib/oneMapApi');

  console.log('Testing LTA DataMall...');
  const stops = await fetchNearbyBusStops(1.290270, 103.851959, 500);
  console.log(`Found ${stops.length} bus stops`);

  console.log('Testing OneMap...');
  const locations = await searchLocation('Orchard Road');
  console.log(`Found ${locations.length} locations`);
}

testAPIs();