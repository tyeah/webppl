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
var tensor = require('tensor');


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
      active: true
    };
  }

  function copyParticle(particle) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      targetScore: particle.targetScore,
      guideScore: particle.guideScore,
      value: particle.value,
      store: _.clone(particle.store),
      active: particle.active
    };
  }

  function VariationalParticleFilter(s, k, a, wpplFn, opts) {

    function opt(name, defaultval) {
      var o = opts[name];
      assert(o !== undefined || defaultval !== undefined,
        'VPF - option "' + name +'" must be defined!');
      return o === undefined ? defaultval : o;
    }

    this.numParticles = opt('numParticles');
    this.strict = opt('strict', false);
    this.vparams = opt('vparams');
    this.flightsLeft = opt('maxNumFlights');
    this.convergeEps = opt('convergeEps', 0.1);
    this.verbosity = opt('verbosity', 0);
    this.initLearnRate = opt('initLearnRate', 1);
    // TODO: regularization? annealing? other stuff?

    // AdaGrad running sum for gradient normalization
    this.runningG2 = {};

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = _.clone(s); // will be reinstated at the end
  }

  VariationalParticleFilter.prototype.runFlight = function() {
    this.particles = [];
    this.particleHistory = [];
    this.particleIndex = 0;  // marks the active particle

    // Create initial particles
    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };
    for (var i = 0; i < this.numParticles; i++) {
      this.particles.push(newParticle(s, exitK));
    }

    // Run first particle
    return this.currentParticle().continuation(this.currentParticle().store);
  };

  VariationalParticleFilter.prototype.sample = function(s, cc, a, erp, params) {
    var importanceERP = erp.importanceERP || erp;
    var val = importanceERP.sample(params);
    var importanceScore = importanceERP.score(params, val);
    var choiceScore = erp.score(params, val);
    var particle = this.currentParticle();
    particle.weight += choiceScore - ad_primal(importanceScore);
    particle.targetScore += choiceScore;
    particle.guideScore = ad_add(particle.guideScore, importanceScore)
    return cc(s, val);
  };

  VariationalParticleFilter.prototype.factor = function(s, cc, a, score) {
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
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var W = util.logsumexp(_.map(this.particles, function(p) {
      return p.weight;
    }));
    var avgW = W - Math.log(m);

    if (avgW === -Infinity) {      // debugging: check if NaN
      if (this.strict) {
        throw 'Error! All particles -Infinity';
      }
    } else {
      // Compute list of retained particles
      var retainedParticles = [];
      var newExpWeights = [];
      _.each(
          this.particles,
          function(particle) {
            var w = Math.exp(particle.weight - avgW);
            var nRetained = Math.floor(w);
            newExpWeights.push(w - nRetained);
            for (var i = 0; i < nRetained; i++) {
              retainedParticles.push(copyParticle(particle));
            }
          });
      // Compute new particles
      var numNewParticles = m - retainedParticles.length;
      var newParticles = [];
      var j;
      for (var i = 0; i < numNewParticles; i++) {
        j = erp.multinomialSample(newExpWeights);
        newParticles.push(copyParticle(this.particles[j]));
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
  };

  VariationalParticleFilter.prototype.exit = function(s, retval) {
    var particle = this.currentParticle();
    particle.value = retval;
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
    if (this.flightsLeft === 0) {
      // Turn all params from tapes into doubles
      for (var name in vparams) {
        tensor.mapeq(vparams[name], function(x) { return ad_primal(x); });
      }
      // Reinstate previous coroutine:
      env.coroutine = this.oldCoroutine;
      // Return from particle filter by calling original continuation:
      return this.k(this.oldStore);
    } else {
      // Wrap all params in a fresh set of tapes
      for (var name in vparams) {
        tensor.mapeq(vparams[name], function(x) { return ad_maketape(ad_primal(x)); });
      }
      // Run another flight
      return this.runFlight();
    }
  };

  VariationalParticleFilter.prototype.estimateGradient = function() {
    // Super naive for now: just compute gradients on all particle scores
    //    (resetting tapes along the way)
    var gradient = {};
    for (var i = 0; i < this.particleHistory.length; i++) {
      var particles = this.particleHistory[i];
      for (var j = 0; j < particles.length; j++) {
        var particle = particles[j];
        particle.guideScore.determineFanout();
        particle.guideScore.reversePhaseResetting(1);
        for (var name in this.vparams) {
          var param = this.vparams[name];
          var dim = numeric.dim(param);
          if (!gradient.hasOwnProperty[name]) {
            gradient[name] = numeric.rep(dim, 0);
          }
          numeric.addeq(gradient[name], numeric.mul(particle.weight,
            tensor.map(param, function(x) {
              var sens = x.sensitivity;
              x.sensitivity = 0;
              return sens;
            })));
        }
      }
    }

    return gradient;
  };

  VariationalParticleFilter.prototype.doGradientUpdate = function() {
    var gradient = this.estimateGradient();
    // Update parameters using AdaGrad
    for (var name in gradient) {
      var grad = gradient[name];
      var dim = numeric.dim(grad);
      if (!this.runningG2.hasOwnProperty(name)) {
        this.runningG2[name] = numeric.rep(dim, 0);
      }
      numeric.addeq(this.runningG2[name], numeric.mul(grad, grad));
      var weight = numeric.div(this.initLearnRate, numeric.sqrt(this.runningG2[name]));
      numeric.muleq(grad, weight);
      numeric.addeq(this.vparams[name], grad);
    }
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
        if (initialVal !== undefined) {
          initialVal = sampler(samplerprms);
        }
        if (bound !== undefined) {
          initialVal = bound.rvs(initialVal);
        }
        params[name] = [ad_maketape(initialVal)];
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
        var val;
        if (initialVal !== undefined) {
          val = numeric.rep(dim, initialVal);
        } else {
          val = tensor.create(dim, function() { return sampler(samplerprms); });
        }
        tensor.mapeq(val, function(x) { return ad_maketape(x); });
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
        setParams: function(params) { this.params = params; },
        sample: function(params) { return erpObj.sample(this.params); },
        score: function(params, val) { return erpObj.score(this.params, val); }
      });
      var vpfErpObj = _.extend(_.clone(erpObj) {
        importanceERP: impErpObj
      });
      VPF[propname] = vpfErpObj;
    }
  }



  return {
    VPF: VPF
  };

};



