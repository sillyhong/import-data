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
            console.log('\x1b[36m%s', 'filePath123', filePath);
            if (!filePath.includes('700.json')) continue

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
    const selectQuery = 'SELECT COUNT(*) AS count FROM importgenius WHERE url = ?';
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
            const [rows] = await connection.query(selectQuery, [item.url]);
            const count = rows[0].count;

            if (count === 0) {
                await connection.query(insertQuery, values);
                console.log('Data inserted successfully. filePath:', filePath);
            } else {
                console.log('URL already exists. Skipping insertion.', item.url);
            }
        } catch (error) {
            console.error('Error inserting data:', error);
        }
    }
}

// 执行主函数
main();
