import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Music2, Play, Sliders, Download, ChevronRight, Sparkles } from 'lucide-react';

interface WelcomeOverlayProps {
  onDismiss: () => void;
}

const steps = [
  {
    icon: Music2,
    title: 'Your chords are ready',
    description: 'Tap any chord to edit it, drag to reorder, or add new ones',
  },
  {
    icon: Sliders,
    title: 'Pick your style',
    description: 'Choose a rhythm pattern that fits your music',
  },
  {
    icon: Play,
    title: 'Press play',
    description: 'Hear your progression come to life with real instruments',
  },
  {
    icon: Download,
    title: 'Export when ready',
    description: 'Download your creation as an audio file',
  },
];

export const WelcomeOverlay = memo(function WelcomeOverlay({ onDismiss }: WelcomeOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onDismiss();
    }
  };

  const currentStepData = steps[currentStep];
  const Icon = currentStepData.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Gradient header */}
        <div className="relative h-32 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 backdrop-blur-sm flex items-center justify-center border border-primary/30">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </div>
          
          {/* Step indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentStep 
                    ? 'w-6 bg-primary' 
                    : index < currentStep 
                      ? 'w-1.5 bg-primary/50' 
                      : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {currentStepData.title}
          </h2>
          
          <p className="text-muted-foreground mb-6">
            {currentStepData.description}
          </p>
          
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={onDismiss}
            >
              Skip
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleNext}
            >
              {currentStep < steps.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                "Let's go!"
              )}
            </Button>
          </div>
        </div>
        
        {/* Step counter */}
        <div className="px-6 pb-4 text-center">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {steps.length}
          </span>
        </div>
      </div>
    </div>
  );
});
