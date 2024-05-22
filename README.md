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

#### fetchShipments

2024-05-21 usa 1801
2024-05-21 argentina 406
2024-05-21 chile 200
2024-05-21 colombia 201

#### 插入数据库

**local 数据库**
2024-05-03 usa 已经插入 700
2024-05-06 usa 已经插入 1000
2024-05-08 usa 已经插入 1400
2024-05-11 usa 已经插入 1801
2024-05-21 argentina 已经插入 406

**cloud 数据库**
2024-05-21 usa 已经插入 1801
2024-05-21 argentina 已经插入 406
2024-05-21 chile 已经插入 200
2024-05-21 colombia 已经插入 201
