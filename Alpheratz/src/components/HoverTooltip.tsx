import { ReactNode } from "react";

interface HoverTooltipProps {
  label: string;
  children: ReactNode;
  placement?: "top";
  disabled?: boolean;
  className?: string;
}

export const HoverTooltip = ({
  label,
  children,
  placement = "top",
  disabled = false,
  className = "",
}: HoverTooltipProps) => {
  if (disabled) {
    return <>{children}</>;
  }

  const wrapperClassName = [
    "hover-tooltip",
    `placement-${placement}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className={wrapperClassName}>
      {children}
      <div className="hover-tooltip-bubble" role="tooltip" aria-hidden="true">
        <div className="hover-tooltip-inner">{label}</div>
      </div>
    </div>
  );
};
