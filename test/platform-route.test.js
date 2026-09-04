import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePlatformListRoute,
  serializePlatformListRoute,
} from '../platform-route.js';

test('restores provider and retired-device filters from a Platforms deep link', () => {
  assert.deepEqual(parsePlatformListRoute({
    platform_provider: 'IBM',
    show_retired: 'false',
  }), {
    provider: 'IBM',
    showRetiredDevices: false,
    sortKey: 'score',
    sortDirection: 'desc',
  });
});

test('round-trips the shareable IBM active-devices view', () => {
  const expectedState = {
    provider: 'IBM',
    showRetiredDevices: false,
    sortKey: 'score',
    sortDirection: 'desc',
  };
  const params = new URLSearchParams({
    view: 'platforms',
    ...serializePlatformListRoute(expectedState),
  });

  assert.equal(params.toString(), 'view=platforms&platform_provider=IBM&show_retired=false');
  assert.deepEqual(
    parsePlatformListRoute(Object.fromEntries(params)),
    expectedState,
  );
});

test('serializes non-default Platforms state into shareable parameters', () => {
  assert.deepEqual(serializePlatformListRoute({
    provider: 'IBM',
    showRetiredDevices: false,
    sortKey: 'provider',
    sortDirection: 'asc',
  }), {
    platform_provider: 'IBM',
    show_retired: 'false',
    platform_sort: 'provider',
    platform_sort_dir: 'asc',
  });
});

test('keeps default Platforms state out of the URL', () => {
  assert.deepEqual(serializePlatformListRoute({
    provider: '',
    showRetiredDevices: true,
    sortKey: 'score',
    sortDirection: 'desc',
  }), {});
});

test('falls back safely for malformed Platforms route values', () => {
  assert.deepEqual(parsePlatformListRoute({
    platform_sort: 'unknown',
    platform_sort_dir: 'asc',
    show_retired: 'maybe',
  }), {
    provider: '',
    showRetiredDevices: true,
    sortKey: 'score',
    sortDirection: 'desc',
  });
});
