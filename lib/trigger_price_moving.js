// 开仓的时候设置好止损, 无止盈; 当价格向有利方向变动, 止损价同方向移动; 但是当价格朝不利方向移动, 止损价不动.
// 止损价按照当前价格朝有盈利的单方向移动 - 要有格子概念(保证最小盈利能覆盖手续费)

const { EventEmitter } = require('events');
const debug = require('debug')('calculator:moving-stop-loss');

const {
  calcRatio, calcPrice,
  closeLong, closeShort,
  parseDecimal, parsePercent,
} = require('./calculator');

class MovingTriggerPrice extends EventEmitter {
  constructor() {
    super();

    this.longshort = 0; // 多>0, 空<=0
    this.leverage = 0; // 杠杆倍数
    this.fee = 0; // 手续费率
    this.radio = 0; // 止损百分比
    this.slippage = 0; // 止损价下单价格与止损价差百分比
    this.decimal = 0; // 最小精度

    this.holdCont = 0; // 持仓数量
    this.holdPrice = 0; // 平均持仓价格
    this.currPrice = 0; // 当前市场价格
    this.upperPrice = 0; // 上轨价格 - 做多时为移仓价
    this.lowerPrice = 0; // 下轨价格 - 做空时为平仓价

    this.movePrice = 0; // 触发器价格移动触发价
    this.triggerPrice = 0; // 平仓触发价格
    this.closePrice = 0; // 平仓价格

    this.pnlRatio = 0; // 收益率
  }

  // 初始化对象数据
  init(longshort, leverage, fee, radio, slippage, decimal) {
    this.longshort = longshort; // 多>0, 空<=0
    this.leverage = leverage; // 杠杆倍数
    this.fee = fee; // 手续费率
    this.radio = radio; // 止损百分比
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
    this.longshort = data.longshort; // 多>0, 空<=0
    this.leverage = data.leverage; // 杠杆倍数
    this.fee = data.fee; // 手续费率
    this.radio = data.radio; // 止损百分比
    this.slippage = data.slippage; // 止损价下单价格与止损价差百分比
    this.decimal = data.decimal; // 最小精度

    this.holdCont = data.holdCont; // 持仓数量
    this.holdPrice = data.holdPrice; // 平均持仓价格
    this.currPrice = data.currPrice; // 当前市场价格
    this.upperPrice = data.upperPrice; // 上轨价格 - 做多时为移仓价
    this.lowerPrice = data.lowerPrice; // 下轨价格 - 做空时为平仓价

    this.movePrice = data.movePrice; // 触发器价格移动触发价
    this.triggerPrice = data.triggerPrice; // 平仓触发价格
    this.closePrice = data.closePrice; // 平仓价格

    this.pnlRatio = data.pnlRatio; // 收益率

    return this;
  }

  // 转换为可存储数据
  toJson() {
    return {
      longshort: this.longshort,
      leverage: this.leverage,
      fee: this.fee,
      radio: this.radio,
      slippage: this.slippage,
      decimal: this.decimal,

      holdCont: this.holdCont,
      holdPrice: this.holdPrice,
      currPrice: this.currPrice,
      upperPrice: this.upperPrice,
      lowerPrice: this.lowerPrice,

      movePrice: this.movePrice,
      triggerPrice: this.triggerPrice,
      closePrice: this.closePrice,

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

    this.emit('onContChange');
    debug('加仓 %s 张, 价格 %s, 持仓 %s 张, 均价 %s', addCont, currPrice, this.holdCont, this.holdPrice);

    return this.holdCont;
  }

  // 减仓
  subCont(cont, price) {
    const subCont = parseInt(cont, 10);
    const currPrice = parseDecimal(price, this.decimal);

    if (subCont === 0 || this.holdCont < subCont) return this.holdCont;

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const minusTotal = currPrice * subCont;

    const total = holdTotal - minusTotal; // 持仓总成本
    this.holdCont -= subCont; // 持仓总张数
    this.holdPrice = this.holdCont > 0 ? total / this.holdCont : currPrice; // 平均持仓成本

    this.emit('onContChange');

    debug('减仓 %s 张, 价格 %s, 持仓 %s 张, 均价 %s', subCont, currPrice, this.holdCont, this.holdPrice);

    return this.holdCont;
  }

  calcProfitRatio() {
    // 无仓位
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
      '当前价格 %s 持仓价格 %s 平仓价格 %s=>%s 移仓价格 %s 仓位 %s, 未实现收益率 %s%',
      this.currPrice, this.holdPrice, this.triggerPrice, this.closePrice,
      this.movePrice, this.holdCont, this.pnlRatio,
    );

    return this.pnlRatio;
  }

