// 1: 单仓位止盈止损: 开仓的时候设置好止盈止损, 由系统确认止盈止损是否触发
// 2: 组合仓位止盈止损: 解决方案为当仓位变化后, 根据新仓位算出新的止盈止损位置(如无仓位即撤销止盈止损)
// TODO 当仓位变化后(补仓, 手动仓(部分/全部), 触发一方向(部分/全部)止盈止损), 需要按照策略重置止盈止损单
// 1. 轮询当前仓位变化情况(触发某一方向全部止盈止损后仓位为 0), 撤销另一方向止盈止损
// 2. 下新的单前撤销原来止盈止损, 按新复合价格设置新的止盈止损

const { EventEmitter } = require('events');
const debug = require('debug')('calculator:fixed-stop-loss');

const {
  calcRatio,
  parseDecimal, parsePercent,
  triggerLong, triggerShort,
  closeLong, closeShort,
} = require('./calculator');

class FixedTriggerPrice extends EventEmitter {
  constructor() {
    super();

    this.longshort = 0; // 多>0, 空<=0
    this.leverage = 0; // 杠杆倍数
    this.fee = 0; // 手续费率
    this.winRatio = 0; // 止盈百分比
    this.loseRatio = 0; // 止损百分比
    this.slippage = 0; // 止损价下单价格与止损价差百分比
    this.decimal = 0; // 最小精度

    this.holdPrice = 0; // 平均持仓价格
    this.currPrice = 0; // 当前市场价格
    this.holdCont = 0; // 持仓数量

    this.triggerWinPrice = 0; // 触发止盈价
    this.triggerLosePrice = 0; // 触发止损价
    this.closeWinPrice = 0; // 止盈价格
    this.closeLosePrice = 0; // 止损价格

    this.pnlRatio = 0; // 收益率
  }

  // 初始化对象数据
  init(longshort, leverage, fee, winRatio, loseRatio, slippage, decimal) {
    this.longshort = longshort; // 多>0, 空<=0
    this.leverage = leverage; // 杠杆倍数
    this.fee = fee; // 手续费率
    this.winRatio = winRatio; // 止盈百分比
    this.loseRatio = loseRatio; // 止损百分比
    this.slippage = slippage; // 止损价下单价格与止损价差百分比
    this.decimal = decimal; // 最小精度

    return this;
  }

  // 与远端服务器同步数据
  async(longshort, cont, price) {
    this.longshort = longshort;
    this.holdCont = cont;
    this.holdPrice = price;
  }

  // 从存储数据恢复对象
  fromJson(data) {
    this.longshort = parseInt(data.longshort, 10);
    this.leverage = parseInt(data.leverage, 10);
    this.fee = parseFloat(data.fee);
    this.winRatio = parseFloat(data.winRatio);
    this.loseRatio = parseFloat(data.loseRatio);
    this.slippage = parseFloat(data.slippage);
    this.decimal = parseInt(data.decimal, 10);

    this.holdPrice = data.holdPrice;
    this.currPrice = data.currPrice;
    this.holdCont = data.holdCont;

    this.triggerWinPrice = data.triggerWinPrice;
    this.triggerLosePrice = data.triggerLosePrice;
    this.closeWinPrice = data.closeWinPrice;
    this.closeLosePrice = data.closeLosePrice;

    this.pnlRatio = data.pnlRatio;

    return this;
  }

  // 转换为可存储数据
  toJson() {
    return {
      longshort: this.longshort,
      leverage: this.leverage,
      fee: this.fee,
      winRatio: this.winRatio,
      loseRatio: this.loseRatio,
      slippage: this.slippage,
      decimal: this.decimal,

      holdPrice: this.holdPrice,
      currPrice: this.currPrice,
      holdCont: this.holdCont,

      triggerWinPrice: this.triggerWinPrice,
      triggerLosePrice: this.triggerLosePrice,
      closeWinPrice: this.closeWinPrice,
      closeLosePrice: this.closeLosePrice,

      pnlRatio: this.pnlRatio,
    };
  }

  // 加仓
  addCont(cont, price) {
    const addCont = parseInt(cont, 10);
    const currPrice = parseDecimal(price, this.decimal);

    if (addCont <= 0) return this.subCont(-addCont, currPrice);

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const addTotal = currPrice * addCont;

    const total = holdTotal + addTotal; // 持仓总成本
    this.holdCont += addCont; // 持仓总张数
    this.holdPrice = total / this.holdCont; // 平均持仓成本

    // 平仓价
    const {
      triggerWin, triggerLose, closeWin, closeLose,
    } = this.calcClosePrice();

    this.triggerWinPrice = parseDecimal(triggerWin, this.decimal);
    this.triggerLosePrice = parseDecimal(triggerLose, this.decimal);
    this.closeWinPrice = parseDecimal(closeWin, this.decimal);
    this.closeLosePrice = parseDecimal(closeLose, this.decimal);
    debug(
      '止盈 %s=>%s 止损 %s=>%s',
      parseDecimal(triggerWin, this.decimal),
      parseDecimal(closeWin, this.decimal),
      parseDecimal(triggerLose, this.decimal),
      parseDecimal(closeLose, this.decimal),
    );

    this.emit('onContChange');
    debug('加仓 %s 张, 价格 %s, 持仓 %s 张, 均价 %s', addCont, currPrice, this.holdCont, this.holdPrice);

    return this.holdCont;
  }

