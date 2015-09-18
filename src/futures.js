
// Stochastic ordering
function sfuture(s, k, a, fn)
{
	if (s.__futures === undefined)
		s.__futures = [];
	var future = function(s, k)
	{
		// Use the address from the future's creation point
		return fn(s, k, a);
	}
	s.__futures = s.__futures.slice();
	s.__futures.push(future);
	return k(s, future);
}

// Deterministic, depth-first ordering
function dfuture(s, k, a, fn)
{
	return fn(s, k, a);
}

// We default to using stochastic futures
var _future = sfuture;
function future(s, k, a, fn) {
	return _future(s, k, a, fn);
}

// Switch what type of future is being used
function setFuturePolicy(s, k, a, policyname) {
	if (policyname == 'stochastic') {
		_future = sfuture;
	} else if (policyname == 'deterministic') {
		_future = dfuture;
	} else
		throw 'Unknown future policy ' + policyname;
	return k(s);
}

function forceFuture(s, k, a, future)
{
	var i = s.__futures.indexOf(future);
	s.__futures = globalStore.__futures.slice();
	s.__futures.splice(i, 1);
	return future(s, k);
}

function finishAllFutures(s, k, a)
{
	if (s.__futures !== undefined && s.__futures.length > 0)
	{
		return sample(s, function(s, i)
		{
			var fut = s.__futures[i];
			s.__futures = s.__futures.slice();
			s.__futures.splice(i, 1);
			return fut(s, function(s)
			{
				return finishAllFutures(s, k, a);
			});
		}, a, randomIntegerERP, [s.__futures.length]);
	}
	else return k(s);
}


module.exports = {
	future: future,
	setFuturePolicy: setFuturePolicy,
	forceFuture: forceFuture,
	finishAllFutures: finishAllFutures
}