var assert = require('assert');

module.exports = function(env) {

	function makeFuture(s, k, a, fn) {
		// Create the global futures list, if it does not exist
		if (s.__futures === undefined)
			s.__futures = [];
		// The future just calls the original function with the address
		//    from its creation point.
		var future = function(s, k) {
			return fn(s, k, a);
		}
		// Append this future to the global list
		s.__futures = s.__futures.concat([future]);
		return k(s);
	}

	var policies = {
		// Immediate policy: Just run the future immediately.
		immediate: {
			future: function(s, k, a, fn) {
				return fn(s, k, a);
			},
			finishAllFutures: function(s, k) {
				return k(s);
			}
		},
		// Depth-first policy: Store futures in a list, and pull
		//    futures off of that list in LIFO order.
		// (This is similar to the immediate policy, except that it
		//    traverses children last-to-first instead of first-to-last)
		depthfirst: {
			future: makeFuture,
			finishAllFutures: function(s, k) {
				if (s.__futures !== undefined && s.__futures.length > 0) {
					// Pop off the top
					var i = s.__futures.length - 1;
					var fut = s.__futures[i];
					s.__futures = s.__futures.slice(0, i);
					return fut(s, function(s) {
						return policies.depthfirst.finishAllFutures(s, k);
					});
				} else return k(s);
			}
		},
		// Breadth-first policy: Store futures in a list, and pull
		//    futures off of that list in FIFO order.
		breadthfirst: {
			future: makeFuture,
			finishAllFutures: function(s, k) {
				if (s.__futures !== undefined && s.__futures.length > 0) {
					// Pop off the front
					var fut = s.__futures[0];
					s.__futures = s.__futures.slice();
					s.__futures.splice(0, 1);
					return fut(s, function(s) {
						return policies.depthfirst.finishAllFutures(s, k);
					});
				} else return k(s);
			}
		},
		// Stochastic policy: Store futures in a list, and pull
		//    futures out of that list in random order.
		stochastic: {
			future: makeFuture,
			finishAllFutures: function(s, k, a) {
				if (s.__futures !== undefined && s.__futures.length > 0) {
					// Pick a random future
					return sample(s, function(s, i) {
						var fut = s.__futures[i];
						s.__futures = s.__futures.slice();
						s.__futures.splice(i, 1);
						return fut(s, function(s) {
							return policies.stochastic.finishAllFutures(s, k, a.concat('_ff'));
						});
					}, a, randomIntegerERP, [s.__futures.length]);
				} else return k(s);
			}
		}
	}

	// Switch what type of future is being used
	function setFuturePolicy(s, k, a, policyname) {
		assert(policies.hasOwnProperty(policyname));
		s.__futurePolicy = policies[policyname];
		return k(s);
	}

	// We default to the immediate policy
	function ensurePolicy(s) {
		if (s.__futurePolicy === undefined) {
			s.__futurePolicy = policies.immediate;
		}
	}

	function future(s, k, a, fn) {
		ensurePolicy(s);
		return s.__futurePolicy.future(s, k, a, fn);
	}

	function finishAllFutures(s, k, a) {
		ensurePolicy(s);
		return s.__futurePolicy.finishAllFutures(s, k, a);
	}

	return {
		setFuturePolicy: setFuturePolicy,
		future: future,
		finishAllFutures: finishAllFutures
	}
}