  // 减仓
  subCont(cont, price) {
    const subCont = parseInt(cont, 10);
    const currPrice = parseDecimal(price, this.decimal);

    if (subCont <= 0) return this.subCont(-subCont, currPrice);

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const minusTotal = currPrice * subCont;

    const total = holdTotal - minusTotal; // 持仓总成本
    this.holdCont -= subCont; // 持仓总张数
    this.holdPrice = this.holdCont > 0 ? total / this.holdCont : 0; // 平均持仓成本

    this.emit('onContChange');
    debug('减仓 %s 张, 价格 %s, 持仓 %s 张, 均价 %s', subCont, currPrice, this.holdCont, this.holdPrice);

    return this.holdCont;
  }

  // 计算止盈止损价格
  calcClosePrice() {
    let triggerWin; // 止盈触发价格
    let triggerLose; // 止损触发价格
    let closeWin; // 止盈下单价格
    let closeLose; // 止损下单价格

    if (this.longshort > 0) {
      // 做多 Long
      ({ triggerWin, triggerLose } = triggerLong(
        this.holdPrice, this.winRatio, this.loseRatio, this.fee, this.leverage,
      ));
      ({ closeWin, closeLose } = closeLong(triggerWin, triggerLose, this.slippage));
      debug(
        '%s做多 => %s触发 %s止盈 收益率 %s%, %s触发 %s止损 收益率 %s%',
        parseDecimal(this.holdPrice, this.decimal),
        parseDecimal(triggerWin, this.decimal),
        parseDecimal(closeWin, this.decimal),
        parsePercent(this.winRatio, this.decimal),
        parseDecimal(triggerLose, this.decimal),
        parseDecimal(closeLose, this.decimal),
        parsePercent(-this.loseRatio, this.decimal),
      );
    }
    if (this.longshort <= 0) {
      // 做空 Short
      ({ triggerWin, triggerLose } = triggerShort(
        this.holdPrice, this.winRatio, this.loseRatio, this.fee, this.leverage,
      ));
      ({ closeWin, closeLose } = closeShort(triggerWin, triggerLose, this.slippage));
      debug(
        '%s做空 => %s触发 %s止盈 收益率 %s%, %s触发 %s止损 收益率 %s%',
        parseDecimal(this.holdPrice, this.decimal),
        parseDecimal(triggerWin, this.decimal),
        parseDecimal(closeWin, this.decimal),
        parsePercent(this.winRatio, this.decimal),
        parseDecimal(triggerLose, this.decimal),
        parseDecimal(closeLose, this.decimal),
        parsePercent(-this.loseRatio, this.decimal),
      );
    }

    return {
      triggerWin, triggerLose, closeWin, closeLose,
    };
  }

  // 计算收益率
  calcProfitRatio() {
    if (this.holdCont <= 0) return 0;

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
    debug(
      '当前价格 %s 持仓价格 %s 止损 %s=>%s 止盈 %s=>%s 仓位 %s, 未实现收益率 %s%',
      this.currPrice, this.holdPrice, this.triggerLosePrice, this.closeLosePrice,
      this.triggerWinPrice, this.closeWinPrice, this.holdCont, this.pnlRatio,
    );

    return this.pnlRatio;
  }

  // 价格变化
  onPriceChange(price) {
    // 无仓位
    if (this.holdCont <= 0) return;

    this.currPrice = parseDecimal(price, this.decimal);

    if (this.longshort > 0
      && (this.currPrice <= this.triggerLosePrice || this.currPrice >= this.triggerWinPrice)) {
      this.closeLongPos();
      return;
    }
    if (this.longshort <= 0
      && (this.currPrice >= this.triggerLosePrice || this.currPrice <= this.triggerWinPrice)) {
      this.closeShortPos();
      return;
    }

    debug(
      '价格 %s 未触发止盈 %s=>%s 止损 %s=>%s',
      this.currPrice, this.triggerWinPrice, this.closeWinPrice,
      this.triggerLosePrice, this.closeLosePrice,
    );
    this.calcProfitRatio();

    this.emit('onPriceChange');
  }

  // 平多头
  closeLongPos() {
    debug(
      '做多 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.closePrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    // this.subCont(this.holdCont, this.holdPrice);
    this.emit('onCloseLong', this.holdCont, this.holdPrice);
  }

  // 平空头
  closeShortPos() {
    debug(
      '做空 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.closePrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    // this.subCont(this.holdCont, this.holdPrice);
    this.emit('onCloseShort', this.holdCont, this.holdPrice);
  }
}

module.exports = FixedTriggerPrice;
