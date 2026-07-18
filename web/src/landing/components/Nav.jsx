import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Terminal } from "lucide-react";
import { useAuth } from "../../auth/useAuth";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { configured, isAuthenticated, isLoading, login, logout, user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/70 backdrop-blur-md border-b hairline border-slate-200"
          : "bg-transparent border-b hairline border-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-inkwell">
              <Terminal className="h-4 w-4 text-white" strokeWidth={2.2} />
            </div>
            <span className="font-heading text-lg font-bold tracking-tight text-inkwell">
              Zendai
            </span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-royal-blue opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-royal-blue" />
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {[
              ["Features", "#features"],
              ["Workflow", "#workflow"],
              ["Technology", "#technology"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="font-mono-label text-slate-steel transition-colors hover:text-inkwell"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {configured && !isLoading && (
              isAuthenticated ? (
                <>
                  {user?.name && (
                    <span className="hidden sm:inline font-mono-label text-slate-steel max-w-[10rem] truncate">
                      {user.name}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="hidden sm:inline-flex font-mono-label text-slate-steel transition-colors hover:text-inkwell"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void login({ screenHint: "login" })}
                    className="hidden sm:inline-flex font-mono-label text-slate-steel transition-colors hover:text-inkwell"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => void login({ screenHint: "signup" })}
                    className="hidden sm:inline-flex font-mono-label text-slate-steel transition-colors hover:text-inkwell"
                  >
                    Sign up
                  </button>
                </>
              )
            )}
            <Link
              to="/model"
              className="inline-flex items-center justify-center rounded-md bg-inkwell px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-royal-blue hover:rounded-xl"
            >
              {isAuthenticated ? "Open editor" : "Get Started"}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
