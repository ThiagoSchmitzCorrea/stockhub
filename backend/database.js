const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Servidor conectado ao banco de dados.');
    }
});

db.run(`CREATE TABLE IF NOT EXISTS users (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   nome TEXT NOT NULL,
   email TEXT NOT NULL UNIQUE,
   senha TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS balances (
   user_id INTEGER PRIMARY KEY,
   saldo REAL NOT NULL DEFAULT 0,
   FOREIGN KEY(user_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS user_stocks (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id INTEGER NOT NULL,
   ticker TEXT NOT NULL,
   price REAL NOT NULL,
   quantidade INTEGER NOT NULL,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(user_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL, 
    ticker TEXT, 
    quantidade INTEGER, 
    valor REAL NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS rentabilidade (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    valor_inicial REAL NOT NULL,
    valor_atual REAL NOT NULL,
    rentabilidade REAL NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS anotacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);


module.exports = db;
