/**
 * Key Detection Module
 * 
 * Analyzes chord progressions to detect the likely key/tonality
 * using music theory principles.
 */

import { Chord, RootNote, Accidental, ChordQuality } from './musicTheory';

// All 12 chromatic notes
const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Major scale intervals from root
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// Minor scale intervals from root  
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Chord functions in major key (by scale degree)
const MAJOR_KEY_CHORD_WEIGHTS: Record<string, number> = {
  'I_maj': 10,    // Tonic
  'ii_min': 4,    // Supertonic
  'iii_min': 3,   // Mediant
  'IV_maj': 6,    // Subdominant
  'V_maj': 8,     // Dominant
  'V_7': 9,       // Dominant 7th
  'vi_min': 5,    // Submediant
  'vii_dim': 2,   // Leading tone
};

// Chord functions in minor key
const MINOR_KEY_CHORD_WEIGHTS: Record<string, number> = {
  'i_min': 10,    // Tonic
  'ii_dim': 3,    // Supertonic
  'III_maj': 4,   // Mediant
  'iv_min': 5,    // Subdominant
  'V_maj': 7,     // Dominant (harmonic minor)
  'V_7': 8,       // Dominant 7th
  'v_min': 4,     // Natural minor dominant
  'VI_maj': 5,    // Submediant
  'VII_maj': 3,   // Subtonic
  'vii_dim': 2,   // Leading tone
};

function noteToChromatic(root: RootNote, accidental: Accidental): number {
  const baseNote = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 }[root];
  if (accidental === '#') return (baseNote + 1) % 12;
  if (accidental === 'b') return (baseNote + 11) % 12;
  return baseNote;
}

function getScaleDegree(chordRoot: number, keyRoot: number): number {
  return (chordRoot - keyRoot + 12) % 12;
}

function qualityToType(quality: ChordQuality): 'maj' | 'min' | 'dim' | '7' | 'other' {
  if (['maj', 'maj7', 'maj9', '6'].includes(quality)) return 'maj';
  if (['min', 'min7', 'min9', 'min6'].includes(quality)) return 'min';
  if (['dim', 'dim7', 'm7b5'].includes(quality)) return 'dim';
  if (['7', '9'].includes(quality)) return '7';
  return 'other';
}

interface KeyCandidate {
  root: string;
  mode: 'major' | 'minor';
  score: number;
}

export function detectKey(chords: Chord[]): { key: string; confidence: number } {
  if (chords.length === 0) {
    return { key: 'C Major', confidence: 0 };
  }

  const candidates: KeyCandidate[] = [];

  // Test each possible key
  for (let keyRootIdx = 0; keyRootIdx < 12; keyRootIdx++) {
    const keyRoot = CHROMATIC_NOTES[keyRootIdx];
    
    // Test major key
    let majorScore = 0;
    let minorScore = 0;
    
    chords.forEach((chord, idx) => {
      const chordRoot = noteToChromatic(chord.root, chord.accidental);
      const degree = getScaleDegree(chordRoot, keyRootIdx);
      const chordType = qualityToType(chord.quality);
      
      // Weight: first and last chords are more important
      const positionWeight = (idx === 0 || idx === chords.length - 1) ? 2 : 1;
      
      // Check major key compatibility
      if (MAJOR_SCALE_INTERVALS.includes(degree)) {
        // Check expected chord quality at this degree
        const majorDegreeExpectations: Record<number, string[]> = {
          0: ['maj', '7'],  // I
          2: ['min'],       // ii
          4: ['min'],       // iii
          5: ['maj'],       // IV
          7: ['maj', '7'],  // V
          9: ['min'],       // vi
          11: ['dim'],      // vii°
        };
        
        if (majorDegreeExpectations[degree]?.includes(chordType)) {
          majorScore += (degree === 0 ? 10 : degree === 7 ? 8 : 5) * positionWeight;
        } else {
          majorScore += 1 * positionWeight;
        }
      }
      
      // Check minor key compatibility
      const minorKeyRootIdx = (keyRootIdx + 9) % 12; // Relative minor
      const minorDegree = getScaleDegree(chordRoot, minorKeyRootIdx);
      
      if (MINOR_SCALE_INTERVALS.includes(minorDegree)) {
        const minorDegreeExpectations: Record<number, string[]> = {
          0: ['min'],       // i
          2: ['dim'],       // ii°
          3: ['maj'],       // III
          5: ['min'],       // iv
          7: ['maj', '7'],  // V (harmonic)
          8: ['maj'],       // VI
          10: ['maj'],      // VII
        };
        
        if (minorDegreeExpectations[minorDegree]?.includes(chordType)) {
          minorScore += (minorDegree === 0 ? 10 : minorDegree === 7 ? 8 : 5) * positionWeight;
        } else {
          minorScore += 1 * positionWeight;
        }
      }
    });
    
    candidates.push({ root: keyRoot, mode: 'major', score: majorScore });
    candidates.push({ root: CHROMATIC_NOTES[(keyRootIdx + 9) % 12], mode: 'minor', score: minorScore });
  }
  
  // Sort by score
  candidates.sort((a, b) => b.score - a.score);
  
  const best = candidates[0];
  const maxPossibleScore = chords.length * 20; // Rough estimate
  const confidence = Math.min(100, Math.round((best.score / maxPossibleScore) * 100));
  
  // Format key name
  const keyName = `${best.root.replace('#', '♯').replace('b', '♭')} ${best.mode === 'major' ? 'Major' : 'Minor'}`;
  
  return { key: keyName, confidence };
}

/**
 * Get scale notes for a detected key
 */
export function getScaleNotes(key: string): string[] {
  const match = key.match(/^([A-G][#♯b♭]?)\s+(Major|Minor)$/i);
  if (!match) return [];
  
  let rootNote = match[1].replace('♯', '#').replace('♭', 'b');
  const mode = match[2].toLowerCase();
  
  const rootIdx = CHROMATIC_NOTES.indexOf(rootNote as typeof CHROMATIC_NOTES[number]);
  if (rootIdx === -1) return [];
  
  const intervals = mode === 'major' ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
  
  return intervals.map(interval => {
    const noteIdx = (rootIdx + interval) % 12;
    return CHROMATIC_NOTES[noteIdx].replace('#', '♯');
  });
}
