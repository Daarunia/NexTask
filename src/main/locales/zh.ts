import type { MainMessages } from './fr.js'

/**
 * Textes du main en chinois simplifié, mêmes clés que le catalogue français
 * (une clé manquante ou en trop casse le typecheck).
 */
export const zh: MainMessages = {
  tray: {
    open: '打开 NexTask',
    quickAdd: '快速添加…',
    quit: '退出',
  },
  notifications: {
    title: { one: '待开始的任务（{count}）', other: '待开始的任务（{count}）' },
    more: { one: '… 还有 {count} 个', other: '… 还有 {count} 个' },
    dismiss: '关闭',
  },
  startup: {
    errorTitle: 'NexTask 无法启动',
    databaseFailed: '数据库更新失败，已撤销。',
    serverFailed: '应用的本地服务器无法启动。',
  },
  quickAdd: {
    windowTitle: 'NexTask — 快速添加',
  },
  documents: {
    saveTitle: '保存文档',
  },
  dataTransfer: {
    exportTitle: '导出数据',
    importTitle: '导入数据',
    fileFilter: 'NexTask 导出文件',
    unreadableFile: '该文件不是可读取的 JSON 文件',
    unreadableArchive: '该文件不是可读取的 NexTask 导出压缩包',
    damagedDocument: '压缩包中的某个文档已损坏或过大',
  },
  // Emplacement de la base (cf. system/databaseLocation.ts)
  databaseLocation: {
    openTitle: '打开 NexTask 数据库',
    moveTitle: '选择数据库文件夹',
    fileFilter: 'NexTask 数据库',
    invalidTitle: '数据库被拒绝',
    problems: {
      sameLocation: 'NexTask 已在使用此数据库',
      alreadyExists: '此文件夹中已有 nextask.db 数据库。请通过“打开数据库…”打开它，或选择其他文件夹',
      documentsExist: '此文件夹中已有旧数据库留下的 nextask-documents 文件夹。请选择其他文件夹',
      notWritable: '无法将数据库复制到此文件夹',
      copyFailed: '数据库副本不完整，已被删除',
      unreadable: '文件不存在或无法读取',
      notSqlite: '此文件不是数据库',
      notNextask: '此数据库不是 NexTask 数据库',
      newerVersion: '此数据库已被更新版本的 NexTask 升级。请先更新 NexTask 再打开',
    },
    useDefault: {
      title: '默认位置',
      message: '恢复数据库的默认位置？',
      detail:
        'NexTask 将使用 {path} 中的数据库重新启动。你可以按原样重新打开它，或将当前数据库复制过去（旧数据库会保存在备份文件夹中）。',
      reopen: '按原样重新打开',
      copy: '复制当前数据库',
      cancel: '取消',
    },
    missing: {
      title: '找不到数据库',
      message: '找不到 NexTask 数据库。',
      detail: '{path}\n\n它可能位于已拔出的 U 盘或已断开的网络驱动器上。',
      retry: '重试',
      chooseOther: '选择其他数据库…',
      useDefault: '使用默认位置',
      quit: '退出',
    },
    locked: {
      title: '数据库可能已被打开',
      message: '此数据库可能已在另一台电脑上打开。',
      detail:
        '由 {hostname} 于 {date} 打开。\n{path}\n\n同时在此处打开可能会丢失修改。如果 NexTask 在那里已不再运行（异常退出），可以放心打开。',
      openAnyway: '仍然打开',
      quit: '退出',
    },
  },
}
