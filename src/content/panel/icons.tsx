import type { ImgHTMLAttributes, SVGProps } from "react";
import whaleLogo from "../../../static/icons/icon-128.png?inline";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function WhaleMark(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src={whaleLogo} alt="" aria-hidden="true" draggable={false} {...props} />;
}

export const CloseIcon = (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
export const ArrowIcon = (props: IconProps) => <IconBase {...props}><path d="M4 12h16M14 6l6 6-6 6" /></IconBase>;
export const ChevronIcon = (props: IconProps) => <IconBase {...props}><path d="m7 9 5 5 5-5" /></IconBase>;
export const SoundIcon = (props: IconProps) => <IconBase {...props}><path d="M11 5 6.5 9H3v6h3.5l4.5 4V5ZM15 9a4 4 0 0 1 0 6M17.8 6.2a8 8 0 0 1 0 11.6" /></IconBase>;
export const StopIcon = (props: IconProps) => <IconBase {...props}><rect x="7" y="7" width="10" height="10" rx="1" /></IconBase>;
export const CopyIcon = (props: IconProps) => <IconBase {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></IconBase>;
export const RetryIcon = (props: IconProps) => <IconBase {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.5-2.2L20 12M4 12l2.4 5.2A7 7 0 0 0 17.9 15" /></IconBase>;
export const MoveIcon = (props: IconProps) => <IconBase {...props}><path d="M12 3v18M3 12h18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5" /></IconBase>;
export const GripIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
);
export const BookIcon = (props: IconProps) => <IconBase {...props}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5Z" /></IconBase>;
export const StarIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="m12 3.2 2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8Z" />
  </svg>
);
