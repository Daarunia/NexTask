import type { Checklist, Prisma } from '../../prisma/generated/prisma/client.js'
import { tagKey } from './tag.helper.js'
import { CHECKLIST_TEMPLATE_NAME_MAX_LENGTH, type ChecklistItemInput } from '../../shared/checklist.constants.js'

/**
 * Helpers des checklists, partagés par les routes des modèles et des tâches.
 *
 * Une `Checklist` sans `taskId` est un modèle. Prisma ne sait pas exprimer
 * l'invariant « `taskId` null si et seulement si `name`, `nameKey` et
 * `position` sont renseignés », c'est donc au code de le tenir. Toute requête
 * de modèle filtre `taskId: null`, et toute création de modèle écrit les trois
 * champs.
 */

/** Client Prisma utilisable dans une transaction interactive. */
type TransactionClient = Prisma.TransactionClient

/** Point de modèle prêt à écrire, jamais coché. */
export interface TemplateItemRow {
  text: string
  position: number
  isChecked: false
  checkedAt: null
}

/**
 * Clé de comparaison d'un nom de modèle, sans tenir compte de la casse. Même
 * normalisation que les tags, dont la fonction est reprise telle quelle.
 *
 * @param name Nom de modèle, déjà nettoyé
 */
export const templateKey: (name: string) => string = tagKey

/** Points renvoyés avec chaque modèle, dans l'ordre. */
export const templateInclude = {
  items: { orderBy: { position: 'asc' } },
} as const

/** Filtre des modèles, qui écarte les checklists des tâches. */
export const templateWhere = { taskId: null } as const

/**
 * Cherche un modèle par son nom, sans tenir compte de la casse. Les
 * checklists des tâches, sans nom, ne sont jamais trouvées.
 *
 * @param tx Client Prisma (transaction ou client global)
 * @param name Nom recherché (nettoyé ici)
 * @returns Le modèle trouvé, ou `null`
 */
export async function findTemplateByName(tx: TransactionClient, name: string): Promise<Checklist | null> {
  return tx.checklist.findFirst({ where: { ...templateWhere, nameKey: templateKey(name.trim()) } })
}

/**
 * Position d'un modèle ajouté en fin de liste (0 s'il n'y en a aucun).
 *
 * @param tx Client Prisma de la transaction en cours
 */
export async function nextTemplatePosition(tx: TransactionClient): Promise<number> {
  const { _max } = await tx.checklist.aggregate({ where: templateWhere, _max: { position: true } })
  return _max.position === null ? 0 : _max.position + 1
}

/**
 * Premier nom libre à partir de `base`, sans tenir compte de la casse. La base
 * elle-même si elle est libre, sinon « base 2 », « base 3 »… La base est
 * raccourcie si besoin pour que le numéro tienne dans la longueur maximale.
 *
 * @param base Nom souhaité, déjà nettoyé (ex. « Revue de code (copie) »)
 * @param takenKeys Clés (`templateKey`) des noms déjà pris
 * @param maxLength Longueur maximale du nom
 */
export function duplicateName(
  base: string,
  takenKeys: ReadonlySet<string>,
  maxLength = CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
): string {
  // Termine toujours, l'ensemble des noms pris étant fini
  for (let rank = 1; ; rank++) {
    const suffix = rank === 1 ? '' : ` ${rank}`
    const candidate = base.slice(0, maxLength - suffix.length).trimEnd() + suffix
    if (!takenKeys.has(templateKey(candidate))) return candidate
  }
}

/**
 * Points d'un modèle à écrire, à partir des textes saisis. Les textes sont
 * nettoyés (trim), les vides retirés, la position est le rang dans la liste
 * restante et aucun point n'est coché.
 *
 * @param texts Textes des points, dans l'ordre
 */
export function templateItemRows(texts: string[]): TemplateItemRow[] {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .map((text, position) => ({ text, position, isChecked: false, checkedAt: null }))
}

/** Point déjà en base dans la checklist d'une tâche. */
export interface ExistingChecklistItem {
  id: number
  text: string
  position: number
  isChecked: boolean
  checkedAt: Date | null
}

/** Point de tâche à écrire, état de coche et date compris. */
export interface TaskItemRow {
  text: string
  position: number
  isChecked: boolean
  checkedAt: Date | null
}

/**
 * Écritures qui amènent la checklist d'une tâche à la liste envoyée. Les
 * points gardés tels quels n'apparaissent nulle part.
 */
export interface ChecklistSyncPlan {
  deleteIds: number[] // points existants absents de la liste envoyée
  update: (TaskItemRow & { id: number })[] // points existants modifiés (texte, position ou coche)
  create: TaskItemRow[] // nouveaux points
  total: number // nombre de points de la checklist une fois le plan appliqué
}

/**
 * Date de coche d'un point après l'enregistrement. Elle est fixée par le
 * serveur, `now` pour un point coché à l'instant, conservée pour un point
 * déjà coché, `null` pour un point décoché.
 *
 * @param isChecked Point coché dans la liste envoyée
 * @param previous Point existant correspondant, absent pour un nouveau point
 * @param now Maintenant
 */
