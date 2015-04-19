////////////////////////////////////////////////////////////////////
// Simple Variational inference wrt the (pseudo)mean-field program.
// We do stochastic gradient descent on the ERP params.
// On sample statements: sample and accumulate grad-log-score, orig-score, and variational-score
// On factor statements accumulate into orig-score.

'use strict';

var erp = require('../erp.js');


module.exports = function(env) {

  function Variational(s, k, a, wpplFn, estS) {

    this.wpplFn = wpplFn;
    this.estimateSamples = estS;
    this.numS = 0;
    this.t = 1;
    this.variationalParams = {};
    //historic gradient squared for each variational param, used for adagrad update:
    this.runningG2 = {};
    //gradient estimate per iteration:
    this.grad = {};
    //gradient of each sample used to estimate gradient:
    this.samplegrad = {};
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
    this.samplegrad = {};
    this.jointScore = 0;
    this.variScore = 0;
    //get another sample
    this.numS++;
    return this.wpplFn(this.initialStore, env.exit, this.initialAddress);
  };

  Variational.prototype.sample = function(s, k, a, erp, params) {
    //sample from variational dist
    if (!this.variationalParams.hasOwnProperty(a)) {
      //initialize at prior (for this sample)...
      this.variationalParams[a] = params;
      this.runningG2[a] = [0];//fixme: vec size
    }
    var vParams = this.variationalParams[a];
    var val = erp.sample(vParams);

    //compute variational dist grad
    this.samplegrad[a] = erp.grad(vParams, val);

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
    for (var a in this.samplegrad) {
      if (!this.grad.hasOwnProperty(a)) {
        //FIXME: size param vec:
        this.grad[a] = [0];
      }
      this.grad[a] = vecPlus(
          this.grad[a],
          vecScalarMult(this.samplegrad[a],
          (this.jointScore - this.variScore)));
    }

    //do we have as many samples as we need for this gradient estimate?
    if (this.numS < this.estimateSamples) {
      return this.takeGradSample();
    }

    //we have all our samples to do a gradient step.
    //use AdaGrad update rule.
    //update variational parameters:

    var delta, deltaAbsMax = 0;
    for (a in this.variationalParams) {
      for (var i in this.variationalParams[a]) {
        var grad = this.grad[a][i] / this.numS;
        this.runningG2[a][i] += Math.pow(grad, 2);
        var weight = 1.0 / Math.sqrt(this.runningG2[a][i]);
        assert(isFinite(weight), 'Variational update weight is infinite.')
        // console.log(a+" "+i+": weight "+ weight +" grad "+ grad +" vparam "+this.variationalParams[a][i])
        delta = weight * grad;
        this.variationalParams[a][i] += delta;
        deltaAbsMax = Math.max(Math.abs(delta), deltaAbsMax);
      }
    }

    // Maintain an exponentially decaying average of the max
    // variational parameter delta in order to test for convergence.
    this.deltaAbsMaxAvg = this.deltaAbsMaxAvg * 0.9 + deltaAbsMax;
    console.log(this.deltaAbsMaxAvg);
    var converged = this.deltaAbsMaxAvg < 0.1;
    if (converged) {
      console.log('Varitional inference converged after step', this.t);
    }

    this.t++;
    console.log(this.variationalParams);

    //if we haven't converged then do another gradient estimate and step:
    if (this.t < 500 && !converged) {
      this.grad = {};
      this.numS = 0;
      return this.takeGradSample();
    }

    //return variational dist as ERP:
    //FIXME
    console.log(this.variationalParams);
    var dist = null;

    // Reinstate previous coroutine
    env.coroutine = this.oldCoroutine;

    // Return from particle filter by calling original continuation:
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

  function vari(s, cc, a, wpplFn, estS) {
    return new Variational(s, cc, a, wpplFn, estS);
  }

  return {
    Variational: vari
  };

};
