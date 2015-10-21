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
		// future.address = a;
		// Append this future to the global list
		s.__futures = s.__futures.concat([future]);
		return k(s);
	}

	function makeFinishAllFutures(selectionFn) {
		function finishAllFutures(s, k, a) {
			if (s.__futures !== undefined && s.__futures.length > 0) {
				return selectionFn(s, function(s, i) {
					var fut = s.__futures[i];
					s.__futures = s.__futures.slice();
					s.__futures.splice(i, 1);
					return fut(s, function(s) {
						return finishAllFutures(s, k, a.concat('_f0'));
					});
				}, a.concat('_f1'));
			} else return k(s);
		}
		return finishAllFutures;
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
		// LIFO policy: Store futures in a list, and pull
		//    futures off of that list in LIFO order.
		// (This is similar to the immediate policy, except that it
		//    traverses children last-to-first instead of first-to-last)
		lifo: {
			future: makeFuture,
			finishAllFutures: makeFinishAllFutures(function(s, k, a) {
				return k(s, s.__futures.length - 1);
			})
		},
		// FIFO policy: Store futures in a list, and pull
		//    futures off of that list in FIFO order.
		fifo: {
			future: makeFuture,
			finishAllFutures: makeFinishAllFutures(function(s, k, a) {
				return k(s, 0);
			})
		},
		// Uniform-from-all policy: Store futures in a list, and pull
		//    futures out of that list in random order.
		uniformFromAll: {
			future: makeFuture,
			finishAllFutures: makeFinishAllFutures(function(s, k, a) {
				return sample(s, k, a.concat('_f2'), randomIntegerERP, [s.__futures.length]);
			})
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


