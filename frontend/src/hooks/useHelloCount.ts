import { useEffect, useState } from "react";
import { fetchHelloCount } from "../services/helloService";

type HelloCountState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; n: number };

export function useHelloCount(): HelloCountState {
  const [state, setState] = useState<HelloCountState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchHelloCount()
      .then(({ n }) => {
        if (!cancelled) setState({ status: "success", n });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
