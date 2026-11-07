/**
 * Document joint à une tâche, tel que renvoyé avec elle : sans son contenu, lu
 * à la demande (cf. window.documents).
 */
export interface TaskDocument {
  id: number
  name: string // nom affiché et proposé à l'enregistrement, unique dans la tâche
  size: number // en octets
  createdAt: Date | string // chaîne ISO via HTTP
}
