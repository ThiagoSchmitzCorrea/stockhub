const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const db = require('./database');
const app = express();
const PORT = 1234;
const API_KEY = '4CGp42KiBMk2ZIY6XNjNCtLMqsQwk5nP';

const SECRET_KEY = 'segredoShiu';

app.use(cors());
app.use(bodyParser.json());

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido.' });
    }

    req.user = user;
    next();
  });
}

app.post('/register', (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ message: 'Todos os campos (nome, email, senha) são obrigatórios.' });
  }

  const sqlInsertUser = `INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)`;
  const sqlInsertBalance = `INSERT INTO balances (user_id, saldo) VALUES (?, ?)`;

  db.run(sqlInsertUser, [nome, email, senha], function (err) {
    if (err) {
      return res.status(400).json({ message: 'Erro ao registrar usuário' });
    }

    const userId = this.lastID;

    db.run(sqlInsertBalance, [userId, 0], (err) => {
      if (err) {
        console.error('Erro ao criar entrada no saldo:', err.message);
        return res.status(500).json({ message: 'Erro ao configurar saldo do usuário' });
      }

      res.status(201).json({ id: userId, nome, email, saldo: 0 });
    });
  });
});


app.post('/login', (req, res) => {
  const { email, senha } = req.body;

  const sql = `SELECT * FROM users WHERE email = ?`;
  db.get(sql, [email], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    if (senha !== user.senha) {
      return res.status(401).json({ sucesso: false, mensagem: 'Senha incorreta' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });

    res.status(200).json({
      sucesso: true,
      token,
      userId: user.id,
      nome: user.nome,
    });
  });
});

app.get('/saldo/:id', verifyToken, (req, res) => {
  const userId = req.params.id;
  const sql = `SELECT saldo FROM balances WHERE user_id = ?`;

  db.get(sql, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao consultar saldo' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Saldo não encontrado' });
    }

    res.status(200).json({ saldo: row.saldo });
  });
});

app.get('/saldo/:id', verifyToken, (req, res) => {
  const userId = req.params.id;
  const sql = `SELECT saldo FROM balances WHERE user_id = ?`;

  db.get(sql, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao consultar saldo' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Saldo não encontrado' });
    }

    res.status(200).json({ saldo: row.saldo });
  });
});

app.post('/deposito', verifyToken, (req, res) => {
  const { userId, valor } = req.body;

  if (valor <= 0) {
    return res.status(400).json({ message: 'Valor inválido para depósito' });
  }

  const sql = `UPDATE balances SET saldo = saldo + ? WHERE user_id = ?`;

  db.run(sql, [valor, userId], function (err) {
    if (err) {
      return res.status(500).json({ message: 'Erro ao realizar depósito' });
    }

    res.status(200).json({ message: 'Depósito realizado com sucesso' });
  });
});

app.post('/retirada', verifyToken, (req, res) => {
  const { userId, valor } = req.body;

  if (valor <= 0) {
    return res.status(400).json({ message: 'Valor inválido para retirada' });
  }

  const sql = `SELECT saldo FROM balances WHERE user_id = ?`;
  db.get(sql, [userId], (err, row) => {
    if (err || !row) {
      return res.status(500).json({ message: 'Erro ao consultar saldo' });
    }

    if (row.saldo < valor) {
      return res.status(400).json({ message: 'Saldo insuficiente' });
    }

    const updateSql = `UPDATE balances SET saldo = saldo - ? WHERE user_id = ?`;
    db.run(updateSql, [valor, userId], function (err) {
      if (err) {
        return res.status(500).json({ message: 'Erro ao realizar retirada' });
      }

      res.status(200).json({ message: 'Retirada realizada com sucesso' });
    });
  });
});

