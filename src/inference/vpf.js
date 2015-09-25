////////////////////////////////////////////////////////////////////
// Variational particle filter
//
// Sequential importance re-sampling, which treats 'factor' calls as
// the synchronization / intermediate distribution points.

'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');
var numeric = require('numeric');
var tensor = require('../tensor.js');
var assert = require('assert');
var ad = require('../ad/functions.js')


function hrtimeToSeconds(t) {
  // Seconds + nanoseconds
  return t[0] + t[1]/1e9;
}


module.exports = function(env) {

  function isActive(particle) {
    return particle.active;
  }

  function newParticle(s, k) {
    return {
      continuation: k,
      weight: 0,
      targetScore: 0,
      guideScore: 0,
      value: undefined,
      store: _.clone(s),
      active: true,
      ancestor: -1
    };
  }

  function copyParticle(particle, ancestorIdx) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      targetScore: particle.targetScore,
      guideScore: particle.guideScore,
      value: particle.value,
      store: _.clone(particle.store),
      active: particle.active,
      ancestor: ancestorIdx
    };
  }

  function avgWeight(particles) {
    var m = particles.length;
    var W = util.logsumexp(_.map(particles, function(p) {
      return p.weight;
    }));
    var avgW = W - Math.log(m);
    return avgW;
  }

  function VariationalParticleFilter(s, k, a, wpplFn, vparams, opts) {

    function opt(name, defaultval) {
      var o = opts[name];
      assert(o !== undefined || defaultval !== undefined,
        'VPF - option "' + name +'" must be defined!');
      return o === undefined ? defaultval : o;
    }

    this.numParticles = opt('numParticles');
    this.maxNumFlights = opt('maxNumFlights');
    this.flightsLeft = this.maxNumFlights;
    this.strict = opt('strict', false);
    this.convergeEps = opt('convergeEps', 0.1);
    this.verbosity = opt('verbosity', {});
    this.adagradInitLearnRate = opt('adagradInitLearnRate', 1);
    this.tempSchedule = opt('tempSchedule', function() { return 1; });
    this.regularizationWeight = opt('regularizationWeight', 0);
    this.objective = opt('objective', 'EUBO');

    // Variational parameters
    this.vparams = vparams;

    // AdaGrad running sum for gradient normalization
    this.runningG2 = {};
    // Convergence testing
    this.maxDeltaAvg = 0;

    // Diagnostics
    this.diagnostics = {};

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = _.clone(s); // will be reinstated at the end
    this.wpplFn = wpplFn;
    this.addr = a;

    // Start timer
    this.startTime = process.hrtime();
  }

  VariationalParticleFilter.prototype.runFlight = function() {
    if (this.verbosity.flightNum) {
      var flightId = this.maxNumFlights - this.flightsLeft + 1
      console.log('Running particle flight ' + flightId + '/' + this.maxNumFlights);
    }

    this.particles = [];
    this.particleHistory = [];
    this.particleIndex = 0;  // marks the active particle

    // Create initial particles
    var wpplFn = this.wpplFn;
    var a = this.addr;
    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };
    for (var i = 0; i < this.numParticles; i++) {
      this.particles.push(newParticle(this.oldStore, exitK));
    }

    // Run first particle
    return this.currentParticle().continuation(this.currentParticle().store);
  };

  VariationalParticleFilter.prototype.sample = function(s, cc, a, erp, params) {
    var importanceERP = erp.importanceERP || erp;
    var val = importanceERP.sample(params);
    var importanceScore = importanceERP.adscore(params, val);
    var choiceScore = erp.score(params, val);
    var particle = this.currentParticle();
    particle.weight += choiceScore - ad.primal(importanceScore);
    particle.targetScore += choiceScore;
    particle.guideScore = ad.add(particle.guideScore, importanceScore);
    if (!isFinite(particle.weight)) {
      console.log('name: ' + a);
      console.log('erp: ' + erp.sample.name);
      console.log('val: ' + val);
      console.log('params: ' + params);
      console.log('importance params: ' + importanceERP.rawparams);
      console.log('scores:', particle.targetScore, ad.primal(particle.guideScore), particle.weight);
      assert(false, 'Found non-finite particle weight!');
    }
    return cc(s, val);
  };

  VariationalParticleFilter.prototype.factor = function(s, cc, a, score) {
    var temp = this.tempSchedule(this.maxNumFlights - this.flightsLeft, this.maxNumFlights);
    score *= temp;
    // Update particle weight
    var particle = this.currentParticle();
    particle.weight += score;
    particle.targetScore += score;
    particle.continuation = cc;
    particle.store = s;

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      // Resampling can kill all continuing particles
      var i = this.firstActiveParticleIndex();
      if (i === -1) {
        // All particles completed, no more computation to do
        return this.finish();
      } else {
        this.particleIndex = i;
      }
    } else {
      // Advance to the next particle
      this.particleIndex = this.nextActiveParticleIndex();
    }

    return this.currentParticle().continuation(this.currentParticle().store);
  };

  // The three functions below return -1 if there is no active particle

  VariationalParticleFilter.prototype.firstActiveParticleIndex = function() {
    return util.indexOfPred(this.particles, isActive);
  };

  VariationalParticleFilter.prototype.lastActiveParticleIndex = function() {
    return util.lastIndexOfPred(this.particles, isActive);
  };

  VariationalParticleFilter.prototype.nextActiveParticleIndex = function() {
    var successorIndex = this.particleIndex + 1;
    var nextActiveIndex = util.indexOfPred(this.particles, isActive, successorIndex);
    if (nextActiveIndex === -1) {
      return this.firstActiveParticleIndex();  // wrap around
    } else {
      return nextActiveIndex;
    }
  };

  VariationalParticleFilter.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  VariationalParticleFilter.prototype.allParticlesAdvanced = function() {
    return this.particleIndex === this.lastActiveParticleIndex();
  };

  VariationalParticleFilter.prototype.resampleParticles = function() {
    if (this.objective === 'ELBO') {
      return;
    }
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var avgW = avgWeight(this.particles);

    if (avgW === -Infinity) {      // debugging: check if NaN
      if (this.strict) {
        throw 'Error! All particles -Infinity';
      }
    } else {
      // Compute list of retained particles
      var retainedParticles = [];
      var newExpWeights = [];
      for (var p = 0; p < this.numParticles; p++) {
        var particle = this.particles[p];
        var w = Math.exp(particle.weight - avgW);
        var nRetained = Math.floor(w);
        newExpWeights.push(w - nRetained);
        for (var i = 0; i < nRetained; i++) {
          retainedParticles.push(copyParticle(particle, p));
        }
      }
      // Compute new particles
      var numNewParticles = m - retainedParticles.length;
      var newParticles = [];
      var j;
      for (var i = 0; i < numNewParticles; i++) {
        j = erp.multinomialSample(newExpWeights);
        newParticles.push(copyParticle(this.particles[j], j));
      }

      // Particles after update: Retained + new particles
      this.particles = newParticles.concat(retainedParticles);
      // Save particles to history
      this.particleHistory.push(this.particles);
    }

    // Reset all weights
    _.each(this.particles, function(particle) {
      particle.weight = avgW;
    });

    if (this.verbosity.numUniqueParticles) {
      var ids = {};
      var n = 0;
      for (var i = 0; i < this.numParticles; i++) {
        var id = this.particles[i].ancestor;
        if (!ids.hasOwnProperty(id)) {
          n++;
          ids[id] = true;
        }
      }
      console.log('  # unique particles after resample: ' + n);
    }
  };

  VariationalParticleFilter.prototype.exit = function(s, retval) {
    var particle = this.currentParticle();
    particle.value = retval;
    if (this.verbosity.particleNum) {
      console.log('      Finished particle ' + this.particleIndex + '/' + this.numParticles);
    }
    particle.active = false;
    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    var i = this.nextActiveParticleIndex();
    if (i === -1) {
      // All particles completed
      return this.finish();
    } else {
      if (i < this.particleIndex) {
        // We have updated all particles and will now wrap around
        this.resampleParticles();
      }
      this.particleIndex = i;
      return this.currentParticle().continuation(this.currentParticle().store);
    }
  };

  VariationalParticleFilter.prototype.finish = function() {
    this.flightsLeft--;
    this.doGradientUpdate();
    var converged = this.maxDeltaAvg < this.convergeEps;
    if (converged || this.flightsLeft === 0) {
      if (this.verbosity.endStatus) {
        if (converged) {
          console.log('CONVERGED (' + this.maxDeltaAvg + ' < ' + this.convergeEps + ')');
        } else {
          console.log('DID NOT CONVERGE (' + this.maxDeltaAvg + ' > ' + this.convergeEps +  ')');
        }
      }
      // Finalize return object
      this.diagnostics.converged = converged;
      this.diagnostics.flightsRun = this.maxNumFlights - this.flightsLeft;
      this.diagnostics.finalParams = this.vparams;
      this.diagnostics.timeTaken = hrtimeToSeconds(process.hrtime(this.startTime));
      // Reinstate previous coroutine:
      env.coroutine = this.oldCoroutine;
      // Return from particle filter by calling original continuation:
      return this.k(this.oldStore, this.diagnostics);
    } else {
      // Wrap all params in a fresh set of tapes
      for (var name in this.vparams) {
        tensor.mapeq(this.vparams[name], function(x) { return ad.maketape(x); });
      }
      // Run another flight
      return this.runFlight();
    }
  };

  VariationalParticleFilter.prototype.doGradientUpdate = function() {
    var gradient = this.estimateGradient();
    if (this.verbosity.params) {
      console.log('  params before update: ' + JSON.stringify(this.vparams));
    }
    var maxDelta = 0;
    // Update parameters using AdaGrad
    for (var name in gradient) {
      var grad = gradient[name];
      if (this.regularizationWeight > 0) {
        numeric.subeq(grad, numeric.mul(this.regularizationWeight, this.vparams[name]));
      }
      var dim = numeric.dim(grad);
      if (!this.runningG2.hasOwnProperty(name)) {
        this.runningG2[name] = numeric.rep(dim, 0);
      }
      numeric.addeq(this.runningG2[name], numeric.mul(grad, grad));
      var weight = numeric.div(this.adagradInitLearnRate, numeric.sqrt(this.runningG2[name]));
      if (!numeric.all(numeric.isFinite(weight))) {
        console.log('name: ' + name);
        console.log('grad: ' + grad);
        console.log('weight: ' + weight);
        assert(false, 'Found non-finite AdaGrad weight!');
      }
      numeric.muleq(grad, weight);
      numeric.addeq(this.vparams[name], grad);
      maxDelta = Math.max(tensor.maxreduce(numeric.abs(grad)), maxDelta);
    }
    this.maxDeltaAvg = this.maxDeltaAvg * 0.9 + maxDelta;
    if (this.verbosity.params) {
      console.log('  params after update: ' + JSON.stringify(this.vparams));
    }
  };

  VariationalParticleFilter.prototype.estimateGradient = function() {
    var gradient;
    if (this.objective === 'EUBO') {
      gradient = this.estimateEUBOGradient();
    } else if (this.objective === 'ELBO') {
      gradient = this.estimateELBOGradient();
    } else {
      throw 'Unrecognized variational objective ' + this.objective;
    }

    // Turn all params from tapes into doubles
    for (var name in this.vparams) {
      tensor.mapeq(this.vparams[name], function(x) { return ad.primal(x); });
    }

    var scoreDiff = 0;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      scoreDiff += (p.targetScore - ad.primal(p.guideScore));
    }
    scoreDiff /= this.numParticles;
    if (!this.diagnostics.hasOwnProperty('scoreDiffs')) {
      this.diagnostics.scoreDiffs = [];
      this.diagnostics.times = [];
    }
    this.diagnostics.scoreDiffs.push(scoreDiff);
    this.diagnostics.times.push(hrtimeToSeconds(process.hrtime(this.startTime)));
    if (this.verbosity.scoreDiff) {
      console.log('  scoreDiff: ' + scoreDiff);
    }
    if (this.verbosity.gradientEstimate) {
      console.log('  gradientEst: ' + JSON.stringify(gradient));
    }

    return gradient;
  };

  VariationalParticleFilter.prototype.estimateEUBOGradient = function() {
    // TODO: Use particle ancestor tree to avoid even more unnecessary recomputation(?)
    var gradient = {};
    for (var i = 0; i < this.particleHistory.length; i++) {
      var particles = this.particleHistory[i];
      var avgW = avgWeight(particles);
      var groupedParticles = groupByAncestor(particles);
      for (var j = 0; j < groupedParticles.length; j++) {
        var group = groupedParticles[j];
        var n = group.length;
        var rep = group[0];
        var grad = this.getParticleGradient(rep);
        var w = n * Math.exp(rep.weight - avgW);
        for (var name in grad) {
          var g = grad[name];
          if (!gradient.hasOwnProperty(name)) {
            var dim = numeric.dim(g);
            gradient[name] = numeric.rep(dim, 0);
          }
          numeric.addeq(gradient[name], numeric.mul(w, g));
        }
      }
    };
    return gradient;
  };

  function groupByAncestor(particles) {
    var groups = {};
    for (var p = 0; p < particles.length; p++) {
      var particle = particles[p];
      var id = particle.ancestor;
      if (!groups.hasOwnProperty(id)) {
        groups[id] = [];
      }
      groups[id].push(particle);
    }
    var list = [];
    for (var name in groups) {
      list.push(groups[name]);
    }
    return list;
  }

  VariationalParticleFilter.prototype.estimateELBOGradient = function() {
    var sumScoreDiff = 0;
    var sumGrad = {};
    var sumWeightedGrad = {};
    var sumGradSq = {};
    var sumWeightedGradSq = {};
    for (var i = 0; i < this.particles.length; i++) {
      var particle = this.particles[i];
      var scoreDiff = particle.targetScore - ad.primal(particle.guideScore);
      var grad = this.getParticleGradient(particle);
      sumScoreDiff += scoreDiff;
      for (var name in grad) {
        var g = grad[name];
        if (!sumGrad.hasOwnProperty(name)) {
          var dim = numeric.dim(g);
          sumGrad[name] = numeric.rep(dim, 0);
          sumWeightedGrad[name] = numeric.rep(dim, 0);
          sumGradSq[name] = numeric.rep(dim, 0);
          sumWeightedGradSq[name] = numeric.rep(dim, 0);
        }
        numeric.addeq(sumGrad[name], g);
        var weightedGrad = numeric.mul(g, scoreDiff);
        numeric.addeq(sumWeightedGrad[name], weightedGrad);
        var gSq = numeric.mul(g, g);
        numeric.addeq(sumGradSq[name], gSq);
        var weightedGradSq = numeric.mul(gSq, scoreDiff);
        numeric.addeq(sumWeightedGradSq[name], weightedGradSq);
      }
    }
    // Control variate
    var numerSum = 0;
    var denomSum = 0;
    for (var name in sumGrad) {
      numerSum += numeric.sum(sumWeightedGradSq[name]);
      denomSum += numeric.sum(sumGradSq[name]);
    }
    var aStar = numerSum / denomSum;
    var elboGradEst = {};
    for (var name in sumGrad) {
      elboGradEst[name] = numeric.div(numeric.sub(sumWeightedGrad[name], numeric.mul(sumGrad[name], aStar)), this.numParticles);
    }
    if (this.verbosity.gradientIntermediates) {
      console.log('  sumGrad: ' + JSON.stringify(sumGrad));
      console.log('  sumGradSq: ' + JSON.stringify(sumGradSq));
      console.log('  sumWeightedGrad: ' + JSON.stringify(sumWeightedGrad));
      console.log('  sumWeightedGradSq: ' + JSON.stringify(sumWeightedGradSq));
      console.log('  aStar: ' + JSON.stringify(aStar));
      console.log('  sumScoreDiff: ' + sumScoreDiff);
      console.log('  avgScoreDiff: ' + sumScoreDiff / this.numParticles);
      console.log('  elboGradEst: ' + JSON.stringify(elboGradEst));
    }
    return elboGradEst;
  };

  VariationalParticleFilter.prototype.getParticleGradient = function(particle) {
    var gradient = {};
    particle.guideScore.determineFanout();
    particle.guideScore.reversePhaseResetting(1);
    for (var name in this.vparams) {
      var param = this.vparams[name];
      // TODO(?): Only add if some element of param is non-zero.
      gradient[name] = tensor.map(param, function(x) {
        var sens = x.sensitivity;
        x.sensitivity = 0;
        return sens;
      });
    }
    if (this.verbosity.gradientSamples) {
      console.log('    gradientSamp: ' + JSON.stringify(gradient));
    }
    return gradient;
  };

  VariationalParticleFilter.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function VPF(s, cc, a, wpplFn, numParticles, strict) {
    return new VariationalParticleFilter(s, cc, a, wpplFn, numParticles, strict === undefined ? true : strict).runFlight();
  }



  // Functions for creating / retrieving variational parameters
  _.extend(VPF, {
    newParams: function() { return {}; },
    param: function(params, name, initialVal, bound, sampler, samplerprms) {
      if (!params.hasOwnProperty(name)) {
        assert(env.coroutine instanceof VariationalParticleFilter,
          'Attempting to create new variational parameter outside of VPF.');
        if (initialVal === undefined) {
          initialVal = sampler(samplerprms);
        }
        if (bound !== undefined) {
          initialVal = bound.rvs(initialVal);
        }
        params[name] = [ad.maketape(initialVal)];
      }
      var p = params[name][0];
      if (bound !== undefined) {
        return bound.fwd(p);
      } else {
        return p;
      }
    },
    paramTensor: function(params, name, dim, sampler, samplerprms) {
      if (!params.hasOwnProperty(name)) {
        assert(env.coroutine instanceof VariationalParticleFilter,
          'Attempting to create new variational parameter outside of VPF.');
        var val = tensor.create(dim, function() { return sampler(samplerprms); });
        tensor.mapeq(val, function(x) { return ad.maketape(x); });
        params[name] = val;
      }
      return params[name];
    }
  });



  // For each ERP, define a version that has an importance ERP that uses its own stored parameters
  //    instead of the parameters passed to its sample and score functions.
  for (var propname in erp) {
    var prop = erp[propname];
    if (typeof(prop) === 'object' && prop instanceof erp.ERP) {
      var erpObj = prop;
      var impErpObj = _.extend(_.clone(erpObj), {
        baseERP: erpObj,
        setParams: function(params) {
          this.params = params;
          this.rawparams = params.map(ad.primal);
        },
        sample: function(params) { return this.baseERP.sample(this.rawparams); },
        score: function(params, val) { return this.baseERP.score(this.rawparams, val); },
        adscore: function(params, val) { return this.baseERP.adscore(this.params, val); }
      });
      var vpfErpObj = _.extend(_.clone(erpObj), {
        importanceERP: impErpObj
      });
      VPF[propname] = vpfErpObj;
    }
  }

  return {
    VPF: VPF
  };

};



