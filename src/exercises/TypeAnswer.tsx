import { useRef } from 'react';

const KEYS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];

/** Text box for Spanish answers with an accent key row (English keyboards lack them). */
export function TypeAnswer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Escribe aquí',
  state,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder?: string;
  state?: 'ok' | 'bad' | 'warn';
}) {
  const ref = useRef<HTMLInputElement>(null);

  function insert(ch: string) {
    const el = ref.current;
    if (!el) return onChange(value + ch);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + ch + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  }

  return (
    <form
      className="type"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
    >
      <input
        ref={ref}
        className={`type-input${state ? ` type-input--${state}` : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        lang="es-ES"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      <div className="keys" aria-label="Spanish characters">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="key"
            disabled={disabled}
            // Keep the input focused so the phone keyboard stays open.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => insert(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <button type="submit" className="tile tile--block" disabled={disabled || !value.trim()}>
        Comprobar
      </button>
    </form>
  );
}
