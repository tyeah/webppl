"use strict";

var numeric = require('numeric');
var scalar = require('./scalar');


function spaces(n) {
  var s = '';
  for (var i = 0; i < n; i++)
    s += ' ';
  return s;
}

var id = 0;
var T_tape = function(primal) {
  this.primal = primal;
  this.dim = numeric.dim(primal);
  this.fanout = 0;
  this.sensitivity = numeric.rep(this.dim, 0);
  this.opname = 'ROOT';
  this.id = id++;
};
T_tape.prototype = {
  determineFanout: function() { this.fanout += 1; },
  reversePhase: function(sensitivity) {
  	numeric.addeq(this.sensitivity, sensitivity);
    this.fanout -= 1;
  },
  print: function(tablevel) {
    tablevel = tablevel === undefined ? 0 : tablevel;
    var s = spaces(tablevel);
    console.log(s + '[' + this.id + '] ' + this.opname + ' | primal: ' +
    	JSON.stringify(this.primal) + ', deriv: ' + JSON.stringify(this.sensitivity));
  },
  resetState: function() {
    this.sensitivity = numeric.rep(this.dim, 0);
    this.fanout = 0;
  }
};
T_tape.prototype.reversePhaseResetting = T_tape.prototype.reversePhase;
var isTape = function(t) { return t instanceof T_tape; };

var T_tape1 = function(opname, primal, factor, tape, mulfn) {
  T_tape.call(this, primal);
  this.opname = opname;
  this.factor = factor;
  this.tape = tape;
  this.mulfn = mulfn || numeric.mul;
}
T_tape1.prototype = new T_tape();
T_tape1.prototype.determineFanout = function() {
  this.fanout += 1;
  if (this.fanout === 1)
    this.tape.determineFanout();
}
T_tape1.prototype.reversePhase = function(sensitivity) {
  numeric.addeq(this.sensitivity, sensitivity);
  this.fanout -= 1;
  if (this.fanout === 0) {
  	this.tape.reversePhase(this.mulfn(this.sensitivity, this.factor));
  }
}
T_tape1.prototype.reversePhaseResetting = function(sensitivity) {
  numeric.addeq(this.sensitivity, sensitivity);
  this.fanout -= 1;
  if (this.fanout === 0) {
    var sens = this.sensitivity;
    this.sensitivity = numeric.rep(this.dim, 0);
    this.tape.reversePhaseResetting(this.mulfn(sens, this.factor));
  }
}
T_tape1.prototype.print = function(tablevel) {
  tablevel = tablevel === undefined ? 0 : tablevel;
  T_tape.prototype.print.call(this, tablevel);
  this.tape.print(tablevel + 1);
}
T_tape1.prototype.resetState = function() {
  T_tape.prototype.resetState.call(this);
  this.tape.resetState();
}

var T_tape2 = function(opname, primal, factor1, factor2, tape1, tape2, mulfn1, mulfn2) {
  T_tape.call(this, primal);
  this.opname = opname;
  this.factor1 = factor1;
  this.factor2 = factor2;
  this.tape1 = tape1;
  this.tape2 = tape2;
  this.mulfn1 = mulfn1 || numeric.mul;
  this.mulfn2 = mulfn2 || numeric.mul;
}
T_tape2.prototype = new T_tape();
T_tape2.prototype.determineFanout = function() {
  this.fanout += 1;
  if (this.fanout === 1) {
    this.tape1.determineFanout();
    this.tape2.determineFanout();
  }
}
T_tape2.prototype.reversePhase = function(sensitivity) {
  numeric.addeq(this.sensitivity, sensitivity);
  this.fanout -= 1;
  if (this.fanout === 0) {
    this.tape1.reversePhase(this.mulfn1(this.sensitivity, this.factor1));
    this.tape2.reversePhase(this.mulfn2(this.sensitivity, this.factor2));
  }
}
T_tape2.prototype.reversePhaseResetting = function(sensitivity) {
  numeric.addeq(this.sensitivity, sensitivity);
  this.fanout -= 1;
  if (this.fanout === 0) {
    var sens = this.sensitivity;
    this.sensitivity = 0;
    this.tape1.reversePhaseResetting(this.mulfn1(sens, this.factor1));
    this.tape2.reversePhaseResetting(this.mulfn2(sens, this.factor2));
  }
}
T_tape2.prototype.print = function(tablevel) {
  tablevel = tablevel === undefined ? 0 : tablevel;
  T_tape.prototype.print.call(this, tablevel);
  this.tape1.print(tablevel + 1);
  this.tape2.print(tablevel + 1);
}
T_tape2.prototype.resetState = function() {
  T_tape.prototype.resetState.call(this);
  this.tape1.resetState();
  this.tape2.resetState();
}


