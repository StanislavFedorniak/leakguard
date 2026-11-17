import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/api/health';

/** API health, refreshed every 30 seconds. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 30_000,
  });
}
