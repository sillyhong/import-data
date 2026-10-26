require('../config/environment').loadServerEnvironment();

const Koa = require('koa'); // 引入koa
const Router = require('koa-router'); // 引入koa-router
const path = require('path');
const serve = require('koa-static');
const bodyParser = require('koa-bodyparser');
const getImportgenius = require('./controller/importgenius').getImportgenius;
const updateImportGenius = require('./controller/importgenius').updateImportGenius;
const importYetiController = require('./controller/importyeti');
const tradesnsController = require('./controller/tradesns');
const taskController = require('./controller/tasks');
const taskLogController = require('./controller/task-logs');
const app = new Koa(); // 创建koa应用
const router = new Router(); // 创建路由，支持传递参数


// 错误处理中间件
app.use(async (ctx, next) => {
    try {
        await next(); // 调用下一个中间件
    } catch (err) {
        console.error(err); // 在控制台输出错误信息
        ctx.status = err.status || 500; // 设置响应状态码，默认为 500
        ctx.body = { error: err.message }; // 设置响应体为错误消息
    }
});

app.use(bodyParser())
// 调用router.routes()来组装匹配好的路由，返回一个合并好的中间件
// 调用router.allowedMethods()获得一个中间件，当发送了不符合的请求时，会返回 `405 Method Not Allowed` 或 `501 Not Implemented`
app.use(router.routes());
app.use(router.allowedMethods({
    // throw: true, // 抛出错误，代替设置响应头状态
    // notImplemented: () => '不支持当前请求所需要的功能',
    // methodNotAllowed: () => '不支持的请求方式'
}));
const main = serve(path.join(__dirname));
app.use(async (ctx, next) => {
    if (!/^[a-z0-9/_-]+\.json$/i.test(ctx.path)) return next();
    await main(ctx, next);
});

// importgenius
router.get('/getImportgenius', getImportgenius)
router.post('/updateImportgenius', updateImportGenius)
router.get('/getTradesns', tradesnsController.getTradesns)
router.get('/getImportyeti/summary', importYetiController.getImportYetiSummary)
router.get('/getImportyeti/shipments', importYetiController.getImportYetiShipments)
router.get('/getImportyeti/entities', importYetiController.getImportYetiEntities)
router.get('/tasks', taskController.getTasks)
router.get('/tasks/importgenius/batches', taskController.getImportGeniusBatches)
router.post('/tasks/:taskId/run', taskController.runTask)
router.get('/tasks/:taskId/runs/:runId', taskController.getTaskRun)
router.post('/tasks/:taskId/runs/:runId/stop', taskController.stopTask)
router.post('/tasks/scheduler', taskController.updateScheduler)
router.get('/task-logs', taskLogController.listLogs)
router.get('/task-logs/:id/output', taskLogController.getOutput)
router.get('/task-logs/:id', taskLogController.getLog)
router.get('/scheduler-logs', taskLogController.listLogs)
router.get('/scheduler-logs/:id/output', taskLogController.getOutput)
router.get('/scheduler-logs/:id', taskLogController.getLog)


// 启动服务监听本地8081端口
const port = Number(process.env.PORT || 8081);
app.listen(port, () => {
    console.log(`Import Desk API started on port ${port}; task environment: ${process.env.TASK_ENV || 'unknown'}`);
})

app.on('error', (err) => {
    console.log('====================================');
    console.log('error', err);
    console.log('====================================');
})
