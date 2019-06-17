// 1: 单仓位止盈止损: 开仓的时候设置好止盈止损, 由系统确认止盈止损是否触发
// 2: 组合仓位止盈止损: 解决方案为当仓位变化后, 根据新仓位算出新的止盈止损位置(如无仓位即撤销止盈止损)
// TODO 当仓位变化后(补仓, 手动仓(部分/全部), 触发一方向(部分/全部)止盈止损), 需要按照策略重置止盈止损单
// 1. 轮询当前仓位变化情况(触发某一方向全部止盈止损后仓位为 0), 撤销另一方向止盈止损
// 2. 下新的单前撤销原来止盈止损, 按新复合价格设置新的止盈止损

const { EventEmitter } = require('events');

const {
  calcRatio,
  parseDecimal, parsePercent,
  triggerLong, triggerShort,
  closeLong, closeShort,
} = require('./calculator');

class FixedTriggerPrice extends EventEmitter {
  constructor(longshort, leverage, fee, winRatio, loseRatio, slippage, decimal) {
    super();

    this.longshort = longshort; // 多>0, 空<=0
    this.leverage = leverage; // 杠杆倍数
    this.fee = fee; // 手续费率
    this.winRatio = winRatio; // 止盈百分比
    this.loseRatio = loseRatio; // 止损百分比
    this.slippage = slippage; // 止损价下单价格与止损价差百分比
    this.decimal = decimal; // 最小精度

    this.holdPrice = 0; // 平均持仓价格
    this.currPrice = 0; // 当前市场价格
    this.holdCont = 0; // 持仓数量

    this.triggerWinPrice = 0; // 触发止盈价
    this.triggerLosePrice = 0; // 触发止损价
    this.closeWinPrice = 0; // 止盈价格
    this.closeLosePrice = 0; // 止损价格

    this.pnlRatio = 0; // 收益率
  }

  // 加仓
  addCont(cont, price) {
    if (cont <= 0) return this.minusCont(-cont, price);

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const addTotal = price * cont;

    const total = holdTotal + addTotal; // 持仓总成本
    this.holdCont += cont; // 持仓总张数
    this.holdPrice = total / this.holdCont; // 平均持仓成本

    // 平仓价
    const {
      triggerWin, triggerLose, closeWin, closeLose,
    } = this.calcClosePrice();

    this.triggerWinPrice = parseDecimal(triggerWin, this.decimal);
    this.triggerLosePrice = parseDecimal(triggerLose, this.decimal);
    this.closeWinPrice = parseDecimal(closeWin, this.decimal);
    this.closeLosePrice = parseDecimal(closeLose, this.decimal);
    // console.log(
    //   '止盈 %s=>%s 止损 %s=>%s',
    //   parseDecimal(triggerWin, this.decimal),
    //   parseDecimal(closeWin, this.decimal),
    //   parseDecimal(triggerLose, this.decimal),
    //   parseDecimal(closeLose, this.decimal),
    // );

    return this.onPriceChange(price);
  }

  // 减仓
  minusCont(cont, price) {
    if (cont === 0 || this.holdCont < cont) return this;

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const minusTotal = price * cont;

    const total = holdTotal - minusTotal; // 持仓总成本
    this.holdCont -= cont; // 持仓总张数
    this.holdPrice = this.holdCont > 0 ? total / this.holdCont : 0; // 平均持仓成本

    return this;
  }

  calcClosePrice() {
    let triggerWin; // 止盈触发价格
    let triggerLose; // 止损触发价格
    let closeWin; // 止盈下单价格
    let closeLose; // 止损下单价格

    if (this.longshort > 0) {
      // 做多 Long
      ({ triggerWin, triggerLose } = triggerLong(this.holdPrice, this.winRatio, this.loseRatio, this.fee, this.leverage));
      ({ closeWin, closeLose } = closeLong(triggerWin, triggerLose, this.slippage));
      // console.log(
      //   '%s做多 => %s触发 %s止盈 收益率 %s%, %s触发 %s止损 收益率 %s%',
      //   parseDecimal(this.holdPrice, this.decimal),
      //   parseDecimal(triggerWin, this.decimal),
      //   parseDecimal(closeWin, this.decimal),
      //   parsePercent(this.winRatio, this.decimal),
      //   parseDecimal(triggerLose, this.decimal),
      //   parseDecimal(closeLose, this.decimal),
      //   parsePercent(-this.loseRatio, this.decimal),
      // );
    }
    if (this.longshort <= 0) {
      // 做空 Short
      ({ triggerWin, triggerLose } = triggerShort(this.holdPrice, this.winRatio, this.loseRatio, this.fee, this.leverage));
      ({ closeWin, closeLose } = closeShort(triggerWin, triggerLose, this.slippage));
      // console.log(
      //   '%s做空 => %s触发 %s止盈 收益率 %s%, %s触发 %s止损 收益率 %s%',
      //   parseDecimal(this.holdPrice, this.decimal),
      //   parseDecimal(triggerWin, this.decimal),
      //   parseDecimal(closeWin, this.decimal),
      //   parsePercent(this.winRatio, this.decimal),
      //   parseDecimal(triggerLose, this.decimal),
      //   parseDecimal(closeLose, this.decimal),
      //   parsePercent(-this.loseRatio, this.decimal),
      // );
    }

    return {
      triggerWin, triggerLose, closeWin, closeLose,
    };
  }

  calcProfitRatio() {
    // 未实现收益率
    const { longRatio, shortRatio } = calcRatio(
      this.holdPrice,
      this.currPrice,
      this.fee,
      this.leverage,
    );

    this.pnlRatio = this.longshort > 0
      ? parsePercent(longRatio, this.decimal)
      : parsePercent(shortRatio, this.decimal);
    console.log(
      '当前价格 %s 持仓价格 %s 止损 %s=>%s 止盈 %s=>%s 仓位 %s, 未实现收益率 %s%',
      this.currPrice,
      this.holdPrice,
      this.triggerLosePrice,
      this.closeLosePrice,
      this.triggerWinPrice,
      this.closeWinPrice,
      this.holdCont,
      this.pnlRatio,
    );
  }

  // 价格变化
  onPriceChange(price) {
    // 无仓位
    if (this.holdCont <= 0) return this;

    this.currPrice = price;

    if (this.longshort > 0 && (this.currPrice <= this.triggerLosePrice || this.currPrice >= this.triggerWinPrice)) {
      this.onCloseLong();
      return this;
    }
    if (this.longshort <= 0 && (this.currPrice >= this.triggerLosePrice || this.currPrice <= this.triggerWinPrice)) {
      this.onCloseShort();
      return this;
    }

    return this;
  }

  closeLong() {
    console.log(
      '做多 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.closePrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    this.minusCont(this.holdCont, this.holdPrice);
    this.emit('onCloseLong');
  }

  closeShort() {
    console.log(
      '做空 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.closePrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    this.minusCont(this.holdCont, this.holdPrice);
    this.emit('onCloseShort');
  }
}

module.exports = FixedTriggerPrice;
