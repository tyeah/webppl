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
    //historic gradient squared for each variational param, used for adagrad update:
    this.runningG2 = {};

    // Store the gradients and difference in score (between the target
    // and variational programs) for each sample. This is used to
    // compute the control variate.
    this.grads = [];
    this.scoreDiffs = [];

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

    this.scoreDiffs.push(this.jointScore - this.variScore);
    this.grads.push(this.sampleGrad);

    //do we have as many samples as we need for this gradient estimate?
    if (this.currentSample < this.numSamples) {
      return this.takeGradSample();
    }

    // Estimate a*_i, the optimal scalar in the control variate.
    // (Here the i indexes variational parameters.)
    //
    // a*_i = ( \sum grad_i^2 * scoreDiff ) / ( \sum grad_i^2 )
    //
    // See "Black Box Variational Inference" (Ranganath, Gerrish,
    // Blei.)
    //
    // This performs the sum in both the numerator and
    // denominator.

    // TODO: Can a running/online version of aStarEst be computed. (So
    // that we don't have to keep this.grads and this.scoreDiffs
    // around.)

    var aStarEstParts = {};
    var grad, scoreDiff;
    var address, gradLength, gradSq;
    for (var i = 0; i < this.numSamples; i++) {
      grad = this.grads[i]; // maps addresses to vectors of gradients
      scoreDiff = this.scoreDiffs[i]; // scalar
      for (address in grad) {
        if (!aStarEstParts[address]) {
          gradLength = grad[address].length;
          aStarEstParts[address] = [zeros(gradLength), zeros(gradLength)];
        }
        gradSq = vecElemSq(grad[address]);
        // Numerator.
        aStarEstParts[address][0] = vecPlus(aStarEstParts[address][0], vecScalarMult(gradSq, scoreDiff));
        // Denominator.
        aStarEstParts[address][1] = vecPlus(aStarEstParts[address][1], gradSq);
      }
    }

    // Finally, compute the quotient.
    // TODO: Perform the division in-place? i.e. Re-use aStarEstParts.
    var aStarEst = {};
    for (address in aStarEstParts) {
      aStarEst[address] = vecElemDiv(
        aStarEstParts[address][0],
        aStarEstParts[address][1]);
    }

    // Estimate gradients of the lower-bound (ELBO) we're maximizing.
    // (Note the 1/numSamples factor is included when the gradient
    // step is taken.)
    var elboGrad = {};
    for (i = 0; i < this.numSamples; i++) {
      grad = this.grads[i]; // maps addresses to vectors of gradients
      scoreDiff = this.scoreDiffs[i]; // scalar
      for (address in grad) {
        if (!elboGrad[address]) {
          elboGrad[address] = zeros(grad[address].length);
        }
        elboGrad[address] = vecPlus(elboGrad[address], vecSub(
          vecScalarMult(grad[address], scoreDiff),
          vecElemMult(grad[address], aStarEst[address])));
        // Using this skips including the control variate.
        //elboGrad[address] = vecPlus(elboGrad[address], vecScalarMult(grad[address], scoreDiff));
      }
    }

    // Perform a gradient step using Adagrad.
    var variParam, delta, deltaAbsMax = 0;
    for (var a in elboGrad) {
      variParam = this.variationalParams[a];
      for (var i in variParam.params) {
        var grad = elboGrad[a][i] / this.numSamples;
        this.runningG2[a][i] += Math.pow(grad, 2);
        var weight = 0.5 / Math.sqrt(this.runningG2[a][i]);
        assert(isFinite(weight), 'Variational update weight is infinite.')
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
      this.currentSample = 0;
      this.grads = [];
      this.scoreDiffs = [];
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

        // Reinstate previous coroutine
        env.coroutine = this.oldCoroutine;

        // Return by calling original continuation:
        return this.k(this.initialStore, dist);

      }.bind(this),
      {length: this.numDistSamples} // HACK: Make use of cpsForEach as something like cpsRepeat.
    );

  };

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
