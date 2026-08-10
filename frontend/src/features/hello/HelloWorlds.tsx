import { useHelloCount } from "../../hooks/useHelloCount";
import styles from "./HelloWorlds.module.scss";

export function HelloWorlds() {
  const state = useHelloCount();

  if (state.status === "loading") {
    return <p className={styles.message}>Loading…</p>;
  }

  if (state.status === "error") {
    return <p className={styles.message}>Could not load hello count: {state.error}</p>;
  }

  return <p className={styles.message}>Hello {state.n} worlds !</p>;
}