app.post('/comprar', verifyToken, (req, res) => {
  const { userId, ticker, price, quantidade } = req.body;

  if (!ticker || !price || !quantidade || quantidade <= 0) {
    return res.status(400).json({ message: 'Dados inválidos para compra.' });
  }

  const verificarSaldoSql = `SELECT saldo FROM balances WHERE user_id = ?`;
  db.get(verificarSaldoSql, [userId], (err, row) => {
    if (err || !row) {
      return res.status(500).json({ message: 'Erro ao consultar saldo.' });
    }

    const custoTotal = price * quantidade;

    if (row.saldo < custoTotal) {
      return res.status(400).json({ message: 'Saldo insuficiente para a compra.' });
    }

    const atualizarSaldoSql = `UPDATE balances SET saldo = saldo - ? WHERE user_id = ?`;
    const registrarCompraSql = `
      INSERT INTO user_stocks (user_id, ticker, price, quantidade)
      VALUES (?, ?, ?, ?)
    `;
    const registrarTransacaoSql = `
      INSERT INTO transactions (user_id, tipo, ticker, quantidade, valor)
      VALUES (?, 'compra', ?, ?, ?)
    `;

    db.serialize(() => {
      db.run(atualizarSaldoSql, [custoTotal, userId]);
      db.run(registrarCompraSql, [userId, ticker, price, quantidade]);
      db.run(registrarTransacaoSql, [userId, ticker, quantidade, custoTotal], function (err) {
        if (err) {
          return res.status(500).json({ message: 'Erro ao registrar transação.' });
        }

        res.status(200).json({ message: 'Compra registrada com sucesso.' });
      });
    });
  });
});

app.get('/acoes/:userId', (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT ticker, price, SUM(quantidade) AS quantidade
    FROM user_stocks
    WHERE user_id = ?
    GROUP BY ticker, price
  `;
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar ações do usuário.' });
    }

    res.status(200).json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

app.post('/vender', verifyToken, (req, res) => {
  const { userId, ticker, quantidade } = req.body;

  if (!ticker || quantidade <= 0) {
    return res.status(400).json({ message: 'Dados inválidos para venda.' });
  }

  const verificarQuantidadeSql = `
    SELECT SUM(quantidade) AS quantidade_total, price
    FROM user_stocks 
    WHERE user_id = ? AND ticker = ?
  `;

  db.get(verificarQuantidadeSql, [userId, ticker], (err, row) => {
    if (err || !row || row.quantidade_total < quantidade) {
      return res.status(400).json({ message: 'Quantidade insuficiente para venda.' });
    }

    const receita = row.price * quantidade;
    const atualizarSaldoSql = `UPDATE balances SET saldo = saldo + ? WHERE user_id = ?`;
    const registrarVendaSql = `
      INSERT INTO user_stocks (user_id, ticker, price, quantidade)
      VALUES (?, ?, ?, ?)
    `;
    const registrarTransacaoSql = `
      INSERT INTO transactions (user_id, tipo, ticker, quantidade, valor)
      VALUES (?, 'venda', ?, ?, ?)
    `;

    db.serialize(() => {
      db.run(atualizarSaldoSql, [receita, userId]);
      db.run(registrarVendaSql, [userId, ticker, row.price, -quantidade]);
      db.run(registrarTransacaoSql, [userId, ticker, quantidade, receita], function (err) {
        if (err) {
          return res.status(500).json({ message: 'Erro ao registrar transação.' });
        }

        res.status(200).json({ message: 'Venda registrada com sucesso.', receita });
      });
    });
  });
});

app.post('/nota', verifyToken, (req, res) => {
  const { userId, ticker, note } = req.body;

  if (!userId || !ticker || !note) {
    return res.status(400).json({ message: 'Dados inválidos para adicionar nota.' });
  }

  const sql = `
    INSERT INTO anotacoes (user_id, ticker, note) 
    VALUES (?, ?, ?)
  `;
  db.run(sql, [userId, ticker, note], function (err) {
    if (err) {
      return res.status(500).json({ message: 'Erro ao adicionar nota.', error: err.message });
    }
    res.status(201).json({ message: 'Nota adicionada com sucesso.', id: this.lastID });
  });
});

app.put('/nota', verifyToken, (req, res) => {
  const { userId, ticker, note } = req.body;

  if (!userId || !ticker || !note) {
    return res.status(400).json({ message: 'Dados inválidos para atualizar nota.' });
  }

  const sql = `
    UPDATE anotacoes 
    SET note = ?, updated_at = datetime('now') 
    WHERE user_id = ? AND ticker = ?
  `;
  db.run(sql, [note, userId, ticker], function (err) {
    if (err) {
      return res.status(500).json({ message: 'Erro ao atualizar nota.', error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Nota não encontrada.' });
    }

    res.status(200).json({ message: 'Nota atualizada com sucesso.' });
  });
});

app.get('/notas/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT ticker, note, created_at, updated_at 
    FROM anotacoes
    WHERE user_id = ?
  `;
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar notas.', error: err.message });
    }
    res.status(200).json(rows);
  });
});

