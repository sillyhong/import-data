/* 
    隔5天，拉取最新的50页数据
*/


const cron = require('node-cron');

// 定时任务：每隔 5 天执行一次
cron.schedule('0 0 */5 * *', () => {
    console.log('Executing task every 5 days');
    // 在这里执行你的任务，例如调用某个函数或执行 SQL 查询
});