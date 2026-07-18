import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, ArrowUpRight, Box, Layers, Clapperboard, Settings2, Download, Sparkles } from "lucide-react";

const PROMPT_TEXT = "A windswept dune field at dusk, low poly terrain, sharp shadows";

function useTyped(text, speed = 38, startDelay = 600) {
  const [out, setOut] = useState("");
  useEffect(() => {
    let i = 0;
    let timer;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        i++;
        setOut(text.slice(0, i));
        if (i >= text.length) clearInterval(timer);
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [text, speed, startDelay]);
  return out;
}

export default function Hero() {
  const typed = useTyped(PROMPT_TEXT);

  return (
    <section id="top" className="relative pt-32 pb-24 lg:pt-40 lg:pb-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-8 animate-fade-up">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-royal-blue opacity-50 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-royal-blue" />
          </span>
          <span className="font-mono-label text-slate-steel">v1.0</span>
          <span className="h-px w-8 bg-royal-blue/40" />
          <span className="font-mono-label text-inkwell">Spatial Architecture Engine</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Editorial stack */}
          <div className="lg:col-span-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h1 className="font-heading text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem] font-bold tracking-[-0.04em] text-inkwell text-balance">
              Create 3D Worlds From a <span className="relative inline-block text-royal-blue">
                Prompt
                <svg className="absolute -bottom-1 left-0 w-full" height="8" viewBox="0 0 200 8" preserveAspectRatio="none" fill="none">
                  <path d="M2 5 C 50 2, 150 2, 198 5" stroke="#1E40AF" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-md text-base lg:text-lg leading-relaxed text-slate-steel">
              Generate, edit, and export 3D scenes in your browser with Blender,
              Three.js, WebGL, and Remotion.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/model"
                className="inline-flex items-center gap-2 rounded-md bg-inkwell px-5 py-3 text-sm font-medium text-white transition-all duration-300 hover:bg-royal-blue hover:rounded-xl"
              >
                Get Started
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-md border hairline border-slate-300 px-5 py-3 text-sm font-medium text-inkwell transition-all duration-300 hover:border-inkwell hover:bg-slate-50"
              >
                <Play className="h-3.5 w-3.5 fill-inkwell" />
                Watch Demo
              </a>
            </div>

            <div className="mt-10 flex items-center gap-6 font-mono-label text-slate-steel">
              <span>Blender</span>
              <span className="h-3 w-px bg-slate-300" />
              <span>Three.js</span>
              <span className="h-3 w-px bg-slate-300" />
              <span>WebGL</span>
              <span className="h-3 w-px bg-slate-300" />
              <span className="text-royal-blue">Remotion</span>
            </div>
          </div>

          {/* Product mockup */}
          <div className="lg:col-span-7 animate-fade-up" style={{ animationDelay: "0.25s" }}>
            <ProductMockup typed={typed} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductMockup({ typed }) {
  return (
    <div className="relative">
      {/* Playful sticker */}
      <div className="absolute -top-4 -right-3 z-20 rotate-[6deg] select-none">
        <div className="flex items-center gap-1.5 rounded-full border hairline border-royal-blue bg-royal-blue px-3 py-1.5 shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          <span className="font-mono-label text-white">live preview</span>
        </div>
      </div>
      {/* Window chrome */}
      <div className="rounded-xl border hairline border-slate-300 bg-white shadow-[0_1px_2px_rgba(10,15,30,0.04),0_24px_60px_-24px_rgba(10,15,30,0.18)] overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b hairline border-slate-200 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          </div>
          <span className="font-mono-label text-slate-steel">zendai / scene-01.zdai</span>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-md bg-inkwell px-2.5 py-1 text-white font-mono-label">
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
        </div>

        {/* Prompt input */}
        <div className="border-b hairline border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-royal-blue shrink-0" />
            <div className="flex-1 text-sm text-inkwell">
              <span>{typed}</span>
              <span className="inline-block w-px h-4 bg-inkwell align-middle ml-0.5 animate-pulse" />
            </div>
            <button className="rounded-md border hairline border-slate-300 px-2.5 py-1 font-mono-label text-slate-steel hover:border-inkwell hover:text-inkwell transition-colors">
              Generate
            </button>
          </div>
        </div>

        {/* Main body: viewport + properties */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px]">
          {/* 3D Viewport */}
          <div className="relative aspect-[4/3] bg-gradient-to-b from-slate-50 to-slate-100 border-b md:border-b-0 md:border-r hairline border-slate-200 overflow-hidden">
            <ViewportGrid />
            <Viewport3D />
            <div className="absolute top-3 left-3 font-mono-label text-slate-steel">Viewport · 3D</div>
            <div className="absolute bottom-3 left-3 flex items-center gap-3 font-mono-label text-slate-steel">
              <span>X 0.00</span>
              <span>Y 0.00</span>
              <span>Z 0.00</span>
            </div>
          </div>

          {/* Properties panel */}
          <div className="p-3.5 space-y-4">
            <div>
              <div className="font-mono-label text-slate-steel mb-2">Properties</div>
              <div className="space-y-1.5">
                {[
                  ["Mesh", "Terrain"],
                  ["Verts", "12,480"],
                  ["Material", "Clay"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-steel">{k}</span>
                    <span className="text-inkwell font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-px bg-slate-200" />
            <div>
              <div className="font-mono-label text-slate-steel mb-2">Transform</div>
              {["Pos", "Rot", "Scl"].map((label) => (
                <div key={label} className="flex items-center gap-2 mb-1.5">
                  <span className="w-7 font-mono-label text-slate-steel">{label}</span>
                  <div className="flex-1 grid grid-cols-3 gap-1">
                    {[0, 0, 0].map((_, i) => (
                      <div key={i} className="h-5 rounded-sm border hairline border-slate-200 bg-slate-50" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="border-t hairline border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Clapperboard className="h-3.5 w-3.5 text-slate-steel" />
            <span className="font-mono-label text-slate-steel">Timeline</span>
            <span className="ml-auto font-mono-label text-slate-steel">00:00 / 00:12</span>
          </div>
          <div className="space-y-1.5">
            {[
              { w: "w-3/4", icon: Box, label: "Scene" },
              { w: "w-1/2", icon: Layers, label: "Camera" },
              { w: "w-2/3", icon: Settings2, label: "Lights" },
            ].map((track, i) => {
              const Icon = track.icon;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Icon className="h-3 w-3 text-slate-400" />
                  <div className="flex-1 h-5 rounded-sm bg-slate-50 border hairline border-slate-200 relative overflow-hidden">
                    <div className={`absolute inset-y-0 left-0 ${track.w} bg-inkwell/85 rounded-sm`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewportGrid() {
  return (
    <div className="absolute inset-0 opacity-[0.5]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(100,116,139,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-royal-blue/30" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-royal-blue/30" />
    </div>
  );
}

function Viewport3D() {
  return (
    <div className="absolute inset-0 flex items-end justify-center pb-10">
      <svg viewBox="0 0 400 220" className="w-[78%] h-auto" fill="none">
        {/* Wireframe dune landscape */}
        {[0, 1, 2, 3, 4, 5].map((row) => {
          const y = 30 + row * 28;
          const depth = row / 5;
          return (
            <path
              key={row}
              d={`M 20 ${y} C 80 ${y - 18 - depth * 6}, 140 ${y + 14 - depth * 10}, 200 ${y - 6 - depth * 8} S 320 ${y - 22 - depth * 6}, 380 ${y - 2 - depth * 4}`}
              stroke="rgba(10,15,30,0.35)"
              strokeWidth="0.6"
            />
          );
        })}
        {/* Vertical connectors */}
        {[60, 120, 180, 240, 300, 360].map((x, i) => (
          <path
            key={x}
            d={`M ${x} ${28 + i * 0} C ${x + 4} 60, ${x - 6} 110, ${x + 2} 170`}
            stroke="rgba(10,15,30,0.18)"
            strokeWidth="0.5"
          />
        ))}
        {/* Focal object */}
        <g transform="translate(195, 96)">
          <polygon points="0,-22 24,8 -24,8" stroke="#0A0F1E" strokeWidth="0.8" fill="rgba(10,15,30,0.06)" />
          <polygon points="0,-22 24,8 -24,8" stroke="#1E40AF" strokeWidth="0.4" fill="none" transform="translate(2,2)" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
}