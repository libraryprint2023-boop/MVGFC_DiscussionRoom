import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

const ROOM_IMAGE_MAP: Record<'hero' | 'small' | 'seminar' | 'research', string> = {
  hero: '/src/assets/images/hero_mvgfc_library_1795571027366.jpg',
  small: '/src/assets/images/room_study_small_1795571027851.jpg',
  seminar: '/src/assets/images/room_seminar_medium_1795571029295.jpg',
  research: '/src/assets/images/room_research_capstone_1795571029680.jpg',
};

interface RoomImageProps {
  variant: 'hero' | 'small' | 'seminar' | 'research';
  src?: string;
  alt: string;
  className?: string;
}

export function RoomImage({ variant, src, alt, className = '' }: RoomImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src && src.trim() ? src : ROOM_IMAGE_MAP[variant];

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#144A34]/15 via-slate-100 to-slate-200 p-6 text-center text-[#144A34] ${className}`}
      >
        <BookOpen className="mb-2 h-8 w-8 opacity-75" />
        <span className="text-xs font-medium text-slate-700">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
