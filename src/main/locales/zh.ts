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
  checklists: {
    copyName: '{name}（副本）',
  },
  boards: {
    defaultName: '我的看板',
    defaultStages: {
      todo: '待办',
      inProgress: '进行中',
      waiting: '等待中',
      done: '已完成',
    },
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
    duplicateBoard: '看板 {id} 出现多次',
    duplicateBoardName: '多个看板名为“{name}”',
    stageUnknownBoard: '列 {id} 引用了文件中不存在的看板',
    recurrenceUnknownStage: '系列 {id} 引用了文件中不存在的列（{ref}）',
    recurrenceUnknownTag: '系列 {id} 引用了文件中不存在的标签（{ref}）',
    taskUnknownStage: '任务 {id} 引用了文件中不存在的列（{ref}）',
    taskUnknownTag: '任务 {id} 引用了文件中不存在的标签（{ref}）',
    taskUnknownRecurrence: '任务 {id} 引用了文件中不存在的系列（{ref}）',
    duplicateOccurrence: '系列 {id} 中有多个任务安排在同一日期',
    taskChecklistClamped: '任务 {id} 的清单已缩减为最多 {maxItems} 项，每项最多 {maxLength} 个字符',
    recurrenceChecklistClamped: '系列 {id} 的清单已缩减为最多 {maxItems} 项，每项最多 {maxLength} 个字符',
    templateChecklistClamped: '模板“{name}”已缩减为最多 {maxItems} 项，每项最多 {maxLength} 个字符',
    templateNameTruncated: '模板名称已缩短为 {maxLength} 个字符（“{name}”）',
    duplicateTemplateName: '多个模板名为“{name}”，仅导入第一个',
  },
}
