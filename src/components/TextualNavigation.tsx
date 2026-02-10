'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Bus, MapPin, Camera, Navigation, ChevronRight, Clock, Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  fetchNearbyBusStops, 
  fetchBusArrivals, 
  getCrowdLevel, 
  formatArrivalTime,
  BusStop 
} from '@/lib/ltaDataMall';
import { 
  getVisualLandmark, 
  getStaticMapUrl,
  reverseGeocode 
} from '@/lib/oneMapApi';

interface NavigationStep {
  id: string;
  type: 'walk' | 'bus' | 'mrt' | 'wait' | 'landmark';
  instruction: string;
  distance?: number;
  duration?: number;
  landmark?: {
    name: string;
    imageUrl?: string;
    description?: string;
  };
  busInfo?: {
    serviceNo: string;
    stopCode: string;
    stopName: string;
    crowdLevel?: 'low' | 'medium' | 'high';
  };
  location: [number, number];
  completed?: boolean;
}

interface TextualNavigationProps {
  currentLocation: [number, number];
  destination: [number, number];
  routePath: Array<[number, number]>;
  onClose: () => void;
  onSwitchToAR?: () => void;
}

export default function TextualNavigation({
  currentLocation,
  destination,
  routePath,
  onClose,
  onSwitchToAR
}: TextualNavigationProps) {
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nearbyBusStop, setNearbyBusStop] = useState<BusStop | null>(null);
  const [visualLandmark, setVisualLandmark] = useState<any>(null);

  // Generate navigation steps from route path
  useEffect(() => {
    generateNavigationSteps();
  }, [routePath, currentLocation, destination]);

  // Fetch visual context for current step
  useEffect(() => {
    if (steps[currentStepIndex]) {
      fetchStepVisualContext(steps[currentStepIndex]);
    }
  }, [currentStepIndex, steps]);

  const generateNavigationSteps = async () => {
    setLoading(true);
    
    try {
      const generatedSteps: NavigationStep[] = [];
      
      // Step 1: Start walking
      const startAddress = await reverseGeocode(currentLocation[0], currentLocation[1]);
      generatedSteps.push({
        id: 'start',
        type: 'walk',
        instruction: `Start from ${startAddress?.BUILDING || startAddress?.ROAD_NAME || 'your current location'}`,
        location: currentLocation,
        distance: 0,
        completed: false
      });

      // Step 2: Find nearby bus stop
      const nearbyStops = await fetchNearbyBusStops(currentLocation[0], currentLocation[1], 300);
      if (nearbyStops.length > 0) {
        const closestStop = nearbyStops[0];
        setNearbyBusStop(closestStop);

        generatedSteps.push({
          id: `walk-to-stop-${closestStop.BusStopCode}`,
          type: 'walk',
          instruction: `Walk to bus stop: ${closestStop.Description}`,
          location: [closestStop.Latitude, closestStop.Longitude],
          distance: calculateDistance(
            currentLocation[0], currentLocation[1],
            closestStop.Latitude, closestStop.Longitude
          ),
          completed: false
        });

        // Add bus arrival info
        const arrivals = await fetchBusArrivals(closestStop.BusStopCode);
        if (arrivals.length > 0) {
          const firstBus = arrivals[0];
          const crowdInfo = getCrowdLevel(firstBus.NextBus.Load);

          generatedSteps.push({
            id: `wait-bus-${firstBus.ServiceNo}`,
            type: 'wait',
            instruction: `Wait for Bus ${firstBus.ServiceNo} ${crowdInfo.emoji}`,
            busInfo: {
              serviceNo: firstBus.ServiceNo,
              stopCode: closestStop.BusStopCode,
              stopName: closestStop.Description,
              crowdLevel: crowdInfo.level
            },
            location: [closestStop.Latitude, closestStop.Longitude],
            duration: 5,
            completed: false
          });

          generatedSteps.push({
            id: `board-bus-${firstBus.ServiceNo}`,
            type: 'bus',
            instruction: `Board Bus ${firstBus.ServiceNo}`,
            busInfo: {
              serviceNo: firstBus.ServiceNo,
              stopCode: closestStop.BusStopCode,
              stopName: closestStop.Description,
              crowdLevel: crowdInfo.level
            },
            location: [closestStop.Latitude, closestStop.Longitude],
            completed: false
          });
        }
      }

      // Step 3: Add waypoints from route as landmarks
      if (routePath.length > 2) {
        const midPoint = routePath[Math.floor(routePath.length / 2)];
        const landmark = await getVisualLandmark(midPoint[0], midPoint[1]);
        
        if (landmark) {
          generatedSteps.push({
            id: `landmark-${landmark.name}`,
            type: 'landmark',
            instruction: `Look for ${landmark.name}`,
            landmark: {
              name: landmark.name,
              imageUrl: landmark.imageUrl,
              description: landmark.description
            },
            location: midPoint,
            distance: landmark.distance,
            completed: false
          });
        }
      }

      // Step 4: Final destination
      const destAddress = await reverseGeocode(destination[0], destination[1]);
      generatedSteps.push({
        id: 'destination',
        type: 'walk',
        instruction: `Arrive at ${destAddress?.BUILDING || destAddress?.ROAD_NAME || 'your destination'}`,
        location: destination,
        distance: calculateDistance(
          currentLocation[0], currentLocation[1],
          destination[0], destination[1]
        ),
        completed: false
      });

      setSteps(generatedSteps);
    } catch (error) {
      console.error('Error generating navigation steps:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStepVisualContext = async (step: NavigationStep) => {
    if (step.type === 'landmark' || step.type === 'walk') {
      const landmark = await getVisualLandmark(step.location[0], step.location[1]);
      setVisualLandmark(landmark);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      const updatedSteps = [...steps];
      updatedSteps[currentStepIndex].completed = true;
      setSteps(updatedSteps);
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const currentStep = steps[currentStepIndex];
  const progressPercentage = steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg text-muted-foreground">Preparing your journey...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Step-by-Step Guide</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Step {currentStepIndex + 1} of {steps.length}</span>
            <span>{Math.round(progressPercentage)}% complete</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Current Step Card */}
        {currentStep && (
          <Card className="p-6 border-2 border-primary">
            {/* Step Icon */}
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-primary text-primary-foreground rounded-full p-3">
                {currentStep.type === 'walk' && <Navigation className="h-6 w-6" />}
                {currentStep.type === 'bus' && <Bus className="h-6 w-6" />}
                {currentStep.type === 'wait' && <Clock className="h-6 w-6" />}
                {currentStep.type === 'landmark' && <MapPin className="h-6 w-6" />}
              </div>
              <div className="flex-1">
                <Badge variant="outline" className="mb-2">
                  {currentStep.type.toUpperCase()}
                </Badge>
                <h3 className="text-2xl font-bold mb-2">{currentStep.instruction}</h3>
                
                {/* Distance/Duration Info */}
                {currentStep.distance && (
                  <p className="text-muted-foreground">
                    📍 {Math.round(currentStep.distance)} meters away
                  </p>
                )}
                {currentStep.duration && (
                  <p className="text-muted-foreground">
                    ⏱️ About {currentStep.duration} minutes
                  </p>
                )}
              </div>
            </div>

            {/* Visual Context - Map Preview */}
            <div className="mb-4 rounded-lg overflow-hidden border border-border">
              <img 
                src={getStaticMapUrl(
                  currentStep.location[0],
                  currentStep.location[1],
                  16,
                  600,
                  300,
                  [
                    { lat: currentStep.location[0], lng: currentStep.location[1], label: '📍', color: 'red' }
                  ]
                )}
                alt="Location preview"
                className="w-full h-48 object-cover"
              />
            </div>

            {/* Bus Information */}
            {currentStep.busInfo && (
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bus className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-bold text-lg">Bus {currentStep.busInfo.serviceNo}</p>
                      <p className="text-sm text-muted-foreground">{currentStep.busInfo.stopName}</p>
                    </div>
                  </div>
                  
                  {currentStep.busInfo.crowdLevel && (
                    <Badge 
                      variant={
                        currentStep.busInfo.crowdLevel === 'low' ? 'default' :
                        currentStep.busInfo.crowdLevel === 'medium' ? 'secondary' :
                        'destructive'
                      }
                      className="text-sm px-3 py-1"
                    >
                      <Users className="h-3 w-3 mr-1" />
                      {currentStep.busInfo.crowdLevel === 'low' && '🟢 Seats Available'}
                      {currentStep.busInfo.crowdLevel === 'medium' && '🟡 Standing Room'}
                      {currentStep.busInfo.crowdLevel === 'high' && '🔴 Very Crowded'}
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2 text-sm">
                  <Badge variant="outline">Stop: {currentStep.busInfo.stopCode}</Badge>
                </div>

                {currentStep.type === 'wait' && (
                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800">
                      <strong>Wait here!</strong> The bus will arrive soon. Stay near the bus stop sign.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Landmark Information */}
            {currentStep.landmark && (
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h4 className="font-bold text-lg mb-1">{currentStep.landmark.name}</h4>
                    {currentStep.landmark.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {currentStep.landmark.description}
                      </p>
                    )}
                    {currentStep.landmark.imageUrl && (
                      <img 
                        src={currentStep.landmark.imageUrl}
                        alt={currentStep.landmark.name}
                        className="w-full h-40 object-cover rounded-lg mt-2"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Landmark Nearby */}
            {visualLandmark && currentStep.type === 'walk' && (
              <div className="mt-4 bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <Camera className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-800">
                      <strong>Look for:</strong> {visualLandmark.name}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      About {visualLandmark.distance}m away
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* All Steps Overview */}
        <Card className="p-4">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            All Steps
          </h3>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer ${
                  index === currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : step.completed
                    ? 'bg-muted/50 opacity-60'
                    : 'bg-muted/30'
                }`}
                onClick={() => setCurrentStepIndex(index)}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  index === currentStepIndex
                    ? 'bg-primary-foreground text-primary'
                    : step.completed
                    ? 'bg-green-500 text-white'
                    : 'bg-background text-foreground'
                }`}>
                  {step.completed ? '✓' : index + 1}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    index === currentStepIndex ? 'text-primary-foreground' : ''
                  }`}>
                    {step.instruction}
                  </p>
                  {step.distance && (
                    <p className={`text-xs ${
                      index === currentStepIndex ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}>
                      {Math.round(step.distance)}m
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom Navigation */}
      <div className="bg-card border-t border-border p-4 space-y-3">
        {onSwitchToAR && (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={onSwitchToAR}
          >
            <Camera className="h-4 w-4 mr-2" />
            Switch to AR Camera Guide
          </Button>
        )}
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePreviousStep}
            disabled={currentStepIndex === 0}
          >
            Previous
          </Button>
          <Button
            className="flex-1"
            onClick={handleNextStep}
            disabled={currentStepIndex === steps.length - 1}
          >
            {currentStepIndex === steps.length - 1 ? 'Finish' : 'Next Step'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
