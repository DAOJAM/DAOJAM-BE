const mysql = require('mysql2');
const nanoid = require('nanoid');


function bulkinsert() {
  // 创建MySQL连接
  const mysqlConnection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1qazXSW@',
    database: 'test',
  });

  for (let i = 0; i < 100000; i++) {
    mysqlConnection.query('insert into a (name, status) VALUES(?,?);', [ nanoid(16), i ], function(err, results, fields) {
      console.log(results);
      console.log(fields);
    });
  }
}

bulkinsert();
