'use client';

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, User, Volume2, VolumeX, CheckCircle, LogOut, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SavedDestination, PatientInfo } from "@/types/index";
import DestinationCard from "./DestinationCard";
import CallGuardianButton from "./CallGuardianButton";
import EmergencyButton from "./EmergencyButton";
import BusArrivalCard from "./BusArrivalCard";
import MRTArrivalCard from "./MRTArrivalCard";
import PatientProfilePage from "./PatientProfilePage";
import NavigationStepCard from "./NavigationStepCard";
import PairingCodeCard from "./PairingCodeCard";
import { useVoiceNavigation } from "@/hooks/useVoiceNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import ARNavigation from "./ARNavigation";
// 🟢 MERGED: Import for deviation tracking logic
import { useSimulatedLocationTracking } from "@/hooks/useLocationTracking";
import { findNearestSafePoint } from "@/services/safePointsService"; 
// ✨ NEW: Navigation mode components
import TextualNavigation from '@/components/TextualNavigation';
import SimplePictorialGuide from '@/components/SimplePictorialGuide';
import NavigationModeSelector from '@/components/NavigationModeSelector';

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

interface PatientInterfaceProps {
  patient: PatientInfo;
  onNavigationStart?: (destination: SavedDestination) => void;
}

type AppView = "home" | "navigation" | "profile";

interface NavigationStep {
  id: number;
  direction: "straight" | "left" | "right" | "bus" | "mrt" | "destination";
  instruction: string;
  distance?: string;
  coordinates?: [number, number]; //  Added coordinates for AR
}

