import { Link } from 'react-router-dom';
import { isAuthConfigured } from '../auth/config';
import { useAuth } from '../auth/useAuth';

/**
 * Public landing (`/`). Sign up / Log in via Auth0 Universal Login when
 * configured; otherwise a single CTA into the editor. Auth is optional —
 * users can always continue without an account.
 */
export function LandingPage() {
  const { configured, isAuthenticated, isLoading, login, logout } = useAuth();

  return (
    <main className="landing">
      <div className="landing__inner">
        <p className="landing__brand">MotionForge</p>
        <h1 className="landing__title">Code-based 3D scenes, live and editable</h1>
        <p className="landing__lede">
          Prompt an AI agent, tune the PARAMS, preview in WebGL, and export to
          Blender or MP4. Sign in only if you want to push projects to GitHub.
        </p>

        <div className="landing__actions">
          <Link className="landing__btn landing__btn--primary" to="/model">
            {isAuthenticated ? 'Open editor' : 'Continue without signing in'}
          </Link>

          {configured && !isLoading && !isAuthenticated && (
            <>
              <button
                type="button"
                className="landing__btn"
                onClick={() => void login({ screenHint: 'signup' })}
              >
                Sign up
              </button>
              <button
                type="button"
                className="landing__btn"
                onClick={() => void login({ screenHint: 'login' })}
              >
                Log in
              </button>
            </>
          )}

          {configured && isAuthenticated && (
            <button type="button" className="landing__btn" onClick={logout}>
              Log out
            </button>
          )}
        </div>

        {!isAuthConfigured && (
          <p className="landing__note hint">
            Auth0 is not configured — GitHub export sign-in will stay unavailable
            until <code>VITE_AUTH0_*</code> is set.
          </p>
        )}
      </div>
    </main>
  );
}
