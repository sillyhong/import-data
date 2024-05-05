const fs = require('fs');
const mysql = require('mysql2');

// 创建数据库连接
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'test',
    password: '123456',
    database: 'import_data',
});

// var map = {}

// 连接到数据库
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Connected to database.');

    // 读取 JSON 文件夹中的所有文件
    // const jsonFilesPath = '/importer/usea';
    const jsonFilesPath = '/Users/liangweihong/Documents/import-data/importgenius/importer/usa';

    fs.readdir(jsonFilesPath, (err, files) => {
        if (err) {
            console.error('Error reading JSON files:', err);
            return;
        }


        // 逐个读取并插入文件内容到数据库
        files.forEach((file) => {

            const filePath = `${jsonFilesPath}/${file}`;
            // if (!filePath.includes('importer/usa/0.json')) {
            //     return
            // }
            console.log('\x1b[36m%s', 'filePath123', filePath);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(`Error reading file ${file}:`, err);
                    return;
                }

                try {
                    const jsonData = JSON.parse(data);
                    // console.log('\x1b[36m%s', 'jsonData', jsonData.length);
                    // jsonData.forEach((item) => {
                    //     if (!map[item.url]) {
                    //         map[item.url] = 1
                    //     }

                    // })
                    // console.log('\x1b[36m%s', 'length', Object.keys(map).length);
                    insertData(jsonData, filePath);
                } catch (error) {
                    console.error(`Error parsing JSON file ${file}:`, error);
                }
            });
        });
    });
});

// 插入数据到数据库表
// 插入数据到数据库表
async function insertData(data, filePath) {
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
            const [rows] = await connection.promise().query(selectQuery, [item.url]);
            const count = rows[0].count;

            if (count === 0) {
                await connection.promise().query(insertQuery, values);
                console.log('Data inserted successfully. filePath:', filePath);
            } else {
                console.log('URL already exists. Skipping insertion.', item.url);
            }
        } catch (error) {
            console.error('Error inserting data:', error);
        }
    }
}


// function insertData(data, filePath) {
//     const selectQuery = 'SELECT COUNT(*) AS count FROM importgenius WHERE url = ?';
//     const insertQuery = 'INSERT INTO importgenius (raw, totalShipments, company, contactInfo, mostRecentDate, url) VALUES (?, ?, ?, ?, ?, ?)';

//     data.forEach((item) => {
//         const values = [
//             JSON.stringify(item),
//             item.totalShipments,
//             item.company,
//             item.contactInfo,
//             new Date(item.mostRecentDate * 1000).toISOString().slice(0, 10),
//             item.url,
//         ];

//         connection.query(selectQuery, [item.url], (err, result) => {
//             if (err) {
//                 console.error('Error checking existing URL:', err);
//                 return;
//             }

//             const count = result[0].count;

//             if (count === 0) {
//                 connection.query(insertQuery, values, (err, result) => {
//                     if (err) {
//                         console.error('Error inserting data:', err);
//                         return;
//                     }
//                     console.log('Data inserted successfully. filePath:', filePath);
//                 });
//             } else {
//                 console.log('URL already exists. Skipping insertion.', item.url);
//             }
//         });
//     });
// }

// 关闭数据库连接
// connection.end((err) => {
//     if (err) {
//         console.error('Error closing database connection:', err);
//         return;
//     }
//     console.log('Database connection closed.');
// });
