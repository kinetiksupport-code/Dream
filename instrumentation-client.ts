import { privacyEvent } from "./lib/observability/privacy";
import { syncAnalytics } from "./lib/observability/analytics";
import { syncDiagnostics } from "./lib/observability/diagnostics";
export { onRouterTransitionStart } from "./lib/observability/diagnostics";
const sync = () => {
  void syncAnalytics().catch(() => {});
  void syncDiagnostics().catch(() => {});
};
sync();
window.addEventListener(privacyEvent, sync);
window.addEventListener("storage", sync);
