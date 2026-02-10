'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Bus, MapPin, Camera, Navigation, ChevronRight, Clock, Users, AlertCircle, X } from 'lucide-react';
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
  destination: {
    name: string;
    address: string;
    coordinates: [number, number];
    icon?: string;
  } | [number, number]; // ✅ Support both formats
  routePath: Array<[number, number]>;
  navigationSteps: Array<{
    id: number;
    direction: string;
    instruction: string;
    distance?: string;
    coordinates?: [number, number];
  }>;
  onClose: () => void;
  onSwitchToAR?: () => void;
}

// Helper function to calculate distance between two coordinates
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function TextualNavigation({
  currentLocation,
  destination,
  routePath,
  navigationSteps,
  onClose,
  onSwitchToAR
}: TextualNavigationProps) {
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nearbyBusStop, setNearbyBusStop] = useState<BusStop | null>(null);
  const [visualLandmark, setVisualLandmark] = useState<any>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [loadingImages, setLoadingImages] = useState(false);

  // ✅ Normalize destination to always have coordinates
  const destinationCoords: [number, number] = Array.isArray(destination) 
    ? destination 
    : destination.coordinates;
  
  const destinationName = Array.isArray(destination)
    ? 'your destination'
    : destination.name;

  const destinationAddress = Array.isArray(destination)
    ? ''
    : destination.address;

  // Convert PatientInterface steps and enhance with visual context
  useEffect(() => {
    enhanceNavigationSteps();
  }, [navigationSteps, routePath]);

  // Fetch visual context for current step (lazy loaded)
  useEffect(() => {
    if (steps[currentStepIndex] && !loadingImages) {
      fetchStepVisualContext(steps[currentStepIndex]);
    }
  }, [currentStepIndex, steps]);

  const enhanceNavigationSteps = async () => {
    setLoading(true);
    
    try {
      // Convert PatientInterface steps to TextualNavigation format
      const convertedSteps: NavigationStep[] = navigationSteps.map((step, index) => ({
        id: step.id.toString(),
        type: mapStepType(step.direction),
        instruction: step.instruction,
        location: step.coordinates || currentLocation,
        distance: parseDistance(step.distance),
        duration: estimateDuration(step.distance),
        completed: false
      }));

      // 🖼️ Enhance steps with LTA bus stop imagery and OneMap landmarks
      const enhancedSteps = await enhanceStepsWithVisualContext(convertedSteps, routePath);
      
      setSteps(enhancedSteps);
    } catch (error) {
      console.error('Error enhancing navigation steps:', error);
      
      // ✅ Fallback: Use basic converted steps
      const basicSteps: NavigationStep[] = navigationSteps.map((step, index) => ({
        id: step.id.toString(),
        type: 'walk',
        instruction: step.instruction,
        location: step.coordinates || currentLocation,
        distance: parseDistance(step.distance),
        completed: false
      }));
      setSteps(basicSteps);
    } finally {
      setLoading(false);
    }
  };

  // Map routing API directions to step types
  const mapStepType = (direction: string): NavigationStep['type'] => {
    if (direction === 'bus' || direction?.includes('bus')) return 'bus';
    if (direction === 'mrt' || direction?.includes('train')) return 'mrt';
    if (direction === 'wait' || direction?.includes('wait')) return 'wait';
    if (direction === 'destination') return 'walk';
    return 'walk';
  };

  // Parse distance from API response
  const parseDistance = (distance: string | number | undefined): number => {
    if (typeof distance === 'number') return distance;
    if (typeof distance === 'string') {
      const match = distance.match(/([0-9.]+)/);
      return match ? parseFloat(match[1]) : 0;
    }
    return 0;
  };

  // Estimate duration from distance
  const estimateDuration = (distance: string | number | undefined): number => {
    const distanceM = parseDistance(distance);
    return Math.ceil(distanceM / 80); // ~80m per minute walking
  };

  // Enhance steps with visual context (bus stop imagery and landmarks)
  const enhanceStepsWithVisualContext = async (steps: NavigationStep[], path: [number, number][]): Promise<NavigationStep[]> => {
    const enhancedSteps = [...steps];
    
    try {
      // Add bus stop information to bus-related steps
      for (let i = 0; i < enhancedSteps.length; i++) {
        const step = enhancedSteps[i];
        
        if (step.type === 'bus' || step.type === 'wait') {
          try {
            const nearbyStops = await fetchNearbyBusStops(step.location[0], step.location[1], 200);
            if (nearbyStops && nearbyStops.length > 0) {
              const closestStop = nearbyStops[0];
              setNearbyBusStop(closestStop);
              
              // Get bus arrival information
              const arrivals = await fetchBusArrivals(closestStop.BusStopCode);
              if (arrivals && arrivals.length > 0) {
                const firstBus = arrivals[0];
                const crowdInfo = getCrowdLevel(firstBus.NextBus.Load);
                
                enhancedSteps[i] = {
                  ...step,
                  busInfo: {
                    serviceNo: firstBus.ServiceNo,
                    stopCode: closestStop.BusStopCode,
                    stopName: closestStop.Description,
                    crowdLevel: crowdInfo.level
                  },
                  instruction: step.instruction.includes('Bus') ? 
                    `${step.instruction} ${crowdInfo.emoji}` : step.instruction
                };
              }
            }
          } catch (busError) {
            console.warn('Failed to enhance bus step:', busError);
          }
        }
      }
      
      // Add landmark information to walking steps
      if (path && path.length > 2) {
        const midPoint = path[Math.floor(path.length / 2)];
        
        try {
          const landmark = await getVisualLandmark(midPoint[0], midPoint[1]);
          
          if (landmark) {
            // Insert landmark step in the middle
            const landmarkStep: NavigationStep = {
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
            };
            
            enhancedSteps.splice(Math.floor(enhancedSteps.length / 2), 0, landmarkStep);
          }
        } catch (landmarkError) {
          console.warn('Failed to add landmark:', landmarkError);
        }
      }
      
    } catch (error) {
      console.warn('Failed to enhance steps with visual context:', error);
    }
    
    return enhancedSteps;
  };

  const fetchStepVisualContext = async (step: NavigationStep) => {
    if (step.type === 'landmark' || step.type === 'walk') {
      setLoadingImages(true);
      try {
        const landmark = await Promise.race([
          getVisualLandmark(step.location[0], step.location[1]),
          new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('Visual landmark timeout')), 3000)
          )
        ]);
        setVisualLandmark(landmark);
      } catch (error) {
        console.warn('Visual landmark fetch failed:', error);
        setVisualLandmark(null);
      } finally {
        setLoadingImages(false);
      }
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      const updatedSteps = [...steps];
      updatedSteps[currentStepIndex].completed = true;
      setSteps(updatedSteps);
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // Last step - close navigation
      const updatedSteps = [...steps];
      updatedSteps[currentStepIndex].completed = true;
      setSteps(updatedSteps);
      
      // ✅ Wait 1.5 seconds then return to home
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  };

  const handlePreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  // ✅ Handle image loading errors
  const handleImageError = (imageId: string) => {
    setImageErrors(prev => new Set([...prev, imageId]));
  };

  const currentStep = steps[currentStepIndex];

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto"></div>
          <p className="text-xl text-muted-foreground">Planning your route...</p>
          <p className="text-sm text-muted-foreground">This may take a moment</p>
        </div>
      </div>
    );
  }

  if (!currentStep) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          <p className="text-xl font-bold">Unable to generate route</p>
          <Button onClick={onClose}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Step-by-Step Guide</h1>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Step {currentStepIndex + 1} of {steps.length}</span>
            <span>{Math.round(((currentStepIndex + 1) / steps.length) * 100)}% complete</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Current Step Card */}
        <Card className="p-6 border-2 border-primary shadow-lg">
          {/* Step Icon */}
          <div className="flex items-start gap-4 mb-4">
            <div className="bg-primary text-primary-foreground rounded-full p-3 flex-shrink-0">
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
              {currentStep.distance !== undefined && currentStep.distance > 0 && (
                <p className="text-lg text-muted-foreground">
                  📍 {Math.round(currentStep.distance)} meters away
                </p>
              )}
              {currentStep.duration && (
                <p className="text-lg text-muted-foreground">
                  ⏱️ About {currentStep.duration} minutes
                </p>
              )}
            </div>
          </div>

          {/* Visual Context - Map Preview (with error handling) */}
          <div className="mb-4 rounded-lg overflow-hidden border border-border">
            {!imageErrors.has(`map-${currentStep.id}`) ? (
              <img 
                src={getStaticMapUrl(
                  currentStep.location[0],
                  currentStep.location[1],
                  17,
                  600,
                  300,
                  [
                    { lat: currentStep.location[0], lng: currentStep.location[1], label: '📍', color: 'red' }
                  ]
                )}
                alt="Location preview"
                className="w-full h-48 object-cover"
                onError={() => handleImageError(`map-${currentStep.id}`)}
                loading="lazy"
              />
            ) : (
              <div className="w-full h-48 bg-muted flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Map preview unavailable</p>
                </div>
              </div>
            )}
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
                  {currentStep.landmark.imageUrl && !imageErrors.has(`landmark-${currentStep.id}`) && (
                    <img 
                      src={currentStep.landmark.imageUrl}
                      alt={currentStep.landmark.name}
                      className="w-full h-40 object-cover rounded-lg mt-2"
                      onError={() => handleImageError(`landmark-${currentStep.id}`)}
                      loading="lazy"
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

        {/* All Steps Overview */}
        <Card className="p-4">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            All Steps ({steps.length})
          </h3>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                  index === currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : step.completed
                    ? 'bg-muted/50 opacity-60'
                    : 'bg-muted/30 hover:bg-muted/50'
                }`}
                onClick={() => setCurrentStepIndex(index)}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  index === currentStepIndex
                    ? 'bg-primary-foreground text-primary'
                    : step.completed
                    ? 'bg-green-500 text-white'
                    : 'bg-background text-foreground'
                }`}>
                  {step.completed ? '✓' : index + 1}
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-sm font-medium ${
                    index === currentStepIndex ? 'text-primary-foreground' : ''
                  }`}>
                    {step.instruction}
                  </p>
                  {step.distance !== undefined && step.distance > 0 && (
                    <p className={`text-xs ${
                      index === currentStepIndex ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}>
                      {Math.round(step.distance)}m
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
              </button>
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
            size="lg"
            className="flex-1"
            onClick={handlePreviousStep}
            disabled={currentStepIndex === 0}
          >
            ← Previous
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={handleNextStep}
          >
            {currentStepIndex === steps.length - 1 ? '✓ Finish' : 'Next Step →'}
          </Button>
        </div>
      </div>
    </div>
  );
}