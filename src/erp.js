////////////////////////////////////////////////////////////////////
// ERPs
//
// Elementary Random Primitives (ERPs) are the representation of
// distributions. They can have sampling, scoring, and support
// functions. A single ERP need not have all three, but some inference
// functions will complain if they're missing one.
//
// The main thing we can do with ERPs in WebPPL is feed them into the
// "sample" primitive to get a sample. At top level we will also have
// some "inspection" functions to visualize them?
//
// required:
// - erp.sample(params) returns a value sampled from the distribution.
// - erp.score(params, val) returns the log-probability of val under the distribution.
//
// optional:
// - erp.support(params) gives an array of support elements.
// - erp.grad(params, val) gives the gradient of score at val wrt params.
// - erp.proposer is an erp for making mh proposals conditioned on the previous value

'use strict';

var numeric = require('numeric');
var _ = require('underscore');
var util = require('./util.js');
var assert = require('assert');
var scorers = require('./erp_scorers.adjs');
var adscorers = require('./erp_scorers.js');

var LOG_2PI = 1.8378770664093453;

function ERP(obj) {
  assert(obj.sample && obj.score, 'ERP must implement sample and score.');
  _.extendOwn(this, obj);
}

ERP.prototype.isContinuous = function() {
  return !this.support
}

ERP.prototype.MAP = function() {
  if (this.support === undefined)
    throw 'Cannot compute MAP for ERP without support!'
  var supp = this.support([]);
  var mapEst = {val: undefined, prob: 0};
  for (var i = 0, l = supp.length; i < l; i++) {
    var sp = supp[i];
    var sc = Math.exp(this.score([], sp))
    if (sc > mapEst.prob) mapEst = {val: sp, prob: sc};
  }
  this.MAP = function() {return mapEst};
  return mapEst;
};

ERP.prototype.entropy = function() {
  if (this.support === undefined)
    throw 'Cannot compute entropy for ERP without support!'
  var supp = this.support([]);
  var e = 0;
  for (var i = 0, l = supp.length; i < l; i++) {
    var lp = this.score([], supp[i]);
    e -= Math.exp(lp) * lp;
  }
  this.entropy = function() {return e};
  return e;
};

ERP.prototype.parameterized = true;

ERP.prototype.withParameters = function(params) {
  var erp = new ERP(this);
  var sampler = this.sample;
  erp.sample = function(ps) {return sampler(params)};
  var scorer = this.score;
  erp.score = function(ps, val) {return scorer(params, val)};
  if (this.support) {
    var support = this.support;
    erp.support = function(ps) {return support(params)};
  }
  erp.parameterized = false;
  return erp;
};

ERP.prototype.isSerializeable = function() {
  return this.support && !this.parameterized;
};

// ERP serializer (allows JSON.stringify)
ERP.prototype.toJSON = function() {
  if (this.isSerializeable()) {
    var support = this.support([]);
    var probs = support.map(function(s) {return Math.exp(this.score([], s));}, this);
    var erpJSON = {probs: probs, support: support};
    this.toJSON = function() {return erpJSON};
    return erpJSON;
  } else {
    throw 'Cannot serialize ' + this.name + ' ERP.';
  }
};

ERP.prototype.print = function() {
  if (this.isSerializeable()) {
    console.log('ERP:');
    var json = this.toJSON();
    _.zip(json.probs, json.support)
      .sort(function(a, b) { return b[0] - a[0]; })
      .forEach(function(val) {
          console.log('    ' + util.serialize(val[1]) + ' : ' + val[0]);
        });
  } else {
    console.log('[ERP: ' + this.name + ']');
  }
};

var serializeERP = function(erp) {
  return util.serialize(erp);
};

// ERP deserializers
var deserializeERP = function(JSONString) {
  var obj = util.deserialize(JSONString);
  if (!obj.probs || !obj.support) {
    throw 'Cannot deserialize a non-ERP JSON object: ' + JSONString;
  }
  return makeCategoricalERP(obj.probs,
                            obj.support,
                            _.omit(obj, 'probs', 'support'));
};

var uniformERP = new ERP({
  sample: function(params) {
    var u = Math.random();
    return (1 - u) * params[0] + u * params[1];
  },
  score: scorers.uniform,
  adscore: adscorers.uniform
});

var bernoulliERP = new ERP({
  sample: function(params) {
    var weight = params[0];
    var val = Math.random() < weight;
    return val;
  },
  score: scorers.flip,
  adscore: adscorers.flip,
  support: function(params) {
    return [true, false];
  },
  grad: function(params, val) {
    //FIXME: check domain
    var weight = params[0];
    return val ? [1 / weight] : [-1 / weight];
  }
});



var randomIntegerERP = new ERP({
  sample: function(params) {
    return Math.floor(Math.random() * params[0]);
  },
  score: scorers.randomInteger,
  adscore: adscorers.randomInteger,
  support: function(params) {
    return _.range(params[0]);
  }
});

