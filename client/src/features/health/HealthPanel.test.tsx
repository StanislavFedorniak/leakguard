import type { HealthResponse } from '@leakguard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPanel } from './HealthPanel';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HealthPanel />
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthPanel', () => {
  it('shows that all systems are operational', async () => {
    const body: HealthResponse = { status: 'ok', checks: { database: 'up', redis: 'up' } };
    mockFetch(200, body);

    renderPanel();

    expect(await screen.findByText('All systems operational')).toBeInTheDocument();
    expect(screen.getAllByText('Up')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('shows which dependency is down when the API answers 503', async () => {
    const body: HealthResponse = { status: 'error', checks: { database: 'up', redis: 'down' } };
    mockFetch(503, body);

    renderPanel();

    expect(await screen.findByText('Some services are unavailable')).toBeInTheDocument();
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('shows an error when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderPanel();

    expect(await screen.findByText('The API is unavailable')).toBeInTheDocument();
  });
});
