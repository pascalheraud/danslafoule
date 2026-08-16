import { showToast as showIxToast } from "@siemens/ix-react";

// Half of Siemens iX's own 5000ms default — thin wrapper so every toast in
// the app shares one place to tune this instead of repeating the option at
// each call site.
const AUTO_CLOSE_DELAY_MS = 2500;

export function showToast(config: Parameters<typeof showIxToast>[0]): ReturnType<typeof showIxToast> {
  return showIxToast({ autoCloseDelay: AUTO_CLOSE_DELAY_MS, ...config });
}
