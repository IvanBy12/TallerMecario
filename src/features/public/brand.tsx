import { Link } from 'react-router-dom';

export function Brand() {
  return (
    <Link className="public-brand" to="/" aria-label="TallerMecario, inicio">
      <svg className="public-brand-mark" width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect width="34" height="34" rx="9" fill="currentColor" />
        <path d="M7 10h20v4h-8v12h-4V14H7z" fill="white" />
        <path d="m23 18 4 4-4 4" stroke="#E9A04C" strokeWidth="3" />
      </svg>
      <span>Taller<span className="public-brand-accent">Mecario</span></span>
    </Link>
  );
}
