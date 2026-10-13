/**
 * The sandbox has an opaque origin, so reading window.localStorage throws.
 * Remotion keeps small preferences there (seek position, overrides); give it
 * a storage that lives in memory for this page. Imported first, before any
 * library touches storage.
 */
class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  try {
    void window[name];
  } catch {
    Object.defineProperty(window, name, { value: new MemoryStorage(), configurable: true });
  }
}

export {};
