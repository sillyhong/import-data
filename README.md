### 启动 web 服务

1.  `npm run start`
2.  运行在 3000 端口
3.  访问 http://localhost:3000/app

### 启动 koa server

1. `npm run server`
2. 运行在 8081 端口
3. 启动 koa server, 默认运行在 8081 端口, 尝试访问 `http://localhost:8081/american/shower-door/1.json`
4. 在 package.json 增加了代理，`"proxy": "http://localhost:8081`
5. 访问 `http://localhost:3000/american/shower-door/1.json` --> `http://localhost:8081/american/shower-door/1.json`

### 海关数据

搜索 goole 标签页 -- 外贸海关数据 -- [料神外贸数据](https://data.imiker.com/#left_top)
