import "@testing-library/jest-dom";

process.env.APPEAR_DB_PATH = ":memory:";

const storageValues = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return storageValues.size;
  },
  clear() {
    storageValues.clear();
  },
  getItem(key) {
    return storageValues.get(key) ?? null;
  },
  key(index) {
    return [...storageValues.keys()][index] ?? null;
  },
  removeItem(key) {
    storageValues.delete(key);
  },
  setItem(key, value) {
    storageValues.set(key, value);
  },
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
