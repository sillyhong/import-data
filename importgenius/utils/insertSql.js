const fs = require('fs').promises; // Using fs.promises for async file operations
const mysql = require('mysql2/promise'); // Using mysql2/promise for async database operations

// 创建数据库连接
async function main() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'test',
            password: '123456',
            database: 'import_data',
        });

        console.log('Connected to database.');

        // 读取 JSON 文件夹中的所有文件
        const jsonFilesPath = '/Users/liangweihong/Documents/import-data/importgenius/importer/usa';

        const files = await fs.readdir(jsonFilesPath);

        // 逐个读取并插入文件内容到数据库
        for (const file of files) {
            const filePath = `${jsonFilesPath}/${file}`;
            const fileNumber = parseInt(file)
            if (fileNumber <= 1801) continue
            // console.log('\x1b[36m%s', 'filePath123', filePath);

            const data = await fs.readFile(filePath, 'utf8');
            const jsonData = JSON.parse(data);

            await insertData(jsonData, filePath, connection);
        }

        // 关闭数据库连接
        await connection.end();
        console.log('Database connection closed.');
    } catch (err) {
        console.error('Error:', err);
    }
}

// 插入数据到数据库表
async function insertData(data, filePath, connection) {
    const selectQueryUrl = 'SELECT COUNT(*) AS count FROM importgenius WHERE url = ?';
    const updateQuery = 'UPDATE importgenius SET totalShipments = ?, mostRecentDate = ?, raw = ? WHERE url = ?';
    const insertQuery = 'INSERT INTO importgenius (raw, totalShipments, company, contactInfo, mostRecentDate, url) VALUES (?, ?, ?, ?, ?, ?)';

    for (const item of data) {
        const values = [
            JSON.stringify(item),
            item.totalShipments,
            item.company,
            item.contactInfo,
            new Date(item.mostRecentDate * 1000).toISOString().slice(0, 10),
            item.url,
        ];

        try {
            // Check if the URL already exists in the database
            const [urlRows] = await connection.query(selectQueryUrl, [item.url]);
            const urlCount = urlRows[0].count;

            if (urlCount === 0) {
                await connection.query(insertQuery, values);
                console.log('Data inserted successfully. filePath:', filePath);
            } else {
                // 新数据没有shipments
                if (!item.shipments || !item.shipments.length) {
                    continue
                }
                // If URL exists, compare shipments for any changes
                const [existingRows] = await connection.query('SELECT raw FROM importgenius WHERE url = ?', [item.url]);
                // const existingRaw = JSON.parse(existingRows[0].raw);
                const existingRaw = existingRows[0].raw;


                // If there are new shipments, update existing record
                const updatedTotalShipments = item.totalShipments;
                const updatedMostRecentDate = new Date(item.mostRecentDate * 1000).toISOString().slice(0, 10);

                // 旧数据没有 shipments
                if (!existingRaw.shipments || !existingRaw.shipments.length) {
                    const updatedRaw = JSON.stringify({
                        ...item,
                        shipments: item.shipments
                    });

                    console.log('\x1b[36m%s', item.url, 'old的值', 0, 'new的值', item.shipments.length, '合并后的值', JSON.parse(updatedRaw).shipments.length);
                    await connection.query(updateQuery, [updatedTotalShipments, updatedMostRecentDate, updatedRaw, item.url]);

                    continue
                }

                const newShipments = item.shipments.filter(newShipment =>
                    !existingRaw.shipments.some(existingShipment =>
                        existingShipment.BillOfLading === newShipment.BillOfLading
                    )
                );

                if (newShipments && newShipments.length > 0) {

                    // Add new shipment objects to the beginning of the array
                    const updatShipments = existingRaw?.shipments ? [...newShipments, ...existingRaw.shipments] : newShipments
                    const updatedRaw = JSON.stringify({
                        ...item,
                        shipments: updatShipments
                    });

                    await connection.query(updateQuery, [updatedTotalShipments, updatedMostRecentDate, updatedRaw, item.url]);
                    console.log('\x1b[36m%s', item.url, '有新增的newShipments', newShipments.length, 'old的值', existingRaw.shipments && existingRaw.shipments.length, 'new的值', item.shipments.length, '合并后的值', JSON.parse(updatedRaw).shipments.length);
                    // console.log('Data updated successfully. filePath:', filePath);
                } else {
                    console.log('URL already exists. No new shipments found. Skipping insertion.', item.url);
                }
            }
        } catch (error) {
            console.error('Error inserting data:', error);
        }
    }
}

// 执行主函数
main();
