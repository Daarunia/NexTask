export {};

declare global {
  interface GlobalThis {
    settings: {
      get: (key: "theme" | "primaryColor") => any;
      set: (key: "theme" | "primaryColor", value: any) => void;
    };
  }
}