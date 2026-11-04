/**
 * Lecture des catalogues de textes, commune au main et à core : clés en chemin
 * pointé, paramètres `{nom}` et textes au pluriel `{ one, other }`.
 *
 * Sans import (ni Node, ni Electron).
 */

/** Texte au pluriel d'un catalogue. */
export interface PluralMessage {
  one: string
  other: string
}

/** Clés des textes simples, en chemin pointé (`tray.open`). */
export type MessageKey<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends PluralMessage
      ? never
      : MessageKey<T[K], `${P}${K}.`>
}[keyof T & string]

/** Clés des textes au pluriel. */
export type PluralKey<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends PluralMessage
      ? `${P}${K}`
      : PluralKey<T[K], `${P}${K}.`>
}[keyof T & string]

/** Valeurs des paramètres d'un texte. */
export type MessageParams = Record<string, string | number>

/**
 * Valeur d'un chemin pointé dans un catalogue.
 *
 * @param catalog Catalogue lu
 * @param key Chemin pointé (`tray.open`)
 */
export function lookupMessage(catalog: object, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalog)
}

/**
 * Remplace les paramètres `{nom}` d'un texte.
 *
 * @param template Texte du catalogue
 * @param params Valeurs des paramètres
 */
export function interpolateMessage(template: string, params: MessageParams = {}): string {
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}
