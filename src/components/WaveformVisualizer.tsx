/**
 * Waveform Visualizer Component
 * 
 * Real-time audio visualization using Web Audio API AnalyserNode
 * Displays animated bars that respond to the audio frequencies
 */

import { useEffect, useRef, memo } from 'react';
import { getAnalyserNode } from '@/lib/appEngine/preview';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  className?: string;
  barCount?: number;
  variant?: 'bars' | 'wave' | 'circle';
  color?: string;
}

// Helper to resolve CSS variable colors to Canvas-compatible format
function resolveColor(color: string): { hsl: string; hsla: (alpha: number) => string } {
  let h = 262, s = 83, l = 58; // defaults
  
  if (color.includes('var(--')) {
    const match = color.match(/var\(--([^)]+)\)/);
    if (match) {
      const varName = match[1];
      const root = document.documentElement;
      const computed = getComputedStyle(root).getPropertyValue(`--${varName}`).trim();
      if (computed) {
        // Parse space-separated HSL values like "262 83% 58%"
        const parts = computed.split(/\s+/);
        if (parts.length >= 3) {
          h = parseFloat(parts[0]);
          s = parseFloat(parts[1]);
          l = parseFloat(parts[2]);
        }
      }
    }
  } else {
    // Try to parse existing hsl format
    const hslMatch = color.match(/hsl\((\d+),?\s*(\d+)%?,?\s*(\d+)%?\)/);
    if (hslMatch) {
      h = parseFloat(hslMatch[1]);
      s = parseFloat(hslMatch[2]);
      l = parseFloat(hslMatch[3]);
    }
  }
  
  return {
    hsl: `hsl(${h}, ${s}%, ${l}%)`,
    hsla: (alpha: number) => `hsla(${h}, ${s}%, ${l}%, ${alpha})`
  };
}

export const WaveformVisualizer = memo(function WaveformVisualizer({
  isPlaying,
  className = '',
  barCount = 32,
  variant = 'bars',
  color = 'hsl(var(--primary))',
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  
  // Resolve the color once
  const resolvedColor = resolveColor(color);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = getAnalyserNode();
    
    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if (!analyser || !isPlaying) {
      // Draw idle state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const rect = canvas.getBoundingClientRect();
      const barWidth = rect.width / barCount;
      const centerY = rect.height / 2;
      
      ctx.fillStyle = 'hsl(var(--muted-foreground) / 0.2)';
      for (let i = 0; i < barCount; i++) {
        const x = i * barWidth;
        const height = 4;
        ctx.fillRect(x + 1, centerY - height / 2, barWidth - 2, height);
      }
      return;
    }

    // Initialize data array
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying || !analyser || !dataArrayRef.current) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);
      
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (variant === 'bars') {
        drawBars(ctx, dataArray, rect, barCount, resolvedColor);
      } else if (variant === 'wave') {
        drawWave(ctx, dataArray, rect, resolvedColor);
      } else if (variant === 'circle') {
        drawCircle(ctx, dataArray, rect, barCount, resolvedColor);
      }
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, barCount, variant, color]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ display: 'block' }}
    />
  );
});

type ResolvedColor = { hsl: string; hsla: (alpha: number) => string };

function drawBars(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  rect: DOMRect,
  barCount: number,
  color: ResolvedColor
) {
  const barWidth = rect.width / barCount;
  const centerY = rect.height / 2;
  const maxBarHeight = rect.height * 0.8;
  
  // Sample the frequency data evenly
  const step = Math.floor(dataArray.length / barCount);
  
  for (let i = 0; i < barCount; i++) {
    const dataIndex = i * step;
    const value = dataArray[dataIndex] || 0;
    const normalizedValue = value / 255;
    
    // Apply easing for smoother visuals
    const easedValue = Math.pow(normalizedValue, 0.8);
    const barHeight = Math.max(4, easedValue * maxBarHeight);
    
    const x = i * barWidth;
    
    // Create gradient for each bar
    const gradient = ctx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
    gradient.addColorStop(0, color.hsl);
    gradient.addColorStop(0.5, color.hsla(0.8));
    gradient.addColorStop(1, color.hsl);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x + 1, centerY - barHeight / 2, barWidth - 2, barHeight, 2);
    ctx.fill();
  }
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  rect: DOMRect,
  color: ResolvedColor
) {
  const centerY = rect.height / 2;
  const maxAmplitude = rect.height * 0.4;
  
  ctx.beginPath();
  ctx.strokeStyle = color.hsl;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const sliceWidth = rect.width / dataArray.length;
  let x = 0;
  
  for (let i = 0; i < dataArray.length; i++) {
    const value = dataArray[i] / 255;
    const y = centerY + (value - 0.5) * maxAmplitude * 2;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    
    x += sliceWidth;
  }
  
  ctx.stroke();
  
  // Draw mirror wave
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const value = dataArray[i] / 255;
    const y = centerY - (value - 0.5) * maxAmplitude * 2;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    
    x += sliceWidth;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  rect: DOMRect,
  barCount: number,
  color: ResolvedColor
) {
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const baseRadius = Math.min(rect.width, rect.height) * 0.25;
  const maxBarLength = Math.min(rect.width, rect.height) * 0.2;
  
  const step = Math.floor(dataArray.length / barCount);
  const angleStep = (Math.PI * 2) / barCount;
  
  ctx.strokeStyle = color.hsl;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  
  for (let i = 0; i < barCount; i++) {
    const dataIndex = i * step;
    const value = dataArray[dataIndex] || 0;
    const normalizedValue = value / 255;
    const barLength = baseRadius + normalizedValue * maxBarLength;
    
    const angle = i * angleStep - Math.PI / 2;
    const x1 = centerX + Math.cos(angle) * baseRadius;
    const y1 = centerY + Math.sin(angle) * baseRadius;
    const x2 = centerX + Math.cos(angle) * barLength;
    const y2 = centerY + Math.sin(angle) * barLength;
    
    ctx.globalAlpha = 0.5 + normalizedValue * 0.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  
  // Draw center circle
  ctx.fillStyle = color.hsla(0.2);
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

export default WaveformVisualizer;
