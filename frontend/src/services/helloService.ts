export interface HelloCount {
  n: number;
}

export async function fetchHelloCount(): Promise<HelloCount> {
  const response = await fetch("/api/hello-count");
  if (!response.ok) {
    throw new Error(`Failed to fetch hello count: ${response.status}`);
  }
  return (await response.json()) as HelloCount;
}
