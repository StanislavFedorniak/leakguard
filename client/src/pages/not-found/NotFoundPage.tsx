import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <Link
        to="/"
        className="text-emerald-700 underline focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:text-emerald-400"
      >
        {t('notFound.back')}
      </Link>
    </div>
  );
}
