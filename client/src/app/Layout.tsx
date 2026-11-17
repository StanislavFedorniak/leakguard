import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { SUPPORTED_LANGUAGES } from '@/i18n';

/** Common page frame: header with navigation, main content area and footer. */
export function Layout() {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <nav
          aria-label={t('layout.mainNavigation')}
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3"
        >
          <Link
            to="/"
            className="rounded text-lg font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:text-emerald-400"
          >
            {t('app.name')}
          </Link>
          <LanguageSwitcher
            label={t('layout.language')}
            languages={SUPPORTED_LANGUAGES}
            current={i18n.resolvedLanguage ?? i18n.language}
            onChange={(language) => void i18n.changeLanguage(language)}
          />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-sm text-slate-500 dark:border-slate-800">
        {t('layout.footer')}
      </footer>
    </div>
  );
}
