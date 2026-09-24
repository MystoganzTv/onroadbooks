import type { Broker, Load } from "./types";

export function brokerNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function brokerNames(loads: Load[], brokers: Broker[] = []): string[] {
  const names = new Map<string, string>();
  for (const name of [...loads.map((load) => load.broker), ...brokers.map((broker) => broker.name)]) {
    if (name?.trim()) names.set(brokerNameKey(name), name.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
