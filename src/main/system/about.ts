import { shell } from 'electron'
import Logger from 'electron-log'
import { IS_TEST } from '../constants.js'

/**
 * Liens de la section « À propos » des Paramètres, ouverts dans le navigateur
 * par défaut à la demande du renderer (IPC) : notes de version et mentions
 * des logiciels tiers.
 *
 * En mode test, rien ne s'ouvre : le lien demandé est seulement noté, et les
 * tests le relisent via GET /test/opened-links.
 */

/** Dépôt GitHub de l'app. */
const REPOSITORY_URL = 'https://github.com/Daarunia/NexTask'

/** Adresse de chaque lien que le renderer peut faire ouvrir. */
const ABOUT_LINKS = {
  releases: `${REPOSITORY_URL}/releases`,
  notices: `${REPOSITORY_URL}/blob/main/THIRD_PARTY_NOTICES.md`,
} as const

/** Liens que le renderer peut faire ouvrir. */
export const ABOUT_LINK_KINDS = Object.keys(ABOUT_LINKS) as AboutLinkKind[]

/** Lien que le renderer peut faire ouvrir. */
export type AboutLinkKind = keyof typeof ABOUT_LINKS

/** Lien dont l'ouverture a été demandée. */
export interface OpenedLink {
  kind: AboutLinkKind
  url: string
}

// Ouvertures demandées en mode test, dans l'ordre
const openedInTest: OpenedLink[] = []

/**
 * Vrai si la valeur reçue du renderer désigne un lien connu.
 *
 * @param kind Valeur reçue
 */
export function isAboutLinkKind(kind: unknown): kind is AboutLinkKind {
  return ABOUT_LINK_KINDS.includes(kind as AboutLinkKind)
}

/**
 * Ouvre un lien de la section « À propos » dans le navigateur par défaut.
 *
 * @param kind Lien à ouvrir
 * @throws Si le système n'a pas pu ouvrir le lien
 */
export async function openAboutLink(kind: AboutLinkKind): Promise<void> {
  const url = ABOUT_LINKS[kind]

  if (IS_TEST) {
    openedInTest.push({ kind, url })
    Logger.info(`[à propos] Ouverture simulée en test : ${url}`)
    return
  }

  try {
    await shell.openExternal(url)
  } catch (error) {
    Logger.error(`[à propos] Ouverture de ${url} impossible :`, error)
    throw new Error(`Ouverture du lien impossible : ${url}`)
  }

  Logger.info(`[à propos] Lien ouvert : ${url}`)
}

/**
 * Ouvertures demandées depuis le dernier reset (mode test uniquement).
 */
export function getOpenedLinks(): OpenedLink[] {
  return [...openedInTest]
}

/**
 * Oublie les ouvertures demandées (reset des tests).
 */
export function clearOpenedLinks(): void {
  openedInTest.length = 0
}
