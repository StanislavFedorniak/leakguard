import type { DependencyStatus, HealthResponse } from '@leakguard/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useHealth } from './useHealth';

const DEPENDENCIES = [
  'database',
  'redis',
] as const satisfies readonly (keyof HealthResponse['checks'])[];

/** Shows whether the API and its dependencies are reachable. */
export function HealthPanel() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useHealth();

  return (
    <section
      aria-labelledby="health-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id="health-title" className="text-lg font-semibold">
        {t('health.title')}
      </h2>

      {/* <output> is a live region: screen readers announce status changes. */}
      <output aria-live="polite" className="mt-3 block">
        {isPending && <span className="text-slate-500">{t('health.checking')}</span>}
        {isError && (
          <span className="text-red-700 dark:text-red-400">{t('health.unavailable')}</span>
        )}
        {data && <span className="font-medium">{t(`health.overall.${data.status}`)}</span>}
      </output>

      {data && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {DEPENDENCIES.map((name) => (
            <li
              key={name}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800"
            >
              <span>{t(`health.dependency.${name}`)}</span>
              <StateLabel state={data.checks[name]} text={t(`health.state.${data.checks[name]}`)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StateLabel({ state, text }: { state: DependencyStatus; text: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium',
        state === 'up'
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-red-700 dark:text-red-400',
      )}
    >
      <span aria-hidden="true">{state === 'up' ? '●' : '▲'}</span>
      {text}
    </span>
  );
}
