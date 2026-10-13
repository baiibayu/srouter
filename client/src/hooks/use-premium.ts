// Premium/license system was removed. This hook is kept as a no-op stub
// so existing imports don't break. All callers see `licensed: true`.

export function usePremium() {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    licensed: true,
  }
}
