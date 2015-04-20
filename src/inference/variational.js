////////////////////////////////////////////////////////////////////
// Simple Variational inference wrt the (pseudo)mean-field program.
// We do stochastic gradient descent on the ERP params.
// On sample statements: sample and accumulate grad-log-score, orig-score, and variational-score
// On factor statements accumulate into orig-score.

'use strict';

var erp = require('../erp.js');

module.exports = function(env) {

  function Variational(s, k, a, wpplFn, numSteps, numSamples) {

    this.wpplFn = wpplFn;
    this.numSteps = numSteps || 100;
    this.numSamples = numSamples || 100; // Per-step.
    this.currentStep = 0;
    this.currentSample = 0;

    // TODO: This probably needs a better name if it continues to hold ERP.
    this.variationalParams = {};
    //historic gradient squared for each variational param, used for adagrad update:
    this.runningG2 = {};
    //gradient estimate per iteration:
    this.grad = {};
    //gradient of each sample used to estimate gradient:
    this.sampleGrad = {};
    //running score accumulation per sample:
    this.jointScore = 0;
    this.variScore = 0;
    this.deltaAbsMaxAvg = 0;

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.initialStore = s; // will be reinstated at the end
    this.initialAddress = a;

    //kick off the estimation:
    return this.takeGradSample();
  }

  Variational.prototype.takeGradSample = function() {
    //reset sample info
    this.sampleGrad = {};
    this.jointScore = 0;
    this.variScore = 0;
    //get another sample
    this.currentSample++;
    return this.wpplFn(this.initialStore, env.exit, this.initialAddress);
  };

  Variational.prototype.sample = function(s, k, a, erp, params) {
    //sample from variational dist
    if (!this.variationalParams.hasOwnProperty(a)) {
      //initialize at prior (for this sample)...
      this.variationalParams[a] = {params: params, erp: erp};
      this.runningG2[a] = zeros(params.length);
    }
    var vParams = this.variationalParams[a].params;
    var val = erp.sample(vParams);

    //compute variational dist grad
    this.sampleGrad[a] = erp.grad(vParams, val);

    //compute target score + variational score
    this.jointScore += erp.score(params, val);
    this.variScore += erp.score(vParams, val);

    return k(s, val); //TODO: need a?
  };

  Variational.prototype.factor = function(s, k, a, score) {

    //update joint score and keep going
    this.jointScore += score;

    return k(s); //TODO: need a?
  };

  Variational.prototype.exit = function(s, retval) {
    //FIXME: params are arrays, so need vector arithmetic or something..

    //update gradient estimate
    for (var a in this.sampleGrad) {
      if (!this.grad.hasOwnProperty(a)) {
        this.grad[a] = zeros(this.sampleGrad[a].length);
      }
      this.grad[a] = vecPlus(
          this.grad[a],
          vecScalarMult(this.sampleGrad[a],
          (this.jointScore - this.variScore)));
    }

    //do we have as many samples as we need for this gradient estimate?
    if (this.currentSample < this.numSamples) {
      return this.takeGradSample();
    }

    //we have all our samples to do a gradient step.
    //use AdaGrad update rule.
    //update variational parameters:

    var variParam, delta, deltaAbsMax = 0;
    for (a in this.variationalParams) {
      variParam = this.variationalParams[a];
      for (var i in variParam.params) {
        var grad = this.grad[a][i] / this.numSamples;
        this.runningG2[a][i] += Math.pow(grad, 2);
        var weight = 0.5 / Math.sqrt(this.runningG2[a][i]);
        assert(isFinite(weight), 'Variational update weight is infinite.')
        // console.log(a+" "+i+": weight "+ weight +" grad "+ grad +" vparam "+variParam[a].params[i])
        delta = weight * grad;
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

    //if we haven't converged then do another gradient estimate and step:
    if (this.currentStep < this.numSteps && !converged) {
      this.grad = {};
      this.currentSample = 0;
      return this.takeGradSample();
    }

    //return variational dist as ERP:
    //FIXME
    console.log(this.variationalParams);
    var dist = null;

    // Reinstate previous coroutine
    env.coroutine = this.oldCoroutine;

    // Return by calling original continuation:
    return this.k(this.initialStore, dist);
  };

  function vecPlus(a, b) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] + b[i];
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

  function zeros(n) {
    var a = [];
    for (var i = 0; i < n; i++) {
      a.push(0);
    }
    return a;
  }

  function variational(s, cc, a, wpplFn, numSteps, numSamples) {
    return new Variational(s, cc, a, wpplFn, numSteps, numSamples);
  }

  return {Variational: variational};

};
