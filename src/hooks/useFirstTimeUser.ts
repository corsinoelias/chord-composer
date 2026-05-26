import { useState, useCallback } from 'react';

const FIRST_TIME_KEY = 'chord-player-first-time-complete';
const ONBOARDING_KEY = 'chord-player-onboarding-seen';

export function useFirstTimeUser() {
  const [isFirstTime, setIsFirstTime] = useState(() => {
    return localStorage.getItem(FIRST_TIME_KEY) !== 'true';
  });

  const [showOnboarding, setShowOnboarding] = useState(() => {
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
