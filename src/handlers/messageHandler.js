const NLPProcessor = require('../services/nlp');
const ReportGenerator = require('../services/reports');

class MessageHandler {
  constructor(dao, whatsappService) {
    this.dao = dao;
    this.whatsapp = whatsappService;
    this.nlp = new NLPProcessor();
    this.reports = new ReportGenerator(dao);
    this.recentlyProcessed = {};
  }

  async process(message) {
    try {
      if (this.whatsapp.isFromMe(message)) {
        return;
      }

      const text = this.whatsapp.getMessageText(message);
      if (!text || text.trim() === '') return;

      const info = this.whatsapp.getSenderInfo(message);
      const sender = info.sender;
      const chatId = info.chatId;
      const isGroup = info.isGroup;
      const messageId = info.messageId;

      const messageKey = sender + '-' + messageId;
      if (this.recentlyProcessed[messageKey]) {
        return;
      }
      this.recentlyProcessed[messageKey] = true;
      
      const self = this;
      setTimeout(function() {
        delete self.recentlyProcessed[messageKey];
      }, 30000);

      await this.whatsapp.markAsRead(chatId, messageId);
      await this.whatsapp.sendPresence(chatId, 'composing');

      let user = this.dao.getUserByWhatsAppId(sender);
      if (!user) {
        const name = message.pushName || sender.split('@')[0];
        user = this.dao.upsertUser(sender, name);
        console.log('👤 Novo usuário: ' + name + ' (' + sender + ')');
        
        await this.whatsapp.replyMessage(message, this.reports.generateWelcomeMessage(name));
        await this.whatsapp.sendPresence(chatId, 'available');
        return;
      }

      if (isGroup) {
        const groupName = chatId.split('@')[0];
        this.dao.upsertGroup(chatId, groupName);
      }

      const processed = this.nlp.processMessage(text);

      if (processed.type === 'command') {
        await this.handleCommand(processed, user, message);
      } else if (processed.type === 'expense') {
        await this.handleExpense(processed, user, message);
      } else if (processed.type === 'installment') {
        await this.handleInstallment(processed, user, message);
      }

      await this.whatsapp.sendPresence(chatId, 'available');

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  }

  async handleCommand(command, user, message) {
    let response = '';

    // ============ SALDO PRINCIPAL ============
    
    if (command.command === 'setBalance') {
      if (command.amount && command.amount > 0) {
        this.dao.setInitialBalance(user.whatsapp_id, command.amount);
        
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        
        // 🔧 CORRIGIDO: Confirmação com data/hora
        response = '✅ *SALDO DEFINIDO COM SUCESSO*\n\n' +
          '💰 *Valor:* ' + this.reports.formatMoney(command.amount) + '\n' +
          '🕒 *Data/Hora:* ' + this.reports.formatDate(new Date()) + '\n\n' +
          'Agora você pode registrar seus gastos!\n' +
          'Use `/ajuda` para ver todos os comandos.';
        console.log('💰 ' + user.name + ': saldo inicial ' + command.amount);
      } else {
        response = '❌ Valor inválido!\n\nUse: `/saldo 1000`';
      }
    }
    
    else if (command.command === 'addBalance') {
      if (command.amount && command.amount > 0) {
        const success = this.dao.addBalance(user.whatsapp_id, command.amount);
        
        if (success) {
          const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
          // Resetar aviso de saldo baixo quando adicionar dinheiro
          this.dao.setLowBalanceWarned(updatedUser.id, false);
          
          // 🔧 CORRIGIDO: Confirmação com data/hora
          response = '✅ *SALDO ADICIONADO COM SUCESSO*\n\n' +
            '💵 *Valor adicionado:* ' + this.reports.formatMoney(command.amount) + '\n' +
            '🕒 *Data/Hora:* ' + this.reports.formatDate(new Date()) + '\n\n' +
            '💰 *NOVO SALDO*\n' +
            '   Principal: *' + this.reports.formatMoney(updatedUser.current_balance) + '*\n';
          
          if (updatedUser.savings_balance > 0) {
            response += '   Poupança: ' + this.reports.formatMoney(updatedUser.savings_balance) + '\n';
          }
          if (updatedUser.emergency_fund > 0) {
            response += '   Emergência: ' + this.reports.formatMoney(updatedUser.emergency_fund) + '\n';
          }
          
          const total = updatedUser.current_balance + updatedUser.savings_balance + updatedUser.emergency_fund;
          response += '   Total: ' + this.reports.formatMoney(total);
          
          console.log('💰 ' + user.name + ': adicionou ' + command.amount);
        } else {
          response = '❌ Erro ao adicionar saldo. Tente novamente.';
        }
      } else {
        response = '❌ Valor inválido!\n\nUse: `/adicionar 500`';
      }
    }
    
    else if (command.command === 'getBalance') {
      const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
      response = this.reports.generateBalanceReport(updatedUser);
    }
    
    // ============ POUPANÇA ============
    
    else if (command.command === 'getSavings') {
      const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
      response = '🐷 *POUPANÇA*\n\n' +
        '💵 Saldo guardado: *' + this.reports.formatMoney(updatedUser.savings_balance) + '*\n\n' +
        'Use `/guardar 100` para guardar dinheiro\n' +
        'Use `/retirar 50` para retirar';
    }
    
    else if (command.command === 'depositSavings') {
      if (command.amount && command.amount > 0) {
        const success = this.dao.addToSavings(user.id, command.amount);
        
        if (success) {
          const updatedUser = this.dao.getUserById(user.id);
          response = this.reports.generateSavingsConfirmation('deposit', command.amount, updatedUser);
          console.log('🐷 ' + user.name + ': guardou ' + command.amount);
        } else {
          response = '❌ Saldo insuficiente!\n\nVocê tem: ' + this.reports.formatMoney(user.current_balance);
        }
      } else {
        response = '❌ Valor inválido!\n\nUse: `/guardar 100`';
      }
    }
    
    else if (command.command === 'withdrawSavings') {
      if (command.amount && command.amount > 0) {
        const success = this.dao.withdrawFromSavings(user.id, command.amount);
        
        if (success) {
          const updatedUser = this.dao.getUserById(user.id);
          response = this.reports.generateSavingsConfirmation('withdraw', command.amount, updatedUser);
          console.log('🐷 ' + user.name + ': retirou ' + command.amount);
        } else {
          response = '❌ Poupança insuficiente!\n\nVocê tem: ' + this.reports.formatMoney(user.savings_balance);
        }
      } else {
        response = '❌ Valor inválido!\n\nUse: `/retirar 50`';
      }
    }
    
    // ============ RESERVA DE EMERGÊNCIA ============
    
    else if (command.command === 'getEmergency') {
      const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
      response = '🚨 *RESERVA DE EMERGÊNCIA*\n\n' +
        '💵 Saldo reservado: *' + this.reports.formatMoney(updatedUser.emergency_fund) + '*\n\n' +
        'Use `/reservar 200` para adicionar\n' +
        'Use `/usar 100` para utilizar';
    }
    
    else if (command.command === 'depositEmergency') {
      if (command.amount && command.amount > 0) {
        const success = this.dao.addToEmergencyFund(user.id, command.amount);
        
        if (success) {
          const updatedUser = this.dao.getUserById(user.id);
          response = this.reports.generateEmergencyConfirmation('deposit', command.amount, updatedUser);
          console.log('🚨 ' + user.name + ': reservou ' + command.amount);
        } else {
          response = '❌ Saldo insuficiente!\n\nVocê tem: ' + this.reports.formatMoney(user.current_balance);
        }
      } else {
        response = '❌ Valor inválido!\n\nUse: `/reservar 200`';
      }
    }
    
    else if (command.command === 'withdrawEmergency') {
      if (command.amount && command.amount > 0) {
        const success = this.dao.withdrawFromEmergencyFund(user.id, command.amount);
        
        if (success) {
          const updatedUser = this.dao.getUserById(user.id);
          response = this.reports.generateEmergencyConfirmation('withdraw', command.amount, updatedUser);
          console.log('🚨 ' + user.name + ': usou reserva ' + command.amount);
        } else {
          response = '❌ Reserva insuficiente!\n\nVocê tem: ' + this.reports.formatMoney(user.emergency_fund);
        }
      } else {
        response = '❌ Valor inválido!\n\nUse: `/usar 100`';
      }
    }
    
    // ============ RELATÓRIOS ============
    
    else if (command.command === 'reportDaily') {
      response = this.reports.generateDailyReport(user.id);
    }
    
    else if (command.command === 'reportWeekly') {
      response = this.reports.generateWeeklyReport(user.id);
    }
    
    else if (command.command === 'reportMonthly') {
      response = this.reports.generateMonthlyReport(user.id);
    }
    
    // ============ 🆕 PARCELAMENTOS ============
    
    else if (command.command === 'getInstallments') {
      response = this.reports.generateInstallmentsList(user.id);
    }
    
    else if (command.command === 'payInstallment') {
      if (!command.description) {
        response = '❌ Especifique qual parcela pagar!\n\nUse: `/pagar celular`';
      } else {
        const installment = this.dao.findInstallmentByDescription(user.id, command.description);
        
        if (!installment) {
          response = '❌ Parcelamento não encontrado!\n\nUse `/parcelamentos` para ver suas compras.';
        } else {
          const nextPayment = this.dao.getNextPendingPayment(installment.id);
          
          if (!nextPayment) {
            response = '✅ Este parcelamento já foi totalmente pago!';
          } else {
            const success = this.dao.payInstallment(nextPayment.id, user.id);
            
            if (success) {
              const updatedUser = this.dao.getUserById(user.id);
              const updatedPayment = this.dao.getInstallmentPayments(installment.id)
                .find(p => p.id === nextPayment.id);
              
              response = this.reports.generatePaymentConfirmation(installment, updatedPayment, updatedUser);
              console.log('💳 ' + user.name + ': pagou parcela ' + nextPayment.installment_number + '/' + installment.total_installments);
            } else {
              response = '❌ Saldo insuficiente!\n\nParcela: ' + this.reports.formatMoney(nextPayment.amount) + '\nVocê tem: ' + this.reports.formatMoney(user.current_balance);
            }
          }
        }
      }
    }
    
    // ============ 🆕 LEMBRETES ============
    
    else if (command.command === 'getReminders' || command.command === 'getDuePayments') {
      response = this.reports.generateRemindersList(user.id);
    }
    
    // ============ OUTROS ============
    
    else if (command.command === 'help') {
      response = this.reports.generateHelpMessage();
    }
    
    else if (command.command === 'start') {
      response = this.reports.generateWelcomeMessage(user.name);
    }
    
    else {
      response = '❓ Comando não reconhecido.\n\nUse `/ajuda` para ver os comandos disponíveis.';
    }

    if (response) {
      await this.whatsapp.replyMessage(message, response);
    }
  }

  async handleExpense(expense, user, message) {
    const info = this.whatsapp.getSenderInfo(message);
    const chatId = info.chatId;

    if (!this.nlp.isValidAmount(expense.amount)) {
      await this.whatsapp.replyMessage(message, '❌ Valor inválido!\n\nDeve estar entre R$ 0,01 e R$ 1.000.000,00');
      return;
    }

    if (user.initial_balance === 0) {
      await this.whatsapp.replyMessage(message, '⚠️ Defina seu saldo inicial primeiro!\n\nUse: `/saldo 1000`');
      return;
    }

    try {
      const categoryId = this.dao.identifyCategory(expense.description);
      const category = this.dao.getCategoryById(categoryId);

      const savedExpense = this.dao.createExpense({
        userId: user.id,
        amount: expense.amount,
        description: expense.description,
        categoryId: categoryId,
        chatId: chatId,
        messageId: info.messageId
      });

      const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);

      const confirmation = this.reports.generateExpenseConfirmation(savedExpense, updatedUser, category);

      await this.whatsapp.replyMessage(message, confirmation);

      console.log('💸 ' + user.name + ': ' + this.reports.formatMoney(expense.amount) + ' - ' + expense.description + ' (' + category.name + ')');

      // 🔧 CORRIGIDO: Aviso de saldo baixo em 30% - APENAS UMA VEZ
      const totalMoney = updatedUser.current_balance + updatedUser.savings_balance + updatedUser.emergency_fund;
      const percentageRemaining = updatedUser.initial_balance > 0 
        ? (totalMoney / updatedUser.initial_balance) * 100 
        : 100;

      if (updatedUser.current_balance < 0) {
        await this.whatsapp.sendMessage(chatId, '🚨 *ATENÇÃO!*\n\nSeu saldo está negativo!\nVocê está gastando mais do que tem.');
      } 
      else if (percentageRemaining <= 30 && !updatedUser.low_balance_warned) {
        // 🔧 CORRIGIDO: Avisar apenas uma vez quando atingir 30%
        this.dao.setLowBalanceWarned(updatedUser.id, true);
        await this.whatsapp.sendMessage(chatId, 
          '⚠️ *AVISO DE SALDO BAIXO*\n\n' +
          'Você já gastou 70% do seu dinheiro!\n' +
          'Restam apenas ' + percentageRemaining.toFixed(0) + '% do total.\n\n' +
          '💡 *Dica:* Considere reduzir gastos ou adicionar mais saldo.'
        );
      }

    } catch (error) {
      console.error('❌ Erro ao registrar gasto:', error);
      await this.whatsapp.replyMessage(message, '❌ Erro ao registrar gasto.\n\nTente novamente ou use `/ajuda`.');
    }
  }

