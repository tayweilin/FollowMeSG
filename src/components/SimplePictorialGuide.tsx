'use client';

import { useState, useEffect } from 'react';
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, CheckCircle, Circle, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useVoiceNavigation } from '@/hooks/useVoiceNavigation'; // ✅ Import the voice hook

interface PictorialStep {
  id: string;
  emoji: string;
  mainText: string;
  subText?: string;
  image?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  color: 'green' | 'blue' | 'yellow' | 'red';
}

interface SimplePictorialGuideProps {
  currentLocation: [number, number];
  destination: {
    name: string;
    address: string;
    coordinates: [number, number];
    icon?: string;
  } | [number, number];
  routePath: Array<[number, number]>;
  navigationSteps: Array<{
    id: number;
    direction: string;
    instruction: string;
    distance?: string;
    coordinates?: [number, number];
  }>;
  onClose: () => void;
}

export default function SimplePictorialGuide({
  currentLocation,
  destination,
  routePath,
  navigationSteps,
  onClose
}: SimplePictorialGuideProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  
  // ✅ Add voice navigation
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const { speak, stop, isSpeaking } = useVoiceNavigation({ rate: 0.85 });

  // ✅ DYNAMIC: Convert navigationSteps to pictorial format
  const steps: PictorialStep[] = navigationSteps.map((navStep, index) => {
    let emoji = '🚶';
    let color: 'green' | 'blue' | 'yellow' | 'red' = 'blue';
    let direction: 'up' | 'down' | 'left' | 'right' | undefined;

    const instruction = navStep.instruction.toLowerCase();
    
    if (instruction.includes('walk') || instruction.includes('head') || instruction.includes('continue')) {
      emoji = '🚶';
      color = 'green';
    } else if (instruction.includes('turn right') || instruction.includes('right')) {
      emoji = '➡️';
      color = 'blue';
      direction = 'right';
    } else if (instruction.includes('turn left') || instruction.includes('left')) {
      emoji = '⬅️';
      color = 'blue';
      direction = 'left';
    } else if (instruction.includes('bus')) {
      emoji = '🚌';
      color = 'yellow';
    } else if (instruction.includes('wait')) {
      emoji = '⏰';
      color = 'yellow';
    } else if (instruction.includes('mrt') || instruction.includes('train')) {
      emoji = '🚇';
      color = 'blue';
    } else if (instruction.includes('arrived') || instruction.includes('destination')) {
      emoji = '🎯';
      color = 'green';
    }

    return {
      id: navStep.id.toString(),
      emoji: emoji,
      mainText: navStep.instruction,
      subText: navStep.distance || '',
      direction: direction,
      color: color
    };
  });

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  // ✅ Speak instruction when step changes or voice is enabled
  useEffect(() => {
    if (voiceEnabled && currentStep) {
      const message = `${currentStep.mainText}. ${currentStep.subText || ''}`;
      speak(message);
    }
  }, [currentStepIndex, voiceEnabled]);

  // ✅ Toggle voice handler
  const toggleVoice = () => {
    setVoiceEnabled(!voiceEnabled);
    if (voiceEnabled) {
      stop();
    } else {
      // Speak current step when turning voice back on
      const message = `${currentStep.mainText}. ${currentStep.subText || ''}`;
      speak(message);
    }
  };

  const handleComplete = () => {
    const newCompleted = new Set(completedSteps);
    newCompleted.add(currentStepIndex);
    setCompletedSteps(newCompleted);

    if (!isLastStep) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // ✅ Announce completion
      if (voiceEnabled) {
        speak('You have arrived at your destination! Great job!');
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return 'bg-green-500 text-white border-green-600';
      case 'blue':
        return 'bg-blue-500 text-white border-blue-600';
      case 'yellow':
        return 'bg-yellow-400 text-gray-900 border-yellow-500';
      case 'red':
        return 'bg-red-500 text-white border-red-600';
      default:
        return 'bg-gray-500 text-white border-gray-600';
    }
  };

  const getDirectionArrow = (direction?: string) => {
    switch (direction) {
      case 'up':
        return <ArrowUp className="h-16 w-16" />;
      case 'down':
        return <ArrowDown className="h-16 w-16" />;
      case 'left':
        return <ArrowLeft className="h-16 w-16" />;
      case 'right':
        return <ArrowRight className="h-16 w-16" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* ✅ Header with Close and Voice Toggle */}
      <div className="bg-card border-b border-border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🎨 Picture Guide</h1>
          <div className="flex gap-2">
            {/* ✅ Voice Toggle Button */}
            <Button
              onClick={toggleVoice}
              variant="outline"
              size="icon"
              className="h-10 w-10"
            >
              {voiceEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </Button>
            
            {/* Close Button */}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mt-4">
          {steps.map((_, index) => (
            <div key={index}>
              {completedSteps.has(index) ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : index === currentStepIndex ? (
                <Circle className="h-4 w-4 text-primary fill-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {/* Step Counter */}
        <p className="text-center text-sm text-muted-foreground mt-2">
          Step {currentStepIndex + 1} of {steps.length}
        </p>
      </div>

      {/* Main Content - Current Step */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className={`w-full max-w-2xl p-8 border-4 ${getColorClasses(currentStep.color)}`}>
          {/* Large Emoji */}
          <div className="text-center mb-6">
            <div className="text-9xl mb-4">{currentStep.emoji}</div>
            {currentStep.direction && (
              <div className="flex justify-center">
                {getDirectionArrow(currentStep.direction)}
              </div>
            )}
          </div>

          {/* Main Text */}
          <h2 className="text-5xl font-bold text-center mb-4">
            {currentStep.mainText}
          </h2>

          {/* Sub Text */}
          {currentStep.subText && (
            <p className="text-3xl text-center opacity-90">
              {currentStep.subText}
            </p>
          )}
        </Card>
      </div>

      {/* Bottom Navigation */}
      <div className="p-6 bg-card border-t border-border">
        <div className="flex gap-4 max-w-2xl mx-auto">
          {/* Previous Button */}
          <Button
            onClick={handlePrevious}
            disabled={currentStepIndex === 0}
            variant="outline"
            size="lg"
            className="flex-1 h-16 text-xl"
          >
            ⬅️ Back
          </Button>

          {/* Next/Done Button */}
          <Button
            onClick={handleComplete}
            size="lg"
            className="flex-1 h-16 text-xl"
          >
            {isLastStep ? '✅ Done!' : 'Next ➡️'}
          </Button>
        </div>
      </div>
    </div>
  );
}