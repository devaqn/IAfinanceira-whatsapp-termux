class ReportGenerator {
  constructor(dao) {
    this.dao = dao;
  }

  // ============ FORMATAÇÃO ============
  
  formatMoney(value) {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  // 🔧 CORRIGIDO: Data no fuso horário do Brasil
  getBrazilDate(date) {
    const d = date ? new Date(date) : new Date();
    // Offset UTC-3 (Brasília)
    const brazilOffset = -3 * 60;
    const localOffset = d.getTimezoneOffset();
    const diff = brazilOffset - localOffset;
    return new Date(d.getTime() + diff * 60000);
  }

  formatDate(date) {
    const d = this.getBrazilDate(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return day + '/' + month + '/' + year + ' às ' + hour + ':' + minute;
  }

  formatDateShort(date) {
    const d = this.getBrazilDate(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return day + '/' + month + '/' + year;
  }

  // ============ RELATÓRIO DE SALDO ============
  
  generateBalanceReport(user) {
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;
    const percentage = user.initial_balance > 0 
      ? ((user.current_balance / user.initial_balance) * 100).toFixed(1)
      : 0;

    const spent = user.initial_balance - user.current_balance;
    
    let emoji = '💰';
    if (percentage < 20) emoji = '🚨';
    else if (percentage < 50) emoji = '⚠️';

    let report = '━━━━━━━━━━━━━━━━━━━━━\n';
    report += emoji + ' *RESUMO FINANCEIRO*\n';
    report += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    report += '👤 *Usuário:* ' + user.name + '\n';
    report += '📅 *Data:* ' + this.formatDateShort(new Date()) + '\n\n';
    
    report += '💵 *SALDO PRINCIPAL*\n';
    report += '   Inicial: ' + this.formatMoney(user.initial_balance) + '\n';
    report += '   Gasto: ' + this.formatMoney(spent) + '\n';
    report += '   Disponível: *' + this.formatMoney(user.current_balance) + '*\n';
    report += '   └─ ' + percentage + '% restante\n\n';
    
    if (user.savings_balance > 0) {
      report += '🐷 *POUPANÇA*\n';
      report += '   Guardado: *' + this.formatMoney(user.savings_balance) + '*\n\n';
    }
    
    if (user.emergency_fund > 0) {
      report += '🚨 *RESERVA DE EMERGÊNCIA*\n';
      report += '   Reservado: *' + this.formatMoney(user.emergency_fund) + '*\n\n';
    }
    
    report += '💎 *PATRIMÔNIO TOTAL*\n';
    report += '   *' + this.formatMoney(totalMoney) + '*\n\n';
    
    report += '━━━━━━━━━━━━━━━━━━━━━\n';
    report += '_Atualizado em ' + this.formatDate(new Date()) + '_';

    return report;
  }

  // ============ RELATÓRIO DIÁRIO ============
  
  generateDailyReport(userId) {
    const user = this.dao.getUserById(userId);
    
    // 🔧 CORRIGIDO: Usar data do Brasil
    const today = this.getBrazilDate(new Date());
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: today.toISOString(),
      endDate: tomorrow.toISOString(),
      transactionType: 'expense'
    });

    let totalExpenses = 0;
    for (let i = 0; i < expenses.length; i++) {
      totalExpenses += expenses[i].amount;
    }
    
    const byCategory = this.dao.getExpensesByCategory(userId, today.toISOString(), tomorrow.toISOString());
    
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;

    let report = '━━━━━━━━━━━━━━━━━━━━━\n';
    report += '📅 *RELATÓRIO DIÁRIO*\n';
    report += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    report += '👤 *Usuário:* ' + user.name + '\n';
    report += '📆 *Data:* ' + this.formatDateShort(today) + '\n\n';
    
    report += '💸 *MOVIMENTAÇÃO HOJE*\n';
    report += '   Gastos: ' + this.formatMoney(totalExpenses) + '\n';
    report += '   Transações: ' + expenses.length + '\n\n';
    
    report += '💰 *SITUAÇÃO ATUAL*\n';
    report += '   Saldo: ' + this.formatMoney(user.current_balance) + '\n';
    if (user.savings_balance > 0) {
      report += '   Poupança: ' + this.formatMoney(user.savings_balance) + '\n';
    }
    if (user.emergency_fund > 0) {
      report += '   Emergência: ' + this.formatMoney(user.emergency_fund) + '\n';
    }
    report += '   *Total: ' + this.formatMoney(totalMoney) + '*\n\n';

    if (byCategory.length > 0) {
      report += '🏷️ *GASTOS POR CATEGORIA*\n';
      for (let i = 0; i < Math.min(byCategory.length, 5); i++) {
        const cat = byCategory[i];
        const percent = ((cat.total / totalExpenses) * 100).toFixed(0);
        report += '   ' + cat.emoji + ' ' + cat.category + ': ' + this.formatMoney(cat.total) + ' (' + percent + '%)\n';
      }
      report += '\n';
    }

    if (expenses.length > 0) {
      report += '📋 *ÚLTIMOS GASTOS*\n';
      const limit = Math.min(expenses.length, 5);
      for (let i = 0; i < limit; i++) {
        const exp = expenses[i];
        const d = this.getBrazilDate(exp.date);
        const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        report += '   • ' + time + ' - ' + exp.description + '\n';
        report += '     ' + this.formatMoney(exp.amount) + '\n';
      }
    } else {
      report += '✅ *Nenhum gasto hoje!*\n';
      report += 'Você está no controle! 🎯\n';
    }
    
    report += '\n━━━━━━━━━━━━━━━━━━━━━';

    return report;
  }

  // ============ RELATÓRIO SEMANAL ============
  
  generateWeeklyReport(userId) {
    const user = this.dao.getUserById(userId);
    
    const today = this.getBrazilDate(new Date());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: weekAgo.toISOString(),
      endDate: today.toISOString(),
      transactionType: 'expense'
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    const average = expenses.length > 0 ? total / 7 : 0;
    
    const byCategory = this.dao.getExpensesByCategory(userId, weekAgo.toISOString(), today.toISOString());
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;

    let report = '━━━━━━━━━━━━━━━━━━━━━\n';
    report += '📊 *RELATÓRIO SEMANAL*\n';
    report += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    report += '👤 *Usuário:* ' + user.name + '\n';
    report += '📆 *Período:* ' + this.formatDateShort(weekAgo) + ' até ' + this.formatDateShort(today) + '\n\n';
    
    report += '💸 *RESUMO DA SEMANA*\n';
    report += '   Total gasto: ' + this.formatMoney(total) + '\n';
    report += '   Transações: ' + expenses.length + '\n';
    report += '   Média/dia: ' + this.formatMoney(average) + '\n\n';
    
    report += '💰 *SITUAÇÃO ATUAL*\n';
    report += '   Saldo: ' + this.formatMoney(user.current_balance) + '\n';
    if (user.savings_balance > 0) {
      report += '   Poupança: ' + this.formatMoney(user.savings_balance) + '\n';
    }
    if (user.emergency_fund > 0) {
      report += '   Emergência: ' + this.formatMoney(user.emergency_fund) + '\n';
    }
    report += '   *Total: ' + this.formatMoney(totalMoney) + '*\n\n';

    if (byCategory.length > 0) {
      report += '🏷️ *CATEGORIAS MAIS USADAS*\n';
      for (let i = 0; i < Math.min(byCategory.length, 5); i++) {
        const cat = byCategory[i];
        const percentage = ((cat.total / total) * 100).toFixed(0);
        report += '   ' + cat.emoji + ' ' + cat.category + '\n';
        report += '     ' + this.formatMoney(cat.total) + ' (' + percentage + '%)\n';
      }
      report += '\n';
    }

    if (expenses.length > 0) {
      const sorted = expenses.slice().sort(function(a, b) { return b.amount - a.amount; });
      const topExpenses = sorted.slice(0, 3);
      report += '💰 *MAIORES GASTOS*\n';
      for (let i = 0; i < topExpenses.length; i++) {
        const exp = topExpenses[i];
        report += '   ' + (i + 1) + '. ' + exp.description + '\n';
        report += '      ' + this.formatMoney(exp.amount) + '\n';
      }
    }
    
    report += '\n━━━━━━━━━━━━━━━━━━━━━';

    return report;
  }

  // ============ RELATÓRIO MENSAL ============
  
  generateMonthlyReport(userId) {
    const user = this.dao.getUserById(userId);
    
    const today = this.getBrazilDate(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: monthStart.toISOString(),
      endDate: monthEnd.toISOString(),
      transactionType: 'expense'
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    const daysInMonth = monthEnd.getDate();
    const currentDay = today.getDate();
    const average = currentDay > 0 ? total / currentDay : 0;
    const projection = average * daysInMonth;
    
    const stats = this.dao.getUserStats(userId);
    const byCategory = this.dao.getExpensesByCategory(userId, monthStart.toISOString(), monthEnd.toISOString());
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = monthNames[monthStart.getMonth()] + '/' + monthStart.getFullYear();

    let report = '━━━━━━━━━━━━━━━━━━━━━\n';
    report += '📈 *RELATÓRIO MENSAL*\n';
    report += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    report += '👤 *Usuário:* ' + user.name + '\n';
    report += '📆 *Mês:* ' + monthName + '\n\n';
    
    report += '💸 *RESUMO DO MÊS*\n';
    report += '   Total gasto: ' + this.formatMoney(total) + '\n';
    report += '   Transações: ' + expenses.length + '\n';
    report += '   Média/dia: ' + this.formatMoney(average) + '\n';
    report += '   Projeção mensal: ' + this.formatMoney(projection) + '\n';
    report += '   Ticket médio: ' + this.formatMoney(stats.avg_expense || 0) + '\n\n';
    
    report += '💰 *SITUAÇÃO ATUAL*\n';
    report += '   Saldo: ' + this.formatMoney(user.current_balance) + '\n';
    if (user.savings_balance > 0) {
      report += '   Poupança: ' + this.formatMoney(user.savings_balance) + '\n';
    }
    if (user.emergency_fund > 0) {
      report += '   Emergência: ' + this.formatMoney(user.emergency_fund) + '\n';
    }
    report += '   *Total: ' + this.formatMoney(totalMoney) + '*\n\n';

    if (byCategory.length > 0) {
      report += '🏷️ *DISTRIBUIÇÃO POR CATEGORIA*\n';
      for (let i = 0; i < Math.min(byCategory.length, 8); i++) {
        const cat = byCategory[i];
        const percentage = ((cat.total / total) * 100).toFixed(0);
        report += '   ' + cat.emoji + ' ' + cat.category + '\n';
        report += '     ' + this.formatMoney(cat.total) + ' (' + percentage + '%) • ' + cat.count + 'x\n';
      }
      report += '\n';
    }

    const percentageUsed = user.initial_balance > 0 ? ((total / user.initial_balance) * 100).toFixed(0) : 0;
    const percentageSaved = user.initial_balance > 0 ? ((totalMoney / user.initial_balance) * 100).toFixed(0) : 0;

    report += '📊 *ANÁLISE FINANCEIRA*\n';
    report += '   Percentual gasto: ' + percentageUsed + '%\n';
    report += '   Patrimônio atual: ' + percentageSaved + '%\n';

    if (user.current_balance < 0) {
      report += '\n🚨 *ATENÇÃO: Saldo negativo!*\n';
      report += 'Você está gastando mais do que tem.\n';
    } else if (user.current_balance < user.initial_balance * 0.3) {
      report += '\n⚠️ *AVISO: Saldo baixo!*\n';
      report += 'Considere reduzir gastos.\n';
    } else {
      report += '\n✅ *Parabéns! Você está no controle!*\n';
    }
    
    report += '\n━━━━━━━━━━━━━━━━━━━━━';

    return report;
  }

  // ============ CONFIRMAÇÃO DE GASTO ============
  
  generateExpenseConfirmation(expense, user, category) {
    let report = '✅ *GASTO REGISTRADO*\n\n';
    
    report += category.emoji + ' *Categoria:* ' + category.name + '\n';
    report += '💵 *Valor:* ' + this.formatMoney(expense.amount) + '\n';
    report += '📝 *Descrição:* ' + expense.description + '\n';
    report += '📅 *Data:* ' + this.formatDate(expense.date) + '\n\n';
    
    report += '💰 *Saldo Atualizado*\n';
    report += '   Principal: *' + this.formatMoney(user.current_balance) + '*\n';
    
    if (user.savings_balance > 0) {
      report += '   Poupança: ' + this.formatMoney(user.savings_balance) + '\n';
    }
    if (user.emergency_fund > 0) {
      report += '   Emergência: ' + this.formatMoney(user.emergency_fund) + '\n';
    }
    
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;
    report += '   Total: ' + this.formatMoney(totalMoney);
    
    return report;
  }

  // ============ AJUDA ============
  
  generateHelpMessage() {
    let help = '━━━━━━━━━━━━━━━━━━━━━\n';
    help += '🤖 *BOT FINANCEIRO - AJUDA*\n';
    help += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    help += '💸 *REGISTRAR GASTO*\n';
    help += 'Escreva naturalmente:\n';
    help += '• "Gastei 50 no mercado"\n';
    help += '• "Paguei 15 no uber"\n';
    help += '• "Almocei por 25 reais"\n\n';
    
    help += '💰 *SALDO PRINCIPAL*\n';
    help += '• `/saldo` - Ver saldo\n';
    help += '• `/saldo 1000` - Definir inicial\n';
    help += '• `/adicionar 500` - Adicionar saldo\n\n';
    
    help += '🐷 *POUPANÇA*\n';
    help += '• `/poupanca` - Ver poupança\n';
    help += '• `/guardar 100` - Guardar dinheiro\n';
    help += '• `/retirar 50` - Retirar da poupança\n\n';
    
    help += '🚨 *RESERVA DE EMERGÊNCIA*\n';
    help += '• `/emergencia` - Ver reserva\n';
    help += '• `/reservar 200` - Adicionar à reserva\n';
    help += '• `/usar 100` - Usar da reserva\n\n';
    
    help += '📦 *PARCELAMENTOS*\n';
    help += '• "comprei celular por 1200 em 12x"\n';
    help += '• `/parcelamentos` - Ver todas as compras parceladas\n';
    help += '• `/pagar celular` - Pagar próxima parcela\n\n';
    
    help += '🔔 *LEMBRETES*\n';
    help += '• `/lembretes` ou `/lembrar` - Ver lembretes\n';
    help += '• `/vencidas` ou `/pendentes` - Ver parcelas atrasadas\n';
    help += '_⚠️ Lembretes só funcionam com o bot ligado_\n\n';
    
    help += '📊 *RELATÓRIOS*\n';
    help += '• `/relatorio diario` - Hoje\n';
    help += '• `/relatorio semanal` - 7 dias\n';
    help += '• `/relatorio mensal` - Mês atual\n\n';
    
    help += '🏷️ *CATEGORIAS AUTOMÁTICAS*\n';
    help += '🍔 Alimentação • 🚗 Transporte\n';
    help += '🛒 Mercado • 🎮 Lazer\n';
    help += '💳 Contas • 💊 Saúde\n';
    help += '📚 Educação • 👕 Vestuário\n\n';
    
    help += '━━━━━━━━━━━━━━━━━━━━━\n';
    help += '💡 O bot identifica categorias automaticamente!\n';
    help += 'Use `/start` para começar.';
    
    return help;
  }

  // ============ BEM-VINDO ============
  
  generateWelcomeMessage(userName) {
    let welcome = '━━━━━━━━━━━━━━━━━━━━━\n';
    welcome += '👋 *BEM-VINDO!*\n';
    welcome += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    welcome += 'Olá, *' + userName + '!* 😊\n\n';
    welcome += 'Sou seu assistente financeiro pessoal! 🤖💰\n\n';
    
    welcome += '🚀 *PRIMEIROS PASSOS*\n\n';
    welcome += '1️⃣ Defina seu saldo inicial:\n';
    welcome += '   `/saldo 1000`\n\n';
    
    welcome += '2️⃣ Registre seus gastos naturalmente:\n';
    welcome += '   "Gastei 50 no mercado"\n\n';
    
    welcome += '3️⃣ Consulte relatórios:\n';
    welcome += '   `/relatorio mensal`\n\n';
    
    welcome += '💡 *DICA*\n';
    welcome += 'Use `/ajuda` para ver todos os comandos!\n\n';
    
    welcome += '━━━━━━━━━━━━━━━━━━━━━\n';
    welcome += 'Vamos começar a organizar suas finanças! 💪';
    
    return welcome;
  }

  // ============ TRANSAÇÕES DE POUPANÇA ============
  
  generateSavingsConfirmation(action, amount, user) {
    let msg = action === 'deposit' ? '✅ *DINHEIRO GUARDADO*\n\n' : '✅ *DINHEIRO RETIRADO*\n\n';
    
    msg += '💵 *Valor:* ' + this.formatMoney(amount) + '\n';
    msg += '📅 *Data:* ' + this.formatDate(new Date()) + '\n\n';
    
    msg += '💰 *SALDOS ATUALIZADOS*\n';
    msg += '   Principal: ' + this.formatMoney(user.current_balance) + '\n';
    msg += '   Poupança: *' + this.formatMoney(user.savings_balance) + '*\n';
    
    if (user.emergency_fund > 0) {
      msg += '   Emergência: ' + this.formatMoney(user.emergency_fund) + '\n';
    }
    
    const total = user.current_balance + user.savings_balance + user.emergency_fund;
    msg += '   Total: ' + this.formatMoney(total);
    
    return msg;
  }

  // ============ TRANSAÇÕES DE EMERGÊNCIA ============
  
  generateEmergencyConfirmation(action, amount, user) {
    let msg = action === 'deposit' ? '✅ *RESERVA CRIADA*\n\n' : '✅ *RESERVA UTILIZADA*\n\n';
    
    msg += '💵 *Valor:* ' + this.formatMoney(amount) + '\n';
    msg += '📅 *Data:* ' + this.formatDate(new Date()) + '\n\n';
    
    msg += '💰 *SALDOS ATUALIZADOS*\n';
    msg += '   Principal: ' + this.formatMoney(user.current_balance) + '\n';
    
    if (user.savings_balance > 0) {
      msg += '   Poupança: ' + this.formatMoney(user.savings_balance) + '\n';
    }
    
    msg += '   Emergência: *' + this.formatMoney(user.emergency_fund) + '*\n';
    
    const total = user.current_balance + user.savings_balance + user.emergency_fund;
    msg += '   Total: ' + this.formatMoney(total);
    
    return msg;
  }

  // ============ 🆕 RELATÓRIOS DE PARCELAMENTO ============

  generateInstallmentsList(userId) {
    const installments = this.dao.getInstallmentsByUser(userId);
    
    if (installments.length === 0) {
      return '📦 *PARCELAMENTOS*\n\nVocê não tem compras parceladas.\n\nUse: "comprei celular por 1200 em 12x"';
    }
    
    let report = '┏━━━━━━━━━━━━━━━━━━━━━\n';
    report += '📦 *SUAS COMPRAS PARCELADAS*\n';
    report += '┗━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      const pending = inst.pending_count;
      const paid = inst.paid_count;
      const total = inst.total_installments;
      const remaining = parseFloat((pending * inst.installment_amount).toFixed(2));
      
      report += (i + 1) + '. ' + inst.category_emoji + ' *' + inst.description + '*\n';
      report += '   💰 Total: ' + this.formatMoney(inst.total_amount) + '\n';
      report += '   📊 Parcelas: ' + paid + '/' + total + ' pagas\n';
      report += '   💵 Parcela: ' + this.formatMoney(inst.installment_amount) + '\n';
      report += '   ⏳ Restante: ' + this.formatMoney(remaining) + '\n';
      report += '   📅 Criado: ' + this.formatDate(inst.created_at) + '\n\n';
    }
    
    report += '💡 Use `/pagar celular` para pagar a próxima parcela';
    
    return report;
  }

  generateInstallmentConfirmation(installment, category) {
    let report = '✅ *COMPRA PARCELADA REGISTRADA*\n\n';
    
    report += category.emoji + ' *Produto:* ' + installment.description + '\n';
    report += '💰 *Valor Total:* ' + this.formatMoney(installment.total_amount) + '\n';
    report += '📊 *Parcelas:* ' + installment.total_installments + 'x de ' + this.formatMoney(installment.installment_amount) + '\n';
    report += '🕒 *Data:* ' + this.formatDate(installment.created_at) + '\n\n';
    
    report += '💡 *Como pagar parcelas:*\n';
    report += '   `/pagar ' + installment.description + '`\n';
    report += '   ou `/parcelamentos` para ver todas';
    
    return report;
  }

  generatePaymentConfirmation(installment, payment, user) {
    let report = '✅ *PARCELA PAGA*\n\n';
    
    report += '📦 *Produto:* ' + installment.description + '\n';
    report += '📊 *Parcela:* ' + payment.installment_number + '/' + installment.total_installments + '\n';
    report += '💵 *Valor:* ' + this.formatMoney(payment.amount) + '\n';
    report += '🕒 *Data/Hora:* ' + this.formatDate(payment.paid_at) + '\n\n';
    
    const paid = payment.installment_number;
    const remaining = installment.total_installments - paid;
    
    if (remaining > 0) {
      report += '⏳ *Restam ' + remaining + ' parcelas*\n';
      report += '   ' + remaining + 'x de ' + this.formatMoney(installment.installment_amount) + '\n\n';
    } else {
      report += '🎉 *PARABÉNS! TOTALMENTE PAGO!*\n\n';
    }
    
    report += '💰 *Saldo Atualizado:* ' + this.formatMoney(user.current_balance);
    
    return report;
  }

  // ============ 🆕 LEMBRETES DE VENCIMENTO ============

  getBrazilDateOnly(date) {
    const d = this.getBrazilDate(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  generateRemindersList(userId) {
    const pending = this.dao.getPendingPaymentsByUser(userId);
    
    if (pending.length === 0) {
      return '✅ *PARCELAS EM DIA*\n\nVocê não tem parcelas pendentes!';
    }
    
    const today = this.getBrazilDateOnly(new Date());
    let overdue = [];
    let upcoming = [];
    
    for (const p of pending) {
      const dueDate = this.getBrazilDateOnly(p.due_date);
      if (dueDate < today) {
        overdue.push(p);
      } else {
        upcoming.push(p);
      }
    }
    
    let report = '┏━━━━━━━━━━━━━━━━━━━━━\n';
    report += '📅 *LEMBRETES DE PARCELAS*\n';
    report += '┗━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    if (overdue.length > 0) {
      report += '❌ *VENCIDAS (' + overdue.length + ')*\n\n';
      for (const p of overdue) {
        const daysLate = Math.floor((today - this.getBrazilDateOnly(p.due_date)) / (1000 * 60 * 60 * 24));
        report += '   • ' + p.emoji + ' *' + p.description + '*\n';
        report += '     Parcela: ' + p.installment_number + '/' + p.total_installments + '\n';
        report += '     Valor: ' + this.formatMoney(p.amount) + '\n';
        report += '     Venceu: ' + this.formatDateShort(p.due_date) + '\n';
        report += '     ⚠️ Atrasada há ' + daysLate + ' dia(s)\n\n';
      }
    }
    
    if (upcoming.length > 0) {
      report += '⏳ *PRÓXIMAS (' + upcoming.length + ')*\n\n';
      const limit = Math.min(upcoming.length, 5);
      for (let i = 0; i < limit; i++) {
        const p = upcoming[i];
        const daysUntil = Math.ceil((this.getBrazilDateOnly(p.due_date) - today) / (1000 * 60 * 60 * 24));
        report += '   • ' + p.emoji + ' *' + p.description + '*\n';
        report += '     Parcela: ' + p.installment_number + '/' + p.total_installments + '\n';
        report += '     Valor: ' + this.formatMoney(p.amount) + '\n';
        report += '     Vence: ' + this.formatDateShort(p.due_date) + '\n';
        
        if (daysUntil === 0) {
          report += '     🔔 Vence HOJE!\n\n';
        } else if (daysUntil === 1) {
          report += '     ⏰ Vence AMANHÃ!\n\n';
        } else {
          report += '     📅 Faltam ' + daysUntil + ' dias\n\n';
        }
      }
    }
    
    report += '💡 Use `/pagar [nome]` para pagar uma parcela';
    
    return report;
  }

  generateReminderMessage(payment) {
    const today = this.getBrazilDateOnly(new Date());
    const dueDate = this.getBrazilDateOnly(payment.due_date);
    
    let msg = '';
    
    if (dueDate < today) {
      const daysLate = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      msg = '❌ *PARCELA VENCIDA*\n\n';
      msg += '⚠️ Atrasada há ' + daysLate + ' dia(s)\n\n';
    } else {
      msg = '🔔 *LEMBRETE DE PAGAMENTO*\n\n';
      msg += '📅 Vence HOJE\n\n';
    }
    
    msg += payment.emoji + ' *Compra:* ' + payment.description + '\n';
    msg += '💳 *Parcela:* ' + payment.installment_number + '/' + payment.total_installments + '\n';
    msg += '💰 *Valor:* ' + this.formatMoney(payment.amount) + '\n';
    msg += '📅 *Vencimento:* ' + this.formatDateShort(payment.due_date) + '\n\n';
    msg += '💡 Use `/pagar ' + payment.description + '` para pagar';
    
    return msg;
  }
}

module.exports = ReportGenerator;