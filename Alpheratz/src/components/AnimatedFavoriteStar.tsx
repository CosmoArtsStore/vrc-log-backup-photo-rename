import { useEffect, useRef, useState } from "react";

interface AnimatedFavoriteStarProps {
  liked: boolean;
  interactive?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export const AnimatedFavoriteStar = ({
  liked,
  interactive = false,
  className = "",
  title,
  onClick,
}: AnimatedFavoriteStarProps) => {
  const [animationPhase, setAnimationPhase] = useState<"idle" | "fade-in" | "fade-out">("idle");
  const previousLikedRef = useRef(liked);

  useEffect(() => {
    if (liked !== previousLikedRef.current) {
      setAnimationPhase(liked ? "fade-in" : "fade-out");
      const resetTimer = window.setTimeout(() => setAnimationPhase("idle"), 260);
      previousLikedRef.current = liked;
      return () => window.clearTimeout(resetTimer);
    }

    previousLikedRef.current = liked;
    return undefined;
  }, [liked]);

  const rootClassName = [
    "favorite-star",
    liked ? "liked" : "",
    animationPhase === "fade-in" ? "fade-in" : "",
    animationPhase === "fade-out" ? "fade-out" : "",
    interactive ? "interactive" : "display-only",
    className,
  ].filter(Boolean).join(" ");

  const content = (
    <>
      <div className="favorite-star-glow" />
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
