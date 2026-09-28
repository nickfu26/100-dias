import { Link } from 'react-router';

export function PreviewBanner({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`preview-banner${compact ? ' preview-banner--compact' : ''}`} role="status">
      <strong>Vista previa</strong>
      {compact ? null : (
        <>
          {' '}
          · everything unlocked, progress kept separately. <Link to="/settings">Ajustes</Link>
        </>
      )}
    </p>
  );
}
