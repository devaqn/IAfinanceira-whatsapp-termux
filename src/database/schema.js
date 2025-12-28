const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DatabaseSchema {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../database/finance.db');
    this.db = null;
  }

  async init() {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    
    return this.db;
  }

  initialize() {
    console.log('🗄️  Inicializando banco de dados...');

    // Tabela de usuários (estrutura básica)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        whatsapp_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        initial_balance REAL DEFAULT 0.0,
        current_balance REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de categorias
    this.db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        emoji TEXT DEFAULT '📌',
        keywords TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de despesas (estrutura básica)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        chat_id TEXT NOT NULL,
        message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      )
    `);

    // Tabela de grupos
    this.db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE NOT NULL,
        name TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices básicos
    try {
      this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_users_whatsapp_id ON users(whatsapp_id)');
    } catch (e) {
      // Índices já existem, tudo bem
    }

    console.log('✅ Estrutura básica criada!');
    
    // MIGRAR antes de inserir categorias
    this.migrateDatabase();
    
    // Inserir categorias DEPOIS da migração
    this.insertDefaultCategories();
    
    this.save();
    console.log('✅ Banco de dados pronto!\n');
  }

  migrateDatabase() {
    try {
      console.log('🔄 Verificando migração...');
      
      // === MIGRAÇÃO: USERS ===
      const userColumns = this.db.exec("PRAGMA table_info(users)");
      if (userColumns[0]) {
        const columnNames = userColumns[0].values.map(row => row[1]);
        
        if (!columnNames.includes('savings_balance')) {
          console.log('   → Adicionando savings_balance');
          this.db.run('ALTER TABLE users ADD COLUMN savings_balance REAL DEFAULT 0.0');
        }
        
        if (!columnNames.includes('emergency_fund')) {
          console.log('   → Adicionando emergency_fund');
          this.db.run('ALTER TABLE users ADD COLUMN emergency_fund REAL DEFAULT 0.0');
        }
        
        if (!columnNames.includes('low_balance_warned')) {
          console.log('   → Adicionando low_balance_warned');
          this.db.run('ALTER TABLE users ADD COLUMN low_balance_warned INTEGER DEFAULT 0');
        }
      }

      // === MIGRAÇÃO: EXPENSES ===
      const expenseColumns = this.db.exec("PRAGMA table_info(expenses)");
      if (expenseColumns[0]) {
        const columnNames = expenseColumns[0].values.map(row => row[1]);
        
        if (!columnNames.includes('transaction_type')) {
          console.log('   → Adicionando transaction_type');
          this.db.run("ALTER TABLE expenses ADD COLUMN transaction_type TEXT DEFAULT 'expense'");
          
          // Criar índice DEPOIS de adicionar a coluna
          try {
            this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(transaction_type)');
            console.log('   → Índice criado');
          } catch (e) {
            // Índice já existe
          }
        }
      }

      console.log('✅ Migração concluída!');
      this.save();
    } catch (error) {
      console.log('⚠️  Aviso: ' + error.message);
    }
  }

  insertDefaultCategories() {
    try {
      // Verificar se já existem categorias
      const check = this.db.exec('SELECT COUNT(*) as count FROM categories');
      const count = check[0] ? check[0].values[0][0] : 0;
      
      if (count > 0) {
        console.log('✅ Categorias já existem (' + count + ')');
        return;
      }

      // Categorias MELHORADAS
      const categories = [
        { 
          name: 'Alimentação', 
          emoji: '🍔', 
          keywords: 'comida,almoço,almoco,jantar,café,cafe,lanche,restaurante,delivery,ifood,rappi,pizza,hamburger,hamburguer,sorvete,açai,acai,pastel,coxinha,salgado,bebida,cerveja,refri,refrigerante,suco,padaria,pão,pao,bolo,doce,chocolate,mcdonalds,burger king,subway,kfc,starbucks,outback'
        },
        { 
          name: 'Transporte', 
          emoji: '🚗', 
          keywords: 'uber,99,taxi,ônibus,onibus,metrô,metro,trem,gasolina,combustível,combustivel,etanol,diesel,passagem,estacionamento,pedágio,pedagio,aplicativo,corrida,viagem,carro,moto,bicicleta,patinete,mobilidade,frete,entrega'
        },
        { 
          name: 'Mercado', 
          emoji: '🛒', 
          keywords: 'mercado,supermercado,feira,compras,açougue,acougue,padaria,hortifruti,verduras,frutas,legumes,carrefour,extra,pão de açucar,atacadão,atacadao,walmart,makro,assaí,assai,cesta básica,basica'
        },
        { 
          name: 'Lazer', 
          emoji: '🎮', 
          keywords: 'cinema,teatro,show,festa,balada,jogo,games,diversão,diversao,parque,viagem,passeio,netflix,streaming,spotify,amazon prime,disney,hbo,ingresso,concerto,museu,zoo,praia,piscina,clube,entretenimento'
        },
        { 
          name: 'Contas', 
          emoji: '💳', 
          keywords: 'conta,luz,energia elétrica,eletrica,água,agua,saneamento,internet,telefone,celular,aluguel,condomínio,condominio,cartão,cartao,fatura,boleto,pagamento,financiamento,prestação,prestacao,iptu,ipva,seguro,taxa,tarifa,mensalidade'
        },
        { 
          name: 'Saúde', 
          emoji: '💊', 
          keywords: 'médico,medico,remédio,remedio,farmácia,farmacia,consulta,exame,hospital,clínica,clinica,dentista,odonto,plano de saúde,saude,medicamento,drogaria,droga raia,drogasil,pague menos,ultrafarma,panvel,laboratório,laboratorio,fisioterapia,terapia,psicólogo,psicologo'
        },
        { 
          name: 'Educação', 
          emoji: '📚', 
          keywords: 'curso,faculdade,universidade,escola,colégio,colegio,livro,material escolar,mensalidade,matrícula,matricula,apostila,aula,professor,educação,educacao,estudo,formação,formacao,treinamento,workshop,seminário,seminario,udemy,coursera,alura'
        },
        { 
          name: 'Vestuário', 
          emoji: '👕', 
          keywords: 'roupa,calça,calca,camisa,blusa,camiseta,sapato,tênis,tenis,sandália,sandalia,chinelo,moda,loja de roupa,shopping,calçado,calcado,vestido,saia,bermuda,shorts,jaqueta,casaco,boné,bone,acessório,acessorio,bolsa,mochila,carteira,renner,c&a,riachuelo,marisa,hering,zara,adidas,nike'
        },
        { 
          name: 'Poupança', 
          emoji: '🐷', 
          keywords: 'poupança,poupanca,guardado,economia,reserva,investimento,aplicação,aplicacao'
        },
        { 
          name: 'Emergência', 
          emoji: '🚨', 
          keywords: 'emergência,emergencia,urgência,urgencia,imprevisto'
        },
        { 
          name: 'Outros', 
          emoji: '📦', 
          keywords: 'outro,diversos,variados,geral,vários,varios,demais'
        }
      ];

      const stmt = this.db.prepare('INSERT OR IGNORE INTO categories (name, emoji, keywords) VALUES (?, ?, ?)');
      let inserted = 0;
      
      for (const cat of categories) {
        stmt.run([cat.name, cat.emoji, cat.keywords]);
        inserted++;
      }
      stmt.free();
      
      console.log('✅ ' + inserted + ' categorias inseridas!');
      this.save();
    } catch (error) {
      console.log('⚠️  Erro ao inserir categorias: ' + error.message);
    }
  }

  save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('Erro ao salvar banco:', error.message);
    }
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }

  getDatabase() {
    return this.db;
  }
}

module.exports = DatabaseSchema;