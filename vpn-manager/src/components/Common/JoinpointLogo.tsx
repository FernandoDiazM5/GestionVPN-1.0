interface JoinpointLogoProps {
  className?: string;
  inverted?: boolean;
}

/** Identidad compacta de Joinpoint: una J conectada por tres nodos. */
export default function JoinpointLogo({ className = 'h-10 w-10', inverted = false }: JoinpointLogoProps) {
  const primary = inverted ? '#ffffff' : '#3157D5';
  const accent = inverted ? '#9DECF0' : '#16B8C4';

  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Joinpoint" className={className} fill="none">
      <rect width="64" height="64" rx="18" fill={inverted ? 'rgba(255,255,255,0.14)' : '#EEF2FF'} />
      <path d="M42 15v25c0 8.3-6.7 15-15 15-7.2 0-13-4.7-15-11.2" stroke={primary} strokeWidth="7" strokeLinecap="round" />
      <path d="M23 25h19" stroke={primary} strokeWidth="7" strokeLinecap="round" />
      <circle cx="42" cy="15" r="5" fill={accent} />
      <circle cx="23" cy="25" r="5" fill={accent} />
      <circle cx="12" cy="43" r="5" fill={accent} />
    </svg>
  );
}
