'use client';

import { useState } from 'react';
import { Camera, FileText, Image, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type NavigationMode = 'ar' | 'textual' | 'pictorial' | null;

interface NavigationModeSelectorProps {
  onModeSelect: (mode: NavigationMode) => void;
  onBack: () => void;
}

export default function NavigationModeSelector({
  onModeSelect,
  onBack
}: NavigationModeSelectorProps) {
  const modes = [
    {
      id: 'ar' as NavigationMode,
      title: 'AR Camera Guide',
      description: 'Point camera to see arrows',
      emoji: '📸',
      icon: Camera,
      color: 'bg-blue-500',
      recommended: true,
      requirements: 'Works outdoors with GPS'
    },
    {
      id: 'textual' as NavigationMode,
      title: 'Step-by-Step Text',
      description: 'Read instructions with pictures',
      emoji: '📝',
      icon: FileText,
      color: 'bg-green-500',
      recommended: false,
      requirements: 'Works anywhere'
    },
    {
      id: 'pictorial' as NavigationMode,
      title: 'Simple Pictures',
      description: 'Big emojis and simple words',
      emoji: '🎨',
      icon: Image,
      color: 'bg-purple-500',
      recommended: false,
      requirements: 'Easiest to follow'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8">
        <Button
          variant="ghost"
          size="lg"
          onClick={onBack}
          className="mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back
        </Button>
        
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-3">Choose Your Guide</h1>
          <p className="text-xl text-muted-foreground">
            Pick the way you want to see directions
          </p>
        </div>
      </div>

      {/* Mode Cards */}
      <div className="max-w-4xl mx-auto space-y-4">
        {modes.map((mode) => (
          <Card
            key={mode.id}
            className="p-6 hover:shadow-xl transition-all cursor-pointer border-2 hover:border-primary"
            onClick={() => onModeSelect(mode.id)}
          >
            <div className="flex items-start gap-6">
              {/* Icon */}
              <div className={`${mode.color} text-white rounded-2xl p-6 flex-shrink-0`}>
                <div className="text-6xl">{mode.emoji}</div>
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-3xl font-bold">{mode.title}</h3>
                  {mode.recommended && (
                    <span className="bg-yellow-100 text-yellow-800 text-sm font-bold px-3 py-1 rounded-full">
                      ⭐ Best
                    </span>
                  )}
                </div>
                
                <p className="text-xl text-muted-foreground mb-3">
                  {mode.description}
                </p>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="bg-muted px-3 py-1 rounded-full">
                    {mode.requirements}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center">
                <div className="bg-primary text-primary-foreground rounded-full p-3">
                  <mode.icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Help Text */}
      <div className="max-w-2xl mx-auto mt-8 text-center">
        <Card className="p-6 bg-blue-50 border-blue-200">
          <p className="text-lg text-blue-900">
            💡 <strong>Not sure?</strong> Try AR Camera Guide first. You can always switch modes later!
          </p>
        </Card>
      </div>
    </div>
  );
}
