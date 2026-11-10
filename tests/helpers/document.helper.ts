import { createHash } from 'node:crypto'
import type { APIRequestContext, APIResponse, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { API } from './api.helper'
import { setSetting } from './desktop.helper'

/**
 * Appels API partagés par les tests E2E des documents joints aux tâches : ajout
 * d'un document, lecture de son contenu, état de la base et du dossier.
 */

/** Document tel que renvoyé avec une tâche. */
export interface TaskDocument {
  id: number
  name: string
  size: number
  createdAt: string
}

/** Tâche telle que renvoyée par l'API, avec ses documents. */
export interface DocumentTask {
  id: number
  title: string
  stageId: number | null
  updatedAt: string
  documents: TaskDocument[]
}

/** Lignes de documents, fichiers et envois en cours du dossier (GET /test/task-documents). */
export interface DocumentStoreState {
  documents: number
  files: number
  uploads: number
  directory: string
}

/**
 * Empreinte SHA-256 d'un contenu, en hexadécimal.
 * @param content Contenu
 */
export function sha256Of(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Id de la première colonne du tableau. */
export async function firstStageId(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as { id: number; position: number }[]
  return [...stages].sort((a, b) => a.position - b.position)[0].id
}

/**
 * Crée une tâche dans la première colonne, et la renvoie.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 */
export async function createTask(request: APIRequestContext, title = 'Avec documents'): Promise<DocumentTask> {
  const stageId = await firstStageId(request)
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as DocumentTask
}

/**
 * Envoie un POST /tasks/:id/documents, sans contrôler la réponse.
 * @param request Contexte de requête Playwright
 * @param taskId Id de la tâche
 * @param name Nom du fichier
 * @param content Contenu du fichier
 */
export function postDocument(
  request: APIRequestContext,
  taskId: number,
  name: string,
  content: Buffer | string,
): Promise<APIResponse> {
  return request.post(`${API}/tasks/${taskId}/documents`, {
    params: { name },
    headers: { 'Content-Type': 'application/octet-stream' },
    data: Buffer.from(content),
  })
}

/**
 * Ajoute un document, et renvoie la tâche à jour.
 * @param request Contexte de requête Playwright
 * @param taskId Id de la tâche
 * @param name Nom du fichier
 * @param content Contenu du fichier
 */
export async function addDocument(
  request: APIRequestContext,
  taskId: number,
  name: string,
  content: Buffer | string,
): Promise<DocumentTask> {
  const res = await postDocument(request, taskId, name, content)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as DocumentTask
}

/**
 * Contenu d'un document, lu par l'API.
 * @param request Contexte de requête Playwright
 * @param documentId Id du document
 */
export async function documentContent(request: APIRequestContext, documentId: number): Promise<Buffer> {
  const res = await request.get(`${API}/documents/${documentId}/content`)
  expect(res.ok(), `Contenu du document ${documentId}`).toBeTruthy()
  return res.body()
}

/** État de la base et du dossier des documents. */
export async function documentStoreState(request: APIRequestContext): Promise<DocumentStoreState> {
  const res = await request.get(`${API}/test/task-documents`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as DocumentStoreState
}

/**
 * Change les limites des documents, relues par le serveur à chaque ajout.
 * @param page Page de l'app, qui porte le pont des paramètres
 * @param limits Limites à changer
 */
export async function setDocumentLimits(
  page: Page,
  limits: { documentMaxSizeMb?: number; documentMaxPerTask?: number },
): Promise<void> {
  for (const [key, value] of Object.entries(limits) as [keyof typeof limits, number][]) {
    await setSetting(page, key, value)
  }
}
