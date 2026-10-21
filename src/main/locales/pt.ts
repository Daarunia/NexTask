import type { MainMessages } from './fr.js'

/**
 * Textes du main en portugais du Brésil, mêmes clés que le catalogue français
 * (une clé manquante ou en trop casse le typecheck).
 */
export const pt: MainMessages = {
  tray: {
    open: 'Abrir o NexTask',
    quickAdd: 'Adição rápida…',
    quit: 'Sair',
  },
  notifications: {
    title: { one: 'Tarefa para começar ({count})', other: 'Tarefas para começar ({count})' },
    more: { one: '… e mais {count}', other: '… e mais {count}' },
    dismiss: 'Fechar',
  },
  startup: {
    errorTitle: 'O NexTask não pode iniciar',
    databaseFailed: 'A atualização do banco de dados falhou e foi desfeita.',
    serverFailed: 'O servidor local do aplicativo não pôde iniciar.',
  },
  quickAdd: {
    windowTitle: 'NexTask — Adição rápida',
  },
  checklists: {
    copyName: '{name} (cópia)',
  },
  boards: {
    defaultName: 'Meu quadro',
    defaultStages: {
      todo: 'A fazer',
      inProgress: 'Em andamento',
      waiting: 'Em espera',
      done: 'Concluído',
    },
  },
  dataTransfer: {
    exportTitle: 'Exportar os dados',
    importTitle: 'Importar dados',
    fileFilter: 'Exportação do NexTask',
    unreadableFile: 'O arquivo não é um arquivo JSON legível',
  },
  importProblems: {
    notAnExport: 'Este arquivo não é uma exportação do NexTask',
    unsupportedVersion: 'Versão de formato {version} não suportada (versão esperada: {expected})',
    duplicateStage: 'A coluna {id} aparece várias vezes',
    duplicateTag: 'A etiqueta {id} aparece várias vezes',
    duplicateTagName: 'Várias etiquetas se chamam “{name}”',
    duplicateTask: 'A tarefa {id} aparece várias vezes',
    duplicateRecurrence: 'A série {id} aparece várias vezes',
    recurrenceUnknownStage: 'A série {id} faz referência a uma coluna ausente do arquivo ({ref})',
    recurrenceUnknownTag: 'A série {id} faz referência a uma etiqueta ausente do arquivo ({ref})',
    taskUnknownStage: 'A tarefa {id} faz referência a uma coluna ausente do arquivo ({ref})',
    taskUnknownTag: 'A tarefa {id} faz referência a uma etiqueta ausente do arquivo ({ref})',
    taskUnknownRecurrence: 'A tarefa {id} faz referência a uma série ausente do arquivo ({ref})',
    duplicateOccurrence: 'Várias tarefas da série {id} estão previstas para a mesma data',
    taskChecklistClamped: 'Checklist da tarefa {id} reduzida a {maxItems} itens de no máximo {maxLength} caracteres',
    recurrenceChecklistClamped:
      'Checklist da série {id} reduzida a {maxItems} itens de no máximo {maxLength} caracteres',
    templateChecklistClamped: 'Modelo “{name}” reduzido a {maxItems} itens de no máximo {maxLength} caracteres',
    templateNameTruncated: 'Nome de modelo encurtado para {maxLength} caracteres (“{name}”)',
    duplicateTemplateName: 'Vários modelos se chamam “{name}”, apenas o primeiro é importado',
  },
}
