/* 
    为了实现每周触发一次的定时任务，并执行以下步骤：

    1.拉取10页的 importer 数据。
    2. 每拉取一页 importer 数据后，调用 fetchShipments.js 补充 importer 数据下的 shipments。
    3. 10页数据处理完后，调用 batchInsertSql.js 插入数据库。
    4. 每页数据处理成功后，删除对应的 importer 文件夹下的 *.json 文件。
    5. 在关键位置打印日志，包括失败和普通日志。
*/

const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const dayjs = require('dayjs')
const winston = require('winston');
const fetchImporter = require('../fetchImporter').fetchImporter
const fetchShipments = require('../fetchShipments').fetchShipments
const batchInsertSql = require('../utils/batchInsertSql').batchInsertSql


const countryList = [
    /* 北美 */
    // 'usa',
    /* 亚洲 */
    'india',// 印度
    'vietnam',//越南
    // 'turkey', // 土耳其 error
    /* 欧洲 */
    // 'russia' // 俄罗斯 error
    // 'ukraine' // 乌克兰 error
    /* 拉丁美洲 */
    'argentina',// 阿根廷 
    'chile',// 智利 done
    'colombia',// 哥伦比亚 done
    'costarica',// 哥斯达黎加  done
    'ecuador',// 厄瓜多尔 done
    'panama',// 巴拿马  done
    'peru',// 秘鲁  done
    'paraguay',// 巴拉圭 done 
    'uruguay',// 乌拉圭 
    'venezuela',// 委内瑞拉 
]


// 设置日志记录
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'schedule.log' })
    ]
});


async function deleteJsonFiles(country, page) {
    const jsonFilePath = path.join(__dirname, `../importer/${country}`, `${page}.json`);
    await fs.unlink(jsonFilePath);
    logger.info(`Deleted file: ${jsonFilePath}`);

}

async function fetchDatas(country) {
    try {
        for (let page = 1; page <= 10; page++) {
            await fetchImporter(country, page);
            logger.info(`[FetchImporter] Fetched importer for page: ${page} success`);

            await fetchShipments(country, page, false)
            logger.info(`[FetchShipments] Fetched shipments for page: ${page} success`);

            await batchInsertSql(country, page);
            logger.info(`[BatchInsertSql] Inserted data p to database, page: ${page}`);

            await deleteJsonFiles(country, page);
        }

    } catch (error) {
        logger.error(`Error processing pages: ${error.message}`);
    }
}

const timestamp = dayjs().format('YYYY-MM-DD HH:MM:SS');
(async () => {
    for (const country of countryList) {
        await fetchDatas(country);
        logger.info(`Data fetch and insert job for ${country} started at ${timestamp}`);
    }
})()

    // 设置每周日的定时任务
    (async () => {
        const timestamp = dayjs().format('YYYY-MM-DD HH:MM:SS');
        logger.info(`Starting weekly data fetch and insert job at ${timestamp}`);

        for (const country of countryList) {
            await fetchDatas(country);
            logger.info(`Data fetch and insert job for ${country} started at ${timestamp}`);
        }
    })();


