import { useTranslation } from 'react-i18next';
import { HealthPanel } from '@/features/health/HealthPanel';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold sm:text-4xl">{t('app.name')}</h1>
        <p className="max-w-2xl text-slate-600 sm:text-lg dark:text-slate-300">
          {t('app.tagline')}
        </p>
      </section>
      <HealthPanel />
    </div>
  );
}
