import { IxButton, IxInput, IxTypography } from "@siemens/ix-react";
import { iconArrowRight } from "@siemens/ix-icons/icons";
import type { IxInputCustomEvent } from "@siemens/ix/components";
import { useState } from "react";
import styles from "./Onboarding.module.scss";

interface OnboardingProps {
  onSubmit: (name: string) => Promise<void>;
}

export function Onboarding({ onSubmit }: OnboardingProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(event: IxInputCustomEvent<string>) {
    setName(event.detail);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setStatus("submitting");
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function ErrorMessage() {
    if (status !== "error") return null;
    return <IxTypography format="body">Could not save your name: {error}</IxTypography>;
  }

  return (
    <form className={styles.onboarding} onSubmit={handleSubmit}>
      <img src="/logo.svg" alt="" className={styles.logo} />
      <IxTypography format="h1">Welcome to Dans la foule</IxTypography>
      <IxTypography format="body">Choose a name so your friends can recognize you.</IxTypography>
      <IxInput
        name="user-name"
        label="Your name"
        value={name}
        onValueChange={handleNameChange}
        placeholder="e.g. Alice"
      />
      {ErrorMessage()}
      <IxButton type="submit" iconRight={iconArrowRight} disabled={!name.trim() || status === "submitting"}>
        {status === "submitting" ? "Saving…" : "Continue"}
      </IxButton>
    </form>
  );
}
