export {};

declare global {
  interface Window {
    settings: {
      get: (key: "theme" | "primaryColor") => any;
      set: (key: "theme" | "primaryColor", value: any) => void;
      onDidChange: (
        key: "theme" | "primaryColor",
        callback: (newVal: any, oldVal: any) => void,
      ) => () => void;
    };
  }
}