app.get('/historico/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT 
      tipo,
      ticker,
      quantidade,
      valor,
      created_at
    FROM transactions
    WHERE user_id = ? AND tipo != 'dividendo'
    ORDER BY created_at DESC
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar histórico:', err.message);
      return res.status(500).json({ message: 'Erro ao buscar histórico.' });
    }

    res.status(200).json(rows);
  });
});

app.post('/registrar-transacao', verifyToken, (req, res) => {
  const { userId, tipo, ticker, quantidade, valor } = req.body;

  if (!userId || !tipo || !valor) {
    return res.status(400).json({ message: 'Dados inválidos para registrar transação.' });
  }

  const sql = `
    INSERT INTO transactions (user_id, tipo, ticker, quantidade, valor, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `;

  db.run(sql, [userId, tipo, ticker, quantidade, valor], function (err) {
    if (err) {
      console.error('Erro ao registrar transação:', err.message);
      return res.status(500).json({ message: 'Erro ao registrar transação.' });
    }

    res.status(200).json({
      message: 'Transação registrada com sucesso.',
      ticker: ticker,
      valor: valor,
    });
  });
});

app.get('/dividendos/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT ticker, quantidade, valor, created_at
    FROM dividends
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar dividendos:', err.message);
      return res.status(500).json({ message: 'Erro ao buscar dividendos.' });
    }

    res.status(200).json(rows);
  });
});

app.post('/calcular-dividendos', verifyToken, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'ID do usuário é obrigatório.' });
  }

  const dividendosFixos = {
    PBR: 0.5,  
    VALE: 0.7, 
    ITUB: 0.3, 
    AAPL: 0.2, 
    MSFT: 0.25, 
  };

  const buscarAcoesSql = `
    SELECT ticker, quantidade
    FROM user_stocks
    WHERE user_id = ?
  `;

  db.all(buscarAcoesSql, [userId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar ações:', err.message);
      return res.status(500).json({ message: 'Erro ao calcular dividendos.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: 'Usuário não possui ações.' });
    }

    let totalDividendo = 0;

    rows.forEach(({ ticker, quantidade }) => {
      if (dividendosFixos[ticker] && quantidade > 0) {
        totalDividendo += dividendosFixos[ticker] * quantidade;
      }
    });

    if (totalDividendo === 0) {
      return res.status(400).json({ message: 'Nenhum dividendo a ser pago.' });
    }

    const atualizarSaldoSql = `UPDATE balances SET saldo = saldo + ? WHERE user_id = ?`;
    db.run(atualizarSaldoSql, [totalDividendo, userId], function (err) {
      if (err) {
        console.error('Erro ao atualizar saldo:', err.message);
        return res.status(500).json({ message: 'Erro ao registrar dividendos.' });
      }

      const registrarTransacaoSql = `
        INSERT INTO transactions (user_id, tipo, ticker, quantidade, valor)
        VALUES (?, 'dividendo', NULL, NULL, ?)
      `;
      db.run(registrarTransacaoSql, [userId, totalDividendo], function (err) {
        if (err) {
          console.error('Erro ao registrar transação:', err.message);
          return res.status(500).json({ message: 'Erro ao registrar transação.' });
        }

        res.status(200).json({
          message: 'Dividendos adicionados com sucesso.',
          totalDividendo,
        });
      });
    });
  });
});

app.get('/rentabilidade/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT 
      r.ticker,
      r.valor_inicial,
      r.valor_atual,
      r.rentabilidade
    FROM rentabilidade r
    WHERE r.user_id = ?
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar rentabilidade:', err.message);
      return res.status(500).json({ message: 'Erro ao buscar rentabilidade.' });
    }

    res.status(200).json(rows);
  });
});

