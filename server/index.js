const Koa = require('koa'); // 引入koa
const Router = require('koa-router'); // 引入koa-router
const path = require('path');
const serve = require('koa-static');
const bodyParser = require('koa-bodyparser');
const getImportgenius = require('./controller/importgenius').getImportgenius;
const updateImportGenius = require('./controller/importgenius').updateImportGenius;
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
app.use(main)

// importgenius
router.get('/getImportgenius', getImportgenius)
router.post('/updateImportgenius', updateImportGenius)


// 启动服务监听本地8081端口
app.listen(8081, () => {
    console.log('应用已经启动，http://localhost:8081');
})

app.on('error', (err) => {
    console.log('====================================');
    console.log('error', err);
    console.log('====================================');
})
