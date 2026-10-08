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
  dataTransfer: {
    exportTitle: '导出数据',
    importTitle: '导入数据',
    fileFilter: 'NexTask 导出文件',
    unreadableFile: '该文件不是可读取的 JSON 文件',
  },
  importProblems: {
    notAnExport: '该文件不是 NexTask 导出文件',
    unsupportedVersion: '不支持格式版本 {version}（应为版本 {expected}）',
    duplicateStage: '列 {id} 出现多次',
    duplicateTag: '标签 {id} 出现多次',
    duplicateTagName: '多个标签名为“{name}”',
    duplicateTask: '任务 {id} 出现多次',
    duplicateRecurrence: '系列 {id} 出现多次',
    recurrenceUnknownStage: '系列 {id} 引用了文件中不存在的列（{ref}）',
    recurrenceUnknownTag: '系列 {id} 引用了文件中不存在的标签（{ref}）',
    taskUnknownStage: '任务 {id} 引用了文件中不存在的列（{ref}）',
    taskUnknownTag: '任务 {id} 引用了文件中不存在的标签（{ref}）',
    taskUnknownRecurrence: '任务 {id} 引用了文件中不存在的系列（{ref}）',
    duplicateOccurrence: '系列 {id} 中有多个任务安排在同一日期',
  },
}
