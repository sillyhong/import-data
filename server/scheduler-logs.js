const taskLogsModule = require('./task-logs');

// Keep existing imports working while all new executions use the unified store.
module.exports = {
  ...taskLogsModule,
  schedulerLogs: taskLogsModule.taskLogs,
  createSchedulerLogStore: taskLogsModule.createTaskLogStore,
};
