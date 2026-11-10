import { Page, Locator } from '@playwright/test'

/** Fichier joint depuis un test : nom, contenu et type facultatif. */
export interface TestFile {
  name: string
  content: string | Buffer
  mimeType?: string
}

/**
 * Objet de la section Documents (TaskDocuments.vue), dans le dialogue de tâche
 * ou, en consultation seule, dans le détail d'une tâche archivée.
 *
 * Les fichiers passent par le champ caché du bouton « Ajouter », ou par un
 * dépôt simulé sur le dialogue (événements de glisser-déposer construits dans
 * la page, Playwright ne sachant pas glisser un fichier du système).
 */
export class TaskDocuments {
  readonly page: Page
  readonly root: Locator
  readonly items: Locator
  readonly names: Locator
  readonly uploads: Locator
  readonly count: Locator
  readonly hint: Locator
  readonly addButton: Locator
  readonly fileInput: Locator
  readonly dropOverlay: Locator
  readonly errorToast: Locator

  /**
   * Constructeur
   * @param page Page courante
   * @param scope Conteneur de la section (dialogue par défaut, ligne d'archive sinon)
   */
  constructor(page: Page, scope: Locator = page.getByTestId('task-dialog')) {
    this.page = page
    this.root = scope.getByTestId('task-documents')
    this.items = this.root.getByTestId('task-document')
    this.names = this.items.getByTestId('task-document-name')
    this.uploads = this.root.getByTestId('task-document-upload')
    this.count = this.root.getByTestId('task-documents-count')
    this.hint = this.root.getByTestId('task-documents-hint')
    this.addButton = this.root.getByTestId('btn-document-add')
    this.fileInput = this.root.getByTestId('document-file-input')
    this.dropOverlay = page.getByTestId('task-documents-drop')
    this.errorToast = page.locator('.p-toast-message-error')
  }

  /**
   * Ligne d'un document, par son nom exact.
   * @param name Nom du document
   */
  item(name: string): Locator {
    return this.items.and(this.page.locator(`[data-name="${name}"]`))
  }

  /**
   * Noms des documents, dans l'ordre affiché.
   */
  async nameList(): Promise<string[]> {
    return (await this.names.allTextContents()).map((name) => name.trim())
  }

  /**
   * Joint des fichiers comme le bouton « Ajouter » (boîte de choix du système).
   * @param files Fichiers à joindre
   */
  async add(...files: TestFile[]) {
    await this.fileInput.setInputFiles(
      files.map((file) => ({
        name: file.name,
        mimeType: file.mimeType ?? 'application/octet-stream',
        buffer: Buffer.from(file.content),
      })),
    )
  }

  /**
   * Dépose des fichiers sur le dialogue de tâche, comme depuis l'explorateur.
   * @param files Fichiers déposés
   */
  async drop(...files: TestFile[]) {
    const payload = files.map((file) => ({ name: file.name, content: Buffer.from(file.content).toString('base64') }))
    await this.page.getByTestId('task-dialog').evaluate((form, entries) => {
      const transfer = new DataTransfer()
      for (const entry of entries) {
        const bytes = Uint8Array.from(atob(entry.content), (character) => character.codePointAt(0) as number)
        transfer.items.add(new File([bytes], entry.name))
      }
      const target = form.querySelector('[data-testid="task-documents"]') ?? form
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
      }
    }, payload)
  }

  /**
   * Survole le dialogue avec des fichiers, sans les déposer.
   */
  async dragOver() {
    await this.page.getByTestId('task-dialog').evaluate((form) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['x'], 'survol.txt'))
      for (const type of ['dragenter', 'dragover']) {
        form.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
      }
    })
  }

  /**
   * Ouvre un document en cliquant sur son nom.
   * @param name Nom du document
   */
  async open(name: string) {
    await this.item(name).getByTestId('task-document-name').click()
  }

  /**
   * Bouton « Enregistrer sous » d'un document.
   * @param name Nom du document
   */
  saveButton(name: string): Locator {
    return this.item(name).getByTestId('btn-document-save')
  }

  /**
   * Bouton de suppression d'un document.
   * @param name Nom du document
   */
  deleteButton(name: string): Locator {
    return this.item(name).getByTestId('btn-document-delete')
  }

  /**
   * Supprime un document, confirmation acceptée.
   * @param name Nom du document
   */
  async delete(name: string) {
    await this.deleteButton(name).click()
    await this.page.getByTestId('btn-confirm-accept').click()
  }
}
