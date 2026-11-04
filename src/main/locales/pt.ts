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
  dataTransfer: {
    exportTitle: 'Exportar os dados',
    importTitle: 'Importar dados',
    fileFilter: 'Exportação do NexTask',
    unreadableFile: 'O arquivo não é um arquivo JSON legível',
  },
  // Emplacement de la base (cf. system/databaseLocation.ts)
  databaseLocation: {
    openTitle: 'Abrir um banco de dados do NexTask',
    moveTitle: 'Escolher a pasta do banco de dados',
    fileFilter: 'Banco de dados do NexTask',
    invalidTitle: 'Banco de dados recusado',
    problems: {
      sameLocation: 'O NexTask já usa este banco de dados',
      alreadyExists:
        'Esta pasta já contém um banco de dados nextask.db. Abra-o com “Abrir um banco…” ou escolha outra pasta',
      notWritable: 'Não foi possível copiar o banco de dados para esta pasta',
      copyFailed: 'A cópia do banco de dados estava incompleta e foi excluída',
      unreadable: 'O arquivo não existe ou não pode ser lido',
      notSqlite: 'Este arquivo não é um banco de dados',
      notNextask: 'Este banco de dados não é do NexTask',
      newerVersion:
        'Este banco de dados foi atualizado por uma versão mais recente do NexTask. Atualize o NexTask para abri-lo',
    },
    useDefault: {
      title: 'Local padrão',
      message: 'Voltar ao local padrão do banco de dados?',
      detail:
        'O NexTask será reiniciado com o banco de dados de {path}. Você pode reabri-lo como estava ou copiar para lá o banco de dados atual (o antigo fica então guardado na pasta de backups).',
      reopen: 'Reabrir como estava',
      copy: 'Copiar o banco de dados atual',
      cancel: 'Cancelar',
    },
    missing: {
      title: 'Banco de dados não encontrado',
      message: 'O banco de dados do NexTask não foi encontrado.',
      detail: '{path}\n\nTalvez ele esteja em um pen drive desconectado ou em uma unidade de rede indisponível.',
      retry: 'Tentar novamente',
      chooseOther: 'Escolher outro banco…',
      useDefault: 'Usar o local padrão',
      quit: 'Sair',
    },
    locked: {
      title: 'Banco de dados talvez já aberto',
      message: 'Este banco de dados talvez esteja aberto em outro computador.',
      detail:
        'Aberto por {hostname} em {date}.\n{path}\n\nAbri-lo aqui ao mesmo tempo pode fazer perder alterações. Se o NexTask não estiver mais aberto lá (encerramento inesperado), você pode abri-lo sem risco.',
      openAnyway: 'Abrir mesmo assim',
      quit: 'Sair',
    },
  },
}
