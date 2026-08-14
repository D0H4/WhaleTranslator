import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function WhaleMark(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="10" fill="currentColor" />
      <path d="M7.5 18.3c2.9 1.3 5.3 1.1 7.3-.5-1.7-1.4-2.4-3.2-2.2-5.5 2.2.3 3.8 1.3 4.9 3.1 1-1.9 2.5-3 4.7-3.5.4 2.4-.1 4.3-1.7 5.8 1.4.8 2.7 1.1 4 .8-1.5 3.9-4.5 5.8-9 5.8-3.9 0-6.6-2-8-6Z" fill="var(--whale-mark-ink)" />
      <path d="M9.6 15.2c.9-3.8 3.5-5.8 7.7-5.8" stroke="var(--whale-mark-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
}

export const CloseIcon = (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
export const ArrowIcon = (props: IconProps) => <IconBase {...props}><path d="M4 12h16M14 6l6 6-6 6" /></IconBase>;
export const ChevronIcon = (props: IconProps) => <IconBase {...props}><path d="m7 9 5 5 5-5" /></IconBase>;
export const SoundIcon = (props: IconProps) => <IconBase {...props}><path d="M11 5 6.5 9H3v6h3.5l4.5 4V5ZM15 9a4 4 0 0 1 0 6M17.8 6.2a8 8 0 0 1 0 11.6" /></IconBase>;
export const StopIcon = (props: IconProps) => <IconBase {...props}><rect x="7" y="7" width="10" height="10" rx="1" /></IconBase>;
export const CopyIcon = (props: IconProps) => <IconBase {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></IconBase>;
export const RetryIcon = (props: IconProps) => <IconBase {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.5-2.2L20 12M4 12l2.4 5.2A7 7 0 0 0 17.9 15" /></IconBase>;
export const MoveIcon = (props: IconProps) => <IconBase {...props}><path d="M12 3v18M3 12h18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5" /></IconBase>;
