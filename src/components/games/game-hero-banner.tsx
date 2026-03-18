"use client";

import { useState } from "react";
import Image from "next/image";

interface GameHeroBannerProps {
  steamAppId: string;
  title: string;
  coverUrl: string | null;
}

/**
 * Cinematic hero banner for a Steam game.
 *
 * - Hero: `library_hero.jpg` (3840×1240) — blurred + darkened to act as
 *   atmospheric texture, not a competing image.
 * - Box art: `library_600x900.jpg` or falls back to `coverUrl` — floats
 *   on the left with a drop shadow.
 * - Fails silently: if either image 404s an `onError` hides it gracefully.
 */
export function GameHeroBanner({ steamAppId, title, coverUrl }: GameHeroBannerProps) {
  const heroUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/library_hero.jpg`;
  const boxUrl  = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`;

  const [heroFailed, setHeroFailed]   = useState(false);
  const [boxFailed,  setBoxFailed]    = useState(false);

  // If the hero image fails there's nothing to show — render nothing and let
  // the caller fall back to the plain game section layout.
  if (heroFailed) return null;

  const effectiveBoxUrl = boxFailed ? coverUrl : boxUrl;

  return (
    <div className="relative w-full h-36 sm:h-44 rounded-xl overflow-hidden">
      {/* Hero — blurred, darkened atmospheric layer */}
      <Image
        src={heroUrl}
        alt=""
        fill
        className="object-cover object-center scale-105 blur-sm brightness-50"
        sizes="(max-width: 768px) 100vw, 700px"
        onError={() => setHeroFailed(true)}
        priority
      />

      {/* Dark gradient over bottom edge for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      {/* Box art — floats left, anchored to bottom */}
      {effectiveBoxUrl && (
        <div className="absolute bottom-3 left-4 z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={effectiveBoxUrl}
            alt={title}
            onError={() => setBoxFailed(true)}
            className="h-24 sm:h-28 w-auto rounded-md shadow-xl object-cover"
          />
        </div>
      )}

      {/* Game title anchored bottom-right */}
      <div className="absolute bottom-3 right-4 left-36 sm:left-40 z-10">
        <p className="text-white font-bold text-base sm:text-lg leading-tight line-clamp-2 drop-shadow">
          {title}
        </p>
      </div>
    </div>
  );
}
