import { config, type StaticTextDefaultValue, type ToolbarNames } from 'md-editor-v3'
import type { Locale } from '../../main/shared/settings.constants'

/**
 * Configuration de md-editor-v3, l'éditeur Markdown des descriptions de tâche.
 *
 * Par défaut, l'éditeur télécharge depuis unpkg.com la coloration du code,
 * KaTeX, Mermaid, ECharts, Prettier, Cropper et screenfull. L'app fonctionne
 * hors ligne : ces modules sont coupés par les props `no*` de MarkdownEditor.vue
 * et les boutons qui en dépendent ne sont pas affichés.
 */

/**
 * Langue des libellés de l'éditeur pour chaque langue de l'interface. Celles
 * que md-editor-v3 ne fournit pas (il connaît `en-US` et `zh-CN`) sont
 * déclarées par `setupMarkdownEditor`.
 */
const EDITOR_LANGUAGES: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR' }

/**
 * Langue des libellés de l'éditeur pour une langue de l'interface.
 * @param locale Langue de l'interface (`fr`, `en`…)
 */
export function markdownEditorLanguage(locale: string): string {
  return EDITOR_LANGUAGES[locale as Locale] ?? EDITOR_LANGUAGES.en
}

/**
 * Boutons de la barre d'outils, dans l'ordre (`-` = séparateur, `=` = la suite
 * est poussée à droite). Pas de cases à cocher : les checklists auront leur
 * propre fonctionnalité.
 */
export const MARKDOWN_EDITOR_TOOLBARS: ToolbarNames[] = [
  'title',
  'bold',
  'italic',
  'strikeThrough',
  '-',
  'unorderedList',
  'orderedList',
  'quote',
  '-',
  'codeRow',
  'code',
  'link',
  'table',
  '=',
  'revoke',
  'next',
  'pageFullscreen',
]

/**
 * Libellés de chaque langue déclarée, limités à ce que l'éditeur affiche. Ils
 * restent ici plutôt que dans les catalogues : c'est la forme attendue par md-editor-v3.
 */
const FRENCH: StaticTextDefaultValue = {
  toolbarTips: {
    bold: 'Gras',
    italic: 'Italique',
    strikeThrough: 'Barré',
    title: 'Titre',
    quote: 'Citation',
    unorderedList: 'Liste à puces',
    orderedList: 'Liste numérotée',
    codeRow: 'Code en ligne',
    code: 'Bloc de code',
    link: 'Lien',
    table: 'Tableau',
    revoke: 'Annuler',
    next: 'Rétablir',
    pageFullscreen: 'Agrandir',
  },
  titleItem: {
    h1: 'Titre 1',
    h2: 'Titre 2',
    h3: 'Titre 3',
    h4: 'Titre 4',
    h5: 'Titre 5',
    h6: 'Titre 6',
  },
  copyCode: {
    text: 'Copier',
    successTips: 'Copié',
    failTips: 'Copie impossible',
  },
  footer: {
    markdownTotal: 'Caractères',
    scrollAuto: 'Défilement synchronisé',
  },
}

const SPANISH: StaticTextDefaultValue = {
  toolbarTips: {
    bold: 'Negrita',
    italic: 'Cursiva',
    strikeThrough: 'Tachado',
    title: 'Título',
    quote: 'Cita',
    unorderedList: 'Lista con viñetas',
    orderedList: 'Lista numerada',
    codeRow: 'Código en línea',
    code: 'Bloque de código',
    link: 'Enlace',
    table: 'Tabla',
    revoke: 'Deshacer',
    next: 'Rehacer',
    pageFullscreen: 'Ampliar',
  },
  titleItem: {
    h1: 'Título 1',
    h2: 'Título 2',
    h3: 'Título 3',
    h4: 'Título 4',
    h5: 'Título 5',
    h6: 'Título 6',
  },
  copyCode: {
    text: 'Copiar',
    successTips: 'Copiado',
    failTips: 'No se ha podido copiar',
  },
  footer: {
    markdownTotal: 'Caracteres',
    scrollAuto: 'Desplazamiento sincronizado',
  },
}

const PORTUGUESE: StaticTextDefaultValue = {
  toolbarTips: {
    bold: 'Negrito',
    italic: 'Itálico',
    strikeThrough: 'Tachado',
    title: 'Título',
    quote: 'Citação',
    unorderedList: 'Lista com marcadores',
    orderedList: 'Lista numerada',
    codeRow: 'Código em linha',
    code: 'Bloco de código',
    link: 'Link',
    table: 'Tabela',
    revoke: 'Desfazer',
    next: 'Refazer',
    pageFullscreen: 'Ampliar',
  },
  titleItem: {
    h1: 'Título 1',
    h2: 'Título 2',
    h3: 'Título 3',
    h4: 'Título 4',
    h5: 'Título 5',
    h6: 'Título 6',
  },
  copyCode: {
    text: 'Copiar',
    successTips: 'Copiado',
    failTips: 'Não foi possível copiar',
  },
  footer: {
    markdownTotal: 'Caracteres',
    scrollAuto: 'Rolagem sincronizada',
  },
}

/**
 * Configure md-editor-v3 pour toute l'app, une seule fois avant le premier
 * affichage : libellés des langues que md-editor-v3 ne fournit pas, liens
 * ouverts hors de l'app, et rendu sans les cases à cocher (`- [ ]` reste du texte).
 * Appelée au chargement de ce module, importé seulement par MarkdownEditor.vue
 * (chargé à la demande par TaskDialog).
 */
function setupMarkdownEditor() {
  config({
    editorConfig: {
      languageUserDefined: {
        [EDITOR_LANGUAGES.fr]: FRENCH,
        [EDITOR_LANGUAGES.es]: SPANISH,
        [EDITOR_LANGUAGES.pt]: PORTUGUESE,
      },
    },
    // Lien en nouvelle fenêtre : le main le confie au navigateur par défaut,
    // sans tenter de naviguer dans la page de l'app
    markdownItConfig: (md) => {
      const defaultLinkOpen = md.renderer.rules.link_open
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        tokens[idx].attrSet('target', '_blank')
        tokens[idx].attrSet('rel', 'noopener noreferrer')
        return defaultLinkOpen
          ? defaultLinkOpen(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options)
      }
    },
    markdownItPlugins: (plugins) => plugins.filter((plugin) => plugin.type !== 'taskList'),
  })
}

setupMarkdownEditor()
