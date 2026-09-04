export const PLATFORM_SORT_KEYS = [
  'score',
  'coverage',
  'num_qubits',
  'provider',
  'device',
  'last_seen',
] as const;

export type PlatformSortKey = typeof PLATFORM_SORT_KEYS[number];
export type PlatformSortDirection = 'asc' | 'desc';

export type PlatformListRouteState = {
  provider: string;
  showRetiredDevices: boolean;
  sortKey: PlatformSortKey;
  sortDirection: PlatformSortDirection;
};

export const DEFAULT_PLATFORM_LIST_ROUTE_STATE: PlatformListRouteState = {
  provider: '',
  showRetiredDevices: true,
  sortKey: 'score',
  sortDirection: 'desc',
};

function defaultSortDirection(sortKey: PlatformSortKey): PlatformSortDirection {
  return sortKey === 'device' ? 'asc' : 'desc';
}

export function parsePlatformListRoute(route: Record<string, string>): PlatformListRouteState {
  const requestedSortKey = String(route.platform_sort || '').trim();
  const hasValidSortKey = PLATFORM_SORT_KEYS.includes(requestedSortKey as PlatformSortKey);
  const sortKey = hasValidSortKey
    ? requestedSortKey as PlatformSortKey
    : DEFAULT_PLATFORM_LIST_ROUTE_STATE.sortKey;
  const requestedSortDirection = String(route.platform_sort_dir || '').trim().toLowerCase();
  const sortDirection = hasValidSortKey && (requestedSortDirection === 'asc' || requestedSortDirection === 'desc')
    ? requestedSortDirection
    : defaultSortDirection(sortKey);

  return {
    provider: String(route.platform_provider || '').trim(),
    showRetiredDevices: String(route.show_retired || '').trim().toLowerCase() !== 'false',
    sortKey,
    sortDirection,
  };
}

export function serializePlatformListRoute(state: PlatformListRouteState): Record<string, string> {
  const route: Record<string, string> = {};
  const provider = String(state.provider || '').trim();
  if (provider) route.platform_provider = provider;
  if (!state.showRetiredDevices) route.show_retired = 'false';
  if (
    state.sortKey !== DEFAULT_PLATFORM_LIST_ROUTE_STATE.sortKey
    || state.sortDirection !== DEFAULT_PLATFORM_LIST_ROUTE_STATE.sortDirection
  ) {
    route.platform_sort = state.sortKey;
    route.platform_sort_dir = state.sortDirection;
  }
  return route;
}
