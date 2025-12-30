class NLPProcessor {
  constructor() {
    this.moneyPatterns = [
      /(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+(?:r\$|rs)?\s*(\d+(?:[.,]\d{1,2})?)/i,
      /(?:r\$|rs)\s*(\d+(?:[.,]\d{1,2})?)/i,
      /(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|contos|pila|pilas|pau|mangos)/i,
      /(\d+(?:[.,]\d{1,2})?)\s*(?:R\$|RS)/i,
      /^(\d+(?:[.,]\d{1,2})?)\s+/
    ];

    // 🆕 Padrão para parcelamento
    this.installmentPattern = /(\d+(?:[.,]\d{1,2})?)\s*(?:em|por|parcelado em|parcelada em|parcelado|parcelada)\s*(\d+)x?/i;

    this.commandPatterns = {
      // Saldo principal
      setBalance: /^\/saldo\s+(\d+(?:[.,]\d{1,2})?)/i,
      getBalance: /^\/saldo\s*$/i,
      addBalance: /^\/adicionar\s+(\d+(?:[.,]\d{1,2})?)/i,
      
      // Poupança - COM E SEM ACENTO
      getSavings: /^\/poupan[cç]a\s*$/i,
      depositSavings: /^\/guardar\s+(\d+(?:[.,]\d{1,2})?)/i,
      withdrawSavings: /^\/retirar\s+(\d+(?:[.,]\d{1,2})?)/i,
      
      // Reserva de emergência - COM E SEM ACENTO
      getEmergency: /^\/emerg[eê]ncia\s*$/i,
      depositEmergency: /^\/reservar\s+(\d+(?:[.,]\d{1,2})?)/i,
      withdrawEmergency: /^\/usar\s+(\d+(?:[.,]\d{1,2})?)/i,
      
      // 🆕 Parcelamentos - COM E SEM ACENTO
      getInstallments: /^\/parcelamentos?\s*$/i,
      payInstallment: /^\/pagar\s+(?:parcela\s+)?(.+)/i,
      
      // 🆕 Lembretes - COM E SEM ACENTO
      getReminders: /^\/(?:lembretes?|lembrar|avisos?)/i,
      getDuePayments: /^\/(?:vencidas?|atrasadas?|pendentes?)/i,
      
      // Relatórios - COM E SEM ACENTO - MÚLTIPLAS VARIAÇÕES
      reportDaily: /^\/relat[oó]rio\s+(?:hoje|di[aá]rio|diario|day|daily)/i,
      reportWeekly: /^\/relat[oó]rio\s+(?:semana|semanal|week|weekly)/i,
      reportMonthly: /^\/relat[oó]rio\s+(?:m[eê]s|mes|mensal|month|monthly)/i,
      
      // Comandos diretos sem "/relatório"
      reportDailyShort: /^\/(?:hoje|di[aá]rio|diario)\s*$/i,
      reportWeeklyShort: /^\/(?:semana|semanal)\s*$/i,
      reportMonthlyShort: /^\/(?:m[eê]s|mes|mensal)\s*$/i,
      
      // Outros
      help: /^\/(?:ajuda|help|comandos)/i,
      start: /^\/(?:start|come[çc]ar|comecar)/i
    };
  }

  extractAmount(text) {
    for (let i = 0; i < this.moneyPatterns.length; i++) {
      const pattern = this.moneyPatterns[i];
      const match = text.match(pattern);
      if (match) {
        const amount = match[1].replace(',', '.');
        return parseFloat(amount);
      }
    }
    return null;
  }

  // 🆕 Detectar parcelamento
  isInstallmentPurchase(text) {
    return this.installmentPattern.test(text);
  }

  // 🆕 Extrair informações de parcelamento
  extractInstallmentInfo(text) {
    const match = text.match(this.installmentPattern);
    if (!match) return null;
    
    const totalAmount = parseFloat(match[1].replace(',', '.'));
    const installments = parseInt(match[2]);
    
    if (totalAmount <= 0 || installments <= 0 || installments > 100) return null;
    
    const installmentAmount = parseFloat((totalAmount / installments).toFixed(2));
    
    return {
      totalAmount: totalAmount,
      installments: installments,
      installmentAmount: installmentAmount
    };
  }

  // 🆕 Extrair descrição de parcelamento
  extractInstallmentDescription(text, totalAmount, installments) {
    let description = text;
    
    // Remover padrões de gasto
    description = description.replace(/^(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+/i, '');
    
    // Remover valores e parcelamento
    const amountStr = totalAmount.toString().replace('.', '[.,]');
    description = description.replace(new RegExp('(?:r\\$|rs)?\\s*' + amountStr, 'gi'), '');
    description = description.replace(/\s*(?:em|por|parcelado em|parcelada em|parcelado|parcelada)\s*\d+x?/gi, '');
    
    // Remover símbolos de moeda
    description = description.replace(/(?:r\$|rs)\s*/gi, '');
    description = description.replace(/^\s*(?:em|de|com|no|na|para|pro|pra)\s+/i, '');
    description = description.trim();
    
    return description || 'Compra parcelada';
  }

  extractDescription(text, amount) {
    let description = text;
    
    description = description.replace(/^(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+/i, '');
    
    const amountStr = amount.toString().replace('.', '[.,]');
    description = description.replace(new RegExp('(?:r\\$|rs)?\\s*' + amountStr + '\\s*(?:reais?|contos?|pilas?|pau|mangos)?', 'gi'), '');
    
    description = description.replace(/(?:r\$|rs)\s*/gi, '');
    description = description.replace(/^\s*(?:em|de|com|no|na|para|pro|pra)\s+/i, '');
    description = description.trim();
    
    return description || 'Gasto';
  }

  identifyCommand(text) {
    const trimmedText = text.trim();
    
    const keys = Object.keys(this.commandPatterns);
    for (let i = 0; i < keys.length; i++) {
      const command = keys[i];
      const pattern = this.commandPatterns[command];
      const match = trimmedText.match(pattern);
      
      if (match) {
        const result = { command: command };
        
        // Comandos com valor
        if (match[1]) {
          // Se for payInstallment, capturar descrição
          if (command === 'payInstallment') {
            result.description = match[1].trim();
          } else {
            result.amount = parseFloat(match[1].replace(',', '.'));
          }
        }
        
        // Mapear comandos curtos para os principais
        if (command === 'reportDailyShort') result.command = 'reportDaily';
        if (command === 'reportWeeklyShort') result.command = 'reportWeekly';
        if (command === 'reportMonthlyShort') result.command = 'reportMonthly';
        
        return result;
      }
    }
    
    return null;
  }

  looksLikeExpense(text) {
    const hasAmount = this.extractAmount(text) !== null;
    
    const expenseKeywords = [
      'gastei', 'paguei', 'comprei', 'saiu', 'foi', 'custou', 
      'deu', 'comprando', 'no mercado', 'na farmácia', 'almocei',
      'jantei', 'lanchou', 'tomei'
    ];
    
    const textLower = text.toLowerCase();
    let hasKeyword = false;
    for (let i = 0; i < expenseKeywords.length; i++) {
      if (textLower.indexOf(expenseKeywords[i]) !== -1) {
        hasKeyword = true;
        break;
      }
    }
    
    return hasAmount || hasKeyword;
  }

  processMessage(text) {
    const command = this.identifyCommand(text);
    if (command) {
      return {
        type: 'command',
        command: command.command,
        amount: command.amount,
        description: command.description
      };
    }

    // 🆕 Verificar se é compra parcelada
    if (this.isInstallmentPurchase(text) && this.looksLikeExpense(text)) {
      const installmentInfo = this.extractInstallmentInfo(text);
      
      if (installmentInfo) {
        const description = this.extractInstallmentDescription(
          text, 
          installmentInfo.totalAmount, 
          installmentInfo.installments
        );
        
        return {
          type: 'installment',
          totalAmount: installmentInfo.totalAmount,
          installments: installmentInfo.installments,
          installmentAmount: installmentInfo.installmentAmount,
          description: description,
          date: new Date(),
          rawText: text
        };
      }
    }

    if (this.looksLikeExpense(text)) {
      const amount = this.extractAmount(text);
      
      if (amount && amount > 0) {
        const description = this.extractDescription(text, amount);
        
        return {
          type: 'expense',
          amount: amount,
          description: description,
          date: new Date(),
          rawText: text
        };
      }
    }

    return {
      type: 'unknown',
      text: text
    };
  }

  isValidAmount(amount) {
    return amount !== null && amount > 0 && amount < 1000000;
  }
}

module.exports = NLPProcessor;