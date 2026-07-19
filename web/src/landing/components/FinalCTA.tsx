import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export default function FinalCTA() {
  const [hovered, setHovered] = useState(false);

  return (
    <section id="cta" className="border-t hairline border-white/10 bg-inkwell text-white">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-28 lg:py-40">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-8">
            <span className="font-mono-label"><span className="text-royal-blue">05</span> <span className="text-slate-400">/ Start</span></span>
            <span className="h-px w-8 bg-royal-blue/50" />
            <span className="font-mono-label text-slate-400">Begin your first scene</span>
          </div>
          <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.04em] text-white text-balance">
            Start Building with{' '}
            <span
              className="relative inline-block cursor-pointer select-none"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-300 to-blue-400 transition-all duration-700 ease-out inline-block">
                Zendai
              </span>
              <svg className="absolute -bottom-1 left-0 w-full" height="8" viewBox="0 0 200 8" preserveAspectRatio="none" fill="none">
                <path d="M2 5 C 50 2, 150 2, 198 5" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span
                className="pointer-events-none absolute inset-0 rounded animate-shimmer transition-opacity duration-700"
                style={{
                  background: 'linear-gradient(to right, transparent, rgba(147,197,253,0.4), transparent)',
                  backgroundSize: '200% 100%',
                  opacity: hovered ? 1 : 0,
                }}
              />
            </span>
            <span className="inline-block ml-1 animate-fade-up">.</span>
          </h2>
          <p className="mt-6 max-w-xl text-base lg:text-lg leading-relaxed text-slate-400">
            Create your first 3D scene in seconds. No installs, no learning
            curve. Just describe what you want and make it yours.
          </p>

          <div className="mt-10">
            <Link
              to="/model"
              className="group inline-flex items-center gap-2 rounded-md bg-white px-6 py-3.5 text-sm font-medium text-inkwell transition-all duration-300 hover:bg-royal-blue hover:text-white hover:rounded-xl"
            >
              Get Started
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}