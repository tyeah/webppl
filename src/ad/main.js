var scalar = require('./scalar');


module.exports = {
	scalarTapify: function(x) { return new scalar.tape(x); },
  	untapify: function(x) { return x.primal === undefined ? x : x.primal; },
  	math: scalar.math
};

// Scalar functions
for (var name in scalar.functions) {
	module.exports[name] = scalar.functions[name];
}



