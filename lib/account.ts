/**
 * Account actions not yet exposed by dream-api.
 *
 * TODO(backend): dream-api has no `profile_update` (display name) nor
 * `account_delete` action. When they exist, implement them here with
 * callDream(...) and the Ajustes screen enables the controls automatically.
 */
export const accountActions: {
  updateDisplayName: ((name: string) => Promise<void>) | null;
  deleteAccount: (() => Promise<void>) | null;
} = {
  updateDisplayName: null,
  deleteAccount: null,
};