var lift_realreal_to_real = function(f, df_dx1, df_dx2, mulfn1, mulfn2) {
  var liftedfn;
  var fn = f;
  liftedfn = function(x_1, x_2) {
    if (isTape(x_1)) {
      if (isTape(x_2))
          return new T_tape2(f.name,
                      fn(x_1.primal, x_2.primal),
                      df_dx1(x_1.primal, x_2.primal), df_dx2(x_1.primal, x_2.primal),
                      x_1, x_2, mulfn1, mulfn2)
      else
        return new T_tape1(f.name, fn(x_1.primal, x_2), df_dx1(x_1.primal, x_2), x_1, mulfn1)
    }
    else {
      if (isTape(x_2))
        return new T_tape1(f.name, fn(x_1, x_2.primal), df_dx2(x_1, x_2.primal), x_2, mulfn2)
      else
        return f(x_1, x_2)
    }
  };
  return liftedfn;
};

var lift_real_to_real = function(f, df_dx, mulfn) {
  var liftedfn;
  var fn = f;
  liftedfn = function(x1) {
    if (isTape(x1))
      return new T_tape1(f.name, fn(x1.primal), df_dx(x1.primal), x1, mulfn);
    else
      return f(x1);
  }
  return liftedfn;
};


// Lifted function to select an element from a 1D vector
// elem -> primal, vector -> tape, index -> factor
var ST_tape = function(elem, vector, index) {
	scalar.tape1.call(this, 'select', elem, index, vector);
};
ST_tape.prototype = new scalar.tape1();
ST_tape.prototype.reversePhase = function(sensitivity) {
	this.sensitivity += sensitivity;
	this.fanout -= 1;
	if (this.fanout === 0) {
		// Accumulate scalar derivative into correct component of
		//    vector derivative
		var vectorderiv = numeric.rep(numeric.dim(this.tape.primal), 0);
		vectorderiv[this.factor] = this.sensitivity;
		this.tape.reversePhase(vectorderiv);
	}
};
ST_tape.prototype.reversePhaseResetting = function(sensitivity) {
	this.sensitivity += sensitivity;
	this.fanout -= 1;
	if (this.fanout === 0) {
		// Accumulate scalar derivative into correct component of
		//    vector derivative
		var vectorderiv = numeric.rep(numeric.dim(this.tape.primal), 0);
		vectorderiv[this.factor] = this.sensitivity;
		this.sensitivity = 0;
		this.tape.reversePhaseResetting(vectorderiv);
	}
};
function vecselect(x, i) {
	if (isTape(x)) {
		return new ST_tape(x.primal[i], x, i);
	} else {
		return x[i];
	}
};
function vec2scalars(x) {
	var out = Array(x.length);
	for (var i = 0; i < out.length; i++) {
		out[i] = vecselect(x, i);
	}
	return out;
}


///////////////////////////////////////////////////////////////////////////////
// TESTS

var add = scalar.functions.add;

// Unary: pointwise log
function unaryTest() {
	var dfdx = function(x) { return numeric.div(1, x); };
	var log = lift_real_to_real(
		numeric.log,
		dfdx
	);
	var x = new T_tape([1, 2, 3]);
	var l = log(x);
	var y = add(vecselect(l, 0), add(vecselect(l, 1), vecselect(l, 2)));
	console.log(x.primal, l.primal);
	y.determineFanout();
	y.reversePhase(1);
	console.log(x.sensitivity, dfdx(x.primal));
}

// Binary: pointwise multiplication
function binaryTest() {
	var dfdx1 = function(x1, x2) { return x2; };
	var dfdx2 = function(x1, x2) { return x1; };
	var mul = lift_realreal_to_real(
		numeric.mul,
		dfdx1, dfdx2
	);
	var x1 = new T_tape([1, 2, 3]);
	var x2 = new T_tape([4, 5, 6]);
	var m = mul(x1, x2);
	var y = add(vecselect(m, 0), add(vecselect(m, 1), vecselect(m, 2)));
	console.log(x1.primal, x2.primal, m.primal);
	y.determineFanout();
	y.reversePhase(1);
	console.log(x1.sensitivity, x2.primal);
	console.log(x2.sensitivity, x1.primal);
}

// Matrix-vector multiply
function mvTest() {
	var dfdm = function(m, v) { return v; };
	var dfdv = function(m, v) { return m; };
	var mvmul = lift_realreal_to_real(
		numeric.dot,
		dfdm, dfdv,
		numeric.tensor, numeric.dot
	);
	var m = new T_tape([[1, 2], [3, 4]]);
	var v = new T_tape([1, 2]);
	var t = mvmul(m, v);
	var y = add(vecselect(t, 0), vecselect(t, 1));
	console.log(m.primal, v.primal, t.primal);
	y.determineFanout();
	y.reversePhase(1);
	console.log(m.sensitivity, numeric.tensor([1, 1], v.primal));
	console.log(v.sensitivity, numeric.dot([1, 1], m.primal));
}

// unaryTest();
// binaryTest();
// mvTest();


///////////////////////////////////////////////////////////////////////////////


module.exports = {
	tape: T_tape,
	tape1: T_tape1,
	tape2: T_tape2,
	isTape: isTape,
	makeUnaryFunction: lift_real_to_real,
	makeBinaryFunction: lift_realreal_to_real,
	vecselect: vecselect,
	vec2scalars: vec2scalars
};