  // 价格变化
  onPriceChange(price) {
    // 无仓位
    if (this.holdCont <= 0) return;

    this.currPrice = parseDecimal(price, this.decimal);

    // 平仓价
    const { upperPrice, lowerPrice } = calcPrice(
      this.currPrice,
      this.radio,
      this.fee,
      this.leverage,
    );
    this.upperPrice = upperPrice;
    this.lowerPrice = lowerPrice;

    debug(
      '上轨平仓价 %s, 下轨平仓价 %s',
      parseDecimal(this.upperPrice, this.decimal),
      parseDecimal(this.lowerPrice, this.decimal),
    );

    this.calcProfitRatio();

    this.emit('onPriceChange');

    if (this.longshort > 0) {
      if ((this.triggerPrice === 0 || this.movePrice === 0)
        || (this.triggerPrice < this.lowerPrice && this.currPrice > this.movePrice)
      ) {
        // 做多时: 价格未初始化, 当止损低于原来止损线 并且 当前价格已经超过移动线
        this.moveClosePriceUp();
      }

      if (this.currPrice <= this.triggerPrice) {
        // 做多时: 价格低于平仓触发价格, 平多
        this.closeLongPos();
      }
    } else if (this.longshort <= 0) {
      if ((this.triggerPrice === 0 || this.movePrice === 0)
        || (this.triggerPrice > this.upperPrice && this.currPrice < this.movePrice)
      ) {
        // 做空时: 价格未初始化, 当止损高于原来止损线 并且 当前价已经低于移动线
        this.moveClosePriceDown();
      }

      if (this.currPrice >= this.triggerPrice) {
        // 做空时: 价格高于平仓触发价格, 平空
        this.closeShortPos();
      }
    }
  }

  // 做多时, 平仓价上移
  moveClosePriceUp() {
    this.triggerPrice = parseDecimal(this.lowerPrice, this.decimal);
    this.closePrice = closeLong(this.triggerPrice, this.slippage);
    this.movePrice = parseDecimal(this.upperPrice, this.decimal);
    debug(
      '平多价 %s=>%s, 移动平多价 %s',
      parseDecimal(this.triggerPrice, this.decimal),
      parseDecimal(this.closePrice, this.decimal),
      parseDecimal(this.movePrice, this.decimal),
    );
    this.emit('onClosePriceMove');
  }

  // 做空时, 平仓价下移
  moveClosePriceDown() {
    this.triggerPrice = parseDecimal(this.upperPrice, this.decimal);
    this.movePrice = parseDecimal(this.lowerPrice, this.decimal);
    this.closePrice = closeShort(this.triggerPrice, this.slippage);
    debug(
      '平空价 %s=>%s, 移动平空价 %s',
      parseDecimal(this.triggerPrice, this.decimal),
      parseDecimal(this.closePrice, this.decimal),
      parseDecimal(this.movePrice, this.decimal),
    );
    this.emit('onClosePriceMove');
  }

  // 平多头
  closeLongPos() {
    debug(
      '做多 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.triggerPrice, this.decimal),
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
      parseDecimal(this.triggerPrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    // this.subCont(this.holdCont, this.holdPrice);
    this.emit('onCloseShort', this.holdCont, this.holdPrice);
  }
}

module.exports = MovingTriggerPrice;
