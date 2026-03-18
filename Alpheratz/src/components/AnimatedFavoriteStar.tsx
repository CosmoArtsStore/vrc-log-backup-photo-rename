import { useEffect, useMemo, useRef, useState } from "react";

interface AnimatedFavoriteStarProps {
  liked: boolean;
  interactive?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
}

const SHARD_COUNT = 8;

const buildShards = () => (
  Array.from({ length: SHARD_COUNT }, (_, index) => {
    const angle = (index / SHARD_COUNT) * Math.PI * 2;
    const distance = 18 + (index % 3) * 4;
    const offsetX = Math.cos(angle) * distance;
    const offsetY = Math.sin(angle) * distance;
    return {
      id: `shard-${index}`,
      width: 4 + (index % 4),
      height: 2 + ((index + 1) % 3),
      offsetX,
      offsetY,
      rotateStart: `${index * 17}deg`,
      rotateEnd: `${index * 29 + 45}deg`,
      delay: `${index * 0.018}s`,
      colorClass: `c${(index % 6) + 1}`,
    };
  })
);

export const AnimatedFavoriteStar = ({
  liked,
  interactive = false,
  className = "",
  title,
  onClick,
}: AnimatedFavoriteStarProps) => {
  const [animationPhase, setAnimationPhase] = useState<"idle" | "shatter" | "reform">("idle");
  const previousLikedRef = useRef(liked);
  const shards = useMemo(() => buildShards(), []);

  useEffect(() => {
    if (liked && !previousLikedRef.current) {
      setAnimationPhase("shatter");
      const shatterTimer = window.setTimeout(() => setAnimationPhase("reform"), 155);
      const resetTimer = window.setTimeout(() => setAnimationPhase("idle"), 420);
      previousLikedRef.current = liked;
      return () => {
        window.clearTimeout(shatterTimer);
        window.clearTimeout(resetTimer);
      };
    }

    previousLikedRef.current = liked;
    if (!liked) {
      setAnimationPhase("idle");
    }
    return undefined;
  }, [liked]);

  const rootClassName = [
    "favorite-star",
    liked ? "liked" : "",
    animationPhase === "shatter" ? "shatter" : "",
    animationPhase === "reform" ? "reform" : "",
    interactive ? "interactive" : "display-only",
    className,
  ].filter(Boolean).join(" ");

  const content = (
    <>
      <div className="favorite-star-bloom" />
      <div className="favorite-star-crystals" aria-hidden="true">
        {shards.map((shard) => (
          <span
            key={shard.id}
            className={`favorite-star-shard ${shard.colorClass}`}
            style={{
              width: `${shard.width}px`,
              height: `${shard.height}px`,
              marginLeft: `${-shard.width / 2}px`,
              marginTop: `${-shard.height / 2}px`,
              ["--ox" as string]: `${shard.offsetX}px`,
              ["--oy" as string]: `${shard.offsetY}px`,
              ["--rot" as string]: shard.rotateStart,
              ["--rot2" as string]: shard.rotateEnd,
              ["--cid" as string]: shard.delay,
            }}
          />
        ))}
      </div>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="favorite-star-path" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    </>
  );

  if (!interactive) {
    return <span className={rootClassName} title={title}>{content}</span>;
  }

  return (
    <button className={rootClassName} type="button" title={title} onClick={onClick}>
      {content}
    </button>
  );
};
