import { useId } from 'react';

type LanguageSwitcherProps = {
  label: string;
  languages: readonly string[];
  current: string;
  onChange: (language: string) => void;
};

/** Language selector. Knows nothing about i18next: the caller supplies the state. */
export function LanguageSwitcher({ label, languages, current, onChange }: LanguageSwitcherProps) {
  const id = useId();

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 uppercase focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-800"
      >
        {languages.map((language) => (
          <option key={language} value={language}>
            {language}
          </option>
        ))}
      </select>
    </div>
  );
}
