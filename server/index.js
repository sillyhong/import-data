const Koa = require('koa'); // 引入koa
const Router = require('koa-router'); // 引入koa-router
const fs = require('fs');
const path = require('path');
const serve = require('koa-static');

const app = new Koa(); // 创建koa应用
const router = new Router(); // 创建路由，支持传递参数
// 指定一个url匹配
// router.get('/:index', async (ctx) => {
//     console.log('====================================');
//     console.log('ctx', ctx.params);
//     console.log('====================================');
//     // 获取页数
//     const index = ctx.params.index || 0
//     //加载数据
//     fs.readFile(path.join(__dirname, `./American/${index}.json`),'utf8', (err, data) => { 
//         if(err){
//             console.log('err', err);
//                 ctx.body = '<h1>hello world!</h1>' + err;
//             return
//         }
//         // console.log('data',data);
//         // ctx.type = 'application/json';
//         // ctx.body = data;
//         // ctx.end(200)
//         ctx.response.type = 'json';
//         ctx.response.body = { data: 'Hello World' };
//     })
//     //返回数据
//     // ctx.type = 'html';
    
// })

router.get('/', () => {
    console.log('123');
})

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

// 启动服务监听本地8081端口
app.listen(8081, () => {
    console.log('应用已经启动，http://localhost:8081');
})

app.on('error', (err) => {
    console.log('====================================');
    console.log('error', err);
    console.log('====================================');
})
