
const mysql = require('mysql2/promise');

// 创建数据库连接池
//TODO 环境变量
const pool = mysql.createPool({
    // host: '43.156.33.21',
    host: 'localhost',
    user: 'root',
    password: 'Asd123456!',
    database: 'import_data',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function getImportgenius(ctx) {
    // 获取查询参数
    const { pageIndex = 1, pageSize = 10, country, keyword, mostRecentDate, url, isTarget } = ctx.query;
    const offset = (pageIndex - 1) * pageSize;

    // 构建查询条件
    let query = 'SELECT SQL_CALC_FOUND_ROWS * FROM importgenius WHERE 1=1';
    const queryParams = [];

    if (country) {
        query += ' AND country = ?';
        queryParams.push(country);
    }

    if (keyword) {
        const keywordParam = `%${keyword}%`;
        query += ' AND product_description_generated LIKE ?';
        queryParams.push(keywordParam);
    }

    if (mostRecentDate) {
        query += ' AND mostRecentDate = ?';
        queryParams.push(mostRecentDate);
    }

    if (url) {
        query += ' AND url = ?';
        queryParams.push(url);
    }

    if ([0, 1, 2].includes(Number(isTarget))) {
        query += ' AND isTarget = ?';
        queryParams.push(isTarget);
    }

    query += ' ORDER BY mostRecentDate DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(pageSize), parseInt(offset));
    console.log('\x1b[36m%s', 'queryParams132', queryParams);

    try {
        // 执行查询
        const [rows] = await pool.query(query, queryParams);

        // 查询总数
        const [countRows] = await pool.query('SELECT FOUND_ROWS() AS total');

        // 提取总数
        const total = countRows[0].total;

        // 返回结果
        ctx.body = {
            data: rows,
            total: total,
            pagination: {
                pageIndex: parseInt(pageIndex),
                pageSize: parseInt(pageSize)
            }
        };
    } catch (error) {
        ctx.status = 500;
        ctx.body = { message: 'Data query error' + error };

    }

}

// 更新数据的控制器方法
async function updateImportGenius(ctx) {
    const { id, isTarget } = ctx.request.body || {};
    console.log('\x1b[36m%s', 'ctx.body123', ctx.request.body);
    // 0 表示 非目标， 1目标客户， 2 表示未开发
    if (!id || ![0, 1, 2].includes(Number(isTarget))) {
        ctx.status = 500;
        ctx.body = { message: 'Data is not correct' };
        return
    }
    const query = `UPDATE importgenius 
                   SET isTarget = ?
                   WHERE id = ?`;
    const queryParams = [isTarget, id];

    try {
        const [result] = await pool.query(query, queryParams);

        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { message: 'Record not found' };
        } else {
            ctx.body = { message: 'Record updated successfully' };
        }
    } catch (error) {
        ctx.status = 404;
        ctx.body = { message: 'Update data not success:' + error };
    }
}

module.exports = {
    updateImportGenius,
    getImportgenius,
}  