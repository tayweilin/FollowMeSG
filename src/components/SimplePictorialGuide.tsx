'use client';

import { useState, useEffect } from 'react';
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, CheckCircle, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  destination: [number, number];
  onClose: () => void;
}

export default function SimplePictorialGuide({
  currentLocation,
  destination,
  onClose
}: SimplePictorialGuideProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Simplified pictorial steps
  const steps: PictorialStep[] = [
    {
      id: 'start',
      emoji: '🚶',
      mainText: 'Start Walking',
      subText: 'Leave your building',
      color: 'green'
    },
    {
      id: 'turn',
      emoji: '➡️',
      mainText: 'Turn Right',
      subText: 'At the traffic light',
      direction: 'right',
      color: 'blue'
    },
    {
      id: 'bus-stop',
      emoji: '🚏',
      mainText: 'Find Bus Stop',
      subText: 'Look for the sign',
      color: 'yellow'
    },
    {
      id: 'wait',
      emoji: '⏰',
      mainText: 'Wait Here',
      subText: 'Bus will come soon',
      color: 'blue'
    },
    {
      id: 'bus',
      emoji: '🚌',
      mainText: 'Get On Bus',
      subText: 'Show your card',
      color: 'green'
    },
    {
      id: 'ride',
      emoji: '💺',
      mainText: 'Sit Down',
      subText: 'Count 5 stops',
      color: 'blue'
    },
    {
      id: 'alert',
      emoji: '🔔',
      mainText: 'Press Bell',
      subText: 'At stop 5',
      color: 'yellow'
    },
    {
      id: 'exit',
      emoji: '🚪',
      mainText: 'Get Off Bus',
      subText: 'Use back door',
      color: 'red'
    },
    {
      id: 'destination',
      emoji: '🎯',
      mainText: 'You Arrived!',
      subText: 'Good job!',
      color: 'green'
    }
  ];

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleComplete = () => {
    const newCompleted = new Set(completedSteps);
    newCompleted.add(currentStepIndex);
    setCompletedSteps(newCompleted);

    if (!isLastStep) {
      setCurrentStepIndex(currentStepIndex + 1);
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
        return 'bg-green-100 border-green-300 text-green-900';
      case 'blue':
        return 'bg-blue-100 border-blue-300 text-blue-900';
      case 'yellow':
        return 'bg-yellow-100 border-yellow-300 text-yellow-900';
      case 'red':
        return 'bg-red-100 border-red-300 text-red-900';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-900';
    }
  };

  const DirectionArrow = ({ direction }: { direction?: 'up' | 'down' | 'left' | 'right' }) => {
    if (!direction) return null;

    const ArrowComponent = {
      up: ArrowUp,
      down: ArrowDown,
      left: ArrowLeft,
      right: ArrowRight
    }[direction];

    return (
      <div className="my-8 flex justify-center">
        <div className="bg-primary text-primary-foreground rounded-full p-8 animate-bounce">
          <ArrowComponent size={80} strokeWidth={3} />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-card border-b-4 border-primary p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">Step {currentStepIndex + 1} of {steps.length}</h2>
          <Button variant="outline" size="lg" onClick={onClose} className="text-xl px-6">
            Close
          </Button>
        </div>
      </div>

      {/* Main Content - Large and Clear */}
      <div className="flex-1 overflow-y-auto p-6">
        <Card className={`p-8 border-4 ${getColorClasses(currentStep.color)}`}>
          {/* Giant Emoji */}
          <div className="text-center mb-8">
            <div className="text-[150px] leading-none mb-4 animate-float">
              {currentStep.emoji}
            </div>
          </div>

          {/* Main Instruction - Very Large Text */}
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold leading-tight px-4">
              {currentStep.mainText}
            </h1>
            
            {currentStep.subText && (
              <p className="text-3xl text-muted-foreground font-medium">
                {currentStep.subText}
              </p>
            )}
          </div>

          {/* Direction Arrow */}
          <DirectionArrow direction={currentStep.direction} />

          {/* Step Image if available */}
          {currentStep.image && (
            <div className="my-8">
              <img 
                src={currentStep.image}
                alt={currentStep.mainText}
                className="w-full h-96 object-cover rounded-2xl border-4 border-white shadow-lg"
              />
            </div>
          )}

          {/* Completion Status */}
          {completedSteps.has(currentStepIndex) && (
            <div className="mt-8 bg-green-100 border-4 border-green-300 p-6 rounded-2xl text-center">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-3" />
              <p className="text-2xl font-bold text-green-900">Done! ✓</p>
            </div>
          )}
        </Card>

        {/* Progress Dots */}
        <div className="flex justify-center gap-4 mt-8 flex-wrap">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStepIndex(index)}
              className={`transition-all ${
                index === currentStepIndex 
                  ? 'w-16 h-16' 
                  : 'w-12 h-12 opacity-50'
              }`}
            >
              {completedSteps.has(index) ? (
                <CheckCircle 
                  className={`w-full h-full ${
                    index === currentStepIndex 
                      ? 'text-green-600' 
                      : 'text-green-400'
                  }`} 
                />
              ) : (
                <Circle 
                  className={`w-full h-full ${
                    index === currentStepIndex 
                      ? 'text-primary fill-primary' 
                      : 'text-muted-foreground'
                  }`}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Navigation - Large Buttons */}
      <div className="bg-card border-t-4 border-border p-6 space-y-4">
        <div className="flex gap-4">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 text-2xl py-8"
            onClick={handlePrevious}
            disabled={currentStepIndex === 0}
          >
            ← Back
          </Button>
          
          <Button
            size="lg"
            className="flex-1 text-2xl py-8"
            onClick={handleComplete}
          >
            {isLastStep ? '🎉 Finish!' : 'Done →'}
          </Button>
        </div>

        {/* Emergency Contact Button */}
        <Button
          variant="destructive"
          size="lg"
          className="w-full text-2xl py-8"
          onClick={() => {
            // Trigger emergency call/alert
            window.location.href = 'tel:999';
          }}
        >
          🚨 Need Help - Call Caregiver
        </Button>
      </div>
    </div>
  );
}