function gaussianSample(params) {
  var mu = params[0];
  var sigma = params[1];
  var u, v, x, y, q;
  do {
    u = 1 - Math.random();
    v = 1.7156 * (Math.random() - 0.5);
    x = u - 0.449871;
    y = Math.abs(v) + 0.386595;
    q = x * x + y * (0.196 * y - 0.25472 * x);
  } while (q >= 0.27597 && (q > 0.27846 || v * v > -4 * u * u * Math.log(u)));
  return mu + sigma * v / u;
}

var gaussianERP = new ERP({
  sample: gaussianSample,
  score: scorers.gaussian,
  adscore: adscorers.gaussian
});

function multivariateGaussianSample(params) {
  var mu = params[0];
  var cov = params[1];
  var xs = mu.map(function() {return gaussianSample([0, 1]);});
  var svd = numeric.svd(cov);
  var scaledV = numeric.transpose(svd.V).map(function(x) {
    return numeric.mul(numeric.sqrt(svd.S), x);
  });
  xs = numeric.dot(xs, numeric.transpose(scaledV));
  return numeric.add(xs, mu);
}

function multivariateGaussianScore(params, x) {
  var mu = params[0];
  var cov = params[1];
  var n = mu.length;
  var coeffs = n * LOG_2PI + Math.log(numeric.det(cov));
  var xSubMu = numeric.sub(x, mu);
  var exponents = numeric.dot(numeric.dot(xSubMu, numeric.inv(cov)), xSubMu);
  return -0.5 * (coeffs + exponents);
}

var multivariateGaussianERP = new ERP({
  sample: multivariateGaussianSample,
  score: multivariateGaussianScore
});

var discreteERP = new ERP({
  sample: function(params) {
    return multinomialSample(params);
  },
  score: scorers.discrete,
  adscore: adscorers.discrete,
  support: function(params) {
    return _.range(params.length);
  }
});

function gammaSample(params) {
  var a = params[0];
  var b = params[1];
  if (a < 1) {
    return gammaSample([1 + a, b]) * Math.pow(Math.random(), 1 / a);
  }
  var x, v, u;
  var d = a - 1 / 3;
  var c = 1 / Math.sqrt(9 * d);
  while (true) {
    do {
      x = gaussianSample([0, 1]);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    u = Math.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return b * d * v;
    }
  }
}

// params are shape and scale
var gammaERP = new ERP({
  sample: gammaSample,
  score: scorers.gamma,
  adscore: adscorers.gamma
});

var exponentialERP = new ERP({
  sample: function(params) {
    var a = params[0];
    var u = Math.random();
    return Math.log(u) / (-1 * a);
  },
  score: scorers.exponential,
  adscore: adscorers.exponential
});

function __betaSample(params) {
  var a = params[0];
  var b = params[1];
  var x = gammaSample([a, 1]);
  var y = gammaSample([b, 1]);
  return x / (x + y);
}
// Kludge: rejection sample until we get a value in the support
function betaSample(params) {
  var x;
  do {
    x = __betaSample(params);
  } while (x <= 0 || x >= 1)
  return x;
}

var betaERP = new ERP({
  sample: betaSample,
  score: scorers.beta,
  adscore: adscorers.beta
});

function binomialG(x) {
  if (x === 0) {
    return 1;
  }
  if (x === 1) {
    return 0;
  }
  var d = 1 - x;
  return (1 - (x * x) + (2 * x * Math.log(x))) / (d * d);
}

function binomialSample(params) {
  var p = params[0];
  var n = params[1];
  var k = 0;
  var N = 10;
  var a, b;
  while (n > N) {
    a = 1 + n / 2;
    b = 1 + n - a;
    var x = betaSample([a, b]);
    if (x >= p) {
      n = a - 1;
      p /= x;
    }
    else {
      k += a;
      n = b - 1;
      p = (p - x) / (1 - x);
    }
  }
  var u;
  for (var i = 0; i < n; i++) {
    u = Math.random();
    if (u < p) {
      k++;
    }
  }
  return k || 0;
}

var binomialERP = new ERP({
  sample: binomialSample,
  score: scorers.binomial,
  adscore: adscorers.binomial,
  support: function(params) {
    return _.range(params[1]).concat([params[1]]);
  }
});

var poissonERP = new ERP({
  sample: function(params) {
    var mu = params[0];
    var k = 0;
    while (mu > 10) {
      var m = 7 / 8 * mu;
      var x = gammaSample([m, 1]);
      if (x > mu) {
        return (k + binomialSample([mu / x, m - 1])) || 0;
      } else {
        mu -= x;
        k += m;
      }
    }
    var emu = Math.exp(-mu);
    var p = 1;
    do {
      p *= Math.random();
      k++;
    } while (p > emu);
    return (k - 1) || 0;
  },
  score: scorers.poisson,
  adscore: adscorers.poisson
});

function dirichletSample(params) {
  var alpha = params;
  var ssum = 0;
  var theta = [];
  var t;
  for (var i = 0; i < alpha.length; i++) {
    t = gammaSample([alpha[i], 1]);
    theta[i] = t;
    ssum = ssum + t;
  }
  for (var j = 0; j < theta.length; j++) {
    theta[j] /= ssum;
  }
  return theta;
}

