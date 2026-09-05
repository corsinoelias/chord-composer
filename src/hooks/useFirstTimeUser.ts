import { useState, useCallback } from 'react';

const FIRST_TIME_KEY = 'chord-player-first-time-complete';
const ONBOARDING_KEY = 'chord-player-onboarding-seen';

// The guided tour is switched OFF, not removed -- flip this back to true to restore it.
// GuidedTour.tsx, its render site in Index.tsx and every data-tour anchor are untouched,
// so nothing else has to change to bring it back.
//
// Why it is off: every first-time visitor to /chord-player/ without ?chords= or ?data=
// got a 4-step overlay that blurs the entire app. On a 664px phone screen the modal IS
// the screen, so someone arriving from a "chord player" search met a blurred page and
// "Tap any chord to edit it, drag to reorder" -- over a mouse cursor -- before hearing a
// single chord. Mobile is ~half of sessions and engages 13 points worse than desktop.
// The deep-link exemption in Index.tsx already makes this argument for shared links
// ("came here to see a specific progression, not to be walked through a 4-step tour");
// a cold visitor from search is the same case with less patience, not a different one.
const TOUR_ENABLED: boolean = false;

export function useFirstTimeUser() {
  const [isFirstTime, setIsFirstTime] = useState(() => {
    return localStorage.getItem(FIRST_TIME_KEY) !== 'true';
  });

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (!TOUR_ENABLED) return false;
    return localStorage.getItem(ONBOARDING_KEY) !== 'true';
  });

  const markAsReturningUser = useCallback(() => {
    localStorage.setItem(FIRST_TIME_KEY, 'true');
    setIsFirstTime(false);
  }, []);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
    markAsReturningUser();
  }, [markAsReturningUser]);

  return {
    isFirstTime,
    showOnboarding,
    dismissOnboarding,
    markAsReturningUser,
  };
}
