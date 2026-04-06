export function createLazyProxy<T extends object>(getInstance: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = getInstance();
      const value = Reflect.get(instance, property, instance);

      return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, property, value) {
      return Reflect.set(getInstance(), property, value);
    },
    has(_target, property) {
      return Reflect.has(getInstance(), property);
    },
    ownKeys() {
      return Reflect.ownKeys(getInstance());
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(getInstance(), property);
    },
    defineProperty(_target, property, attributes) {
      return Reflect.defineProperty(getInstance(), property, attributes);
    },
    deleteProperty(_target, property) {
      return Reflect.deleteProperty(getInstance(), property);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(getInstance());
    },
  });
}