  async handleInstallment(installment, user, message) {
    const info = this.whatsapp.getSenderInfo(message);
    const chatId = info.chatId;

    if (!this.nlp.isValidAmount(installment.totalAmount)) {
      await this.whatsapp.replyMessage(message, '❌ Valor inválido!');
      return;
    }

    if (user.initial_balance === 0) {
      await this.whatsapp.replyMessage(message, '⚠️ Defina seu saldo inicial primeiro!\n\nUse: `/saldo 1000`');
      return;
    }

    try {
      const categoryId = this.dao.identifyCategory(installment.description);
      const category = this.dao.getCategoryById(categoryId);

      // 🆕 Calcular primeira data de vencimento (próximo mês, dia 5)
      const firstDueDate = new Date();
      firstDueDate.setMonth(firstDueDate.getMonth() + 1);
      firstDueDate.setDate(5);

      const savedInstallment = this.dao.createInstallment({
        userId: user.id,
        description: installment.description,
        totalAmount: installment.totalAmount,
        installmentAmount: installment.installmentAmount,
        totalInstallments: installment.installments,
        categoryId: categoryId,
        chatId: chatId,
        firstDueDate: firstDueDate // 🆕 Adicionar data
      });

      const confirmation = this.reports.generateInstallmentConfirmation(savedInstallment, category);
      await this.whatsapp.replyMessage(message, confirmation);

      console.log('📦 ' + user.name + ': parcelou ' + this.reports.formatMoney(installment.totalAmount) + ' em ' + installment.installments + 'x - ' + installment.description);

    } catch (error) {
      console.error('❌ Erro ao registrar parcelamento:', error);
      await this.whatsapp.replyMessage(message, '❌ Erro ao registrar parcelamento.\n\nTente novamente ou use `/ajuda`.');
    }
  }
}

module.exports = MessageHandler;