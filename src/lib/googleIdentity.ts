/**
 * Thin wrapper around Google Identity Services (GIS) — the inline "Sign in with
 * Google" button, as opposed to Supabase's own signInWithOAuth(), which redirects the
 * whole page away to a Google-hosted consent screen and back. That full-page round
 * trip showed the visitor "Sign in to continue to <project-ref>.supabase.co" instead
 * of chordsequence.com (Supabase's hosted auth server is the real OAuth client, so
 * that's genuinely the domain Google's redirect returns to — no amount of branding
 * config changes that line). GIS runs inline in an iframe on this page instead: the
 * visitor never leaves the site, and it hands back an ID token this app forwards to
 * Supabase via signInWithIdToken() rather than Supabase brokering the redirect itself.
 *
 * The <script src="https://accounts.google.com/gsi/client"> tag lives in
 * BaseLayout.astro, loaded on every page (async) — waitForGoogleIdentity() below is
 * what a component awaits before touching window.google, since that script may not
 * have finished loading yet when the component mounts.
 */

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        nonce?: string;
        auto_select?: boolean;
        itp_support?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          shape?: 'rectangular' | 'pill' | 'circle' | 'square';
          width?: string | number;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

/** Resolves once window.google is available, or rejects if the script never loads (blocked, offline, etc). */
export function waitForGoogleIdentity(timeoutMs = 8000): Promise<GoogleIdentityServices> {
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google) {
        resolve(window.google);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Google Sign-In failed to load'));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

/**
 * A random nonce, and its SHA-256 hash. Supabase's signInWithIdToken() wants the raw
 * value (it hashes it itself and compares against the ID token's nonce claim); GIS's
 * initialize() wants the pre-hashed value (whatever is passed there is what ends up
 * embedded in the token). Passing the same value to both would never match.
 */
export async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = crypto.randomUUID();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { raw, hashed };
}
