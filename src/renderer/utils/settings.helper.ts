import { useSettingsStore } from "../stores/Settings";

// type de couleur
export interface Color {
  name: string;
  palette: Record<string, string>;
}

/**
 * Applique une couleur primaire sur le DOM et la persistance Pinia/Electron-store
 * @param color objet couleur {name, palette}
 */
export const applyPrimaryColor = async (color: Color) => {
  const settings = useSettingsStore();
  await settings.setPrimaryColor(color.name);

  Object.keys(color.palette).forEach((key) => {
    document.documentElement.style.setProperty(
      `--p-primary-${key}`,
      color.palette[key],
    );
  });
};
