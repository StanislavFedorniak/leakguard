import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import i18n from '@/i18n';

// Registered explicitly on this `expect`: the side-effect entry `@testing-library/jest-dom/vitest`
// intermittently left the matchers unregistered under Vitest 5.
expect.extend(matchers);

// Tests assert on English strings regardless of the machine's locale.
await i18n.changeLanguage('en');

afterEach(() => {
  cleanup();
});
