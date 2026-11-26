export const OFFICIAL_LOGO_SRC = '/assets/aistudio/Untitled_design__10__c8874a7d.png';

interface OfficialLogoProps {
  className?: string;
  decorative?: boolean;
}

export function OfficialLogo({ className = 'h-9 w-9', decorative = false }: OfficialLogoProps) {
  return (
    <img
      src={OFFICIAL_LOGO_SRC}
      alt={decorative ? '' : 'Manuel V. Gallego Foundation Colleges Official Seal'}
      aria-hidden={decorative ? true : undefined}
      className={`shrink-0 rounded-full bg-white object-contain ${className}`}
    />
  );
}
