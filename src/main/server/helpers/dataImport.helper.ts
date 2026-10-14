import { templateKey, type TaskItemRow } from './checklist.helper.js'
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
} from '../../shared/checklist.constants.js'
import type { ImportProblem } from '../../shared/data.constants.js'

/**
 * Helpers purs de l'import des checklists (POST /data/import), sans accès à la
 * base.
 *
 * Le schéma d'import ne borne ni la longueur des textes ni le nombre de points,
 * car un fichier un peu trop gros ne doit pas faire refuser tout l'import. Les
 * textes et les listes sont donc ramenés ici aux limites partagées, et chaque
 * correction remonte en `ImportProblem`, journalisée et renvoyée avec le
 * résultat de l'import.
 */

/** Point de la checklist d'une tâche, tel qu'exporté. */
export interface ExportedChecklistItem {
  text: string
  isChecked?: boolean
  checkedAt?: string | null
}

/** Modèle de checklist, tel qu'exporté. */
export interface ExportedChecklistTemplate {
  name: string
  position?: number
  items?: string[]
}

/** Modèle prêt à écrire, nom nettoyé et points dans les limites. */
export interface ImportedTemplate {
  name: string
  nameKey: string
  position: number
  items: string[]
}

/** Liste de points ramenée aux limites. */
interface ClampedItems<T> {
  items: T[]
  clamped: boolean // vrai si un texte a été raccourci ou des points retirés
}

/** Paramètres communs aux messages des listes raccourcies. */
const LIMIT_PARAMS = { maxItems: CHECKLIST_MAX_ITEMS, maxLength: CHECKLIST_ITEM_MAX_LENGTH }

/**
 * Coupe un texte à `maxLength` caractères sans séparer les deux moitiés d'un
 * caractère hors du plan de base (émoji), puis retire les blancs de fin.
 *
 * @param text Texte déjà nettoyé
 * @param maxLength Longueur maximale
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  let cut = text.slice(0, maxLength)
  const last = cut.codePointAt(cut.length - 1) ?? 0
  // Moitié haute d'une paire de substitution, privée de sa moitié basse
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut.trimEnd()
}

/**
 * Texte d'un point importé, sur une seule ligne et sans blancs autour. Les
 * retours à la ligne, refusés à la saisie, deviennent des espaces.
 *
 * @param text Texte lu dans le fichier
 */
export function cleanItemText(text: string): string {
  return text.replaceAll(/[\r\n]+/g, ' ').trim()
}

/**
 * Ramène une liste de points aux limites partagées. Les textes sont nettoyés
 * (cf. cleanItemText), les vides retirés sans être signalés, les trop longs
 * raccourcis et les points au-delà du nombre maximal retirés.
 *
 * @param items Points lus dans le fichier, dans l'ordre
 */
export function clampChecklistItems<T extends { text: string }>(items: readonly T[]): ClampedItems<T> {
  const kept: T[] = []
  let clamped = false

  for (const item of items) {
    const text = cleanItemText(item.text)
    if (text === '') continue
    if (kept.length === CHECKLIST_MAX_ITEMS) {
      clamped = true
      break
    }
    if (text.length > CHECKLIST_ITEM_MAX_LENGTH) clamped = true
    kept.push({ ...item, text: truncateText(text, CHECKLIST_ITEM_MAX_LENGTH) })
  }

  return { items: kept, clamped }
}

/**
 * Textes d'une liste de points ramenés aux limites (cf. clampChecklistItems).
 *
 * @param texts Textes lus dans le fichier
 */
function clampChecklistTexts(texts: readonly string[]): ClampedItems<string> {
  const { items, clamped } = clampChecklistItems(texts.map((text) => ({ text })))
  return { items: items.map((item) => item.text), clamped }
}

/**
 * Points de la checklist d'une tâche importée, prêts à écrire. Un point non
 * coché perd sa date de coche. Sans point, la tâche n'aura pas de checklist.
 *
 * @param taskId Id de la tâche dans le fichier
 * @param items Points lus dans le fichier, absents d'un export antérieur aux checklists
 * @returns Les points et, s'ils ont été raccourcis, l'anomalie à signaler
 */
export function importedTaskChecklist(
  taskId: number,
  items: readonly ExportedChecklistItem[] | undefined,
): { rows: TaskItemRow[]; problem: ImportProblem | null } {
  const { items: kept, clamped } = clampChecklistItems(items ?? [])
  const rows = kept.map((item, position) => {
    const isChecked = item.isChecked ?? false
    return {
      text: item.text,
      position,
      isChecked,
      checkedAt: isChecked && item.checkedAt ? new Date(item.checkedAt) : null,
    }
  })
  const problem: ImportProblem | null = clamped
    ? { code: 'taskChecklistClamped', params: { id: taskId, ...LIMIT_PARAMS } }
    : null
  return { rows, problem }
}

/**
 * Textes des points du modèle d'une série importée.
 *
 * @param seriesId Id de la série dans le fichier
 * @param texts Textes lus dans le fichier, absents d'un export antérieur aux checklists
 * @returns Les textes et, s'ils ont été raccourcis, l'anomalie à signaler
 */
export function importedSeriesChecklist(
  seriesId: number,
  texts: readonly string[] | undefined,
): { texts: string[]; problem: ImportProblem | null } {
  const { items, clamped } = clampChecklistTexts(texts ?? [])
  const problem: ImportProblem | null = clamped
    ? { code: 'recurrenceChecklistClamped', params: { id: seriesId, ...LIMIT_PARAMS } }
    : null
  return { texts: items, problem }
}

/**
 * Modèles de checklist à écrire, à partir de ceux du fichier.
 *
 * Les modèles gardent l'ordre de leur `position` (ordre du fichier à égalité
 * ou sans position) et sont renumérotés à partir de 0. Le nom est nettoyé
 * (trim) et raccourci si besoin. Un modèle dont le nom, casse mise à part,
 * est déjà pris par un modèle précédent n'est pas recréé.
 *
 * @param templates Modèles lus dans le fichier, absents d'un export antérieur aux checklists
 * @returns Les modèles à écrire et les anomalies corrigées
 */
export function planTemplateImport(templates: readonly ExportedChecklistTemplate[] | undefined): {
  templates: ImportedTemplate[]
  problems: ImportProblem[]
} {
  const ordered = (templates ?? [])
    .map((template, index) => ({ template, index }))
    .sort(
      (a, b) =>
        (a.template.position ?? Number.MAX_SAFE_INTEGER) - (b.template.position ?? Number.MAX_SAFE_INTEGER) ||
        a.index - b.index,
    )

  const planned: ImportedTemplate[] = []
  const problems: ImportProblem[] = []
  const takenKeys = new Set<string>()

  for (const { template } of ordered) {
    const trimmed = template.name.trim()
    const name = truncateText(trimmed, CHECKLIST_TEMPLATE_NAME_MAX_LENGTH)
    if (name !== trimmed) {
      problems.push({ code: 'templateNameTruncated', params: { name, maxLength: CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } })
    }

    const nameKey = templateKey(name)
    if (takenKeys.has(nameKey)) {
      problems.push({ code: 'duplicateTemplateName', params: { name } })
      continue
    }
    takenKeys.add(nameKey)

    const { items, clamped } = clampChecklistTexts(template.items ?? [])
    if (clamped) problems.push({ code: 'templateChecklistClamped', params: { name, ...LIMIT_PARAMS } })

    planned.push({ name, nameKey, position: planned.length, items })
  }

  return { templates: planned, problems }
}
