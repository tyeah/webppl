////////////////////////////////////////////////////////////////////
// Simple Variational inference wrt the (pseudo)mean-field program.
// We do stochastic gradient descent on the ERP params.
// On sample statements: sample and accumulate grad-log-score, orig-score, and variational-score
// On factor statements accumulate into orig-score.

'use strict';

var _ = require('underscore');
var numeric = require('numeric')
var assert = require('assert');
var erp = require('../erp.js');
var util = require('../util.js');

module.exports = function(env) {

  function Variational(s, k, a, wpplFn,
                       numSteps, numSamples, numDistSamples,
                       verbose,
                       initialLearningRate, convergenceEpsilon) {

    this.wpplFn = wpplFn;
    this.verbose = verbose;
    this.numSteps = numSteps || 100;
    this.numSamples = numSamples || 100; // Per-step.
    this.currentStep = 0;
    this.currentSample = 0;

    // Number of samples used to create the ERP returned from inference.
    this.numDistSamples = numDistSamples || 100;

    // The variational parameters.
    this.variationalParams = {};

    // AdaGrad eta parameter.
    this.initialLearningRate = initialLearningRate || 1;
    this.convergenceEpsilon = convergenceEpsilon || 0.1;
    this.deltaAbsMaxAvg = 0;

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
    return this.wpplFn(_.clone(this.initialStore), env.exit, this.initialAddress);
  };

  Variational.prototype.sample = function(s, k, a, erp, params) {
    // Sample from variational dist
    if (!this.variationalParams.hasOwnProperty(a)) {
      // Initialize at prior (for this sample).
      this.variationalParams[a] = params;
      this.runningG2[a] = numeric.rep([params.length], 0);
    }
    var vParams = this.variationalParams[a];
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
      if (this.sampleGrad.hasOwnProperty(a)) {
        if (!this.sumGrad[a]) {
          var numParams = this.sampleGrad[a].length;
          this.sumGrad[a] = numeric.rep([numParams], 0);
          this.sumGradSq[a] = numeric.rep([numParams], 0);
          this.sumWeightedGrad[a] = numeric.rep([numParams], 0);
          this.sumWeightedGradSq[a] = numeric.rep([numParams], 0);
        }

        this.sumGrad[a] = numeric.add(this.sumGrad[a], this.sampleGrad[a]);
        this.sumWeightedGrad[a] = numeric.add(
            this.sumWeightedGrad[a],
            numeric.mul(this.sampleGrad[a], scoreDiff));

        var sampleGradSq = numeric.pow(this.sampleGrad[a], 2);
        this.sumGradSq[a] = numeric.add(this.sumGradSq[a], sampleGradSq);
        this.sumWeightedGradSq[a] = numeric.add(
            this.sumWeightedGradSq[a],
            numeric.mul(sampleGradSq, scoreDiff));
      }
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
      if (this.sumGrad.hasOwnProperty(a)) {
        // Estimate a*, the (per-parameter) optimal control variate scalar.
        var optimalScalarEst = numeric.div(
            this.sumWeightedGradSq[a],
            this.sumGradSq[a]);

        var elboGradEst = numeric.sub(
            this.sumWeightedGrad[a],
            numeric.mul(this.sumGrad[a], optimalScalarEst));

        var variParams = this.variationalParams[a];
        for (var i = 0; i < variParams.length; i++) {
          var grad = elboGradEst[i] / this.numSamples;
          this.runningG2[a][i] += Math.pow(grad, 2);
          var weight = this.initialLearningRate / Math.sqrt(this.runningG2[a][i]);
          assert(isFinite(weight), 'Variational update weight is infinite.');
          var delta = weight * grad;
          variParams[i] += delta;
          deltaAbsMax = Math.max(Math.abs(delta), deltaAbsMax);
        }
      }
    }

    this.currentStep++;

    // Maintain an exponentially decaying average of the max
    // variational parameter delta in order to test for convergence.
    this.deltaAbsMaxAvg = this.deltaAbsMaxAvg * 0.9 + deltaAbsMax;
    var converged = this.deltaAbsMaxAvg < this.convergenceEpsilon;
    if (converged && this.verbose) {
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

    // Return the variational distribution as an ERP.
    var hist = {};
    return util.cpsForEach(
        function(undef, i, lengthObj, nextK) {

          // Sample from the variational program.
          return this.wpplFn(_.clone(this.initialStore), function(store, val) {
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
          dist.variationalParams = this.variationalParams;

          // Reinstate previous coroutine
          env.coroutine = this.oldCoroutine;

          // Return by calling original continuation:
          return this.k(this.initialStore, dist);

        }.bind(this),

        // Duck-type an array-like object to iterate over.
        {length: this.numDistSamples}
    );

  };

  Variational.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function variational(s, cc, a, wpplFn, numSteps, numSamples, numDistSamples, verbose, lr, eps) {
    return new Variational(s, cc, a, wpplFn, numSteps, numSamples, numDistSamples, verbose, lr, eps);
  }

  return {Variational: variational};

};