var dirichletERP = new ERP({
  sample: dirichletSample,
  score: scorers.dirichlet,
  adscore: adscorers.dirichlet
});

function multinomialSample(theta) {
  var thetaSum = util.sum(theta);
  var x = Math.random() * thetaSum;
  var k = theta.length;
  var probAccum = 0;
  for (var i = 0; i < k; i++) {
    probAccum += theta[i];
    if (probAccum >= x) {
      return i;
    } //FIXME: if x=0 returns i=0, but this isn't right if theta[0]==0...
  }
  return k;
}

// Make a discrete ERP from a {val: prob, etc.} object (unormalized).
function makeMarginalERP(marginal) {
  assert.ok(_.size(marginal) > 0);
  // Normalize distribution:
  var norm = -Infinity;
  var supp = [];
  for (var v in marginal) {if (marginal.hasOwnProperty(v)) {
    var d = marginal[v];
    norm = util.logsumexp([norm, d.prob]);
    supp.push(d.val);
  }}
  var mapEst = {val: undefined, prob: 0};
  for (v in marginal) {if (marginal.hasOwnProperty(v)) {
    var dd = marginal[v];
    var nprob = dd.prob - norm;
    var nprobS = Math.exp(nprob)
    if (nprobS > mapEst.prob)
      mapEst = {val: dd.val, prob: nprobS};
    marginal[v].prob = nprobS;
  }}

  // Make an ERP from marginal:
  var dist = new ERP({
    sample: function(params) {
      var x = Math.random();
      var probAccum = 0;
      for (var i in marginal) {if (marginal.hasOwnProperty(i)) {
        probAccum += marginal[i].prob;
        // FIXME: if x=0 returns i=0, but this isn't right if theta[0]==0...
        if (probAccum >= x)
          return marginal[i].val;
      }}
      return marginal[i].val;
    },
    score: function(params, val) {
      var lk = marginal[JSON.stringify(val)];
      return lk ? Math.log(lk.prob) : -Infinity;
    },
    support: function(params) {
      return supp;
    },
    parameterized: false,
    name: 'marginal'
  });

  dist.MAP = function() {return mapEst};
  return dist;
}

// note: ps is expected to be normalized
var makeCategoricalERP = function(ps, vs, extraParams) {
  var dist = {};
  vs.forEach(function(v, i) {dist[JSON.stringify(v)] = {val: v, prob: ps[i]}})
  var categoricalSample = vs.length === 1 ?
      function(params) { return vs[0]; } :
      function(params) { return vs[multinomialSample(ps)]; };
  return new ERP(_.extendOwn({
    sample: categoricalSample,
    score: function(params, val) {
      var lk = dist[JSON.stringify(val)];
      return lk ? Math.log(lk.prob) : -Infinity;
    },
    support: function(params) { return vs; },
    parameterized: false,
    name: 'categorical'
  }, extraParams));
};

// Make a parameterized ERP that selects among multiple (unparameterized) ERPs
var makeMultiplexERP = function(vs, erps) {
  var stringifiedVals = vs.map(JSON.stringify);
  var selectERP = function(params) {
    var stringifiedV = JSON.stringify(params[0]);
    var i = _.indexOf(stringifiedVals, stringifiedV);
    if (i === -1) {
      return undefined;
    } else {
      return erps[i];
    }
  };
  return new ERP({
    sample: function(params) {
      var erp = selectERP(params);
      assert.notEqual(erp, undefined);
      return erp.sample();
    },
    score: function(params, val) {
      var erp = selectERP(params);
      if (erp === undefined) {
        return -Infinity;
      } else {
        return erp.score([], val);
      }
    },
    support: function(params) {
      var erp = selectERP(params);
      return erp.support();
    },
    name: 'multiplex'
  });
};

function isErp(x) {
  return x && _.isFunction(x.score) && _.isFunction(x.sample);
}

function isErpWithSupport(x) {
  return isErp(x) && _.isFunction(x.support);
}

function setErpNames(exports) {
  return _.each(exports, function(val, key) {
    if (isErp(val)) {
      val.name = key.replace(/ERP$/, '');
    }
  });
}

module.exports = setErpNames({
  ERP: ERP,
  serializeERP: serializeERP,
  deserializeERP: deserializeERP,
  bernoulliERP: bernoulliERP,
  betaERP: betaERP,
  binomialERP: binomialERP,
  dirichletERP: dirichletERP,
  discreteERP: discreteERP,
  exponentialERP: exponentialERP,
  gammaERP: gammaERP,
  gaussianERP: gaussianERP,
  multinomialSample: multinomialSample,
  multivariateGaussianERP: multivariateGaussianERP,
  poissonERP: poissonERP,
  randomIntegerERP: randomIntegerERP,
  uniformERP: uniformERP,
  makeMarginalERP: makeMarginalERP,
  makeCategoricalERP: makeCategoricalERP,
  makeMultiplexERP: makeMultiplexERP,
  isErp: isErp,
  isErpWithSupport: isErpWithSupport
});