app.post('/atualizar-rentabilidade', verifyToken, (req, res) => {
  const { userId, ticker, valorAtual } = req.body;

  if (!userId || !ticker || !valorAtual) {
    return res.status(400).json({ message: 'Dados incompletos para atualizar rentabilidade.' });
  }

  const sql = `
    UPDATE rentabilidade
    SET valor_atual = ?, 
        rentabilidade = ((? - valor_inicial) / valor_inicial) * 100
    WHERE user_id = ? AND ticker = ?
  `;

  db.run(sql, [valorAtual, valorAtual, userId, ticker], function (err) {
    if (err) {
      console.error('Erro ao atualizar rentabilidade:', err.message);
      return res.status(500).json({ message: 'Erro ao atualizar rentabilidade.' });
    }

    res.status(200).json({ message: 'Rentabilidade atualizada com sucesso.' });
  });
});

app.post('/sincronizar-precos', async (req, res) => {
  const { userId } = req.body;

  const buscarAcoesSql = `
    SELECT DISTINCT ticker, price
    FROM user_stocks
    WHERE user_id = ? AND quantidade > 0
  `;

  db.all(buscarAcoesSql, [userId], async (err, tickers) => {
    if (err) {
      console.error('Erro ao buscar ações do usuário:', err.message);
      return res.status(500).json({ message: 'Erro ao buscar ações do usuário.' });
    }

    try {
      const precos = await Promise.all(
        tickers.map(async ({ ticker, price: valorInicial }) => {
          try {
            const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${API_KEY}`
            );
            const valorAtual = response.data.results[0]?.c || 0;

            return {
              ticker,
              valorInicial,
              valorAtual,
            };
          } catch (error) {
            console.error(`Erro ao obter preço para o ticker ${ticker}:`, error.message);
            return null;
          }
        })
      );

      const precosValidos = precos.filter((p) => p !== null);

      precosValidos.forEach(({ ticker, valorInicial, valorAtual }) => {
        const verificarSql = `
          SELECT COUNT(*) AS count
          FROM rentabilidade
          WHERE user_id = ? AND ticker = ?
        `;

        db.get(verificarSql, [userId, ticker], (verificarErr, row) => {
          if (verificarErr) {
            console.error(`Erro ao verificar rentabilidade para o ticker ${ticker}:`, verificarErr.message);
            return;
          }

          if (row.count === 0) {
            const inserirSql = `
              INSERT INTO rentabilidade (user_id, ticker, valor_inicial, valor_atual, rentabilidade)
              VALUES (?, ?, ?, ?, ((? - ?) / ?) * 100)
            `;
            db.run(inserirSql, [userId, ticker, valorInicial, valorAtual, valorAtual, valorInicial, valorInicial], (inserirErr) => {
              if (inserirErr) {
                console.error(`Erro ao inserir rentabilidade para o ticker ${ticker}:`, inserirErr.message);
              }
            });
          } else {
            const atualizarSql = `
              UPDATE rentabilidade
              SET valor_atual = ?, rentabilidade = ((? - valor_inicial) / valor_inicial) * 100
              WHERE user_id = ? AND ticker = ?
            `;
            db.run(atualizarSql, [valorAtual, valorAtual, userId, ticker], (atualizarErr) => {
              if (atualizarErr) {
                console.error(`Erro ao atualizar rentabilidade para o ticker ${ticker}:`, atualizarErr.message);
              }
            });
          }
        });
      });

      res.status(200).json({ message: 'Preços sincronizados e rentabilidade atualizada.' });
    } catch (error) {
      console.error('Erro ao sincronizar preços:', error.message);
      res.status(500).json({ message: 'Erro ao sincronizar preços.' });
    }
  });
});

  
cron.schedule('0 * * * *', async () => {
  console.log('Atualizando preços e rentabilidade automaticamente...');
  const buscarUsuariosSql = `SELECT DISTINCT user_id FROM rentabilidade`;

  db.all(buscarUsuariosSql, (err, usuarios) => {
    if (err) {
      console.error('Erro ao buscar usuários para atualização:', err.message);
      return;
    }

    usuarios.forEach(({ user_id }) => {
      axios.post('http://192.168.0.178:1234/sincronizar-precos', { userId: user_id }).catch((err) => {
        console.error(`Erro ao atualizar preços para userId ${user_id}:`, err.message);
      });
    });
  });
});