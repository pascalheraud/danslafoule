import { useNavigate, type NavigateOptions } from "react-router-dom";
import type { AppRoute } from "./routes";

export interface AppNavigate {
  (to: AppRoute, options?: NavigateOptions): void;
  (delta: number): void; // history.go(delta) — e.g. navigate(-1) for Back
}

export function useAppNavigate(): AppNavigate {
  const navigate = useNavigate();
  return navigate as AppNavigate;
}
