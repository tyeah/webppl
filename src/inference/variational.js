////////////////////////////////////////////////////////////////////
// Simple Variational inference wrt the (pseudo)mean-field program.
// We do stochastic gradient descent on the ERP params.
// On sample statements: sample and accumulate grad-log-score, orig-score, and variational-score
// On factor statements accumulate into orig-score.

'use strict';

var erp = require('../erp.js');

module.exports = function(env) {

  function Variational(s, k, a, wpplFn, numSteps, numSamples, numDistSamples) {

    this.wpplFn = wpplFn;
    this.numSteps = numSteps || 100;
    this.numSamples = numSamples || 100; // Per-step.
    this.currentStep = 0;
    this.currentSample = 0;

    // Number of samples used to create the ERP returned from inference.
    this.numDistSamples = numDistSamples || 100;

    // TODO: This probably needs a better name if it continues to hold ERP.
    this.variationalParams = {};

    // Historic gradient squared for each variational param, used for
    // adagrad update:
    this.runningG2 = {};

    // Maintain running totals of the sums (over samples) used to
    // computed (per-step) estimates of the lower-bound and its
    // gradient.
    this.sumScoreDiff = 0;
    this.sumGrad = {};
    this.sumWeightedGrad = {};
    this.sumGradSq = {};
    this.sumWeightedGradSq = {};

    // Gradient of each sample used to estimate gradient:
    this.sampleGrad = {};

    // Running score accumulation per sample:
    this.jointScore = 0;
    this.variScore = 0;

    this.deltaAbsMaxAvg = 0;

    // Move old coroutine out of the way and install this as the
    // current handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.initialStore = s; // will be reinstated at the end
    this.initialAddress = a;

    // Kick off the estimation:
    return this.takeGradSample();
  }

  Variational.prototype.takeGradSample = function() {
    // Reset sample info
    this.sampleGrad = {};
    this.jointScore = 0;
    this.variScore = 0;
    // Get another sample
    this.currentSample++;
    return this.wpplFn(this.initialStore, env.exit, this.initialAddress);
  };

  Variational.prototype.sample = function(s, k, a, erp, params) {
    // Sample from variational dist
    if (!this.variationalParams.hasOwnProperty(a)) {
      // Initialize at prior (for this sample).
      this.variationalParams[a] = {params: params, erp: erp};
      this.runningG2[a] = zeros(params.length);
    }
    var vParams = this.variationalParams[a].params;
    var val = erp.sample(vParams);

    // Compute variational dist grad
    this.sampleGrad[a] = erp.grad(vParams, val);

    // Compute target score + variational score
    this.jointScore += erp.score(params, val);
    this.variScore += erp.score(vParams, val);

    return k(s, val); // TODO: need a?
  };

  Variational.prototype.factor = function(s, k, a, score) {

    // Update joint score and keep going
    this.jointScore += score;

    return k(s); // TODO: need a?
  };

  Variational.prototype.exit = function(s, retval) {

    var scoreDiff = this.jointScore - this.variScore;

    // Update running totals.

    this.sumScoreDiff += scoreDiff;

    for (var a in this.sampleGrad) {
      if (!this.sumGrad[a]) {
        var numParams = this.sampleGrad[a].length;
        this.sumGrad[a] = zeros(numParams);
        this.sumGradSq[a] = zeros(numParams);
        this.sumWeightedGrad[a] = zeros(numParams);
        this.sumWeightedGradSq[a] = zeros(numParams);
      }

      this.sumGrad[a] = vecPlus(this.sumGrad[a], this.sampleGrad[a]);
      this.sumWeightedGrad[a] = vecPlus(
          this.sumWeightedGrad[a],
          vecScalarMult(this.sampleGrad[a], scoreDiff));

      var sampleGradSq = vecElemSq(this.sampleGrad[a]);
      this.sumGradSq[a] = vecPlus(this.sumGradSq[a], sampleGradSq);
      this.sumWeightedGradSq[a] = vecPlus(
          this.sumWeightedGradSq[a],
          vecScalarMult(sampleGradSq, scoreDiff));
    }

    // Do we have as many samples as we need for this gradient
    // estimate?
    if (this.currentSample < this.numSamples) {
      return this.takeGradSample();
    }

    // Compute the lower-bound estimate.

    // This will only be correct when observations come from
    // normalized distributions. (Rather than arbitrary factor
    // statements.)

    var elboEst = this.sumScoreDiff / this.numSamples;

    // Perform a gradient step using Adagrad.
    var deltaAbsMax = 0;

    for (a in this.sumGrad) {
      // Estimate a*, the (per-parameter) optimal control variate scalar.
      var optimalScalarEst = vecElemDiv(
          this.sumWeightedGradSq[a],
          this.sumGradSq[a]);

      var elboGradEst = vecSub(
          this.sumWeightedGrad[a],
          vecElemMult(this.sumGrad[a], optimalScalarEst));

      var variParam = this.variationalParams[a];
      for (var i in variParam.params) {
        var grad = elboGradEst[i] / this.numSamples;
        this.runningG2[a][i] += Math.pow(grad, 2);
        var weight = 0.5 / Math.sqrt(this.runningG2[a][i]);
        assert(isFinite(weight), 'Variational update weight is infinite.');
        var delta = weight * grad;
        variParam.params[i] += delta;
        deltaAbsMax = Math.max(Math.abs(delta), deltaAbsMax);
      }
      if (variParam.erp.feasibleParams) {
        assert(variParam.erp.feasibleParams(variParam.params),
               'Variational params have left feasible region.');
      }
    }

    this.currentStep++;

    // Maintain an exponentially decaying average of the max
    // variational parameter delta in order to test for convergence.
    this.deltaAbsMaxAvg = this.deltaAbsMaxAvg * 0.9 + deltaAbsMax;
    var converged = this.deltaAbsMaxAvg < 0.1;
    if (converged) {
      console.log('Varitional inference converged after step', this.currentStep);
    }

    // If we haven't converged then do another gradient estimate and
    // step:
    if (this.currentStep < this.numSteps && !converged) {
      this.currentSample = 0;
      this.sumScoreDiff = 0;
      this.sumGrad = {};
      this.sumWeightedGrad = {};
      this.sumGradSq = {};
      this.sumWeightedGradSq = {};
      return this.takeGradSample();
    }

    console.log(this.variationalParams);

    // Return the variational distribution as an ERP.
    var hist = {};
    return util.cpsForEach(
        function(undef, i, lengthObj, nextK) {

          // Sample from the variational program.
          return this.wpplFn(this.initialStore, function(store, val) {
            var k = JSON.stringify(val);
            if (hist[k] === undefined) {
              hist[k] = {prob: 0, val: val};
            }
            hist[k].prob += 1;
            return nextK();
          }, this.initialAddress);

        }.bind(this),

        function() {

          var dist = erp.makeMarginalERP(hist);
          dist.elboEstimate = elboEst;

          // Reinstate previous coroutine
          env.coroutine = this.oldCoroutine;

          // Return by calling original continuation:
          return this.k(this.initialStore, dist);

        }.bind(this),

        // Duck-type an array-like object to iterate over.
        {length: this.numDistSamples}
    );

  };

  // FIXME: Params are arrays, so need vector arithmetic or something.

  function vecPlus(a, b) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] + b[i];
    }
    return c;
  }

  function vecSub(a, b) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] - b[i];
    }
    return c;
  }

  function vecScalarMult(a, s) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] * s;
    }
    return c;
  }

  function vecElemSq(a) {
    var s = [];
    for (var i = 0; i < a.length; i++) {
      s[i] = a[i] * a[i];
    }
    return s;
  }

  function vecElemDiv(a, b) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] / b[i];
    }
    return c;
  }

  function vecElemMult(a, b) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] * b[i];
    }
    return c;
  }

  function zeros(n) {
    var a = [];
    for (var i = 0; i < n; i++) {
      a.push(0);
    }
    return a;
  }

  function variational(s, cc, a, wpplFn, numSteps, numSamples, numDistSamples) {
    return new Variational(s, cc, a, wpplFn, numSteps, numSamples, numDistSamples);
  }

  return {Variational: variational};

};