const PatientInterface = ({ patient, onNavigationStart }: PatientInterfaceProps) => {
  // 🟢 MERGED: Get updateNavigationStatus from context
  const { logout, updateNavigationStatus, notifyDestinationSelected } = useAuth();
  const [appView, setAppView] = useState<AppView>("home");
  const [selectedDestination, setSelectedDestination] = useState<SavedDestination | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const { speak, speakStep, stop, isSpeaking } = useVoiceNavigation({ rate: 0.85 });
  
  // AR State
  const [showAR, setShowAR] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<[number, number]>(
    patient?.currentLocation || [1.3521, 103.8198] // 🟢 Added optional chaining to prevent crash on logout
  );
  
  // ✨ NEW: Navigation mode state
  const [navigationMode, setNavigationMode] = useState<'ar' | 'textual' | 'pictorial' | null>(null);
  const [showModeSelector, setShowModeSelector] = useState(false);
  
  // 🌐 State for dynamic route generation
  const [navigationSteps, setNavigationSteps] = useState<NavigationStep[]>([]);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);

  // 🟢 MERGED: Simulated tracking hook (drives deviation + live location)
  const {
    currentLocation: simulatedLocation,
    isDeviated,
    deviationDistance,
    startTracking,
    stopTracking,
    triggerDeviation // 🟢 Uncommented to use directly
  } = useSimulatedLocationTracking(
    currentLocation, 
    selectedDestination?.coordinates // Destination is dynamic
  );

  // 🟢 MERGED: Start/stop tracking based on navigation view
  useEffect(() => {
    const isNavigatingView = appView === "navigation" || appView === "ar-guide";

    if (isNavigatingView) {
        // Start simulation when navigating
        startTracking();
    } else {
        // If not navigating, stop tracking
        stopTracking();
    }
  }, [appView, startTracking, stopTracking]);

  // 🟢 Update current location from simulated location when navigating
  useEffect(() => {
    const isNavigatingView = appView === "navigation" || appView === "ar-guide";
    if (isNavigatingView && simulatedLocation) {
        setCurrentLocation(simulatedLocation);
    }
  }, [simulatedLocation, appView]);

  // 🟢 Use real device location when not navigating
  useEffect(() => {
    const isNavigatingView = appView === "navigation" || appView === "ar-guide";
    if (!isNavigatingView && "geolocation" in navigator) {
        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setCurrentLocation([position.coords.latitude, position.coords.longitude]);
            },
            (error) => {
                console.warn("GPS not available:", error.message);
                // Keep using the last known location or default
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [appView]);


  // 🟢 MERGED: Sync navigation status (including deviation) to AuthContext for caregiver view
  const patientId = patient?.id; // Extract ID for stable dependency
  useEffect(() => {
    if (!patientId || !currentLocation || !updateNavigationStatus) return;
    
    // Only update navigation status if we are actually navigating or just stopped
    const isNavigatingView = appView === "navigation" || appView === "ar-guide";
    
    updateNavigationStatus(
      patientId,
      isNavigatingView, 
      isDeviated, // <--- Reports deviation status
      deviationDistance, // <--- Reports deviation distance
      currentLocation
    );
  }, [patientId, currentLocation, appView, isDeviated, deviationDistance, updateNavigationStatus]);

  const handleSwitchRole = () => {
    // 🟢 CHANGED: Removed stopTracking() to persist deviation state
    // This ensures the deviation status remains "true" in AuthContext
    // so the caregiver receives the alert upon login.
    stop();
    
    logout();
    toast({
      title: "Logged out",
      description: "You can now select a different role",
    });
  };

  // Use patient's destinations from auth context (managed by caregiver)
  const destinations = patient?.destinations || []; // 🟢 Added optional chaining

  // 🆘 Emergency handler: Find nearest safe point and auto-navigate
  const handleEmergency = async () => {
    try {
      toast({
        title: "Finding safe location...",
        description: "Searching for nearest Dementia Go-To Point",
      });

      const safePoint = await findNearestSafePoint(currentLocation);

      if (!safePoint) {
        toast({
          title: "No safe location found",
          description: "Unable to find nearby dementia-friendly location. Please call your guardian.",
          variant: "destructive",
        });
        return;
      }

      // Convert SafePoint to SavedDestination format
      const destination: SavedDestination = {
        id: safePoint.id,
        name: safePoint.name,
        address: safePoint.address,
        coordinates: safePoint.coordinates,
        icon: '🛡️', // Safe point icon
      };

      // Automatically start navigation to safe point
      await handleDestinationSelect(destination);

      toast({
        title: "Navigating to safe location",
        description: `Routing you to ${safePoint.name}`,
      });
    } catch (error) {
      console.error('Emergency routing error:', error);
      toast({
        title: "Error",
        description: "Failed to find safe location. Please call your guardian.",
        variant: "destructive",
      });
    }
  };

  const handleDestinationSelect = async (destination: SavedDestination) => {
    setSelectedDestination(destination);
    setAppView("navigation");
    setCurrentStepIndex(0);

    // 🚨 Notify caregiver that patient selected a destination
    if (patient?.id && notifyDestinationSelected) {
      await notifyDestinationSelected(patient.id, destination);
    }

    const start = currentLocation;
    const end = destination.coordinates;
    
    let newSteps: NavigationStep[] = [];
    let newPath: [number, number][] = [];

    // 1. Try comprehensive multi-modal routing (LTA + MRT + Walking)
    try {
      console.log('🚀 Fetching route from /api/multi-modal-route...');
      const params = new URLSearchParams({
        startLat: start[0].toString(),
        startLng: start[1].toString(),
        destLat: end[0].toString(),
        destLng: end[1].toString(),
        mode: 'transit'
      });
    
      const response = await fetch(`/api/multi-modal-route?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Multi-modal route response:', data);
    
        if (data.recommendedRoute && data.recommendedRoute.steps) {
          const route = data.recommendedRoute;
          
          // ✅ FIXED: Flatten nested transit steps
          newSteps = [];
          let stepId = 1;
    
          route.steps.forEach((segment: any) => {
            // Check if this segment has detailedSteps (walking segments)
            if (segment.detailedSteps && segment.detailedSteps.length > 0) {
              // Flatten walking substeps
              segment.detailedSteps.forEach((substep: any) => {
                newSteps.push({
                  id: stepId++,
                  direction: substep.direction || "straight",
                  instruction: substep.instruction,
                  distance: substep.distance,
                  coordinates: substep.coordinates || (segment.from ? [segment.from.lat, segment.from.lng] : start),
                });
              });
            } else {
              // Transit segments (MRT/Bus) - add as single step
              newSteps.push({
                id: stepId++,
                direction: segment.type || "straight",
                instruction: segment.instruction,
                distance: segment.distance || `${segment.duration} min`,
                coordinates: segment.from ? [segment.from.lat, segment.from.lng] : start,
              });
            }
          });
    
          newPath = route.path || [start, end];
          
          console.log(`✅ Multi-modal route loaded: ${newSteps.length} steps (flattened)`);
        }
      }
    } catch (multiModalError) {
      console.warn('⚠️ Multi-modal routing failed, trying route-planner...', multiModalError);
      
      // 2. Fallback to LTA bus route planner  
      try {
        console.log('🚌 Trying LTA route planner...');
        const response = await fetch('/api/route-planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            start, 
            end, 
            destination: destination.name, 
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.steps && data.steps.length > 0) {
            newSteps = data.steps.map((step: any) => ({
              id: step.id,
              direction: step.direction || "straight", 
              instruction: step.instruction,
              distance: step.distance,
              coordinates: step.coordinates,
            }));

            newPath = data.path || [start, end];
            
            console.log(`✅ LTA route loaded: Bus ${data.busNumber} (${newSteps.length} steps)`);
          } else {
            throw new Error('No steps in route-planner response');
          }
        } else {
          throw new Error(`Route planner returned ${response.status}`);
        }
      } catch (ltaError) {
        console.warn('⚠️ LTA routing failed, using simple fallback:', ltaError);
        
        // 3. Final fallback to simple walking route
        newSteps = [
          {
            id: 1,
            direction: "straight",
            instruction: `Walk towards ${destination.name}`,
            distance: `${Math.round(haversineDistance(start[0], start[1], end[0], end[1]) * 1000)}m`,
            coordinates: start,
          },
          {
            id: 2,
            direction: "destination",
            instruction: `You have arrived at ${destination.name}!`,
            coordinates: end,
          },
        ];

        newPath = [start, end];
        console.log('📍 Using simple walking directions');
      }
    }

    setNavigationSteps(newSteps);
    setRoutePath(newPath);

    // Notify parent component (optional)
    if (onNavigationStart) {
      onNavigationStart(destination);
    }

    // Announce first step
    if (voiceEnabled && newSteps[0]) {
      speak(`Navigation started. ${newSteps[0].instruction}`);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < navigationSteps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);

      // Announce next step
      if (voiceEnabled) {
        const step = navigationSteps[nextIndex];
        speakStep(step.instruction, nextIndex + 1, navigationSteps.length);
      }
    }
  };

  const handleSpeakStep = (stepIndex: number) => {
    const step = navigationSteps[stepIndex];
    if (step) {
      speakStep(step.instruction, stepIndex + 1, navigationSteps.length);
    }
  };

  const handleBackToHome = () => {
    stop(); // Stop voice if active
    stopTracking(); // 🟢 Stop deviation tracking
    setAppView("home");
    setSelectedDestination(null);
    setCurrentStepIndex(0);
    setNavigationMode(null); // ✨ Reset navigation mode
    setShowModeSelector(false); // ✨ Reset mode selector

    toast({
      title: "Navigation ended",
      description: "You have arrived at your destination!",
    });
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voiceEnabled);
    if (voiceEnabled) {
      stop();
    }
  };

  // ✨ Close navigation mode handler
  const handleCloseNavigationMode = () => {
    setNavigationMode(null);
    setShowModeSelector(false);
    setAppView("home");
    setSelectedDestination(null);
    setCurrentStepIndex(0);

    stop();

    if (patient?.id) {
      updateNavigationStatus(patient.id, false, null);
    }
  };

  // Profile view
  if (appView === "profile") {
    return (
      <PatientProfilePage
        patient={patient}
        onBack={() => setAppView("home")}
      />
    );
  }

  // Navigation view with steps
  if (appView === "navigation" && selectedDestination) {
    return (
      <div className="min-h-screen pb-40">
        {/* ✨ Mode Selector */}
        {showModeSelector && (
          <NavigationModeSelector
            onModeSelect={(mode) => {
              setNavigationMode(mode);
              setShowModeSelector(false);
            }}
            onBack={() => setShowModeSelector(false)}
          />
        )}

        {/* ✨ AR Mode */}
        {navigationMode === 'ar' && (
          <ARNavigation
            currentLocation={currentLocation}
            routePath={routePath}
            onClose={handleCloseNavigationMode}
          />
        )}

        {/* ✨ Text Mode */}
        {navigationMode === 'textual' && (
          <TextualNavigation
            currentLocation={currentLocation}
            destination={selectedDestination}
            routePath={routePath}
            navigationSteps={navigationSteps}
            onClose={handleCloseNavigationMode}
            onSwitchToAR={() => setNavigationMode('ar')}
          />
        )}

        {/* ✨ Pictorial Mode */}
        {navigationMode === 'pictorial' && (
          <SimplePictorialGuide
            currentLocation={currentLocation}
            destination={selectedDestination}
            routePath={routePath}
            navigationSteps={navigationSteps}
            onClose={handleCloseNavigationMode}
          />
        )}

        {/* Main Navigation UI - Only show when no mode is active */}
        {!showModeSelector && !navigationMode && (
          <div className="px-4 pt-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <Button
                onClick={handleBackToHome}
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-full"
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>

              <div className="flex gap-2">
                <Button
                  onClick={toggleVoice}
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                >
                  {voiceEnabled ? (
                    <Volume2 className="h-6 w-6" />
                  ) : (
                    <VolumeX className="h-6 w-6" />
                  )}
                </Button>
              </div>
            </div>

            {/* Destination Header */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-2xl">
                {selectedDestination.icon}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Going to</p>
                <h2 className="text-2xl font-bold text-foreground">{selectedDestination.name}</h2>
              </div>
            </div>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 py-2">
              {navigationSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all ${
                    index <= currentStepIndex ? "bg-primary w-8" : "bg-muted w-4"
                  }`}
                />
              ))}
            </div>

            {/* 📱 MOBILE-FRIENDLY: Show only current and next step */}
            <div className="space-y-4">
              {/* Current Step - Always visible */}
              <NavigationStepCard
                key={navigationSteps[currentStepIndex]?.id}
                stepNumber={currentStepIndex + 1}
                direction={navigationSteps[currentStepIndex]?.direction}
                instruction={navigationSteps[currentStepIndex]?.instruction}
                distance={navigationSteps[currentStepIndex]?.distance}
                isActive={true}
                isCompleted={false}
                onSpeak={() => handleSpeakStep(currentStepIndex)}
                isSpeaking={isSpeaking}
              />

              {/* Next Step Preview - If not last step */}
              {currentStepIndex < navigationSteps.length - 1 && (
                <div className="opacity-60">
                  <p className="text-sm font-semibold text-muted-foreground mb-2">Next Step:</p>
                  <NavigationStepCard
                    key={navigationSteps[currentStepIndex + 1]?.id}
                    stepNumber={currentStepIndex + 2}
                    direction={navigationSteps[currentStepIndex + 1]?.direction}
                    instruction={navigationSteps[currentStepIndex + 1]?.instruction}
                    distance={navigationSteps[currentStepIndex + 1]?.distance}
                    isActive={false}
                    isCompleted={false}
                  />
                </div>
              )}
            </div>

            {/* ✨ Navigation Mode Button - REPLACED AR BUTTON */}
            <Button 
              onClick={() => setShowModeSelector(true)}
              className="w-full h-16 text-xl font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
            >
              🧭 Start Navigation
            </Button>

            {/* Bus Info - show when relevant */}
            {navigationSteps[currentStepIndex]?.direction === "bus" && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-foreground">Your Bus</h3>
                <BusArrivalCard
                  busNumber="36"
                  destination={selectedDestination.name}
                  arrivalTime="3 min"
                  crowdLevel="low"
                  nextArrival="12 min"
                />
              </div>
            )}

            {/* 🚇 MRT Info - show when relevant */}
            {navigationSteps[currentStepIndex]?.direction === "mrt" && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-foreground">Your Train</h3>
                <MRTArrivalCard
                  line="Green Line"
                  platform="Platform 1"
                  destination={selectedDestination.name}
                  arrivalTime="2 min"
                  nextArrival="5 min"
                  crowdLevel="medium"
                />
              </div>
            )}

            {/* Call Guardian */}
            <CallGuardianButton guardianPhone={patient.guardianPhone} />
          </div>
        )}

        {/* Fixed Action Buttons at Bottom - Only show when no mode is active */}
        {!showModeSelector && !navigationMode && (
          <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-6 px-4 space-y-3">
            {/* Done! Next Step / I Have Arrived Button */}
            {currentStepIndex < navigationSteps.length - 1 ? (
              <Button
                onClick={handleNextStep}
                className="w-full h-16 text-xl font-bold rounded-2xl bg-primary hover:bg-primary/90 shadow-lg"
              >
                <CheckCircle className="h-7 w-7 mr-3" />
                Done! Next Step
              </Button>
            ) : (
              <Button
                onClick={handleBackToHome}
                className="w-full h-16 text-xl font-bold rounded-2xl bg-green-600 hover:bg-green-700 shadow-lg"
              >
                <CheckCircle className="h-7 w-7 mr-3" />
                I Have Arrived!
              </Button>
            )}

            {/* Emergency Button */}
            <div className="flex justify-center">
              <EmergencyButton onEmergency={handleEmergency} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Home view with saved destinations
  return (
    <div className="min-h-screen pb-32 pt-4">
      <div className="px-4 space-y-6">
        {/* Greeting with Profile Access */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-foreground">
              Hello, {patient.name}! 
            </h1>
            <p className="text-lg text-muted-foreground">
              Where would you like to go today?
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setAppView("profile")}
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full border-2"
            >
              <User className="h-6 w-6" />
            </Button>
            <Button
              onClick={handleSwitchRole}
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full border-2"
              title="Switch Role"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Saved Destinations - Read only, managed by caregiver */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-foreground">Your Places</h2>
          {destinations.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-muted/50 border border-border">
              <p className="text-muted-foreground">
                No places saved yet. Ask your caregiver to add destinations for you.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {destinations.map((destination) => (
                <DestinationCard
                  key={destination.id}
                  destination={destination}
                  onSelect={handleDestinationSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pairing Code */}
        <PairingCodeCard pairingCode={patient.pairingCode} patientName={patient.name} />

        {/* Call Guardian */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">Need Help?</h2>
          <CallGuardianButton guardianPhone={patient.guardianPhone} />
        </div>
      </div>

      {/* Emergency Button - Fixed */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
        <EmergencyButton onEmergency={handleEmergency} />
      </div>
    </div>
  );
};

export default PatientInterface;