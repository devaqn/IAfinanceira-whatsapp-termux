const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DAO {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../database/finance.db');
    this.db = null;
    this.hasTransactionType = false;
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

  setDatabase(db) {
    this.db = db;
    
    // Verificar se coluna transaction_type existe
    try {
      const columns = this.db.exec("PRAGMA table_info(expenses)");
      if (columns[0]) {
        const columnNames = columns[0].values.map(row => row[1]);
        this.hasTransactionType = columnNames.includes('transaction_type');
      }
    } catch (e) {
      this.hasTransactionType = false;
    }
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ============ USUÁRIOS ============
  
  upsertUser(whatsappId, name) {
    this.db.run(
      'INSERT INTO users (whatsapp_id, name) VALUES (?, ?) ON CONFLICT(whatsapp_id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP',
      [whatsappId, name]
    );
    this.save();
    
    const result = this.db.exec('SELECT * FROM users WHERE whatsapp_id = ?', [whatsappId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getUserByWhatsAppId(whatsappId) {
    const result = this.db.exec('SELECT * FROM users WHERE whatsapp_id = ?', [whatsappId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getUserById(userId) {
    const result = this.db.exec('SELECT * FROM users WHERE id = ?', [userId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  // ============ SALDO PRINCIPAL ============
  
  setInitialBalance(whatsappId, amount) {
    this.db.run(
      'UPDATE users SET initial_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_id = ?',
      [amount, amount, whatsappId]
    );
    this.save();
  }

  addBalance(whatsappId, amount) {
    const user = this.getUserByWhatsAppId(whatsappId);
    if (!user) return false;
    
    const newInitial = parseFloat((user.initial_balance + amount).toFixed(2));
    const newCurrent = parseFloat((user.current_balance + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET initial_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_id = ?',
      [newInitial, newCurrent, whatsappId]
    );
    this.save();
    return true;
  }

  updateBalance(userId, newBalance) {
    const balance = parseFloat(newBalance.toFixed(2));
    this.db.run(
      'UPDATE users SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [balance, userId]
    );
    this.save();
  }

  // ============ POUPANÇA ============
  
  addToSavings(userId, amount, description = 'Transferência para poupança') {
    const user = this.getUserById(userId);
    if (!user || user.current_balance < amount) return false;
    
    const newCurrent = parseFloat((user.current_balance - amount).toFixed(2));
    const newSavings = parseFloat(((user.savings_balance || 0) + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET current_balance = ?, savings_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newCurrent, newSavings, userId]
    );
    
    // Registrar transação
    const categoryId = this.getCategoryByName('Poupança').id;
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'savings_deposit',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  withdrawFromSavings(userId, amount, description = 'Retirada da poupança') {
    const user = this.getUserById(userId);
    const savingsBalance = user.savings_balance || 0;
    if (!user || savingsBalance < amount) return false;
    
    const newSavings = parseFloat((savingsBalance - amount).toFixed(2));
    const newCurrent = parseFloat((user.current_balance + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET savings_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newSavings, newCurrent, userId]
    );
    
    const categoryId = this.getCategoryByName('Poupança').id;
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'savings_withdrawal',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  // ============ RESERVA DE EMERGÊNCIA ============
  
  addToEmergencyFund(userId, amount, description = 'Depósito na reserva de emergência') {
    const user = this.getUserById(userId);
    if (!user || user.current_balance < amount) return false;
    
    const newCurrent = parseFloat((user.current_balance - amount).toFixed(2));
    const newEmergency = parseFloat(((user.emergency_fund || 0) + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET current_balance = ?, emergency_fund = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newCurrent, newEmergency, userId]
    );
    
    const categoryId = this.getCategoryByName('Emergência').id;
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'emergency_deposit',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  withdrawFromEmergencyFund(userId, amount, description = 'Retirada da reserva de emergência') {
    const user = this.getUserById(userId);
    const emergencyFund = user.emergency_fund || 0;
    if (!user || emergencyFund < amount) return false;
    
    const newEmergency = parseFloat((emergencyFund - amount).toFixed(2));
    const newCurrent = parseFloat((user.current_balance + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET emergency_fund = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newEmergency, newCurrent, userId]
    );
    
    const categoryId = this.getCategoryByName('Emergência').id;
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'emergency_withdrawal',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  // ============ CATEGORIAS ============
  
  getCategories() {
    const result = this.db.exec('SELECT * FROM categories ORDER BY name');
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getCategoryById(id) {
    const result = this.db.exec('SELECT * FROM categories WHERE id = ?', [id]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getCategoryByName(name) {
    const result = this.db.exec('SELECT * FROM categories WHERE name = ?', [name]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  identifyCategory(text) {
    const categories = this.getCategories();
    const textLower = text.toLowerCase().trim();
    
    const matches = [];
    
    for (const category of categories) {
      if (category.name === 'Outros' || category.name === 'Poupança' || category.name === 'Emergência') {
        continue;
      }
      
      const keywords = category.keywords.split(',');
      let score = 0;
      let matchedKeyword = '';
      
      for (const keyword of keywords) {
        const cleanKeyword = keyword.trim().toLowerCase();
        
        if (textLower === cleanKeyword) {
          score += 100;
          matchedKeyword = cleanKeyword;
          break;
        }
        
        const wordBoundaryRegex = new RegExp('\\b' + cleanKeyword + '\\b', 'i');
        if (wordBoundaryRegex.test(textLower)) {
          score += 50;
          matchedKeyword = cleanKeyword;
        }
        else if (textLower.includes(cleanKeyword)) {
          score += 10;
          matchedKeyword = cleanKeyword;
        }
      }
      
      if (score > 0) {
        matches.push({ category, score, matchedKeyword });
      }
    }
    
    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      return matches[0].category.id;
    }
    
    const othersCategory = categories.find(c => c.name === 'Outros');
    return othersCategory ? othersCategory.id : categories[categories.length - 1].id;
  }

  // ============ TRANSAÇÕES ============
  
  createTransaction(transaction) {
    const { userId, amount, description, categoryId, transactionType, chatId, messageId } = transaction;
    const type = transactionType || 'expense';
    
    // Se coluna transaction_type não existe, usar query antiga
    if (!this.hasTransactionType) {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, chatId, messageId]
      );
    } else {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, transaction_type, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, type, chatId, messageId]
      );
    }
    
    const expenseResult = this.db.exec('SELECT * FROM expenses WHERE rowid = last_insert_rowid()');
    const savedExpense = expenseResult[0] ? this.rowToObject(expenseResult[0]) : null;
    
    this.save();
    return savedExpense;
  }

  createExpense(expense) {
    const { userId, amount, description, categoryId, chatId, messageId } = expense;
    
    // Se coluna transaction_type não existe, usar query antiga
    if (!this.hasTransactionType) {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, chatId, messageId]
      );
    } else {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, transaction_type, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, 'expense', chatId, messageId]
      );
    }
    
    const expenseResult = this.db.exec('SELECT * FROM expenses WHERE rowid = last_insert_rowid()');
    const savedExpense = expenseResult[0] ? this.rowToObject(expenseResult[0]) : null;
    
    const userResult = this.db.exec('SELECT current_balance FROM users WHERE id = ?', [userId]);
    if (userResult[0]) {
      const user = this.rowToObject(userResult[0]);
      const newBalance = parseFloat((user.current_balance - amount).toFixed(2));
      this.updateBalance(userId, newBalance);
    }
    
    this.save();
    return savedExpense;
  }

  getExpensesByUser(userId, filters = {}) {
    let query = `
      SELECT 
        e.*,
        c.name as category_name,
        c.emoji as category_emoji
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
    `;
    
    const params = [userId];
    
    if (filters.startDate) {
      query += ' AND e.date >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND e.date <= ?';
      params.push(filters.endDate);
    }
    
    if (filters.categoryId) {
      query += ' AND e.category_id = ?';
      params.push(filters.categoryId);
    }
    
    // Só filtrar por transaction_type se a coluna existir
    if (filters.transactionType && this.hasTransactionType) {
      query += ' AND e.transaction_type = ?';
      params.push(filters.transactionType);
    }
    
    query += ' ORDER BY e.date DESC';
    
    const result = this.db.exec(query, params);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getExpensesByCategory(userId, startDate, endDate) {
    let query = `
      SELECT 
        c.name as category,
        c.emoji,
        COUNT(e.id) as count,
        SUM(e.amount) as total
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
        AND e.date >= ?
        AND e.date <= ?
    `;
    
    // Só filtrar por transaction_type se a coluna existir
    if (this.hasTransactionType) {
      query += " AND e.transaction_type = 'expense'";
    }
    
    query += `
      GROUP BY c.id, c.name, c.emoji
      ORDER BY total DESC
    `;
    
    const result = this.db.exec(query, [userId, startDate, endDate]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getUserStats(userId) {
    let query = `
      SELECT 
        COUNT(*) as total_expenses,
        SUM(amount) as total_spent,
        AVG(amount) as avg_expense,
        MAX(amount) as max_expense,
        MIN(amount) as min_expense
      FROM expenses
      WHERE user_id = ?
    `;
    
    // Só filtrar por transaction_type se a coluna existir
    if (this.hasTransactionType) {
      query += " AND transaction_type = 'expense'";
    }
    
    const result = this.db.exec(query, [userId]);
    return result[0] ? this.rowToObject(result[0]) : { 
      total_expenses: 0, 
      total_spent: 0, 
      avg_expense: 0, 
      max_expense: 0, 
      min_expense: 0 
    };
  }

  // ============ GRUPOS ============
  
  upsertGroup(chatId, name) {
    this.db.run(
      'INSERT INTO groups (chat_id, name) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name, active = 1',
      [chatId, name]
    );
    this.save();
  }

  // ============ AVISO DE SALDO BAIXO ============
  
  setLowBalanceWarned(userId, warned) {
    try {
      this.db.run(
        'UPDATE users SET low_balance_warned = ? WHERE id = ?',
        [warned ? 1 : 0, userId]
      );
      this.save();
    } catch (e) {
      // Coluna não existe ainda, tudo bem
    }
  }

  // ============ UTILITÁRIOS ============
  
  rowToObject(result) {
    const obj = {};
    for (let i = 0; i < result.columns.length; i++) {
      obj[result.columns[i]] = result.values[0][i];
    }
    return obj;
  }

  rowsToObjects(result) {
    const objects = [];
    for (let i = 0; i < result.values.length; i++) {
      const obj = {};
      for (let j = 0; j < result.columns.length; j++) {
        obj[result.columns[j]] = result.values[i][j];
      }
      objects.push(obj);
    }
    return objects;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = DAO;