function checkedAtFor(isChecked: boolean, previous: ExistingChecklistItem | undefined, now: Date): Date | null {
  if (!isChecked) return null
  if (previous?.isChecked) return previous.checkedAt ?? now
  return now
}

/**
 * Vrai si le point existant diffère de la ligne à écrire.
 *
 * @param previous Point existant
 * @param row Ligne à écrire
 */
function itemChanged(previous: ExistingChecklistItem, row: TaskItemRow): boolean {
  return (
    previous.text !== row.text ||
    previous.position !== row.position ||
    previous.isChecked !== row.isChecked ||
    previous.checkedAt?.getTime() !== row.checkedAt?.getTime()
  )
}

/**
 * Prévoit les écritures qui remplacent la checklist d'une tâche par la liste
 * envoyée, sans toucher à la base.
 *
 * Les textes sont nettoyés (trim) et les vides retirés. La position d'un
 * point est son rang dans la liste restante. Un `id` qui ne désigne aucun
 * point de la tâche (point d'une autre tâche, déjà supprimé, ou répété dans
 * la liste) est traité comme un nouveau point. Les points existants absents
 * de la liste sont à supprimer.
 *
 * @param existing Points actuels de la checklist de la tâche
 * @param input Points envoyés, dans l'ordre
 * @param now Maintenant, date de coche des points cochés à l'instant
 */
export function planChecklistSync(
  existing: readonly ExistingChecklistItem[],
  input: readonly ChecklistItemInput[],
  now: Date,
): ChecklistSyncPlan {
  const remaining = new Map(existing.map((item) => [item.id, item]))
  const plan: ChecklistSyncPlan = { deleteIds: [], update: [], create: [], total: 0 }

  for (const item of input) {
    const text = item.text.trim()
    if (text === '') continue

    // Retiré de la table une fois pris, un id répété devient un nouveau point
    const previous = item.id === undefined ? undefined : remaining.get(item.id)
    if (previous) remaining.delete(previous.id)

    const row: TaskItemRow = {
      text,
      position: plan.total,
      isChecked: item.isChecked,
      checkedAt: checkedAtFor(item.isChecked, previous, now),
    }
    plan.total++

    if (!previous) plan.create.push(row)
    else if (itemChanged(previous, row)) plan.update.push({ id: previous.id, ...row })
  }

  plan.deleteIds = [...remaining.keys()]
  return plan
}

/**
 * Remplace la checklist d'une tâche par la liste envoyée (cf.
 * planChecklistSync), dans la transaction de l'enregistrement de la tâche.
 *
 * La checklist est créée avec son premier point et supprimée avec son
 * dernier, une tâche sans point n'en a donc jamais en base. Sans liste
 * (`undefined`), rien ne change.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param taskId Id de la tâche
 * @param items Points envoyés, dans l'ordre, `[]` pour vider la checklist
 * @param now Maintenant
 */
export async function syncTaskChecklist(
  tx: TransactionClient,
  taskId: number,
  items: readonly ChecklistItemInput[] | undefined,
  now: Date,
): Promise<void> {
  if (items === undefined) return

  const checklist = await tx.checklist.findUnique({ where: { taskId }, include: { items: true } })
  const plan = planChecklistSync(checklist?.items ?? [], items, now)

  if (plan.total === 0) {
    // Les points partent avec la checklist (cascade)
    if (checklist) await tx.checklist.delete({ where: { id: checklist.id } })
    return
  }

  if (!checklist) {
    await tx.checklist.create({ data: { taskId, items: { create: plan.create } } })
    return
  }

  if (plan.deleteIds.length) {
    await tx.checklistItem.deleteMany({ where: { checklistId: checklist.id, id: { in: plan.deleteIds } } })
  }
  for (const { id, ...row } of plan.update) {
    await tx.checklistItem.update({ where: { id }, data: row })
  }
  if (plan.create.length) {
    await tx.checklistItem.createMany({ data: plan.create.map((row) => ({ ...row, checklistId: checklist.id })) })
  }
}

/**
 * Vrai si la valeur est une liste de textes de points, forme attendue du
 * champ JSON `Recurrence.checklistItems`. Garde de type pour lire ce champ,
 * que Prisma type en simple `JsonValue`.
 *
 * @param value Valeur lue en base ou importée
 */
export function isChecklistTexts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((text) => typeof text === 'string')
}

/**
 * Vrai si les deux listes portent les mêmes textes, dans le même ordre. Un
 * point ajouté, retiré, renommé ou déplacé change la liste, l'état coché
 * n'entre pas en compte.
 *
 * @param a Textes des points
 * @param b Textes des points
 */
export function sameChecklistTexts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((text, index) => text === b[index])
}

/**
 * Textes des points de la checklist d'une tâche, dans l'ordre, `[]` si elle
 * n'en a pas.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param taskId Id de la tâche
 */
export async function taskChecklistTexts(tx: TransactionClient, taskId: number): Promise<string[]> {
  const items = await tx.checklistItem.findMany({
    where: { checklist: { taskId } },
    orderBy: { position: 'asc' },
    select: { text: true },
  })
  return items.map((item) => item.text)
}
