import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these observers, but Siemens iX web components
// (Stencil-based) use them internally on connect — stub them so components
// mount cleanly in tests.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;

// Node 25+ defines a native `localStorage`/`sessionStorage` global that comes
// back broken (missing methods like `clear()`) unless run with
// `--localstorage-file`, and it shadows jsdom's own implementation since
// `window` is `globalThis` in this environment. Replace it with a minimal
// in-memory Storage polyfill instead.
class MemoryStorage implements Storage {
  #data = new Map<string, string>();

  get length() {
    return this.#data.size;
  }

  clear() {
    this.#data.clear();
  }

  getItem(key: string) {
    return this.#data.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#data.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#data.delete(key);
  }

  setItem(key: string, value: string) {
    this.#data.set(key, String(value));
  }
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[key]?.clear !== "function") {
    Object.defineProperty(globalThis, key, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

// jsdom implements `attachInternals()` but not the full ElementInternals
// form-association API, which Siemens iX's Stencil components (e.g.
// ix-input) call unconditionally in componentWillLoad — stub the missing
// methods so components mount cleanly in tests.
if (typeof ElementInternals !== "undefined" && !("setFormValue" in ElementInternals.prototype)) {
  Object.assign(ElementInternals.prototype, {
    setFormValue() {},
    setValidity() {},
    checkValidity() {
      return true;
    },
    reportValidity() {
      return true;
    },
  });
}
