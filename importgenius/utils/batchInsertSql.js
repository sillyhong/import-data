const fs = require('fs').promises; // Using fs.promises for async file operations
const path = require('path');
const mysql = require('mysql2/promise'); // Using mysql2/promise for async database operations
const isLive = process.env.ENV === 'production'
/* 北美 */
// const country = 'usa'// 美国 done


/* 亚洲 */
// const country = 'india'// 印度
// const country = 'vietnam'//越南
// const country = 'turkey'//土耳其 error


/* 欧洲 */
// const country = 'russia'//俄罗斯
// const country = 'ukraine'//乌克兰


/* 拉丁美洲 */
// const country = 'argentina'// 阿根廷 done
// const country = 'chile'// 智利 done
// const country = 'colombia'// 哥伦比亚 done
// const country = 'costarica'// 哥斯达黎加 
// const country = 'ecuador'// 厄瓜多尔 
// const country = 'panama'// 巴拿马 
// const country = 'peru'// 秘鲁 
// const country = 'paraguay'// 巴拉圭 
// const country = 'uruguay'// 乌拉圭 
// const country = 'venezuela'// 委内瑞拉 



const dbConfig = isLive ? {
    // host: '43.156.33.21',
    host: 'localhost',
    user: 'root',
    password: 'Asd123456!',
    database: 'import_data',
} : {
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'import_data',
}

// 创建数据库连接
async function batchInsertSql(country, fileNumber) {
    try {
        const connection = await mysql.createConnection(dbConfig);

        console.log('Connected to database.');

        // 读取 JSON 文件夹中的路径
        const directoryPath = path.join(__dirname, `../importer/${country}`);

        let files = []
        if (fileNumber) {
            // 读取文件夹中的fileNumber文件
            files = [`${fileNumber}.json`]
        } else {

            // 读取 importer/country 目录下的所有 JSON 文件

            //正序
            files = (await fs.readdir(directoryPath)).sort((a, b) => parseInt(a) - parseInt(b));
        }

        // 逐个读取并插入文件内容到数据库
        for (const file of files) {
            const filePath = `${directoryPath}/${file}`;
            const fileNumber = parseInt(file)
            // 新数据库
            // if (fileNumber < 1689) continue
            // console.log('\x1b[36m%s', 'filePath123', filePath);

            const data = await fs.readFile(filePath, 'utf8');
            const jsonData = JSON.parse(data);

            await insertData(country, jsonData, filePath, connection);
        }

        // 关闭数据库连接
        await connection.end();
        console.log('Database connection closed.');
    } catch (err) {
        console.error('Error:', err);
    }
}

// 插入数据到数据库表
async function insertData(country, data, filePath, connection) {
    const selectQueryUrls = 'SELECT url, raw FROM importgenius WHERE url IN (?)';
    const insertQuery = 'INSERT INTO importgenius (raw, totalShipments, company, contactInfo, mostRecentDate, url, country) VALUES ?';

    // 收集所有的 URL
    const urls = data.map(item => item.url);

    // 批量查询已存在的记录
    let existingRecords = {};
    if (urls.length > 0) {
        const [rows] = await connection.query(selectQueryUrls, [urls]);
        // 构建一个以 URL 为键的已存在记录映射
        rows.forEach(row => {
            existingRecords[row.url] = row;
        });
    }

    // 准备批量插入和更新的数据
    const insertValues = []; // 新记录
    const updateValues = []; // 需要更新的记录
    for (const item of data) {
        const existingRecord = existingRecords[item.url];

        const values = [
            JSON.stringify(item),
            item.totalShipments,
            item.company,
            item.contactInfo,
            item.mostRecentDate,
            item.url,
            country,
        ];

        if (!existingRecord) {
            // URL 不存在，准备插入数据
            insertValues.push(values);
        } else {
            // URL 已存在，检查是否需要增量更新
            if (!item.shipments || !item.shipments.length) {
                // 新数据没有 shipments，跳过更新
                continue;
            }

            // 解析已存在的 raw 数据
            let existingRaw;
            try {
                existingRaw = typeof existingRecord.raw === 'string' ? JSON.parse(existingRecord.raw) : existingRecord.raw;
            } catch (error) {
                console.error('解析已存在的 raw 数据出错，URL:', item.url);
                continue;
            }

            // 如果已存在的数据没有 shipments，直接使用新的 shipments
            if (!existingRaw.shipments || !existingRaw.shipments.length) {
                const updatedRaw = JSON.stringify({
                    ...item,
                    shipments: item.shipments,
                });

                updateValues.push([
                    item.totalShipments,
                    item.mostRecentDate,
                    updatedRaw,
                    item.url,
                ]);
                continue;
            }

            // 比较 shipments，找到新的 shipments
            const existingShipments = existingRaw.shipments;
            const newShipments = item.shipments.filter(newShipment =>
                !existingShipments.some(existingShipment =>
                    existingShipment.BillOfLading === newShipment.BillOfLading
                )
            );

            if (newShipments && newShipments.length > 0) {
                // 合并 shipments
                const updatedShipments = [...newShipments, ...existingShipments];
                const updatedRaw = JSON.stringify({
                    ...item,
                    shipments: updatedShipments,
                });

                updateValues.push([
                    item.totalShipments,
                    item.mostRecentDate,
                    updatedRaw,
                    item.url,
                ]);
            } else {
                // 没有新的 shipments，跳过更新
                continue;
            }
        }
    }

    // 批量插入新记录
    if (insertValues.length > 0) {
        try {
            await connection.query(insertQuery, [insertValues]);
            const fileNumber = parseInt(filePath)
            console.log('批量插入完成。插入记录数:', insertValues.length, 'filePath', filePath);
        } catch (error) {
            console.error('批量插入出错:', error);
        }
    }

    // 批量更新已存在的记录
    if (updateValues.length > 0) {
        // 构建批量更新的 SQL 语句
        let updateSql = 'UPDATE importgenius SET ';
        updateSql += 'totalShipments = CASE url ';
        updateValues.forEach(([totalShipments, , , url]) => {
            updateSql += `WHEN ${connection.escape(url)} THEN ${connection.escape(totalShipments)} `;
        });
        updateSql += 'END, ';

        updateSql += 'mostRecentDate = CASE url ';
        updateValues.forEach(([, mostRecentDate, , url]) => {
            updateSql += `WHEN ${connection.escape(url)} THEN ${connection.escape(mostRecentDate)} `;
        });
        updateSql += 'END, ';

        updateSql += 'raw = CASE url ';
        updateValues.forEach(([, , raw, url]) => {
            updateSql += `WHEN ${connection.escape(url)} THEN ${connection.escape(raw)} `;
        });
        updateSql += 'END ';

        // 指定需要更新的 URL
        const urlsToUpdate = updateValues.map(([, , , url]) => connection.escape(url));
        updateSql += `WHERE url IN (${urlsToUpdate.join(', ')})`;

        try {
            await connection.query(updateSql);
            console.log('批量更新完成。更新记录数:', updateValues.length);
        } catch (error) {
            console.error('批量更新出错:', error);
        }
    }
}


// 执行主函数
// batchInsertSql('usa', 0);

module.exports = {
    batchInsertSql
}